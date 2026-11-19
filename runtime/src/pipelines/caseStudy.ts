// Pipeline: a bilingual case study from approved evidence (roster #28, gated by #5, #7 and #8).

import { z } from "zod";
import { extractClaims } from "../agents/claimExtractor.ts";
import * as Writer from "../agents/caseStudyWriter.ts";
import * as Extractor from "../agents/claimExtractor.ts";
import { submitArtifact } from "../approvals/queue.ts";
import { rulebookFigures } from "../gates/claims.ts";
import type { Finding } from "../gates/findings.ts";
import { findNumericMentions } from "../gates/numbers.ts";
import { redact } from "../gates/pii.ts";
import { removeFailingSentences, runTextGates, type GateReport } from "../gates/runGates.ts";
import type { Lang } from "../gates/text.ts";
import { figuresFromEvidence, knownPeople, readEvidence } from "../ledger/repo.ts";
import type { ModelResult } from "../model/client.ts";
import type { Pipeline } from "./context.ts";

export const CaseStudyInput = z.object({
  project_ref: z.string().regex(/^PRJ-\d+$/),
  audience: z.enum(["public", "tender"]),
});

interface Rendered {
  texts: Record<Lang, string>;
  /** Where each draft sentence sits in the joined text, to tie findings back to citations. */
  spans: Array<{ lang: Lang; start: number; end: number; fact_ids: string[]; text: string }>;
}

function render(draft: Writer.CaseStudyDraft): Rendered {
  const texts: Record<Lang, string> = { en: "", ar: "" };
  const spans: Rendered["spans"] = [];
  for (const s of draft.sentences) {
    const sep = texts[s.lang] ? " " : "";
    const start = texts[s.lang].length + sep.length;
    texts[s.lang] += sep + s.text.trim();
    spans.push({ lang: s.lang, start, end: start + s.text.trim().length, fact_ids: s.fact_ids, text: s.text.trim() });
  }
  return { texts, spans };
}

function withFindings(report: GateReport, extra: Array<Finding & { lang: Lang }>): GateReport {
  const blocking = [...report.blocking, ...extra.filter((f) => f.severity === "fail")];
  const warnings = [...report.warnings, ...extra.filter((f) => f.severity === "signal")];
  return { ...report, blocking, warnings, passed: blocking.length === 0 };
}

