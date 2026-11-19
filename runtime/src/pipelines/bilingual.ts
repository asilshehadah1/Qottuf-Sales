// Pipeline: a bilingual edit (roster #6). Loads the evidence the audience may use, runs the shared workflow
// (workflows/bilingual.ts, the same code the browser console runs) and submits the result for approval.

import { submitArtifact } from "../approvals/queue.ts";
import { knownPeople, readEvidence } from "../ledger/repo.ts";
import { BilingualInput, bilingualWorkflow } from "../workflows/bilingual.ts";
import { workflowEnv, type Pipeline } from "./context.ts";

export { BilingualInput } from "../workflows/bilingual.ts";

export const bilingualPipeline: Pipeline = async (ctx, raw) => {
  const input = BilingualInput.parse(raw);
  const evidence = await readEvidence(ctx.db, {
    maxTier: input.audience === "public" ? "public" : "tender", readBy: "agent:bilingual_editor", purpose: `bilingual edit: ${input.purpose}`,
    ...(input.project_ref ? { projectRef: input.project_ref } : {}),
  });
  const res = await bilingualWorkflow(workflowEnv(ctx, await knownPeople(ctx.db)), input, evidence);
  if (!res.artifact) return { status: res.status, ...(res.note ? { note: res.note } : {}) };
  const artifactId = await submitArtifact(ctx.db, { workOrderId: ctx.workOrderId, ...res.artifact }, "agent:dispatcher");
  return { status: res.status, artifactId, ...(res.note ? { note: res.note } : {}) };
};
