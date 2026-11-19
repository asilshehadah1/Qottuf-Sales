// Pipelines: meeting brief and debrief, for Asil (roster #19). They load from the Ledger, run the shared
// workflows (workflows/meetings.ts, the same code the browser console runs) and submit the result for approval.

import { submitArtifact } from "../approvals/queue.ts";
import { projectProof } from "../ledger/proof.ts";
import { knownPeople, readEvidence } from "../ledger/repo.ts";
import { getOpportunity } from "../pipeline/engine.ts";
import { BriefInput, DebriefInput, meetingBriefWorkflow, meetingDebriefWorkflow } from "../workflows/meetings.ts";
import type { AccountSummary, WorkflowResult } from "../workflows/types.ts";
import { workflowEnv, type Pipeline, type PipelineContext } from "./context.ts";

export { BriefInput, DebriefInput, renderBrief, renderDebrief } from "../workflows/meetings.ts";

async function accountSummary(ctx: PipelineContext, accountId: string): Promise<AccountSummary> {
  const a = (await ctx.db.query("SELECT name_en, name_ar, type, sector, priority_rank FROM accounts WHERE id = $1", [accountId])).rows[0] as AccountSummary | undefined;
  if (!a) throw new Error(`no account ${accountId}`);
  return a;
}

async function submit(ctx: PipelineContext, res: WorkflowResult) {
  if (!res.artifact) return { status: res.status, ...(res.note ? { note: res.note } : {}) };
  const artifactId = await submitArtifact(ctx.db, { workOrderId: ctx.workOrderId, ...res.artifact }, "agent:dispatcher");
  return { status: res.status, artifactId, ...(res.note ? { note: res.note } : {}) };
}

export const meetingBriefPipeline: Pipeline = async (ctx, raw) => {
  const input = BriefInput.parse(raw);
  const account = await accountSummary(ctx, input.account_id);
  const opp = input.opportunity_id ? await getOpportunity(ctx.db, input.opportunity_id) : null;
  const evidence = await readEvidence(ctx.db, { maxTier: "tender", readBy: "agent:meeting_brief", purpose: `brief for ${input.account_id}` });
  const res = await meetingBriefWorkflow(workflowEnv(ctx, await knownPeople(ctx.db)), input, {
    account,
    opportunity: opp && {
      id: opp.id, title: opp.title, stage: opp.stage, route: opp.route, value_min_sar: opp.value_min_sar, value_max_sar: opp.value_max_sar,
      next_step: opp.next_step, knockouts: opp.scorecard?.knockouts.filter((k) => k.status !== "pass").map((k) => `${k.code} ${k.status}: ${k.detail}`) ?? [],
    },
    evidence,
    proof: projectProof(evidence, ctx.rules),
  });
  return submit(ctx, res);
};

export const meetingDebriefPipeline: Pipeline = async (ctx, raw) => {
  const input = DebriefInput.parse(raw);
  const res = await meetingDebriefWorkflow(workflowEnv(ctx, await knownPeople(ctx.db)), input, { account: await accountSummary(ctx, input.account_id) });
  return submit(ctx, res);
};
