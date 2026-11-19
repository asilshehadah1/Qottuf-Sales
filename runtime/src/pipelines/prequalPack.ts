// Pipeline: the prequalification pack manifest (roster #20, Prequalification and Evidence Manager; code only in
// Phase 1). The pack is "the single most important artifact of the department" (business-development spec §3.1):
// this checks every item against the evidence store, flags what is missing or expiring, and lists the referee
// consents to request at handover. Confidential items appear only after Asil's release (S-G6).

import { z } from "zod";
import { submitArtifact } from "../approvals/queue.ts";
import { rulebookFigures } from "../gates/claims.ts";
import { runTextGates } from "../gates/runGates.ts";
import { projectProof } from "../ledger/proof.ts";
import { readEvidence, riyadhDate } from "../ledger/repo.ts";
import type { EvidenceRecord } from "../ledger/schemas.ts";
import { sar, type Pipeline } from "./context.ts";

export const PrequalInput = z.object({
  account_id: z.string(),
  target: z.string().min(3),
  include_confidential: z.boolean().default(false),
});

interface ChecklistItem {
  item: string;
  type: EvidenceRecord["type"];
  use?: string;
  confidential?: boolean;
}

export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { item: "Commercial Registration (CR)", type: "certificate", use: "certificate:CR" },
  { item: "Zakat certificate", type: "certificate", use: "certificate:Zakat" },
  { item: "VAT registration", type: "certificate", use: "certificate:VAT" },
  { item: "GOSI certificate", type: "certificate", use: "certificate:GOSI" },
  { item: "Chamber of Commerce membership", type: "certificate", use: "certificate:Chamber" },
  { item: "Saudisation (Nitaqat) certificate", type: "certificate", use: "certificate:Saudisation" },
  { item: "Company profile", type: "company_record", use: "company_record:profile" },
  { item: "Organisation chart and key CVs", type: "company_record", use: "company_record:org_chart" },
  { item: "HSE policy and statistics", type: "company_record", use: "company_record:hse" },
  { item: "Audited financial statements (confidential: Asil releases, S-G6)", type: "financial_statement", confidential: true },
  { item: "Bank reference letter (confidential: Asil releases, S-G6)", type: "bank_letter", confidential: true },
];

function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
}

export interface PackLine {
  item: string;
  status: "ready" | "expiring" | "missing" | "needs_release";
  evidence: string[];
  note: string;
}

export function assessPack(records: EvidenceRecord[], checklist: ChecklistItem[], today: string, alertDays: number[], includeConfidential: boolean): PackLine[] {
  const horizon = Math.max(...alertDays);
  return checklist.map((c) => {
    const found = records.filter((r) => r.type === c.type && (!c.use || r.permitted_uses.includes(c.use)));
    if (found.length === 0) {
      if (c.confidential && !includeConfidential) return { item: c.item, status: "needs_release", evidence: [], note: "Not in this pack unless Asil releases it (S-G6)." };
      if (c.confidential) return { item: c.item, status: "needs_release", evidence: [], note: "Not on file or not released: ask Asil." };
      return { item: c.item, status: "missing", evidence: [], note: "Not on file: request it." };
    }
    const best = found.sort((a, b) => (b.expires_at ?? "9999").localeCompare(a.expires_at ?? "9999"))[0]!;
    if (best.expires_at && daysUntil(best.expires_at, today) <= horizon) {
      return { item: c.item, status: "expiring", evidence: [best.id], note: `Expires ${best.expires_at} (${daysUntil(best.expires_at, today)} days): renew now.` };
    }
    return { item: c.item, status: "ready", evidence: [best.id], note: best.expires_at ? `Valid to ${best.expires_at}.` : "No expiry." };
  });
}

const ICON: Record<PackLine["status"], string> = { ready: "READY", expiring: "EXPIRING", missing: "MISSING", needs_release: "ASIL" };

export const prequalPackPipeline: Pipeline = async (ctx, raw) => {
  const input = PrequalInput.parse(raw);
  const today = riyadhDate(ctx.now());
  const maxTier = input.include_confidential ? "confidential" : "tender";
  const records = await readEvidence(ctx.db, { maxTier, readBy: "agent:prequal_manager", purpose: `prequalification pack: ${input.target}`, on: today });
  const lines = assessPack(records, DEFAULT_CHECKLIST, today, ctx.rules.evidence.expiry_alert_days, input.include_confidential);
  const proofs = projectProof(records, ctx.rules);
  const refs = proofs.filter((p) => p.documented);
  const consentToRequest = refs.filter((p) => !p.hasRefereeConsent);
  const account = (await ctx.db.query<{ name_en: string }>("SELECT name_en FROM accounts WHERE id = $1", [input.account_id])).rows[0];

  const text = [
    `# Prequalification pack: ${input.target}`,
    `For ${account?.name_en ?? input.account_id}. Checked against the evidence store on ${today}.`,
    "## Documents",
    lines.map((l) => `- ${ICON[l.status]}: ${l.item}. ${l.note}${l.evidence.length ? ` (${l.evidence.join(", ")})` : ""}`).join("\n"),
    "## Project references",
    refs.length
      ? refs.map((p) => `- ${p.projectRef}: ${p.contractValueSar !== null ? sar(p.contractValueSar) : "value missing"}, completed ${p.completionDate}${p.hasRefereeConsent ? ", referee consent on file" : ", no referee consent yet"}`).join("\n")
      : "- None documented yet: this is the proof gap.",
    "## To request at handover",
    consentToRequest.length ? consentToRequest.map((p) => `- Referee consent for ${p.projectRef}`).join("\n") : "- Nothing outstanding.",
  ].join("\n\n");

  const report = runTextGates({ en: text }, { rules: ctx.brand, figures: rulebookFigures(ctx.brand), audience: "internal", formal: false, publicNumbers: ctx.publicNumbers });
  const missing = lines.filter((l) => l.status !== "ready").length;
  const artifactId = await submitArtifact(ctx.db, {
    workOrderId: ctx.workOrderId, artifactType: "prequal_pack", title: `Prequalification pack: ${input.target}`,
    audience: "internal", accountId: input.account_id,
    content: { target: input.target, lines, references: refs.map((r) => r.projectRef), consent_to_request: consentToRequest.map((r) => r.projectRef) },
    renderedEn: text, evidenceTierMax: maxTier, gateReport: report,
    provenance: { rules_version: ctx.rules.rulesVersion, engine: "code", evidence_ids: records.map((r) => r.id) },
  }, "agent:dispatcher");
  await ctx.step({ step: "assess pack", outcome: "ok", details: { items: lines.length, not_ready: missing } });
  return { status: "succeeded", artifactId, note: missing ? `${missing} item(s) not ready.` : undefined };
};
