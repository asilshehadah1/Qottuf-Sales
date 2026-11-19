// The Pipeline Engine (spec §6 S1-04; merged roster #2). Code only, no model anywhere in it.
// - Stage rules for both motions; illegal moves are refused.
// - Every open opportunity has an owner, a next step and a date (principle 11).
// - Screening runs the knock-outs and starts the 48-hour bid-decision timer.
// - Only an authorised approver (Asil, per the rules file) decides a bid; a knock-out can be overridden only by
//   that approver, with a reason, and the override is logged.
// - Every decision records the rules version that made it (principle 20).

import { audit } from "../audit/audit.ts";
import { canApprove, type BusinessRules } from "../config/rules.ts";
import { toNumber, type Db, type Queryable } from "../db/db.ts";
import { projectProof, documentedReferences } from "../ledger/proof.ts";
import { GateError, readEvidence } from "../ledger/repo.ts";
import { NextStep } from "../ledger/schemas.ts";
import {
  contractingKnockOuts, overallKnockOut, scoreOpportunity,
  type FactorScore, type KnockOut, type OpportunityFacts, type ScoreResult,
} from "./scorecard.ts";
import { allowedNext, initialStages, isOpen, LOSS_REASONS, type Motion } from "./stages.ts";
import { addHours, workingDaysBetween } from "./workdays.ts";

export class EngineError extends Error {}

export interface EngineDeps {
  db: Db;
  rules: BusinessRules;
  now?: () => Date;
}

export interface OpportunityRow {
  id: string;
  version: number;
  motion: Motion;
  title: string;
  account_id: string | null;
  route: string;
  qottuf_role: string;
  sector: string | null;
  service_lines: string[];
  stage: string;
  stage_entered_at: Date;
  owner: string;
  next_step: NextStep | null;
  value_min_sar: number | null;
  value_max_sar: number | null;
  value_source: string;
  dates: Record<string, string>;
  requirements: OpportunityFacts["requirements"];
  scorecard: Screening | null;
  outcome: Record<string, unknown> | null;
  created_at: Date;
}

export interface Screening {
  knockouts: KnockOut[];
  overall: "pass" | "fail" | "verify";
  rules_version: string;
  screened_at: string;
  decision_due: string;
  score?: ScoreResult;
  decision?: { decision: "go" | "no_bid"; by: string; at: string; reason: string; override?: string };
}

export interface OpportunityCreate {
  motion: Motion;
  title: string;
  account_id?: string;
  route: string;
  qottuf_role: string;
  sector?: string;
  service_lines?: string[];
  stage: string;
  owner: string;
  next_step: NextStep;
  value_min_sar?: number;
  value_max_sar?: number;
  value_source?: "tender" | "estimate" | "client" | "unknown";
  dates?: Record<string, string>;
  requirements?: OpportunityFacts["requirements"];
  /** For maintenance renewals and inspections: the lift this opportunity is about. */
  installed_unit_id?: string;
}

const now = (deps: EngineDeps) => (deps.now ? deps.now() : new Date());

function rowToOpportunity(r: Record<string, unknown>): OpportunityRow {
  return {
    id: r.id as string,
    version: Number(r.version),
    motion: r.motion as Motion,
    title: r.title as string,
    account_id: (r.account_id as string | null) ?? null,
    route: r.route as string,
    qottuf_role: r.qottuf_role as string,
    sector: (r.sector as string | null) ?? null,
    service_lines: (r.service_lines as string[]) ?? [],
    stage: r.stage as string,
    stage_entered_at: new Date(r.stage_entered_at as string),
    owner: r.owner as string,
    next_step: (r.next_step as NextStep | null) ?? null,
    value_min_sar: toNumber(r.value_min_sar),
    value_max_sar: toNumber(r.value_max_sar),
    value_source: r.value_source as string,
    dates: (r.dates as Record<string, string>) ?? {},
    requirements: (r.requirements as OpportunityFacts["requirements"]) ?? {},
    scorecard: (r.scorecard as Screening | null) ?? null,
    outcome: (r.outcome as Record<string, unknown> | null) ?? null,
    created_at: new Date(r.created_at as string),
  };
}

export async function getOpportunity(q: Queryable, id: string, forUpdate = false): Promise<OpportunityRow> {
  const r = (await q.query(`SELECT * FROM opportunities WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`, [id])).rows[0];
  if (!r) throw new EngineError(`no opportunity ${id}`);
  return rowToOpportunity(r);
}

