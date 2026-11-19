// Pipelines: meeting brief and meeting debrief, for Asil (roster #19).

import { z } from "zod";
import * as Agents from "../agents/meetingPrep.ts";
import { submitArtifact } from "../approvals/queue.ts";
import { rulebookFigures } from "../gates/claims.ts";
import { redact } from "../gates/pii.ts";
import { runTextGates } from "../gates/runGates.ts";
import { projectProof } from "../ledger/proof.ts";
import { figuresFromEvidence, knownPeople, readEvidence } from "../ledger/repo.ts";
import { getOpportunity } from "../pipeline/engine.ts";
import { sar, type Pipeline } from "./context.ts";

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

async function accountSummary(ctx: Parameters<Pipeline>[0], accountId: string) {
  const a = (await ctx.db.query<{ name_en: string; name_ar: string | null; type: string; sector: string | null; priority_rank: number | null }>(
    "SELECT name_en, name_ar, type, sector, priority_rank FROM accounts WHERE id = $1", [accountId])).rows[0];
  if (!a) throw new Error(`no account ${accountId}`);
  return a;
}

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

export const meetingBriefPipeline: Pipeline = async (ctx, raw) => {
  const input = BriefInput.parse(raw);
  const account = await accountSummary(ctx, input.account_id);
  const opp = input.opportunity_id ? await getOpportunity(ctx.db, input.opportunity_id) : null;
  const evidence = await readEvidence(ctx.db, { maxTier: "tender", readBy: `agent:${Agents.BRIEF_AGENT}`, purpose: `brief for ${input.account_id}` });
  const proof = projectProof(evidence, ctx.rules).filter((p) => p.documented);
  const payload = {
    meeting: { at: input.meeting_at, purpose: input.purpose },
    account: { name: account.name_en, name_ar: account.name_ar, type: account.type, sector: account.sector, priority_rank: account.priority_rank },
    opportunity: opp && {
      id: opp.id, title: opp.title, stage: opp.stage, route: opp.route,
      value: opp.value_min_sar !== null ? `${sar(opp.value_min_sar)} to ${sar(opp.value_max_sar ?? opp.value_min_sar)}` : "unknown",
      next_step: opp.next_step,
      knockouts: opp.scorecard?.knockouts.filter((k) => k.status !== "pass").map((k) => `${k.code} ${k.status}: ${k.detail}`) ?? [],
    },
    documented_proof: proof.map((p) => ({ ref: p.projectRef, contract_value: p.contractValueSar !== null ? sar(p.contractValueSar) : null, completed: p.completionDate, reference_ready: p.referenceReady })),
    asil_notes: input.notes ?? "",
  };
  const people = await knownPeople(ctx.db);
  const res = await ctx.callModel(Agents.BRIEF_AGENT, Agents.BRIEF_PROMPT_VERSION, (m) =>
    Agents.writeBrief(m, redact(JSON.stringify(payload, null, 1), { people, publicNumbers: ctx.publicNumbers }).text));
  const brief = res.output;
  const title = `Meeting brief: ${account.name_en}, ${input.meeting_at.slice(0, 10)}`;
  const text = renderBrief(brief, title);
  const report = runTextGates({ en: text }, {
    rules: ctx.brand, figures: [...rulebookFigures(ctx.brand), ...figuresFromEvidence(evidence)], audience: "asil", formal: false, people,
    publicNumbers: ctx.publicNumbers,
  });
  const known = new Set(proof.map((p) => p.projectRef));
  for (const p of brief.proof_to_bring) {
    if (!known.has(p.ref)) {
      report.warnings.push({ gate: "claims", severity: "signal", rule: "brief.unknown_proof", quote: p.ref, lang: "en",
        why: `${p.ref} isn't a documented project: don't bring it as proof.` });
    }
  }
  const artifactId = await submitArtifact(ctx.db, {
    workOrderId: ctx.workOrderId, artifactType: "meeting_brief", title, audience: "asil",
    opportunityId: input.opportunity_id ?? null, accountId: input.account_id,
    content: brief, renderedEn: text, evidenceTierMax: "tender", gateReport: report,
    provenance: { prompt_versions: [Agents.BRIEF_PROMPT_VERSION], models_served: [res.modelServed], rules_version: ctx.rules.rulesVersion },
  }, "agent:dispatcher");
  return { status: "succeeded", artifactId };
};

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

export const meetingDebriefPipeline: Pipeline = async (ctx, raw) => {
  const input = DebriefInput.parse(raw);
  const account = await accountSummary(ctx, input.account_id);
  const people = await knownPeople(ctx.db);
  const payload = { account: account.name_en, opportunity_id: input.opportunity_id ?? null, notes: input.notes };
  const res = await ctx.callModel(Agents.DEBRIEF_AGENT, Agents.DEBRIEF_PROMPT_VERSION, (m) =>
    Agents.writeDebrief(m, redact(JSON.stringify(payload, null, 1), { people, publicNumbers: ctx.publicNumbers }).text));
  const d = res.output;
  const title = `Debrief: ${account.name_en}`;
  const text = renderDebrief(d, title);
  const report = runTextGates({ en: text }, { rules: ctx.brand, figures: rulebookFigures(ctx.brand), audience: "asil", formal: false, people, publicNumbers: ctx.publicNumbers });
  const artifactId = await submitArtifact(ctx.db, {
    workOrderId: ctx.workOrderId, artifactType: "meeting_debrief", title, audience: "asil",
    opportunityId: input.opportunity_id ?? null, accountId: input.account_id,
    content: d, renderedEn: text, evidenceTierMax: "internal", gateReport: report,
    provenance: { prompt_versions: [Agents.DEBRIEF_PROMPT_VERSION], models_served: [res.modelServed], rules_version: ctx.rules.rulesVersion },
  }, "agent:dispatcher");
  return {
    status: "succeeded",
    artifactId,
    note: d.commitments_we_made.length ? `${d.commitments_we_made.length} commitment(s) to check before anything reaches the client.` : undefined,
  };
};
