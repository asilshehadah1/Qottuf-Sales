// The board's API: every route calls the runtime's own functions (the Ledger, the Pipeline Engine, the Dispatcher,
// the registry, the gates), so the rules that hold in the tests hold here. The board acts as Asil: the person at
// this computer is the owner and the approver named in the business rules.

import { z } from "zod";
import { decide, listQueue } from "../approvals/queue.ts";
import type { BusinessRules } from "../config/rules.ts";
import { CrmError, type CrmClient } from "../crm/client.ts";
import { crmSummary, crmView, mirroredQuotes, syncCrm } from "../crm/sync.ts";
import type { Db } from "../db/db.ts";
import type { DnsResolver } from "../deliverability/mailDomain.ts";
import { DEFAULT_BUDGETS, enqueue, PIPELINES } from "../dispatcher/dispatcher.ts";
import { approveEntityVersion, currentEntity, EntityFields, listingsReport } from "../entity/entity.ts";
import type { BrandRules } from "../gates/brand.ts";
import { rulebookFigures } from "../gates/claims.ts";
import { checkParity, glossarySignals } from "../gates/parity.ts";
import { isStrict, runTextGates } from "../gates/runGates.ts";
import { confirmUnit, dueItems, listUnits, MaintenanceContract, recordInspection, recordMaintenanceOffer, recordOwnerConsent, recordRegistration, registerUnit, registryGaps, setMaintenanceContract, UnitConfirmation, UnitInput } from "../installedBase/registry.ts";
import { figuresFromEvidence, riyadhDate } from "../ledger/figures.ts";
import { projectProof } from "../ledger/proof.ts";
import { approveEvidence, createAccount, fileEvidence, GateError, withdrawEvidence } from "../ledger/repo.ts";
import { AccountInput, EvidenceInput, NextStep, type EvidenceRecord } from "../ledger/schemas.ts";
import type { ModelClient } from "../model/core.ts";
import { createOpportunity, decideBid, EngineError, listOpportunities, pipelineAlerts, screen, setNextStep, transition } from "../pipeline/engine.ts";
import { allowedNext, CONTRACTING_STAGES, ELEVATOR_STAGES, initialStages, isOpen, LOSS_REASONS } from "../pipeline/stages.ts";
import { BilingualInput } from "../pipelines/bilingual.ts";
import { CaseStudyInput } from "../pipelines/caseStudy.ts";
import { MailCheckInput, SiteCheckInput } from "../pipelines/footprint.ts";
import { ElevatorAdInput, LinkedinInput, WebPageInput } from "../pipelines/marketing.ts";
import { BriefInput, DebriefInput } from "../pipelines/meetings.ts";
import { PrequalInput } from "../pipelines/prequalPack.ts";
import { FACT_BASE_ISSUER, importBrandFacts } from "./importFacts.ts";
import { HttpError, Router, type EventHub } from "./http.ts";
import { agentForArtifact, GROUPS, ROSTER, rosterSummary } from "./roster.ts";

export interface BoardDeps {
  db: Db;
  rules: BusinessRules;
  brand: BrandRules;
  brandSource: { path: string | null; dir: string | null; real: boolean };
  model: ModelClient | null;
  modelNote: string;
  /** What runtime/.env asks for: the Claude plan through Claude Code, an API key, or off. */
  modelMode?: "claude-plan" | "api" | "off";
  crm: CrmClient;
  hub: EventHub;
  now: () => Date;
  fetchFn: typeof fetch;
  dns?: DnsResolver;
  website: { pages: string[]; mailDomain: string };
  /** Wake the worker after a work order is queued. */
  kick: () => void;
  actor: string;
  dbKind: string;
}