export async function listOpportunities(q: Queryable): Promise<OpportunityRow[]> {
  return (await q.query("SELECT * FROM opportunities ORDER BY id")).rows.map(rowToOpportunity);
}

function checkNextStep(step: unknown, at: Date): NextStep {
  const parsed = NextStep.safeParse(step);
  if (!parsed.success) throw new EngineError(`every open opportunity needs a next step with an action, an owner and a date: ${parsed.error.issues[0]?.message}`);
  if (new Date(parsed.data.due_at).getTime() < at.getTime() - 60_000) {
    throw new EngineError("the next step's date is in the past");
  }
  return parsed.data;
}

async function event(
  q: Queryable, deps: EngineDeps, oppId: string, actor: string, kind: string,
  from: string | null, to: string | null, details: Record<string, unknown> = {},
): Promise<void> {
  await q.query(
    `INSERT INTO opportunity_events (opportunity_id, actor, event, from_stage, to_stage, rules_version, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [oppId, actor, kind, from, to, deps.rules.rulesVersion, JSON.stringify(details)],
  );
  await audit(q, { actor, action: `opportunity_${kind}`, entity: "opportunity", entityId: oppId, details: { from, to, ...details } });
}

export async function createOpportunity(deps: EngineDeps, input: OpportunityCreate, actor: string): Promise<string> {
  if (!initialStages(input.motion).includes(input.stage)) {
    throw new EngineError(`${input.motion} opportunities start at ${initialStages(input.motion).join(" or ")}, not ${input.stage}`);
  }
  const next = checkNextStep(input.next_step, now(deps));
  return deps.db.tx(async (q) => {
    const id = (
      await q.query<{ id: string }>(
        `INSERT INTO opportunities (motion, title, account_id, route, qottuf_role, sector, service_lines, stage, owner, next_step,
                                    value_min_sar, value_max_sar, value_source, dates, requirements, installed_unit_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [input.motion, input.title, input.account_id ?? null, input.route, input.qottuf_role, input.sector ?? null,
          input.service_lines ?? [], input.stage, input.owner, JSON.stringify(next), input.value_min_sar ?? null,
          input.value_max_sar ?? null, input.value_source ?? "unknown", JSON.stringify(input.dates ?? {}),
          JSON.stringify(input.requirements ?? {}), input.installed_unit_id ?? null],
      )
    ).rows[0]!.id;
    await event(q, deps, id, actor, "created", null, input.stage, { next_step: next });
    return id;
  });
}

export async function setNextStep(deps: EngineDeps, id: string, step: NextStep, actor: string): Promise<void> {
  const next = checkNextStep(step, now(deps));
  await deps.db.tx(async (q) => {
    const opp = await getOpportunity(q, id, true);
    if (!isOpen(opp.stage)) throw new EngineError(`${id} is closed (${opp.stage})`);
    await q.query("UPDATE opportunities SET next_step = $2, version = version + 1, updated_at = now() WHERE id = $1", [id, JSON.stringify(next)]);
    await event(q, deps, id, actor, "next_step", opp.stage, opp.stage, { next_step: next });
  });
}

export interface TransitionOptions {
  actor: string;
  nextStep?: NextStep;
  reason?: string;
  outcome?: { primary_reason?: string; secondary_reasons?: string[]; value_sar?: number; winner?: string };
}

const GATED = new Set(["screened", "go", "no_bid"]);

export async function transition(deps: EngineDeps, id: string, to: string, opts: TransitionOptions): Promise<void> {
  await deps.db.tx(async (q) => {
    const opp = await getOpportunity(q, id, true);
    if (opp.motion === "contracting" && GATED.has(to) && !(to === "no_bid" && opp.stage === "invitation")) {
      throw new EngineError(`use screen() and decideBid() to move ${id} to ${to}: the bid gate (S-G1) runs there`);
    }
    await applyTransition(q, deps, opp, to, opts);
  });
}

