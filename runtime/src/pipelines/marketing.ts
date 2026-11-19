// Pipelines for the Proof & Demand writers (#29, #30, #34). They load public evidence from the Ledger (and, for a web
// page, read the live page as the site check does), run the shared workflows and submit the result for approval.
import { submitArtifact } from "../approvals/queue.ts";
import { currentEntity } from "../entity/entity.ts";
import { rulebookFigures } from "../gates/claims.ts";
import { figuresFromEvidence } from "../ledger/figures.ts";
import { knownPeople, readEvidence } from "../ledger/repo.ts";
import { auditHtml, fetchPage, pageHead, visibleText } from "../site/siteChecker.ts";
import { ElevatorAdInput, LinkedinInput, WebPageInput, elevatorAdWorkflow, linkedinWorkflow, webPageWorkflow } from "../workflows/marketing.ts";
import type { WorkflowResult } from "../workflows/types.ts";
import { workflowEnv, type Pipeline, type PipelineContext, type PipelineOutcome } from "./context.ts";

export { ElevatorAdInput, LinkedinInput, WebPageInput } from "../workflows/marketing.ts";

async function submit(ctx: PipelineContext, res: WorkflowResult): Promise<PipelineOutcome> {
  if (!res.artifact) return { status: res.status, ...(res.note ? { note: res.note } : {}) };
  const artifactId = await submitArtifact(ctx.db, { workOrderId: ctx.workOrderId, ...res.artifact }, "agent:dispatcher");
  return { status: res.status, artifactId, ...(res.note ? { note: res.note } : {}) };
}

export const linkedinPipeline: Pipeline = async (ctx, raw) => {
  const input = LinkedinInput.parse(raw);
  const all = await readEvidence(ctx.db, { maxTier: "public", readBy: "agent:linkedin_writer", purpose: `LinkedIn post ${input.project_ref ?? "on a topic"}` });
  // A post about one project gets that project's facts and the company record; a post on a topic gets everything public.
  const records = input.project_ref ? all.filter((r) => r.project_ref === input.project_ref || !r.project_ref) : all;
  return submit(ctx, await linkedinWorkflow(workflowEnv(ctx, await knownPeople(ctx.db)), input, records));
};

export const elevatorAdPipeline: Pipeline = async (ctx, raw) => {
  const input = ElevatorAdInput.parse(raw);
  const records = await readEvidence(ctx.db, { maxTier: "public", readBy: "agent:elevator_ad_writer", purpose: `elevator ${input.format} for ${input.channel}` });
  return submit(ctx, await elevatorAdWorkflow(workflowEnv(ctx, await knownPeople(ctx.db)), input, records));
};

export const webPagePipeline: Pipeline = async (ctx, raw) => {
  const input = WebPageInput.parse(raw);
  if (!ctx.fetchFn) return { status: "needs_human", note: "This deployment can't fetch web pages." };
  const f = await fetchPage(input.page_url, ctx.fetchFn);
  if (f.error) return { status: "needs_human", note: `Could not fetch ${input.page_url}: ${f.error}` };
  const evidence = await readEvidence(ctx.db, { maxTier: "public", readBy: "agent:web_page_writer", purpose: `web page ${input.page_url}` });
  const entity = await currentEntity(ctx.db);
  const audit = auditHtml({ url: f.finalUrl, html: f.html, status: f.status, redirects: f.redirects },
    { ...(entity ? { entity: entity.fields } : {}), brand: ctx.brand, figures: [...rulebookFigures(ctx.brand), ...figuresFromEvidence(evidence)] });
  const head = pageHead(f.html);
  const failures = [
    ...audit.findings.filter((x) => x.severity === "fail").map((x) => ({ rule: x.check, quote: x.detail, why: "" })),
    ...audit.textFindings.filter((x) => x.severity === "fail").map((x) => ({ rule: x.rule, quote: x.quote, why: x.why })),
  ];
  await ctx.step({ step: "read the live page", outcome: "ok", details: { url: f.finalUrl, failures: failures.length } });
  const page = { url: f.finalUrl, title: head.title, description: head.description, text: visibleText(f.html), hasForm: audit.forms.count > 0, failures };
  return submit(ctx, await webPageWorkflow(workflowEnv(ctx, await knownPeople(ctx.db)), input, page, evidence));
};
