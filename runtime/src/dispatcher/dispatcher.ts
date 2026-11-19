// The Dispatcher (spec §6 S1-03; merged roster #1). Code only. The runtime's own queue of work orders, kept in
// Postgres (one service fewer to run and secure than Redis): per-artifact pipelines, retries with backoff for
// transient errors, a dead-letter state, per-order token budgets, and a run log with provenance for every step.

import { audit } from "../audit/audit.ts";
import type { BusinessRules } from "../config/rules.ts";
import type { Db } from "../db/db.ts";
import type { BrandRules } from "../gates/brand.ts";
import {
  ModelOutputError, ModelRefusalError, ModelTransientError, ModelTruncatedError, ModelUnavailableError,
  type ModelClient, type ModelResult,
} from "../model/client.ts";
import type { DnsResolver } from "../deliverability/mailDomain.ts";
import { bilingualPipeline } from "../pipelines/bilingual.ts";
import { caseStudyPipeline } from "../pipelines/caseStudy.ts";
import type { Pipeline, PipelineContext, RunStep } from "../pipelines/context.ts";
import { mailDomainPipeline, renewalsPipeline, siteCheckPipeline } from "../pipelines/footprint.ts";
import { meetingBriefPipeline, meetingDebriefPipeline } from "../pipelines/meetings.ts";
import { prequalPackPipeline } from "../pipelines/prequalPack.ts";
import { buildBoardPack } from "../reporting/boardPack.ts";
import { submitArtifact } from "../approvals/queue.ts";

export class BudgetExceededError extends Error {}

const boardPackPipeline: Pipeline = async (ctx) => {
  const text = await buildBoardPack({ db: ctx.db, rules: ctx.rules, now: ctx.now, brand: ctx.brand });
  const artifactId = await submitArtifact(ctx.db, {
    workOrderId: ctx.workOrderId, artifactType: "board_pack", title: `Board pack ${ctx.now().toISOString().slice(0, 10)}`,
    audience: "asil", content: { kind: "board_pack" }, renderedEn: text, evidenceTierMax: "tender",
    gateReport: { passed: true, note: "code-built report; no model" },
    provenance: { engine: "code", rules_version: ctx.rules.rulesVersion },
  }, "agent:dispatcher");
  return { status: "succeeded", artifactId };
};

export const PIPELINES: Record<string, Pipeline> = {
  case_study: caseStudyPipeline,
  meeting_brief: meetingBriefPipeline,
  meeting_debrief: meetingDebriefPipeline,
  prequal_pack: prequalPackPipeline,
  board_pack: boardPackPipeline,
  bilingual_edit: bilingualPipeline,
  site_check: siteCheckPipeline,
  mail_domain_check: mailDomainPipeline,
  maintenance_renewals: renewalsPipeline,
};

/** Token budgets per work order, sized to the artifact (spec §6 S1-03). Code-only pipelines use none. */
export const DEFAULT_BUDGETS: Record<string, number> = {
  case_study: 150_000,
  meeting_brief: 60_000,
  meeting_debrief: 40_000,
  bilingual_edit: 80_000,
  prequal_pack: 1,
  board_pack: 1,
  site_check: 1,
  mail_domain_check: 1,
  maintenance_renewals: 1,
};

export interface DispatcherDeps {
  db: Db;
  rules: BusinessRules;
  brand: BrandRules;
  model: ModelClient | null;
  now?: () => Date;
  publicNumbers?: string[];
  /** Network for the code-only checks; leave out where the deployment has none. */
  fetchFn?: typeof fetch;
  dns?: DnsResolver;
}

