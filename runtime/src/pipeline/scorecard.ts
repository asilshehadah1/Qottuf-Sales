// The Qottuf Pursuit Scorecard (sales spec §10.1, with the knock-outs agreed at the 18–19 November meeting).
// Knock-outs and the score are code. Classification is Asil's to manage and is not checked here (19 November).

import type { BusinessRules } from "../config/rules.ts";
import type { EvidenceRecord } from "../ledger/schemas.ts";
import { workingDaysBetween } from "./workdays.ts";

export type KnockOutStatus = "pass" | "fail" | "verify";

export interface KnockOut {
  code: string;
  label: string;
  status: KnockOutStatus;
  detail: string;
  alternative?: string;
}

export interface OpportunityFacts {
  value_min_sar: number | null;
  value_max_sar: number | null;
  qottuf_role: string;
  sector: string | null;
  service_lines: string[];
  dates: { submission_deadline?: string };
  requirements: {
    certificates?: string[];
    references?: { min_count: number; min_value_sar: number; within_years: number };
    guarantee_capacity_confirmed?: boolean;
    payer_band?: "A" | "B" | "C" | "do_not_extend";
    integrity_flag_upheld?: boolean;
  };
}

export interface DocumentedReference {
  projectRef: string;
  contractValueSar: number;
  completionDate: string; // YYYY-MM-DD or YYYY-MM
  hasCompletionCertificate: boolean;
}

const fmt = (n: number) => `SAR ${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 })} m`;

export function contractingKnockOuts(
  opp: OpportunityFacts,
  ctx: { rules: BusinessRules; now: Date; certificates: EvidenceRecord[]; references: DocumentedReference[] },
): KnockOut[] {
  const { rules, now } = ctx;
  const band = rules.contracting.band_sar;
  const out: KnockOut[] = [];

  // Band (Asil, 18 November): main contracts of SAR 20–100 m only.
  const lo = opp.value_min_sar;
  const hi = opp.value_max_sar ?? opp.value_min_sar;
  if (lo === null && hi === null) {
    out.push({ code: "K-BAND", label: `Value within ${fmt(band.min)}–${fmt(band.max)}`, status: "verify",
      detail: "Value not published: estimate it from the BOQ quantities or comparable awards before deciding." });
  } else if ((hi ?? lo!) < band.min) {
    out.push({ code: "K-BAND", label: `Value within ${fmt(band.min)}–${fmt(band.max)}`, status: "fail",
      detail: `Below the band: ${fmt(hi ?? lo!)}.` });
  } else if ((lo ?? hi!) > band.max) {
    out.push({ code: "K-BAND", label: `Value within ${fmt(band.min)}–${fmt(band.max)}`, status: "fail",
      detail: `Above the band: ${fmt(lo ?? hi!)}. The band is Asil's to change.` });
  } else if ((lo ?? band.min) < band.min || (hi ?? band.max) > band.max) {
    out.push({ code: "K-BAND", label: `Value within ${fmt(band.min)}–${fmt(band.max)}`, status: "verify",
      detail: "The value range crosses the edge of the band: narrow the estimate." });
  } else {
    out.push({ code: "K-BAND", label: `Value within ${fmt(band.min)}–${fmt(band.max)}`, status: "pass", detail: "In band." });
  }

  out.push(opp.qottuf_role === rules.contracting.required_role
    ? { code: "K-ROLE", label: "Qottuf as main contractor", status: "pass", detail: "Main contract." }
    : { code: "K-ROLE", label: "Qottuf as main contractor", status: "fail",
      detail: `Role is ${opp.qottuf_role}. Subcontract packages are out of scope; a joint venture is an option for Asil only.` });

  out.push(opp.sector && rules.contracting.excluded_sectors.includes(opp.sector)
    ? { code: "K-SECTOR", label: "In scope (no villas)", status: "fail", detail: `Sector ${opp.sector} is out of scope for contracting.` }
    : { code: "K-SECTOR", label: "In scope (no villas)", status: "pass", detail: opp.sector ? `Sector: ${opp.sector}.` : "No sector exclusion." });

  const lines = rules.contracting.service_lines;
  const outside = opp.service_lines.filter((l) => !lines.includes(l));
  out.push(opp.service_lines.length === 0
    ? { code: "K4", label: "Scope within the six service lines", status: "verify", detail: "Scope not yet read from the tender." }
    : outside.length > 0
      ? { code: "K4", label: "Scope within the six service lines", status: "fail", detail: `Outside: ${outside.join(", ")}.`, alternative: "Partner for that scope" }
      : { code: "K4", label: "Scope within the six service lines", status: "pass", detail: "Within." });

  const deadline = opp.dates.submission_deadline ? new Date(opp.dates.submission_deadline) : null;
  if (!deadline) {
    out.push({ code: "K5", label: "Enough time to bid", status: "verify", detail: "No submission deadline recorded." });
  } else {
    const days = workingDaysBetween(now, deadline, rules);
    out.push(days >= rules.contracting.min_working_days_to_bid
      ? { code: "K5", label: "Enough time to bid", status: "pass", detail: `${days} working days to the deadline.` }
      : { code: "K5", label: "Enough time to bid", status: "fail",
        detail: `${days} working days to the deadline; a full bid needs ${rules.contracting.min_working_days_to_bid}.`,
        alternative: "Ask for an extension" });
  }

  const required = opp.requirements.certificates ?? [];
  if (required.length === 0) {
    out.push({ code: "K3", label: "Mandatory certificates valid at the deadline", status: "verify", detail: "Required certificates not yet read from the tender." });
  } else {
    const at = (deadline ?? now).toISOString().slice(0, 10);
    const missing = required.filter((name) => !ctx.certificates.some((c) =>
      (c.permitted_uses.includes(`certificate:${name}`) || c.title.toLowerCase().includes(name.toLowerCase())) &&
      (!c.expires_at || c.expires_at >= at)));
    out.push(missing.length === 0
      ? { code: "K3", label: "Mandatory certificates valid at the deadline", status: "pass", detail: `All ${required.length} on file and valid on ${at}.` }
      : { code: "K3", label: "Mandatory certificates valid at the deadline", status: "fail",
        detail: `Missing or expired by ${at}: ${missing.join(", ")}.`, alternative: "Renew before the deadline, or bid the next round" });
  }

  const refReq = opp.requirements.references;
  if (!refReq) {
    out.push({ code: "K-REF", label: "Comparable-value references", status: "verify", detail: "The tender's reference requirement isn't recorded yet." });
  } else {
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - refReq.within_years);
    const good = ctx.references.filter((r) => r.hasCompletionCertificate && r.contractValueSar >= refReq.min_value_sar &&
      r.completionDate >= cutoff.toISOString().slice(0, r.completionDate.length));
    out.push(good.length >= refReq.min_count
      ? { code: "K-REF", label: "Comparable-value references", status: "pass", detail: `${good.length} documented: ${good.map((g) => g.projectRef).join(", ")}.` }
      : { code: "K-REF", label: "Comparable-value references", status: "fail",
        detail: `${good.length} of ${refReq.min_count} documented references of at least ${fmt(refReq.min_value_sar)} in ${refReq.within_years} years.` });
  }

  const g = opp.requirements.guarantee_capacity_confirmed;
  out.push(g === undefined
    ? { code: "K7", label: "Guarantee capacity (yes/no from Asil)", status: "verify", detail: "Not yet confirmed. Agents never see the facility figures." }
    : g ? { code: "K7", label: "Guarantee capacity (yes/no from Asil)", status: "pass", detail: "Confirmed." }
      : { code: "K7", label: "Guarantee capacity (yes/no from Asil)", status: "fail", detail: "No capacity for the bid bond or performance guarantee." });

  const p = opp.requirements.payer_band;
  out.push(p === "do_not_extend"
    ? { code: "K8", label: "Payer band", status: "fail", detail: "Finance: do not extend credit to this payer.", alternative: "Only with secured payment terms" }
    : p ? { code: "K8", label: "Payer band", status: "pass", detail: `Band ${p}.` }
      : { code: "K8", label: "Payer band", status: "verify", detail: "No payer band from finance yet." });

  if (opp.requirements.integrity_flag_upheld) {
    out.push({ code: "K6", label: "No upheld integrity flag", status: "fail", detail: "An integrity flag was upheld. No override exists." });
  }
  return out;
}