/** Inputs checked before a work order is queued, so a mistake shows on the form instead of as a dead run. */
const RUN_INPUTS: Record<string, z.ZodType> = {
  case_study: CaseStudyInput,
  meeting_brief: BriefInput,
  meeting_debrief: DebriefInput,
  bilingual_edit: BilingualInput,
  linkedin_post: LinkedinInput,
  elevator_ad: ElevatorAdInput,
  web_page: WebPageInput,
  site_check: SiteCheckInput,
  mail_domain_check: MailCheckInput,
  prequal_pack: PrequalInput,
  board_pack: z.object({}),
  maintenance_renewals: z.object({}),
};
/** Code-only work orders: they run without a model. */
const CODE_ONLY = new Set(["site_check", "mail_domain_check", "board_pack", "maintenance_renewals", "prequal_pack"]);
/** Artifacts that are reports to read, not drafts to approve for use. */
export const REPORT_TYPES = new Set(["site_check", "mail_domain_check", "board_pack", "prequal_pack"]);

const OpportunityInput = z.object({
  motion: z.enum(["contracting", "elevator"]),
  title: z.string().min(3),
  account_id: z.string().optional(),
  route: z.string().min(3),
  qottuf_role: z.string().min(3),
  sector: z.string().optional(),
  service_lines: z.array(z.string()).optional(),
  stage: z.string(),
  owner: z.string().min(2),
  next_step: NextStep,
  value_min_sar: z.number().nonnegative().optional(),
  value_max_sar: z.number().nonnegative().optional(),
  value_source: z.enum(["tender", "estimate", "client", "unknown"]).optional(),
  dates: z.record(z.string(), z.string()).optional(),
});

async function allEvidence(db: Db): Promise<Array<EvidenceRecord & { created_at: string; approved_by: string | null }>> {
  const rows = (await db.query("SELECT * FROM evidence_records ORDER BY project_ref NULLS FIRST, id")).rows;
  const d = (v: unknown) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);
  return rows.map((r) => ({
    id: r.id as string, type: r.type as EvidenceRecord["type"], tier: r.tier as EvidenceRecord["tier"], project_ref: (r.project_ref as string | null) ?? null,
    title: r.title as string, issuer: (r.issuer as string | null) ?? null, issued_at: d(r.issued_at), expires_at: d(r.expires_at),
    permitted_uses: (r.permitted_uses as string[]) ?? [], facts: (r.facts as EvidenceRecord["facts"]) ?? [], status: r.status as EvidenceRecord["status"],
    created_at: new Date(r.created_at as string).toISOString(), approved_by: (r.approved_by as string | null) ?? null,
  }));
}

async function latestArtifact(db: Db, type: string): Promise<{ id: string; created_at: string; content: unknown; title: string } | null> {
  const r = (await db.query("SELECT id, title, created_at, content FROM artifacts WHERE artifact_type = $1 ORDER BY created_at DESC, id DESC LIMIT 1", [type])).rows[0];
  return r ? { id: r.id as string, title: r.title as string, created_at: new Date(r.created_at as string).toISOString(), content: r.content } : null;
}

async function recentRuns(db: Db, limit: number, type?: string) {
  const rows = (await db.query(
    `SELECT w.id, w.artifact_type, w.status, w.created_at, w.started_at, w.finished_at, w.last_error, w.tokens_used, w.token_budget, w.attempts,
            (SELECT a.id FROM artifacts a WHERE a.work_order_id = w.id ORDER BY a.id DESC LIMIT 1) AS artifact_id,
            (SELECT count(*) FROM run_log l WHERE l.work_order_id = w.id) AS steps
     FROM work_orders w WHERE ($2::text IS NULL OR w.artifact_type = $2) ORDER BY w.created_at DESC, w.id DESC LIMIT $1`,
    [limit, type ?? null],
  )).rows;
  return rows.map((r) => ({
    id: r.id as string, type: r.artifact_type as string, status: r.status as string, agent: agentForArtifact(r.artifact_type as string)?.no ?? null,
    created_at: new Date(r.created_at as string).toISOString(), started_at: r.started_at ? new Date(r.started_at as string).toISOString() : null,
    finished_at: r.finished_at ? new Date(r.finished_at as string).toISOString() : null, note: (r.last_error as string | null) ?? null,
    tokens: Number(r.tokens_used ?? 0), budget: Number(r.token_budget ?? 0), attempts: Number(r.attempts ?? 0),
    artifact_id: (r.artifact_id as string | null) ?? null, steps: Number(r.steps ?? 0),
  }));
}

