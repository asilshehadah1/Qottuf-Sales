// Workflows: meeting brief and meeting debrief, for Asil (roster #19). Pure: the caller supplies the account,
// the opportunity, the evidence and the proof.

import { z } from "zod";
import * as Agents from "../agents/meetingPrep.ts";
import { rulebookFigures } from "../gates/claims.ts";
import { redact } from "../gates/pii.ts";
import { runTextGates } from "../gates/runGates.ts";
import { figuresFromEvidence } from "../ledger/figures.ts";
import type { ProjectProof } from "../ledger/proof.ts";
import type { EvidenceRecord } from "../ledger/schemas.ts";
import { sar, type AccountSummary, type OpportunitySummary, type WorkflowEnv, type WorkflowResult } from "./types.ts";

export const BriefInput = z.object({
  account_id: z.string(),
  opportunity_id: z.string().optional(),
  meeting_at: z.string(),
  purpose: z.string().min(3),
  notes: z.string().optional(),
});

export const DebriefInput = z.object({
  account_id: z.string(),
  opportunity_id: z.string().optional(),
  notes: z.string().min(10),
});

function bullets(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join("\n") : "- (none)";
}

export function renderBrief(b: Agents.MeetingBrief, title: string): string {
  return [
    `# ${title}`,
    `**Objective:** ${b.objective}`,
    `## Context\n${bullets(b.context)}`,
    `## What they care about\n${bullets(b.what_they_care_about)}`,
    `## Proof to bring\n${bullets(b.proof_to_bring.map((p) => `${p.ref}: ${p.why}`))}`,
    `## Questions to ask\n${bullets(b.questions_to_ask)}`,
    `## Asks\n${bullets(b.asks.map((a) => `${a.ask} (if not: ${a.fallback})`))}`,
    `## Risks\n${bullets(b.risks)}`,
    `## Do not say\n${bullets(b.do_not_say)}`,
    `**Next step to secure:** ${b.next_step_to_secure.action} (${b.next_step_to_secure.owner}, within ${b.next_step_to_secure.due_in_days} days)`,
  ].join("\n\n");
}

export function renderDebrief(d: Agents.MeetingDebrief, title: string): string {
  return [
    `# ${title}`,
    d.summary,
    `## Decisions\n${bullets(d.decisions)}`,
    `## Commitments we made (check each before anything reaches the client)\n${bullets(d.commitments_we_made.map((c) => `${c.what} (${c.by_whom}${c.due_date ? `, by ${c.due_date}` : ", no date"})`))}`,
    `## Next steps\n${bullets(d.next_steps.map((n) => `${n.action} (${n.owner}, ${n.due_date ?? "date not set"})`))}`,
    `## Buying committee\n${bullets(d.buying_committee.map((b) => `${b.person}: ${b.role}, ${b.stance}`))}`,
    `## Objections, in their words\n${bullets(d.objections_verbatim.map((o) => `"${o}"`))}`,
    `## Proof they asked for\n${bullets(d.proof_requested)}`,
  ].join("\n\n");
}

export async function meetingBriefWorkflow(
  env: WorkflowEnv, raw: unknown,
  data: { account: AccountSummary; opportunity: OpportunitySummary | null; evidence: EvidenceRecord[]; proof: ProjectProof[] },
): Promise<WorkflowResult> {
  const input = BriefInput.parse(raw);
  const proof = data.proof.filter((p) => p.documented);
  const opp = data.opportunity;
  const payload = {
    meeting: { at: input.meeting_at, purpose: input.purpose },
    account: { name: data.account.name_en, name_ar: data.account.name_ar, type: data.account.type, sector: data.account.sector, priority_rank: data.account.priority_rank },
    opportunity: opp && {
      id: opp.id, title: opp.title, stage: opp.stage, route: opp.route,
      value: opp.value_min_sar !== null ? `${sar(opp.value_min_sar)} to ${sar(opp.value_max_sar ?? opp.value_min_sar)}` : "unknown",
      next_step: opp.next_step,
      knockouts: opp.knockouts,
    },
    documented_proof: proof.map((p) => ({ ref: p.projectRef, contract_value: p.contractValueSar !== null ? sar(p.contractValueSar) : null, completed: p.completionDate, reference_ready: p.referenceReady })),
    asil_notes: input.notes ?? "",
  };
  const res = await env.callAgent(Agents.BRIEF_AGENT, Agents.BRIEF_PROMPT_VERSION, (m) =>
    Agents.writeBrief(m, redact(JSON.stringify(payload, null, 1), { people: env.people, publicNumbers: env.publicNumbers }).text));
  const brief = res.output;
  const title = `Meeting brief: ${data.account.name_en}, ${input.meeting_at.slice(0, 10)}`;
  const text = renderBrief(brief, title);
  const report = runTextGates({ en: text }, {
    rules: env.brand, figures: [...rulebookFigures(env.brand), ...figuresFromEvidence(data.evidence)], audience: "asil", formal: false,
    people: env.people, publicNumbers: env.publicNumbers,
  });
  const known = new Set(proof.map((p) => p.projectRef));
  for (const p of brief.proof_to_bring) {
    if (!known.has(p.ref)) {
      report.warnings.push({ gate: "claims", severity: "signal", rule: "brief.unknown_proof", quote: p.ref, lang: "en",
        why: `${p.ref} isn't a documented project: don't bring it as proof.` });
    }
  }
  await env.step({ step: "gates", outcome: "ok", details: { warnings: report.warnings.length } });
  return {
    status: "succeeded",
    artifact: {
      artifactType: "meeting_brief", title, audience: "asil", opportunityId: input.opportunity_id ?? null, accountId: input.account_id,
      content: brief, renderedEn: text, renderedAr: null, evidenceTierMax: "tender", gateReport: report,
      provenance: { prompt_versions: [Agents.BRIEF_PROMPT_VERSION], models_served: [res.modelServed], rules_version: env.rulesVersion },
    },
  };
}

export async function meetingDebriefWorkflow(env: WorkflowEnv, raw: unknown, data: { account: AccountSummary }): Promise<WorkflowResult> {
  const input = DebriefInput.parse(raw);
  const payload = { account: data.account.name_en, opportunity_id: input.opportunity_id ?? null, notes: input.notes };
  const res = await env.callAgent(Agents.DEBRIEF_AGENT, Agents.DEBRIEF_PROMPT_VERSION, (m) =>
    Agents.writeDebrief(m, redact(JSON.stringify(payload, null, 1), { people: env.people, publicNumbers: env.publicNumbers }).text));
  const d = res.output;
  const title = `Debrief: ${data.account.name_en}`;
  const text = renderDebrief(d, title);
  const report = runTextGates({ en: text }, { rules: env.brand, figures: rulebookFigures(env.brand), audience: "asil", formal: false, people: env.people, publicNumbers: env.publicNumbers });
  await env.step({ step: "gates", outcome: "ok", details: { warnings: report.warnings.length } });
  return {
    status: "succeeded",
    ...(d.commitments_we_made.length ? { note: `${d.commitments_we_made.length} commitment(s) to check before anything reaches the client.` } : {}),
    artifact: {
      artifactType: "meeting_debrief", title, audience: "asil", opportunityId: input.opportunity_id ?? null, accountId: input.account_id,
      content: d, renderedEn: text, renderedAr: null, evidenceTierMax: "internal", gateReport: report,
      provenance: { prompt_versions: [Agents.DEBRIEF_PROMPT_VERSION], models_served: [res.modelServed], rules_version: env.rulesVersion },
    },
  };
}