export async function enqueue(
  db: Db,
  wo: { artifactType: string; input: unknown; opportunityId?: string; createdBy: string; tokenBudget?: number; maxAttempts?: number },
): Promise<string> {
  if (!PIPELINES[wo.artifactType]) throw new Error(`no pipeline for ${wo.artifactType}`);
  const id = (
    await db.query<{ id: string }>(
      `INSERT INTO work_orders (artifact_type, input, opportunity_id, token_budget, max_attempts, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [wo.artifactType, JSON.stringify(wo.input), wo.opportunityId ?? null, wo.tokenBudget ?? DEFAULT_BUDGETS[wo.artifactType] ?? 50_000,
        wo.maxAttempts ?? 3, wo.createdBy],
    )
  ).rows[0]!.id;
  await audit(db, { actor: wo.createdBy, action: "enqueue", entity: "work_order", entityId: id, details: { type: wo.artifactType } });
  return id;
}

export interface RunResult {
  workOrderId: string;
  artifactType: string;
  status: "succeeded" | "needs_human" | "dead" | "retry";
  artifactId?: string;
  note?: string;
}

async function logStep(db: Db, workOrderId: string, s: RunStep): Promise<void> {
  const r = s.result;
  await db.query(
    `INSERT INTO run_log (work_order_id, step, agent, prompt_version, model_requested, model_served, effort, input_tokens,
                          output_tokens, cache_read_tokens, latency_ms, outcome, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [workOrderId, s.step, s.agent ?? null, s.promptVersion ?? null, r?.modelRequested ?? null, r?.modelServed ?? null, null,
      r?.usage.input ?? null, r?.usage.output ?? null, r?.usage.cacheRead ?? null, r?.latencyMs ?? null, s.outcome,
      JSON.stringify({ ...(s.details ?? {}), ...(r?.fallbackUsed ? { fallback_used: true } : {}) })],
  );
}

/** Run the next ready work order, if any. */
export async function runNext(deps: DispatcherDeps): Promise<RunResult | null> {
  const at = deps.now ? deps.now() : new Date();
  const now = deps.now ?? (() => new Date());
  const wo = (
    await deps.db.query<{ id: string; artifact_type: string; input: unknown; attempts: number; max_attempts: number; token_budget: number; tokens_used: number }>(
      `UPDATE work_orders SET status = 'running', attempts = attempts + 1, started_at = $1
       WHERE id = (SELECT id FROM work_orders WHERE status = 'queued' AND not_before <= $1
                   ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING id, artifact_type, input, attempts, max_attempts, token_budget, tokens_used`,
      [at.toISOString()],
    )
  ).rows[0];
  if (!wo) return null;

  const finish = async (status: RunResult["status"], note?: string, artifactId?: string, retryAt?: Date): Promise<RunResult> => {
    if (status === "retry") {
      await deps.db.query("UPDATE work_orders SET status = 'queued', not_before = $2, last_error = $3 WHERE id = $1", [wo.id, retryAt!.toISOString(), note ?? null]);
    } else {
      await deps.db.query("UPDATE work_orders SET status = $2, finished_at = $3, last_error = $4 WHERE id = $1", [wo.id, status, now().toISOString(), note ?? null]);
    }
    return { workOrderId: wo.id, artifactType: wo.artifact_type, status, ...(artifactId ? { artifactId } : {}), ...(note ? { note } : {}) };
  };

  const pipeline = PIPELINES[wo.artifact_type];
  if (!pipeline) return finish("dead", `no pipeline for ${wo.artifact_type}`);

  let tokensUsed = wo.tokens_used;
  const ctx: PipelineContext = {
    db: deps.db,
    rules: deps.rules,
    brand: deps.brand,
    model: deps.model,
    now,
    workOrderId: wo.id,
    publicNumbers: deps.publicNumbers ?? [],
    ...(deps.fetchFn ? { fetchFn: deps.fetchFn } : {}),
    ...(deps.dns ? { dns: deps.dns } : {}),
    step: (s) => logStep(deps.db, wo.id, s),
    callModel: async <T>(agent: string, promptVersion: string, fn: (m: ModelClient) => Promise<ModelResult<T>>) => {
      if (!deps.model) {
        await logStep(deps.db, wo.id, { step: agent, agent, promptVersion, outcome: "blocked", details: { reason: "model calls are off" } });
        throw new ModelUnavailableError("Model calls are off: this work order needs the model.");
      }
      if (tokensUsed >= wo.token_budget) throw new BudgetExceededError(`token budget of ${wo.token_budget} used up`);
      try {
        const r = await fn(deps.model);
        tokensUsed += r.usage.input + r.usage.output;
        await deps.db.query("UPDATE work_orders SET tokens_used = $2 WHERE id = $1", [wo.id, tokensUsed]);
        await logStep(deps.db, wo.id, { step: agent, agent, promptVersion, result: r as ModelResult<unknown>, outcome: "ok" });
        return r;
      } catch (err) {
        const outcome = err instanceof ModelRefusalError ? "refused" : err instanceof ModelTransientError ? "retry" : "failed";
        await logStep(deps.db, wo.id, { step: agent, agent, promptVersion, outcome, details: { error: (err as Error).message } });
        throw err;
      }
    },
  };

  try {
    const out = await pipeline(ctx, wo.input);
    return finish(out.status, out.note, out.artifactId);
  } catch (err) {
    const message = (err as Error).message;
    const canRetry = wo.attempts < wo.max_attempts;
    if (err instanceof ModelTransientError && canRetry) {
      return finish("retry", message, undefined, new Date(at.getTime() + 30_000 * 2 ** wo.attempts));
    }
    if ((err instanceof ModelOutputError || err instanceof ModelTruncatedError) && canRetry) {
      return finish("retry", message, undefined, new Date(at.getTime() + 5_000));
    }
    if (err instanceof ModelRefusalError || err instanceof ModelUnavailableError || err instanceof BudgetExceededError) {
      return finish("needs_human", message);
    }
    return finish("dead", message);
  }
}

/** Run until nothing is ready, or `limit` orders have run. */
export async function runAll(deps: DispatcherDeps, limit = 100): Promise<RunResult[]> {
  const out: RunResult[] = [];
  for (let i = 0; i < limit; i++) {
    const r = await runNext(deps);
    if (!r) break;
    out.push(r);
  }
  return out;
}