async function applyTransition(q: Queryable, deps: EngineDeps, opp: OpportunityRow, to: string, opts: TransitionOptions, extra: Record<string, unknown> = {}): Promise<void> {
  if (!allowedNext(opp.motion, opp.stage).includes(to)) {
    throw new EngineError(`${opp.id}: ${opp.stage} → ${to} is not allowed (allowed: ${allowedNext(opp.motion, opp.stage).join(", ") || "none"})`);
  }
  let next: NextStep | null = null;
  if (isOpen(to)) {
    next = checkNextStep(opts.nextStep, now(deps));
  }
  let outcome: Record<string, unknown> | null = null;
  if (to === "lost") {
    const reason = opts.outcome?.primary_reason;
    if (!reason || !(LOSS_REASONS as readonly string[]).includes(reason)) {
      throw new EngineError(`a loss needs a primary reason from the taxonomy: ${LOSS_REASONS.join(", ")}`);
    }
    outcome = { result: "lost", ...opts.outcome };
  } else if (to === "won") {
    if (!opts.outcome?.value_sar) throw new EngineError("a win needs the contract value");
    outcome = { result: "won", ...opts.outcome };
  } else if (to === "no_bid" || to === "withdrawn" || to === "cancelled") {
    if (!opts.reason) throw new EngineError(`${to} needs a reason`);
    outcome = { result: to, reason: opts.reason };
  }
  await q.query(
    `UPDATE opportunities SET stage = $2, stage_entered_at = now(), next_step = $3, outcome = coalesce($4, outcome),
            version = version + 1, updated_at = now() WHERE id = $1`,
    [opp.id, to, next ? JSON.stringify(next) : null, outcome ? JSON.stringify(outcome) : null],
  );
  await event(q, deps, opp.id, opts.actor, "transition", opp.stage, to, { ...(next ? { next_step: next } : {}), ...(opts.reason ? { reason: opts.reason } : {}), ...extra });
}

/** Run the knock-outs on an invited tender and start the 48-hour bid-decision timer. */
export async function screen(deps: EngineDeps, id: string, opts: { actor: string; nextStep?: NextStep }): Promise<Screening> {
  const at = now(deps);
  const evidence = await readEvidence(deps.db, { maxTier: "tender", readBy: "engine:screen", purpose: `screen ${id}` });
  const certificates = evidence.filter((e) => e.type === "certificate");
  const references = documentedReferences(projectProof(evidence, deps.rules));
  return deps.db.tx(async (q) => {
    const opp = await getOpportunity(q, id, true);
    if (opp.motion !== "contracting" || opp.stage !== "invitation") {
      throw new EngineError(`${id} must be a contracting opportunity at the invitation stage to be screened (it is ${opp.stage})`);
    }
    const knockouts = contractingKnockOuts(opp, { rules: deps.rules, now: at, certificates, references });
    const due = addHours(at, deps.rules.contracting.bid_decision_hours);
    const screening: Screening = {
      knockouts,
      overall: overallKnockOut(knockouts),
      rules_version: deps.rules.rulesVersion,
      screened_at: at.toISOString(),
      decision_due: due.toISOString(),
    };
    const nextStep = opts.nextStep ?? { action: "Bid decision (gate S-G1)", owner: "asil", due_at: due.toISOString() };
    await q.query("UPDATE opportunities SET scorecard = $2, dates = dates || $3 WHERE id = $1",
      [id, JSON.stringify(screening), JSON.stringify({ bid_decision_due: due.toISOString() })]);
    await applyTransition(q, deps, opp, "screened", { actor: opts.actor, nextStep }, { knockouts: screening.overall });
    return screening;
  });
}

export interface BidDecision {
  actor: string;
  decision: "go" | "no_bid";
  reason: string;
  scores?: Record<string, FactorScore | null>;
  /** Required to bid despite a failed knock-out; only an S-G1 approver may give it. */
  override?: string;
  nextStep?: NextStep;
}

