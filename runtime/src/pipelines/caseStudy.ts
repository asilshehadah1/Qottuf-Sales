// Pipeline: a bilingual case study (roster #28). Loads the evidence the audience may use, runs the shared
// workflow (workflows/caseStudy.ts, the same code the browser console runs) and submits the result for approval.

import { submitArtifact } from "../approvals/queue.ts";
import { knownPeople, readEvidence } from "../ledger/repo.ts";
import { CaseStudyInput, caseStudyWorkflow } from "../workflows/caseStudy.ts";
import { workflowEnv, type Pipeline } from "./context.ts";

export { CaseStudyInput } from "../workflows/caseStudy.ts";

export const caseStudyPipeline: Pipeline = async (ctx, raw) => {
  const input = CaseStudyInput.parse(raw);
  const records = await readEvidence(ctx.db, {
    maxTier: input.audience === "public" ? "public" : "tender", readBy: "agent:case_study_writer",
    purpose: `case study ${input.project_ref}`, projectRef: input.project_ref,
  });
  const res = await caseStudyWorkflow(workflowEnv(ctx, await knownPeople(ctx.db)), input, records);
  if (!res.artifact) return { status: res.status, ...(res.note ? { note: res.note } : {}) };
  const artifactId = await submitArtifact(ctx.db, { workOrderId: ctx.workOrderId, ...res.artifact }, "agent:dispatcher");
  return { status: res.status, artifactId, ...(res.note ? { note: res.note } : {}) };
};
