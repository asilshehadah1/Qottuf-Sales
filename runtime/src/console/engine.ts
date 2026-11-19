// The Pipeline Engine's rules for the console, as pure functions over the documents the console stores.
// Same rules as the server engine (pipeline/engine.ts): the stage machine in stages.ts, an owner + next step + date
// on every open opportunity, screening with the knock-outs, bid decisions by the owner only (S-G1), overrides
// only with a reason, enumerated loss reasons, and the same alerts. Each function returns a new document.

import type { BusinessRules } from "../config/schema.ts";
import { dueItems, type Unit } from "../installedBase/due.ts";
import { documentedReferences, projectProof } from "../ledger/proof.ts";
import { NextStep, type EvidenceRecord } from "../ledger/schemas.ts";
import {
  contractingKnockOuts, overallKnockOut, scoreOpportunity, type FactorScore, type KnockOut, type OpportunityFacts, type ScoreResult,
} from "../pipeline/scorecard.ts";
import { allowedNext, initialStages, isOpen, LOSS_REASONS, type Motion } from "../pipeline/stages.ts";
import { addHours, workingDaysBetween } from "../pipeline/workdays.ts";

export interface HistoryEntry {
  at: string;
  by: string;
  event: "created" | "transition" | "next_step" | "decision" | "override" | "screened";
  from?: string;
  to?: string;
  detail?: string;
  rules_version?: string;
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

export interface ConsoleOpp {
  id: string;
  motion: Motion;
  title: string;
  account_id: string | null;
  route: string;
  qottuf_role: string;
  sector: string | null;
  service_lines: string[];
  stage: string;
  stage_entered_at: string;
  owner: string;
  next_step: NextStep | null;
  value_min_sar: number | null;
  value_max_sar: number | null;
  value_source: string;
  dates: Record<string, string>;
  requirements: OpportunityFacts["requirements"];
  screening: Screening | null;
  outcome: Record<string, unknown> | null;
  installed_unit_id: string | null;
  history: HistoryEntry[];
  example?: boolean;
  created_at: string;
  updated_at: string;
}

export class RuleError extends Error {}

const HISTORY_CAP = 60;

function withHistory(opp: ConsoleOpp, e: HistoryEntry): HistoryEntry[] {
  return [...opp.history, e].slice(-HISTORY_CAP);
}

function checkNextStep(step: unknown, now: Date): NextStep {
  const parsed = NextStep.safeParse(step);
  if (!parsed.success) throw new RuleError("Every open opportunity needs a next step with an action, an owner and a date.");
  if (new Date(parsed.data.due_at).getTime() < now.getTime() - 60_000) throw new RuleError("The next step's date is in the past.");
  return parsed.data;
}

export interface NewOpportunity {
  id: string;
  motion: Motion;
  title: string;
  account_id?: string | null;
  route: string;
  qottuf_role: string;
  sector?: string | null;
  service_lines?: string[];
  stage: string;
  owner: string;
  next_step: unknown;
  value_min_sar?: number | null;
  value_max_sar?: number | null;
  value_source?: string;
  dates?: Record<string, string>;
  requirements?: OpportunityFacts["requirements"];
  installed_unit_id?: string | null;
}

export function newOpportunity(input: NewOpportunity, ctx: { now: Date; by: string; rulesVersion: string }): ConsoleOpp {
  if (!input.title.trim()) throw new RuleError("Give the opportunity a title.");
  if (!initialStages(input.motion).includes(input.stage)) {
    throw new RuleError(`${input.motion === "contracting" ? "Contracting" : "Elevator"} opportunities start at ${initialStages(input.motion).join(" or ")}.`);
  }
  const lo = input.value_min_sar ?? null;
  const hi = input.value_max_sar ?? null;
  if (lo !== null && hi !== null && lo > hi) throw new RuleError("The value range's minimum is above its maximum.");
  const next = checkNextStep(input.next_step, ctx.now);
  const at = ctx.now.toISOString();
  return {
    id: input.id, motion: input.motion, title: input.title.trim(), account_id: input.account_id ?? null, route: input.route,
    qottuf_role: input.qottuf_role, sector: input.sector ?? null, service_lines: input.service_lines ?? [], stage: input.stage,
    stage_entered_at: at, owner: input.owner, next_step: next, value_min_sar: lo, value_max_sar: hi,
    value_source: input.value_source ?? "unknown", dates: input.dates ?? {}, requirements: input.requirements ?? {},
    screening: null, outcome: null, installed_unit_id: input.installed_unit_id ?? null,
    history: [{ at, by: ctx.by, event: "created", to: input.stage, rules_version: ctx.rulesVersion }],
    created_at: at, updated_at: at,
  };
}

export function setNextStep(opp: ConsoleOpp, step: unknown, ctx: { now: Date; by: string }): ConsoleOpp {
  if (!isOpen(opp.stage)) throw new RuleError("This opportunity is closed.");
  const next = checkNextStep(step, ctx.now);
  const at = ctx.now.toISOString();
  return { ...opp, next_step: next, updated_at: at, history: withHistory(opp, { at, by: ctx.by, event: "next_step", detail: next.action }) };
}

const GATED = new Set(["screened", "go"]);

export interface MoveOptions {
  nextStep?: unknown;
  reason?: string;
  outcome?: { primary_reason?: string; value_sar?: number; winner?: string };
}

/** Any stage change except the gated ones (screening and the bid decision have their own functions). */
export function moveOpportunity(opp: ConsoleOpp, to: string, o: MoveOptions, ctx: { now: Date; by: string; rulesVersion: string }): ConsoleOpp {
  if (opp.motion === "contracting" && (GATED.has(to) || (to === "no_bid" && opp.stage === "screened"))) {
    throw new RuleError("Screening and the bid decision (S-G1) have their own steps.");
  }
  if (!allowedNext(opp.motion, opp.stage).includes(to)) {
    throw new RuleError(`${opp.stage} → ${to} isn't allowed. Next can be: ${allowedNext(opp.motion, opp.stage).join(", ") || "nothing (closed)"}.`);
  }
  const next = isOpen(to) ? checkNextStep(o.nextStep, ctx.now) : null;
  let outcome: Record<string, unknown> | null = opp.outcome;
  if (to === "lost") {
    if (!o.outcome?.primary_reason || !(LOSS_REASONS as readonly string[]).includes(o.outcome.primary_reason)) {
      throw new RuleError("A loss needs a reason from the list.");
    }
    outcome = { result: "lost", ...o.outcome };
  } else if (to === "won") {
    if (!o.outcome?.value_sar || o.outcome.value_sar <= 0) throw new RuleError("A win needs the contract value.");
    outcome = { result: "won", ...o.outcome };
  } else if (to === "no_bid" || to === "withdrawn" || to === "cancelled") {
    if (!o.reason?.trim()) throw new RuleError(`Say why it is ${to.replace("_", "-")}.`);
    outcome = { result: to, reason: o.reason.trim() };
  }
  const at = ctx.now.toISOString();
  return {
    ...opp, stage: to, stage_entered_at: at, next_step: next, outcome, updated_at: at,
    history: withHistory(opp, { at, by: ctx.by, event: "transition", from: opp.stage, to, rules_version: ctx.rulesVersion, ...(o.reason ? { detail: o.reason } : {}) }),
  };
}

/** Run the knock-outs on an invited tender and start the 48-hour bid-decision timer. */
export function screenOpportunity(opp: ConsoleOpp, ctx: { now: Date; by: string; rules: BusinessRules; evidence: EvidenceRecord[] }): ConsoleOpp {
  if (opp.motion !== "contracting" || opp.stage !== "invitation") throw new RuleError("Only a contracting invitation can be screened.");
  const approved = ctx.evidence.filter((e) => e.status === "approved");
  const knockouts = contractingKnockOuts(opp, {
    rules: ctx.rules, now: ctx.now,
    certificates: approved.filter((e) => e.type === "certificate"),
    references: documentedReferences(projectProof(approved, ctx.rules)),
  });
  const due = addHours(ctx.now, ctx.rules.contracting.bid_decision_hours).toISOString();
  const at = ctx.now.toISOString();
  return {
    ...opp, stage: "screened", stage_entered_at: at, updated_at: at,
    screening: { knockouts, overall: overallKnockOut(knockouts), rules_version: ctx.rules.rulesVersion, screened_at: at, decision_due: due },
    dates: { ...opp.dates, bid_decision_due: due },
    next_step: { action: "Bid decision (gate S-G1)", owner: "asil", due_at: due },
    history: withHistory(opp, { at, by: ctx.by, event: "screened", from: opp.stage, to: "screened", rules_version: ctx.rules.rulesVersion, detail: `knock-outs ${overallKnockOut(knockouts)}` }),
  };
}

export interface BidDecision {
  decision: "go" | "no_bid";
  reason: string;
  override?: string;
  scores?: Record<string, FactorScore | null>;
  nextStep?: unknown;
}

/** Gate S-G1: only the owner of the console (Asil) decides bids. */
export function decideBid(opp: ConsoleOpp, d: BidDecision, ctx: { now: Date; by: string; isOwner: boolean; rules: BusinessRules }): ConsoleOpp {
  if (!ctx.isOwner) throw new RuleError("Only Asil decides bids (gate S-G1).");
  if (opp.stage !== "screened" || !opp.screening) throw new RuleError("Screen the invitation before deciding.");
  if (!d.reason.trim()) throw new RuleError("A bid decision needs a reason.");
  const s: Screening = { ...opp.screening };
  if (d.scores) s.score = scoreOpportunity(d.scores, ctx.rules);
  const at = ctx.now.toISOString();
  let history = opp.history;
  if (d.decision === "go") {
    if (s.knockouts.some((k) => k.code === "K6" && k.status === "fail")) throw new RuleError("An upheld integrity flag has no override.");
    if (s.overall === "fail") {
      if (!d.override?.trim()) throw new RuleError("A knock-out failed. To bid anyway, give the reason for overriding it.");
      history = [...history, { at, by: ctx.by, event: "override" as const, detail: d.override.trim() }];
    }
  }
  s.decision = { decision: d.decision, by: ctx.by, at, reason: d.reason.trim(), ...(d.override?.trim() ? { override: d.override.trim() } : {}) };
  const next = d.decision === "go" ? checkNextStep(d.nextStep, ctx.now) : null;
  return {
    ...opp, screening: s, stage: d.decision, stage_entered_at: at, next_step: next, updated_at: at,
    outcome: d.decision === "no_bid" ? { result: "no_bid", reason: d.reason.trim() } : opp.outcome,
    history: [...history, { at, by: ctx.by, event: "decision" as const, from: "screened", to: d.decision, detail: d.reason.trim(), rules_version: ctx.rules.rulesVersion }].slice(-HISTORY_CAP),
  };
}

export interface ConsoleAlert {
  kind: string;
  opportunityId: string;
  title: string;
  owner: string;
  detail: string;
  due?: string;
}

export function consoleAlerts(opps: ConsoleOpp[], rules: BusinessRules, now: Date): ConsoleAlert[] {
  const out: ConsoleAlert[] = [];
  for (const o of opps) {
    if (!isOpen(o.stage)) continue;
    if (!o.next_step) out.push({ kind: "missing_next_step", opportunityId: o.id, title: o.title, owner: o.owner, detail: "No next step." });
    else if (new Date(o.next_step.due_at) < now) out.push({ kind: "next_step_overdue", opportunityId: o.id, title: o.title, owner: o.next_step.owner, detail: `Overdue: ${o.next_step.action}`, due: o.next_step.due_at });
    if (o.motion === "contracting") {
      if (o.stage === "screened" && o.dates.bid_decision_due && new Date(o.dates.bid_decision_due) < now) {
        out.push({ kind: "bid_decision_overdue", opportunityId: o.id, title: o.title, owner: "asil", detail: "The 48-hour bid decision is overdue.", due: o.dates.bid_decision_due });
      }
      const sub = o.dates.submission_deadline;
      if (sub && (o.stage === "go" || o.stage === "screened") && new Date(sub) > now && workingDaysBetween(now, new Date(sub), rules) <= 3) {
        out.push({ kind: "submission_soon", opportunityId: o.id, title: o.title, owner: o.owner, detail: "Submission within 3 working days.", due: sub });
      }
    } else {
      if (o.stage === "new" && addHours(new Date(o.created_at), rules.elevator.first_contact_hours) < now) {
        out.push({ kind: "first_contact_overdue", opportunityId: o.id, title: o.title, owner: o.owner, detail: `No first contact within ${rules.elevator.first_contact_hours} hours.` });
      }
      if (o.stage === "tech_review" && addHours(new Date(o.stage_entered_at), rules.elevator.technical_response_hours) < now) {
        out.push({ kind: "technical_response_overdue", opportunityId: o.id, title: o.title, owner: "technical_office", detail: `Technical response past ${rules.elevator.technical_response_hours} hours.` });
      }
    }
  }
  return out;
}

export interface RegistryGapLite {
  kind: "won_without_unit" | "no_maintenance_offer" | "no_origin_document" | "no_owner_consent" | "no_inspection_date";
  ref: string;
  detail: string;
}

export function registryGaps(units: Unit[], opps: ConsoleOpp[]): RegistryGapLite[] {
  const out: RegistryGapLite[] = [];
  for (const o of opps.filter((x) => x.motion === "elevator" && x.stage === "won" && x.route === "inbound_elevator")) {
    if (!units.some((u) => u.installed_from_opportunity === o.id)) out.push({ kind: "won_without_unit", ref: o.id, detail: `${o.title}: sold but not registered, so nobody will offer maintenance or book its inspection.` });
  }
  for (const u of units.filter((x) => x.status === "active")) {
    if (u.source === "installed" && u.maintenance_offer === "not_offered") out.push({ kind: "no_maintenance_offer", ref: u.id, detail: `${u.site}: maintenance never offered.` });
    if (u.source === "installed" && !u.origin_document) out.push({ kind: "no_origin_document", ref: u.id, detail: `${u.site}: no certificate of origin in the technical file.` });
    if (!u.owner_consent_at) out.push({ kind: "no_owner_consent", ref: u.id, detail: `${u.site}: the owner hasn't agreed to be contacted.` });
    if (!u.next_inspection_due) out.push({ kind: "no_inspection_date", ref: u.id, detail: `${u.site}: no annual inspection date.` });
  }
  return out;
}

/** Units whose contract (or warranty, with no contract) ends inside the window, whose owner agreed, with no open opportunity. */
export function renewalCandidates(units: Unit[], opps: ConsoleOpp[], today: string, windowDays: number): Array<{ unit: Unit; kind: "contract_end" | "warranty_end"; due: string }> {
  const open = new Set(opps.filter((o) => isOpen(o.stage) && o.installed_unit_id).map((o) => o.installed_unit_id));
  return dueItems(units, today, windowDays)
    .filter((d) => d.contactable && (d.kind === "contract_end" || d.kind === "warranty_end") && !open.has(d.unitId))
    .map((d) => ({ unit: units.find((u) => u.id === d.unitId)!, kind: d.kind as "contract_end" | "warranty_end", due: d.due }));
}