/** Gate S-G1: the bid decision. */
export async function decideBid(deps: EngineDeps, id: string, d: BidDecision): Promise<Screening> {
  if (!canApprove(deps.rules, "S-G1", d.actor)) throw new GateError(`${d.actor} may not decide bids (gate S-G1)`);
  if (!d.reason?.trim()) throw new EngineError("a bid decision needs a reason");
  return deps.db.tx(async (q) => {
    const opp = await getOpportunity(q, id, true);
    if (opp.stage !== "screened" || !opp.scorecard) throw new EngineError(`${id} must be screened before a bid decision (it is ${opp.stage})`);
    const s: Screening = { ...opp.scorecard };
    if (d.scores) s.score = scoreOpportunity(d.scores, deps.rules);
    if (d.decision === "go" && s.overall === "fail") {
      if (!d.override?.trim()) {
        const failed = s.knockouts.filter((k) => k.status === "fail").map((k) => `${k.code} (${k.detail})`).join("; ");
        throw new EngineError(`knock-out failed: ${failed}. Bidding anyway needs an override with a reason.`);
      }
      await event(q, deps, id, d.actor, "override", opp.stage, opp.stage, { override: d.override, knockouts: s.knockouts.filter((k) => k.status === "fail") });
    }
    if (s.knockouts.some((k) => k.code === "K6" && k.status === "fail") && d.decision === "go") {
      throw new EngineError("an upheld integrity flag has no override");
    }
    s.decision = { decision: d.decision, by: d.actor, at: now(deps).toISOString(), reason: d.reason, ...(d.override ? { override: d.override } : {}) };
    await q.query("UPDATE opportunities SET scorecard = $2 WHERE id = $1", [id, JSON.stringify(s)]);
    await event(q, deps, id, d.actor, "decision", opp.stage, d.decision, {
      decision: d.decision, reason: d.reason, score: s.score?.score ?? null, partial: s.score?.partial ?? null,
      scorecard_version: deps.rules.scorecard.version,
    });
    await applyTransition(q, deps, opp, d.decision, {
      actor: d.actor, reason: d.reason, ...(d.nextStep ? { nextStep: d.nextStep } : {}),
    });
    return s;
  });
}

export interface Alert {
  kind: "next_step_overdue" | "missing_next_step" | "bid_decision_overdue" | "submission_soon" | "clarification_soon"
    | "first_contact_overdue" | "technical_response_overdue";
  opportunityId: string;
  title: string;
  owner: string;
  detail: string;
  due?: string;
}

/** Everything that needs attention now, computed from the Ledger. */
export async function pipelineAlerts(deps: EngineDeps): Promise<Alert[]> {
  const at = now(deps);
  const out: Alert[] = [];
  for (const o of await listOpportunities(deps.db)) {
    if (!isOpen(o.stage)) continue;
    if (!o.next_step) {
      out.push({ kind: "missing_next_step", opportunityId: o.id, title: o.title, owner: o.owner, detail: "No next step: every open opportunity needs one." });
    } else if (new Date(o.next_step.due_at) < at) {
      out.push({ kind: "next_step_overdue", opportunityId: o.id, title: o.title, owner: o.next_step.owner,
        detail: `Overdue: ${o.next_step.action}`, due: o.next_step.due_at });
    }
    if (o.motion === "contracting") {
      if (o.stage === "screened" && o.dates.bid_decision_due && new Date(o.dates.bid_decision_due) < at) {
        out.push({ kind: "bid_decision_overdue", opportunityId: o.id, title: o.title, owner: "asil",
          detail: "The 48-hour bid decision is overdue.", due: o.dates.bid_decision_due });
      }
      const sub = o.dates.submission_deadline;
      if (sub && (o.stage === "go" || o.stage === "screened") && new Date(sub) > at && workingDaysBetween(at, new Date(sub), deps.rules) <= 3) {
        out.push({ kind: "submission_soon", opportunityId: o.id, title: o.title, owner: o.owner, detail: "Submission within 3 working days.", due: sub });
      }
      const cl = o.dates.clarification_deadline;
      if (cl && new Date(cl) > at && workingDaysBetween(at, new Date(cl), deps.rules) <= 2) {
        out.push({ kind: "clarification_soon", opportunityId: o.id, title: o.title, owner: o.owner, detail: "Clarification deadline within 2 working days.", due: cl });
      }
    } else {
      const e = deps.rules.elevator;
      if (o.stage === "new" && addHours(o.created_at, e.first_contact_hours) < at) {
        out.push({ kind: "first_contact_overdue", opportunityId: o.id, title: o.title, owner: o.owner,
          detail: `No first contact within ${e.first_contact_hours} hours.` });
      }
      if (o.stage === "tech_review" && addHours(o.stage_entered_at, e.technical_response_hours) < at) {
        out.push({ kind: "technical_response_overdue", opportunityId: o.id, title: o.title, owner: "technical_office",
          detail: `Technical response past ${e.technical_response_hours} hours.` });
      }
    }
  }
  return out;
}
