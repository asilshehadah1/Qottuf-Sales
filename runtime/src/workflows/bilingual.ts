// Workflow: a bilingual edit (roster #6), checked by code on both languages, with one revision on findings.
// Sentence removal isn't used here: removing a sentence in one language would break parity, so a pair that still
// fails after the revision goes to Asil blocked, with every finding listed. Pure: the caller supplies the evidence.

import { z } from "zod";
import * as Editor from "../agents/bilingualEditor.ts";
import { rulebookFigures } from "../gates/claims.ts";
import type { Finding } from "../gates/findings.ts";
import { checkNoAddedFigures, checkParity, glossarySignals } from "../gates/parity.ts";
import { redact } from "../gates/pii.ts";
import { isStrict, runTextGates, type GateReport } from "../gates/runGates.ts";
import type { Lang } from "../gates/text.ts";
import { figuresFromEvidence } from "../ledger/figures.ts";
import type { EvidenceRecord } from "../ledger/schemas.ts";
import type { ModelResult } from "../model/core.ts";
import type { WorkflowEnv, WorkflowResult } from "./types.ts";

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

export async function bilingualWorkflow(env: WorkflowEnv, raw: unknown, evidence: EvidenceRecord[]): Promise<WorkflowResult> {
  const input = BilingualInput.parse(raw);
  const strict = isStrict(input.audience);
  const maxTier = input.audience === "public" ? "public" : "tender";
  const figures = [...rulebookFigures(env.brand), ...figuresFromEvidence(evidence)];
  const payload = { source_lang: input.source_lang, source_text: input.source_text, audience: input.audience, register: input.register, purpose: input.purpose };

  let out: Editor.BilingualOutput | null = null;
  let report: GateReport | null = null;
  const served = new Set<string>();
  let findings: string[] = [];
  for (let round = 1; round <= 2; round++) {
    const body: string = JSON.stringify(round === 1 ? payload : { ...payload, previous: out, findings }, null, 1);
    const res: ModelResult<Editor.BilingualOutput> = await env.callAgent(Editor.AGENT, Editor.PROMPT_VERSION,
      (m) => Editor.editBilingual(m, env.brand, redact(body, { people: env.people, publicNumbers: env.publicNumbers }).text));
    served.add(res.modelServed);
    const current: Editor.BilingualOutput = res.output;
    out = current;
    const base = runTextGates({ en: current.en, ar: current.ar }, {
      rules: env.brand, figures, audience: input.audience, formal: false, people: env.people, publicNumbers: env.publicNumbers,
    });
    const editedSource = input.source_lang === "en" ? current.en : current.ar;
    const extra: Array<Finding & { lang: Lang }> = [
      ...checkParity(current.en, current.ar, env.brand, strict).map((f) => ({ ...f, lang: (f.rule.endsWith("_in_ar") ? "ar" : "en") as Lang })),
      ...checkNoAddedFigures(input.source_text, editedSource, env.brand).map((f) => ({ ...f, lang: input.source_lang })),
      ...glossarySignals(current.en, current.ar, env.brand).map((f) => ({ ...f, lang: "ar" as Lang })),
    ];
    const blocking = [...base.blocking, ...extra.filter((f) => f.severity === "fail")];
    report = { ...base, blocking, warnings: [...base.warnings, ...extra.filter((f) => f.severity === "signal")], passed: blocking.length === 0 };
    await env.step({ step: `gates round ${round}`, outcome: report.passed ? "ok" : "blocked", details: { blocking: report.blocking.length, warnings: report.warnings.length } });
    if (report.passed) break;
    findings = report.blocking.map((f, i) => `${i + 1}. [${f.lang}] ${f.rule}: "${f.quote}". ${f.why}`);
  }

  return {
    status: report!.passed ? "succeeded" : "needs_human",
    note: report!.passed ? (out!.for_asil_to_check.length ? `${out!.for_asil_to_check.length} point(s) for Asil to check.` : undefined)
      : `${report!.blocking.length} finding(s) still open after the revision: Asil decides.`,
    artifact: {
      artifactType: "bilingual_edit", title: input.title ?? `Bilingual edit: ${input.purpose}`, audience: input.audience,
      content: { source_lang: input.source_lang, register: input.register, purpose: input.purpose, changes_to_source: out!.changes_to_source,
        untransferable: out!.untransferable, for_asil_to_check: out!.for_asil_to_check },
      renderedEn: out!.en, renderedAr: out!.ar, evidenceTierMax: maxTier, gateReport: report!,
      provenance: { prompt_versions: [Editor.PROMPT_VERSION], models_served: [...served], rules_version: env.rulesVersion },
    },
  };
}