export const caseStudyPipeline: Pipeline = async (ctx, raw) => {
  const input = CaseStudyInput.parse(raw);
  const maxTier = input.audience === "public" ? "public" : "tender";
  const records = await readEvidence(ctx.db, {
    maxTier, readBy: `agent:${Writer.AGENT}`, purpose: `case study ${input.project_ref}`, projectRef: input.project_ref,
  });
  if (records.length === 0) {
    return { status: "needs_human", note: `No approved, unexpired ${maxTier} evidence for ${input.project_ref}: nothing to write from.` };
  }

  // Marketing gate G2, re-used: a client is named only with Asil's dated approval for this use.
  const namingApproved = records.some((r) => r.type === "client_naming_approval" && r.permitted_uses.includes(`name_client:${input.audience}`));
  const facts = records.flatMap((r) => r.facts.map((f) => ({ ...f, fid: `${r.id}#${f.id}` })));
  const clientName = facts.find((f) => f.name === "client_name");
  const descriptor = facts.find((f) => f.name === "client_descriptor");
  const usable = facts.filter((f) => f.name !== "client_name" && f.name !== "client_descriptor");
  const knownIds = new Set(usable.map((f) => f.fid));
  if (descriptor) knownIds.add(descriptor.fid);
  if (namingApproved && clientName) knownIds.add(clientName.fid);
  const payload = {
    project_ref: input.project_ref,
    audience: input.audience,
    client: namingApproved && clientName
      ? { may_name: true, name: String(clientName.value), fact_id: clientName.fid }
      : { may_name: false, descriptor: String(descriptor?.value ?? "a private-sector client"), ...(descriptor ? { fact_id: descriptor.fid } : {}) },
    facts: usable.map((f) => ({
      id: f.fid, kind: f.kind, name: f.name, label: f.label, unit: f.unit ?? null,
      value: typeof f.value === "number" ? f.value.toLocaleString("en-US") : f.value,
    })),
  };

  const people = await knownPeople(ctx.db);
  const figures = [...rulebookFigures(ctx.brand), ...figuresFromEvidence(records)];
  // The legal name belongs on the pack's cover letter, not in each case study, so case studies aren't "formal".
  const gateCtx = {
    rules: ctx.brand, figures, audience: input.audience === "public" ? ("public" as const) : ("client" as const),
    formal: false, people, publicNumbers: ctx.publicNumbers,
  };

  let draft: Writer.CaseStudyDraft | null = null;
  let rendered: Rendered | null = null;
  let report: GateReport | null = null;
  const modelsServed = new Set<string>();
  let findingsForRevision: string[] = [];

  for (let round = 1; round <= 2; round++) {
    const body: string = JSON.stringify(
      round === 1 ? payload : { ...payload, previous_draft: draft, findings: findingsForRevision },
      null, 1,
    );
    const res: ModelResult<Writer.CaseStudyDraft> = await ctx.callModel(Writer.AGENT, Writer.PROMPT_VERSION,
      (m) => Writer.writeCaseStudy(m, redact(body, { people, publicNumbers: ctx.publicNumbers }).text));
    modelsServed.add(res.modelServed);
    const current: Writer.CaseStudyDraft = res.output;
    draft = current;
    rendered = render(current);

    const extra: Array<Finding & { lang: Lang }> = [];
    for (const s of rendered.spans) {
      const unknown = s.fact_ids.filter((id) => !knownIds.has(id));
      if (unknown.length) {
        extra.push({ gate: "claims", severity: "fail", rule: "claims.unknown_fact_id", quote: s.text, lang: s.lang,
          why: `The sentence cites facts that aren't on the approved records: ${unknown.join(", ")}.`, start: s.start, end: s.end });
      }
    }
    if (!namingApproved && clientName && [rendered.texts.en, rendered.texts.ar].some((t) => t.includes(String(clientName.value)))) {
      extra.push({ gate: "naming_approval", severity: "fail", rule: "naming_approval.client_named", quote: String(clientName.value), lang: "en",
        why: "The client is named without Asil's approval for this use." });
    }

    report = runTextGates(rendered.texts, {
      ...gateCtx,
      declared: current.declared_claims.map((d) => ({ value: d.value, unit: d.unit, sourceId: d.fact_id })),
    });

    // The independent extractor: its own context, its own list, checked by code.
    const joined = `${rendered.texts.en}\n${rendered.texts.ar}`;
    const ex = await ctx.callModel(Extractor.AGENT, Extractor.PROMPT_VERSION, (m) => extractClaims(m, redact(joined, { people, publicNumbers: ctx.publicNumbers }).text));
    modelsServed.add(ex.modelServed);
    for (const c of ex.output.claims) {
      const text = rendered.texts[c.lang];
      const at = text.indexOf(c.span);
      if (at < 0) {
        extra.push({ gate: "claims", severity: "signal", rule: "claims.extractor_span_not_found", quote: c.span, lang: c.lang,
          why: "The extractor quoted words that aren't in the text; ignored." });
        continue;
      }
      const sentence = rendered.spans.find((s) => s.lang === c.lang && at >= s.start && at < s.end);
      if ((c.kind === "factual" || c.kind === "ranking") && sentence && sentence.fact_ids.length === 0) {
        extra.push({ gate: "claims", severity: "fail", rule: "claims.unsupported_statement", quote: c.span, lang: c.lang,
          why: "A claim with no approved fact behind it.", start: at, end: at + c.span.length });
      }
      for (const m of findNumericMentions(c.span)) {
        const abs = at + m.start;
        const covered = report.verified.some((v) => v.lang === c.lang && abs >= v.start && abs < v.end)
          || report.blocking.some((b) => b.lang === c.lang && b.start !== undefined && abs >= b.start && abs < (b.end ?? b.start + 1));
        if (!covered) {
          extra.push({ gate: "claims", severity: "fail", rule: "claims.extractor_unverified", quote: c.span, lang: c.lang,
            why: `The extractor found '${m.raw}', which no approved figure backs.`, start: abs, end: abs + m.raw.length });
        }
      }
    }
    report = withFindings(report, extra);
    await ctx.step({ step: `gates round ${round}`, outcome: report.passed ? "ok" : "blocked",
      details: { blocking: report.blocking.length, warnings: report.warnings.length, verified: report.verified.length } });
    if (report.passed) break;
    findingsForRevision = report.blocking.map((f, i) => `${i + 1}. [${f.lang}] ${f.rule}: "${f.quote}". ${f.why}${f.fix ? ` Fix: ${f.fix}` : ""}`);
  }

  let texts: Partial<Record<Lang, string>> = rendered!.texts;
  let removed: Array<{ lang: Lang; sentence: string; reasons: string[] }> = [];
  let finalReport = report!;
  if (!finalReport.passed) {
    // Two rounds failed: remove exactly the failing sentences, in their own language (spec §7.1 step 6), and re-check.
    const repair = removeFailingSentences(rendered!.texts, finalReport);
    texts = repair.texts;
    removed = repair.removed;
    const recheck = runTextGates(texts, gateCtx);
    finalReport = withFindings(recheck, repair.unrepairable.map((f) => ({ ...f, lang: "en" as Lang })));
    await ctx.step({ step: "remove failing sentences", outcome: finalReport.passed ? "ok" : "blocked", details: { removed: removed.length } });
  }

  const artifactId = await submitArtifact(ctx.db, {
    workOrderId: ctx.workOrderId,
    artifactType: "case_study",
    title: `${draft!.title_en} (${input.project_ref})`,
    audience: input.audience === "public" ? "public" : "client",
    content: { project_ref: input.project_ref, title_en: draft!.title_en, title_ar: draft!.title_ar, client_named: namingApproved, removed },
    renderedEn: texts.en ?? null,
    renderedAr: texts.ar ?? null,
    evidenceTierMax: maxTier,
    gateReport: finalReport,
    provenance: {
      prompt_versions: [Writer.PROMPT_VERSION, Extractor.PROMPT_VERSION],
      models_served: [...modelsServed],
      rules_version: ctx.rules.rulesVersion,
      evidence_ids: records.map((r) => r.id),
    },
  }, "agent:dispatcher");

  return {
    status: finalReport.passed ? "succeeded" : "needs_human",
    artifactId,
    note: removed.length ? `${removed.length} sentence(s) removed by the gates; see the artifact.` : undefined,
  };
};
