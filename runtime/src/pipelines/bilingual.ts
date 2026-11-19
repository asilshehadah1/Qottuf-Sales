// Pipeline: a bilingual edit (roster #6), checked by code on both languages, with one revision on findings.
// Sentence removal isn't used here: removing a sentence in one language would break parity, so a pair that still
// fails after the revision goes to Asil blocked, with every finding listed.

import { z } from "zod";
import * as Editor from "../agents/bilingualEditor.ts";
import { submitArtifact } from "../approvals/queue.ts";
import { rulebookFigures } from "../gates/claims.ts";
import type { Finding } from "../gates/findings.ts";
import { checkNoAddedFigures, checkParity, glossarySignals } from "../gates/parity.ts";
import { redact } from "../gates/pii.ts";
import { isStrict, runTextGates, type GateReport } from "../gates/runGates.ts";
import type { Lang } from "../gates/text.ts";
import { figuresFromEvidence, knownPeople, readEvidence } from "../ledger/repo.ts";
import type { ModelResult } from "../model/client.ts";
import type { Pipeline } from "./context.ts";

export const BilingualInput = z.object({
  source_lang: z.enum(["en", "ar"]),
  source_text: z.string().min(3),
  audience: z.enum(["asil", "internal", "client", "public"]),
  register: z.enum(["formal_msa", "saudi_conversational"]).default("formal_msa"),
  purpose: z.string().min(3),
  project_ref: z.string().regex(/^PRJ-\d+$/).optional(),
  title: z.string().optional(),
}).superRefine((v, ctx) => {
  // Business-development spec §4: Saudi conversational Arabic only for elevator consumer ads.
  if (v.register === "saudi_conversational" && !(v.purpose === "elevator_ad" && v.audience === "public")) {
    ctx.addIssue({ code: "custom", message: "Saudi conversational Arabic is only for public elevator ads (purpose elevator_ad); everything else is formal Modern Standard Arabic." });
  }
});

export const bilingualPipeline: Pipeline = async (ctx, raw) => {
  const input = BilingualInput.parse(raw);
  const strict = isStrict(input.audience);
  const maxTier = input.audience === "public" ? "public" : "tender";
  const evidence = await readEvidence(ctx.db, {
    maxTier, readBy: `agent:${Editor.AGENT}`, purpose: `bilingual edit: ${input.purpose}`,
    ...(input.project_ref ? { projectRef: input.project_ref } : {}),
  });
  const people = await knownPeople(ctx.db);
  const figures = [...rulebookFigures(ctx.brand), ...figuresFromEvidence(evidence)];
  const payload = { source_lang: input.source_lang, source_text: input.source_text, audience: input.audience, register: input.register, purpose: input.purpose };

  let out: Editor.BilingualOutput | null = null;
  let report: GateReport | null = null;
  const served = new Set<string>();
  let findings: string[] = [];
  for (let round = 1; round <= 2; round++) {
    const body: string = JSON.stringify(round === 1 ? payload : { ...payload, previous: out, findings }, null, 1);
    const res: ModelResult<Editor.BilingualOutput> = await ctx.callModel(Editor.AGENT, Editor.PROMPT_VERSION,
      (m) => Editor.editBilingual(m, ctx.brand, redact(body, { people, publicNumbers: ctx.publicNumbers }).text));
    served.add(res.modelServed);
    const current: Editor.BilingualOutput = res.output;
    out = current;
    const base = runTextGates({ en: current.en, ar: current.ar }, {
      rules: ctx.brand, figures, audience: input.audience, formal: false, people, publicNumbers: ctx.publicNumbers,
    });
    const editedSource = input.source_lang === "en" ? current.en : current.ar;
    const extra: Array<Finding & { lang: Lang }> = [
      ...checkParity(current.en, current.ar, ctx.brand, strict).map((f) => ({ ...f, lang: (f.rule.endsWith("_in_ar") ? "ar" : "en") as Lang })),
      ...checkNoAddedFigures(input.source_text, editedSource, ctx.brand).map((f) => ({ ...f, lang: input.source_lang })),
      ...glossarySignals(current.en, current.ar, ctx.brand).map((f) => ({ ...f, lang: "ar" as Lang })),
    ];
    const blocking = [...base.blocking, ...extra.filter((f) => f.severity === "fail")];
    report = { ...base, blocking, warnings: [...base.warnings, ...extra.filter((f) => f.severity === "signal")], passed: blocking.length === 0 };
    await ctx.step({ step: `gates round ${round}`, outcome: report.passed ? "ok" : "blocked", details: { blocking: report.blocking.length, warnings: report.warnings.length } });
    if (report.passed) break;
    findings = report.blocking.map((f, i) => `${i + 1}. [${f.lang}] ${f.rule}: "${f.quote}". ${f.why}`);
  }

  const title = input.title ?? `Bilingual edit: ${input.purpose}`;
  const artifactId = await submitArtifact(ctx.db, {
    workOrderId: ctx.workOrderId, artifactType: "bilingual_edit", title, audience: input.audience,
    content: { source_lang: input.source_lang, register: input.register, purpose: input.purpose, changes_to_source: out!.changes_to_source,
      untransferable: out!.untransferable, for_asil_to_check: out!.for_asil_to_check },
    renderedEn: out!.en, renderedAr: out!.ar, evidenceTierMax: maxTier, gateReport: report!,
    provenance: { prompt_versions: [Editor.PROMPT_VERSION], models_served: [...served], rules_version: ctx.rules.rulesVersion },
  }, "agent:dispatcher");
  return {
    status: report!.passed ? "succeeded" : "needs_human",
    artifactId,
    note: report!.passed ? (out!.for_asil_to_check.length ? `${out!.for_asil_to_check.length} point(s) for Asil to check.` : undefined)
      : `${report!.blocking.length} finding(s) still open after the revision: Asil decides.`,
  };
};