export function overallKnockOut(kos: KnockOut[]): KnockOutStatus {
  if (kos.some((k) => k.status === "fail")) return "fail";
  if (kos.some((k) => k.status === "verify")) return "verify";
  return "pass";
}

export interface FactorScore {
  score: 0 | 1 | 2 | 3;
  evidence?: string[];
  note?: string;
}

export interface ScoreResult {
  score: number;
  partial: boolean;
  recommendation: "go" | "conditional" | "no_bid";
  excluded: string[];
  warnings: string[];
  scorecard_version: string;
}

/** score = 100 × Σ(wᵢ × sᵢ ÷ 3) ÷ Σwᵢ over scorable factors; a factor with no data source yet is excluded (partial). */
export function scoreOpportunity(scores: Record<string, FactorScore | null | undefined>, rules: BusinessRules): ScoreResult {
  let num = 0;
  let den = 0;
  const excluded: string[] = [];
  const warnings: string[] = [];
  for (const f of rules.scorecard.factors) {
    const s = scores[f.id];
    if (!s) {
      excluded.push(f.id);
      continue;
    }
    let value: number = s.score;
    if (value >= 2 && !(s.evidence && s.evidence.length > 0)) {
      warnings.push(`${f.label}: scored 1, not ${value}. A 2 or 3 needs cited evidence.`);
      value = 1;
    }
    num += (f.weight * value) / 3;
    den += f.weight;
  }
  const score = den === 0 ? 0 : Math.round((100 * num) / den);
  const t = rules.scorecard.thresholds;
  return {
    score,
    partial: excluded.length > 0,
    recommendation: score >= t.go ? "go" : score >= t.conditional ? "conditional" : "no_bid",
    excluded,
    warnings,
    scorecard_version: rules.scorecard.version,
  };
}