export function buildRouter(d: BoardDeps): Router {
  const r = new Router();
  const engine = () => ({ db: d.db, rules: d.rules, now: d.now });
  const emit = (...topics: string[]) => d.hub.emit(topics);

  // ---------------------------------------------------------------- status and the board
  r.get("/api/status", async () => {
    const lastSync = (await d.db.query("SELECT at FROM crm_syncs ORDER BY id DESC LIMIT 1")).rows[0];
    const site = await latestArtifact(d.db, "site_check");
    const mail = await latestArtifact(d.db, "mail_domain_check");
    return {
      now: d.now().toISOString(),
      model: { on: Boolean(d.model), kind: d.model?.kind ?? null, mode: d.modelMode ?? (d.model ? "api" : "off"), note: d.modelNote },
      crm: { url: d.crm.baseUrl, signedIn: d.crm.signedIn, user: d.crm.user, syncedAt: lastSync ? new Date(lastSync.at as string).toISOString() : null },
      website: { pages: d.website.pages, mailDomain: d.website.mailDomain, siteCheckedAt: site?.created_at ?? null, mailCheckedAt: mail?.created_at ?? null },
      brand: d.brandSource,
      rules: { version: d.rules.rulesVersion, approvedBy: d.rules.approved_by },
      db: d.dbKind,
    };
  });

  r.get("/api/board", async () => {
    const now = d.now();
    const today = riyadhDate(now);
    const opps = await listOpportunities(d.db);
    const queue = await listQueue(d.db, "pending");
    const evidence = await allEvidence(d.db);
    const usable = evidence.filter((e) => e.status === "approved" && (!e.expires_at || e.expires_at >= today));
    const proofs = projectProof(usable, d.rules);
    const units = await listUnits(d.db);
    const crm = await mirroredQuotes(d.db);
    const view = crmView(crm.quotes, d.rules, now);
    const site = await latestArtifact(d.db, "site_check");
    const mail = await latestArtifact(d.db, "mail_domain_check");
    const proposal = (await d.db.query("SELECT id, questions FROM entity_proposals WHERE status = 'proposed' ORDER BY id DESC LIMIT 1")).rows[0];
    const entity = await currentEntity(d.db);
    const contracting = opps.filter((o) => o.motion === "contracting" && isOpen(o.stage));
    return {
      today,
      decisions: opps.filter((o) => o.stage === "screened" && o.scorecard && !o.scorecard.decision)
        .map((o) => ({ id: o.id, title: o.title, value_min_sar: o.value_min_sar, value_max_sar: o.value_max_sar, overall: o.scorecard!.overall,
          due: o.scorecard!.decision_due, knockouts: o.scorecard!.knockouts.filter((k) => k.status !== "pass") })),
      drafts: queue.filter((q) => !REPORT_TYPES.has(q.artifact_type)).map((q) => ({ id: q.artifact_id, type: q.artifact_type, title: q.title, audience: q.audience,
        passed: q.passed, requested_at: q.requested_at, agent: agentForArtifact(q.artifact_type)?.no ?? null })),
      evidenceDrafts: evidence.filter((e) => e.status === "draft").length,
      proof: { documented: proofs.filter((p) => p.documented).length, required: d.rules.proof_test.projects_required, due: d.rules.proof_test.due,
        projects: proofs.length, commonestGap: Object.entries(proofs.flatMap((p) => p.missing).reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {}))
          .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null },
      pipeline: {
        contractingOpen: contracting.length,
        contractingMaxSar: contracting.reduce((n, o) => n + (o.value_max_sar ?? o.value_min_sar ?? 0), 0),
        byStage: Object.fromEntries(CONTRACTING_STAGES.filter(isOpen).map((s) => [s, contracting.filter((o) => o.stage === s).length])),
      },
      crm: { syncedAt: crm.syncedAt, signedIn: d.crm.signedIn, summary: crmSummary(view, now) },
      website: site ? { checked_at: site.created_at, verdict: (site.content as { verdict?: unknown }).verdict } : null,
      mail: mail ? { checked_at: mail.created_at, verdict: (mail.content as { verdict?: string }).verdict, summary: (mail.content as { summary?: string }).summary } : null,
      alerts: await pipelineAlerts(engine()),
      due: dueItems(units, today, d.rules.maintenance.renewal_window_days),
      liftsToConfirm: units.filter((u) => u.unverified).length,
      expiring: usable.filter((e) => e.expires_at && (Date.parse(e.expires_at) - Date.parse(today)) / 86_400_000 <= Math.max(...d.rules.evidence.expiry_alert_days))
        .map((e) => ({ id: e.id, title: e.title, expires_at: e.expires_at })),
      entity: { approved: entity ? { version: entity.version, at: entity.approved_at } : null, openQuestions: proposal ? (proposal.questions as string[]).length : 0 },
      runs: await recentRuns(d.db, 8),
      roster: rosterSummary(),
      model: Boolean(d.model),
    };
  });

  // ---------------------------------------------------------------- the department and its runs
  r.get("/api/roster", async () => {
    const last = (await d.db.query(
      `SELECT DISTINCT ON (artifact_type) artifact_type, status, created_at, id FROM work_orders ORDER BY artifact_type, created_at DESC, id DESC`,
    )).rows;
    const lastBy = new Map(last.map((x) => [x.artifact_type as string, { id: x.id as string, status: x.status as string, at: new Date(x.created_at as string).toISOString() }]));
    return {
      groups: GROUPS,
      summary: rosterSummary(),
      model: Boolean(d.model),
      agents: ROSTER.map((a) => {
        const types = a.runs?.artifactTypes ?? [];
        const lastRun = types.map((t) => lastBy.get(t)).filter(Boolean).sort((x, y) => y!.at.localeCompare(x!.at))[0] ?? null;
        return { ...a, lastRun, runnable: a.status === "live" && types.length > 0 && types.every((t) => CODE_ONLY.has(t) || Boolean(d.model)), needsModel: types.some((t) => !CODE_ONLY.has(t)) };
      }),
    };
  });

  r.get("/api/runs", async ({ url }) => recentRuns(d.db, Math.min(100, Number(url.searchParams.get("limit") ?? 30)), url.searchParams.get("type") ?? undefined));

  r.get("/api/runs/:id", async ({ params }) => {
    const [run] = (await recentRuns(d.db, 1000)).filter((x) => x.id === params.id);
    if (!run) throw new HttpError(404, `No run ${params.id}.`);
    const steps = (await d.db.query(
      `SELECT step, agent, outcome, model_served, input_tokens, output_tokens, latency_ms, details, at FROM run_log WHERE work_order_id = $1 ORDER BY id`, [params.id],
    )).rows.map((s) => ({ ...s, at: new Date(s.at as string).toISOString() }));
    const input = (await d.db.query("SELECT input FROM work_orders WHERE id = $1", [params.id])).rows[0]?.input ?? null;
    return { ...run, input, steps };
  });

  r.post("/api/runs", async ({ body }) => {
    const b = z.object({ type: z.string(), input: z.unknown().optional() }).parse(await body());
    if (!PIPELINES[b.type] || !RUN_INPUTS[b.type]) throw new HttpError(400, `There is no agent for ${b.type}.`);
    if (!CODE_ONLY.has(b.type) && !d.model) throw new HttpError(409, d.modelNote);
    const input = RUN_INPUTS[b.type]!.parse(b.input ?? {});
    const id = await enqueue(d.db, { artifactType: b.type, input, createdBy: d.actor, tokenBudget: DEFAULT_BUDGETS[b.type] });
    d.kick();
    emit("runs", "roster");
    return { id };
  });

  // ---------------------------------------------------------------- approvals
  r.get("/api/approvals", async ({ url }) => {
    const status = z.enum(["pending", "approved", "rejected", "all"]).parse(url.searchParams.get("status") ?? "pending");
    return (await listQueue(d.db, status)).map((q) => ({
      id: q.artifact_id, type: q.artifact_type, title: q.title, audience: q.audience, status: q.status, passed: q.passed, requested_at: q.requested_at,
      kind: REPORT_TYPES.has(q.artifact_type) ? "report" : "draft", agent: agentForArtifact(q.artifact_type)?.no ?? null,
      blocking: q.gate_report?.blocking?.length ?? 0, warnings: q.gate_report?.warnings?.length ?? 0,
    })).reverse();
  });

  r.get("/api/artifacts/:id", async ({ params }) => {
    const a = (await d.db.query(
      `SELECT a.*, p.status, p.decided_by, p.decided_at, p.reason FROM artifacts a JOIN approvals p ON p.artifact_id = a.id WHERE a.id = $1`, [params.id],
    )).rows[0];
    if (!a) throw new HttpError(404, `No draft ${params.id}.`);
    return { ...a, kind: REPORT_TYPES.has(a.artifact_type as string) ? "report" : "draft", agent: agentForArtifact(a.artifact_type as string) ?? null };
  });

  r.post("/api/artifacts/:id/decide", async ({ params, body }) => {
    const b = z.object({ decision: z.enum(["approved", "rejected"]), reason: z.string().optional() }).parse(await body());
    await decide(d.db, params.id!, { actor: d.actor, decision: b.decision, ...(b.reason?.trim() ? { reason: b.reason.trim() } : {}), rules: d.rules });
    emit("approvals", "board");
    return { ok: true };
  });

  // ---------------------------------------------------------------- pipeline
  r.get("/api/pipeline", async () => {
    const opps = await listOpportunities(d.db);
    return {
      opportunities: opps.map((o) => ({ ...o, allowed: allowedNext(o.motion, o.stage), open: isOpen(o.stage) })),
      accounts: (await d.db.query("SELECT id, name_en, name_ar, type, sector, priority_rank FROM accounts ORDER BY priority_rank NULLS LAST, name_en")).rows,
      alerts: await pipelineAlerts(engine()),
      lossReasons: LOSS_REASONS,
      stages: { contracting: CONTRACTING_STAGES, elevator: ELEVATOR_STAGES },
      initial: { contracting: initialStages("contracting"), elevator: initialStages("elevator") },
      serviceLines: d.rules.contracting.service_lines,
      band: d.rules.contracting.band_sar,
      factors: d.rules.scorecard.factors,
    };
  });

  r.get("/api/opportunities/:id/events", async ({ params }) =>
    (await d.db.query("SELECT at, actor, event, from_stage, to_stage, details FROM opportunity_events WHERE opportunity_id = $1 ORDER BY id", [params.id])).rows);

  r.post("/api/accounts", async ({ body }) => {
    const id = await createAccount(d.db, AccountInput.parse({ relationship_owner: d.actor, ...(await body() as object) }), d.actor);
    emit("pipeline");
    return { id };
  });

  r.post("/api/opportunities", async ({ body }) => {
    const o = OpportunityInput.parse(await body());
    const id = await createOpportunity(engine(), o, d.actor);
    emit("pipeline", "board");
    return { id };
  });

  r.post("/api/opportunities/:id/next-step", async ({ params, body }) => {
    await setNextStep(engine(), params.id!, NextStep.parse(await body()), d.actor);
    emit("pipeline", "board");
    return { ok: true };
  });

  r.post("/api/opportunities/:id/move", async ({ params, body }) => {
    const b = z.object({
      to: z.string(), nextStep: NextStep.optional(), reason: z.string().optional(),
      outcome: z.object({ primary_reason: z.string().optional(), value_sar: z.number().optional(), winner: z.string().optional() }).optional(),
    }).parse(await body());
    await transition(engine(), params.id!, b.to, { actor: d.actor, ...(b.nextStep ? { nextStep: b.nextStep } : {}), ...(b.reason ? { reason: b.reason } : {}), ...(b.outcome ? { outcome: b.outcome } : {}) });
    emit("pipeline", "board");
    return { ok: true };
  });

  r.post("/api/opportunities/:id/screen", async ({ params }) => {
    const s = await screen(engine(), params.id!, { actor: d.actor });
    emit("pipeline", "board");
    return s;
  });

  r.post("/api/opportunities/:id/decide", async ({ params, body }) => {
    const b = z.object({
      decision: z.enum(["go", "no_bid"]), reason: z.string(), override: z.string().optional(), nextStep: NextStep.optional(),
      scores: z.record(z.string(), z.object({ score: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), evidence: z.array(z.string()).optional() }).nullable()).optional(),
    }).parse(await body());
    const s = await decideBid(engine(), params.id!, { actor: d.actor, decision: b.decision, reason: b.reason,
      ...(b.override?.trim() ? { override: b.override } : {}), ...(b.nextStep ? { nextStep: b.nextStep } : {}), ...(b.scores ? { scores: b.scores } : {}) });
    emit("pipeline", "board");
    return s;
  });

  // ---------------------------------------------------------------- proof and evidence
  r.get("/api/evidence", async () => {
    const records = await allEvidence(d.db);
    const today = riyadhDate(d.now());
    const usable = records.filter((e) => e.status === "approved" && (!e.expires_at || e.expires_at >= today));
    return { records, proof: projectProof(usable, d.rules), test: d.rules.proof_test, brandDir: d.brandSource.dir, imported: records.some((e) => e.issuer === FACT_BASE_ISSUER) };
  });

  r.post("/api/evidence", async ({ body }) => {
    const id = await fileEvidence(d.db, EvidenceInput.parse({ ...(await body() as object), created_by: d.actor }));
    emit("evidence", "board");
    return { id };
  });

  r.post("/api/evidence/:id/approve", async ({ params }) => {
    await approveEvidence(d.db, params.id!, d.actor, d.rules);
    emit("evidence", "board");
    return { ok: true };
  });

  r.post("/api/evidence/:id/withdraw", async ({ params, body }) => {
    const b = z.object({ reason: z.string().min(3) }).parse(await body());
    await withdrawEvidence(d.db, params.id!, d.actor, b.reason);
    emit("evidence", "board");
    return { ok: true };
  });

  // Approved evidence can't change, so naming a client in tenders is a new approval record beside the public one.
  r.post("/api/evidence/naming", async ({ body }) => {
    const b = z.object({ project_ref: z.string().regex(/^PRJ-\d+$/), client: z.string().min(2), use: z.enum(["tender"]) }).parse(await body());
    const id = await fileEvidence(d.db, { type: "client_naming_approval", tier: "tender", project_ref: b.project_ref, title: `${b.client} may be named in tenders`,
      permitted_uses: [`name_client:${b.use}`], facts: [], created_by: d.actor } as z.input<typeof EvidenceInput>);
    await approveEvidence(d.db, id, d.actor, d.rules);
    emit("evidence");
    return { id };
  });

  r.post("/api/import-facts", async () => {
    if (!d.brandSource.dir) throw new HttpError(409, "The qottuf-brand skill wasn't found on this computer. Set QOTTUF_BRAND_DIR in .env to its folder, then restart the board.");
    const result = await importBrandFacts(d.db, d.rules, d.brand, d.brandSource.dir, d.actor);
    emit("evidence", "lifts", "footprint", "board");
    return result;
  });

  // ---------------------------------------------------------------- lifts
  r.get("/api/lifts", async () => {
    const units = await listUnits(d.db);
    return { units, due: dueItems(units, riyadhDate(d.now()), d.rules.maintenance.renewal_window_days), gaps: await registryGaps(d.db),
      toConfirm: units.filter((u) => u.unverified).length, windowDays: d.rules.maintenance.renewal_window_days };
  });

  r.post("/api/lifts", async ({ body }) => {
    const id = await registerUnit(d.db, d.rules, UnitInput.parse(await body()), d.actor);
    emit("lifts", "board");
    return { id };
  });

  r.post("/api/lifts/:id/:action", async ({ params, body }) => {
    const b = (await body()) as Record<string, unknown>;
    const id = params.id!;
    const date = (v: unknown) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date").parse(v);
    switch (params.action) {
      case "confirm": await confirmUnit(d.db, d.rules, id, UnitConfirmation.parse(b), d.actor); break;
      case "consent": await recordOwnerConsent(d.db, d.rules, id, date(b.on), d.actor); break;
      case "offer": await recordMaintenanceOffer(d.db, d.rules, id, z.enum(["offered", "accepted", "declined"]).parse(b.outcome), d.actor); break;
      case "contract": await setMaintenanceContract(d.db, d.rules, id, MaintenanceContract.parse(b.contract), d.actor); break;
      case "inspection": await recordInspection(d.db, d.rules, id, date(b.on), d.actor); break;
      case "registration": await recordRegistration(d.db, d.rules, id, date(b.on), d.actor); break;
      default: throw new HttpError(404, `No lift action ${params.action}.`);
    }
    emit("lifts", "board");
    return { ok: true };
  });

  // ---------------------------------------------------------------- the public footprint: company record, listings, website, mail
  r.get("/api/footprint", async () => {
    const proposal = (await d.db.query("SELECT * FROM entity_proposals WHERE status = 'proposed' ORDER BY id DESC LIMIT 1")).rows[0] ?? null;
    return {
      entity: await currentEntity(d.db),
      proposal,
      listings: await listingsReport(d.db, d.brand, d.now(), d.rules.maintenance.listing_recheck_days),
      site: await latestArtifact(d.db, "site_check"),
      mail: await latestArtifact(d.db, "mail_domain_check"),
      pages: d.website.pages,
      mailDomain: d.website.mailDomain,
    };
  });

  r.post("/api/entity/proposal", async ({ body }) => {
    const b = z.object({ fields: EntityFields.partial(), questions: z.array(z.string().min(3)).default([]) }).parse(await body());
    await d.db.tx(async (q) => {
      await q.query("UPDATE entity_proposals SET status = 'superseded' WHERE status = 'proposed'");
      await q.query("INSERT INTO entity_proposals (fields, questions, proposed_by) VALUES ($1,$2,$3)", [JSON.stringify(b.fields), JSON.stringify(b.questions), d.actor]);
    });
    emit("footprint", "board");
    return { ok: true };
  });

  r.post("/api/entity/approve", async () => {
    const p = (await d.db.query("SELECT id, fields, questions FROM entity_proposals WHERE status = 'proposed' ORDER BY id DESC LIMIT 1")).rows[0];
    if (!p) throw new HttpError(409, "There is no proposed record to approve.");
    if ((p.questions as string[]).length) throw new HttpError(409, "Settle the open questions first: edit the record and delete each question once it's answered.");
    const parsed = EntityFields.safeParse(p.fields);
    if (!parsed.success) throw new HttpError(409, `Fill in first: ${[...new Set(parsed.error.issues.map((i) => i.path.join(".")))].join(", ")}.`);
    const version = await approveEntityVersion(d.db, d.rules, d.brand, { fields: parsed.data, note: "Approved on the board" }, d.actor);
    await d.db.query("UPDATE entity_proposals SET status = 'approved', approved_version = $2 WHERE id = $1", [p.id, version]);
    emit("footprint", "board");
    return { version };
  });

  // ---------------------------------------------------------------- the elevator CRM
  r.get("/api/crm", async () => {
    const m = await mirroredQuotes(d.db);
    const view = crmView(m.quotes, d.rules, d.now());
    return {
      url: d.crm.baseUrl, signedIn: d.crm.signedIn, user: d.crm.user, syncedAt: m.syncedAt, role: m.role,
      quotes: view.map((x) => ({ ...x, crm_url: d.crm.quoteUrl(x.id) })), summary: crmSummary(view, d.now()),
      sla: { firstContactHours: d.rules.elevator.first_contact_hours, technicalHours: d.rules.elevator.technical_response_hours },
    };
  });

  r.post("/api/crm/sign-in", async ({ body }) => {
    const b = z.object({ email: z.string().min(3), password: z.string().min(1), code: z.string().regex(/^[A-Za-z0-9-]{6,20}$/).optional() }).parse(await body());
    const user = await d.crm.signIn(b.email.trim(), b.password, b.code?.trim() || undefined);
    const synced = await syncCrm(d.db, d.crm, d.actor);
    emit("crm", "board", "status");
    return { user, ...synced };
  });

  r.post("/api/crm/sync", async () => {
    const synced = await syncCrm(d.db, d.crm, d.actor);
    emit("crm", "board", "status");
    return synced;
  });

  r.post("/api/crm/sign-out", async () => {
    await d.crm.signOut();
    emit("crm", "status");
    return { ok: true };
  });

  // ---------------------------------------------------------------- check any text
  r.post("/api/check-text", async ({ body }) => {
    const b = z.object({ en: z.string().max(50_000).optional(), ar: z.string().max(50_000).optional(), audience: z.enum(["public", "client", "internal"]) }).parse(await body());
    if (!b.en?.trim() && !b.ar?.trim()) throw new HttpError(400, "Paste some English or Arabic text.");
    const today = riyadhDate(d.now());
    const evidence = (await allEvidence(d.db)).filter((e) => e.status === "approved" && (!e.expires_at || e.expires_at >= today)
      && (b.audience === "public" ? e.tier === "public" : e.tier === "public" || e.tier === "tender"));
    const texts = { ...(b.en?.trim() ? { en: b.en } : {}), ...(b.ar?.trim() ? { ar: b.ar } : {}) };
    const report = runTextGates(texts, { rules: d.brand, figures: [...rulebookFigures(d.brand), ...figuresFromEvidence(evidence)], audience: b.audience, formal: false });
    if (texts.en && texts.ar) {
      for (const f of checkParity(texts.en, texts.ar, d.brand, isStrict(b.audience))) (f.severity === "fail" ? report.blocking : report.warnings).push({ ...f, lang: f.rule.endsWith("_in_ar") ? "ar" : "en" });
      for (const f of glossarySignals(texts.en, texts.ar, d.brand)) report.warnings.push({ ...f, lang: "ar" });
      report.passed = report.blocking.length === 0;
    }
    return report;
  });

  return r;
}

/** Turn an error into a status and a message the board can show as it is. */
export function errorReply(e: unknown): { status: number; body: Record<string, unknown> } {
  if (e instanceof HttpError) return { status: e.status, body: { error: e.message, ...(e.details ? { details: e.details } : {}) } };
  if (e instanceof z.ZodError) {
    return { status: 400, body: { error: `Check the form: ${e.issues.slice(0, 4).map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}.`, issues: e.issues } };
  }
  if (e instanceof EngineError || e instanceof GateError) return { status: 409, body: { error: e.message } };
  if (e instanceof CrmError) {
    const status = { not_signed_in: 401, bad_credentials: 401, mfa_required: 401, mfa_invalid: 401, rate_limited: 429, forbidden: 403, unreachable: 502, bad_reply: 502 }[e.code];
    return { status, body: { error: e.message, code: e.code } };
  }
  const message = (e as Error)?.message ?? String(e);
  if (/forbid_mutation|append-only|immutable|approval_guard|evidence_guard/i.test(message)) return { status: 409, body: { error: `The Ledger refused that change: ${message}` } };
  return { status: 500, body: { error: `Something went wrong on the board: ${message}` } };
}
