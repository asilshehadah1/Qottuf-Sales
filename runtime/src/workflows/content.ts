// One workflow for every public writer that produces an English and Arabic pair from approved evidence
// (#29 Web Page Writer, #30 LinkedIn, #34 Elevator Ad). Pure: the caller supplies the evidence and any page data.
//   1. The writer drafts the pair from the facts it may use, listing the facts and declaring every figure.
//   2. Code runs the brand, claims and PII gates on both languages, checks parity and the glossary, refuses fact ids
//      that aren't on approved records and client names without approval.
//   3. An independent extractor (#7) lists every claim in the final text; code checks each figure it finds.
//   4. One revision round on the findings. A pair that still fails goes to Asil blocked, with every finding listed:
//      removing a sentence from one language only would break parity, so nothing is cut automatically.

import * as Extractor from "../agents/claimExtractor.ts";
import { rulebookFigures } from "../gates/claims.ts";
import type { Finding } from "../gates/findings.ts";
import { findNumericMentions } from "../gates/numbers.ts";
import { checkParity, glossarySignals } from "../gates/parity.ts";
import { redact, type RedactedText } from "../gates/pii.ts";
import { isStrict, runTextGates, type Audience, type GateReport } from "../gates/runGates.ts";
import type { Lang } from "../gates/text.ts";
import { figuresFromEvidence } from "../ledger/figures.ts";
import type { EvidenceRecord, Tier } from "../ledger/schemas.ts";
import type { ModelClient, ModelResult } from "../model/core.ts";
import type { WorkflowEnv, WorkflowResult } from "./types.ts";

export interface ContentOutput {
  fact_ids: string[];
  declared_claims: Array<{ value: number; unit: string | null; fact_id: string }>;
  for_asil_to_check: string[];
}

export interface ContentSpec<T extends ContentOutput> {
  artifactType: string;
  agent: string;
  promptVersion: string;
  audience: Audience;
  evidenceTierMax: Tier;
  write: (model: ModelClient, input: RedactedText) => Promise<ModelResult<T>>;
  /** Everything a reader will see, per language: what the gates read. */
  texts: (out: T) => Record<Lang, string>;
  /** The parts that must carry the same figures in both languages, when that isn't all of texts (e.g. Arabic-only captions). */
  parity?: (out: T) => Record<Lang, string>;
  /** What Asil reads and copies. */
  render: (out: T) => { en: string; ar: string };
  title: (out: T) => string;
  content: (out: T) => Record<string, unknown>;
  /** Extra checks for this writer: failures block, signals are shown to Asil. */
  checks?: (out: T) => Array<Finding & { lang: Lang }>;
  /** A line for the board about what came back, e.g. points for Asil to check. */
  note?: (out: T) => string | undefined;
}

export interface PayloadFact {
  id: string;
  project_ref: string | null;
  kind: string;
  name: string;
  label: string;
  unit: string | null;
  value: string | number;
}

/**
 * The facts a public writer may use. Client names are offered only for projects whose naming Asil approved for
 * public use; every other client name is withheld from the writer and checked for in the output.
 */
export function usableFacts(records: EvidenceRecord[]): { facts: PayloadFact[]; mayName: Array<{ project_ref: string; name: string; fact_id: string }>; mustNotName: string[] } {
  const approvedNaming = new Set(records.filter((r) => r.type === "client_naming_approval" && r.permitted_uses.includes("name_client:public") && r.project_ref).map((r) => r.project_ref!));
  const facts: PayloadFact[] = [];
  const mayName: Array<{ project_ref: string; name: string; fact_id: string }> = [];
  const mustNotName: string[] = [];
  for (const r of records) {
    for (const f of r.facts) {
      const id = `${r.id}#${f.id}`;
      if (f.name === "client_name") {
        if (r.project_ref && approvedNaming.has(r.project_ref)) mayName.push({ project_ref: r.project_ref, name: String(f.value), fact_id: id });
        else mustNotName.push(String(f.value));
        continue;
      }
      facts.push({ id, project_ref: r.project_ref, kind: f.kind, name: f.name, label: f.label, unit: f.unit ?? null,
        value: typeof f.value === "number" ? f.value.toLocaleString("en-US") : f.value });
    }
  }
  return { facts, mayName, mustNotName: [...new Set(mustNotName)].filter((n) => !mayName.some((m) => m.name === n)) };
}

function withFindings(report: GateReport, extra: Array<Finding & { lang: Lang }>): GateReport {
  const blocking = [...report.blocking, ...extra.filter((f) => f.severity === "fail")];
  const warnings = [...report.warnings, ...extra.filter((f) => f.severity === "signal")];
  return { ...report, blocking, warnings, passed: blocking.length === 0 };
}

const PROMISE_KINDS = new Set(["warranty", "payment_term", "inclusion", "availability"]);

export async function contentWorkflow<T extends ContentOutput>(
  env: WorkflowEnv, spec: ContentSpec<T>, request: Record<string, unknown>, records: EvidenceRecord[],
): Promise<WorkflowResult> {
  const approved = records.filter((r) => r.status === "approved");
  const { facts, mayName, mustNotName } = usableFacts(approved);
  if (facts.length === 0) {
    return { status: "needs_human", note: "No approved evidence this writer may use. File and approve the facts first (Proof)." };
  }
  const known = new Set([...facts.map((f) => f.id), ...mayName.map((m) => m.fact_id)]);
  const figures = [...rulebookFigures(env.brand), ...figuresFromEvidence(approved)];
  const strict = isStrict(spec.audience);
  const payload = {
    ...request,
    clients_you_may_name: mayName.map(({ project_ref, name, fact_id }) => ({ project_ref, name, fact_id })),
    facts,
  };
  const red = (text: string) => redact(text, { people: env.people, publicNumbers: env.publicNumbers }).text;

  let out: T | null = null;
  let report: GateReport | null = null;
  let findings: string[] = [];
  const served = new Set<string>();

  for (let round = 1; round <= 2; round++) {
    const body: string = JSON.stringify(round === 1 ? payload : { ...payload, previous: out, findings }, null, 1);
    const res: ModelResult<T> = await env.callAgent(spec.agent, spec.promptVersion, (m) => spec.write(m, red(body)));
    served.add(res.modelServed);
    const current: T = res.output;
    out = current;
    const texts = spec.texts(current);
    const pair = spec.parity ? spec.parity(current) : texts;

    const base = runTextGates(texts, {
      rules: env.brand, figures, audience: spec.audience, formal: false,
      declared: current.declared_claims.map((d) => ({ value: d.value, unit: d.unit, sourceId: d.fact_id })),
      people: env.people, publicNumbers: env.publicNumbers,
    });
    const extra: Array<Finding & { lang: Lang }> = [
      ...checkParity(pair.en, pair.ar, env.brand, strict).map((f) => ({ ...f, lang: (f.rule.endsWith("_in_ar") ? "ar" : "en") as Lang })),
      ...glossarySignals(pair.en, pair.ar, env.brand).map((f) => ({ ...f, lang: "ar" as Lang })),
      ...(spec.checks ? spec.checks(current) : []),
    ];
    const unknown = [...new Set([...current.fact_ids, ...current.declared_claims.map((d) => d.fact_id)])].filter((id) => !known.has(id));
    if (unknown.length) {
      extra.push({ gate: "claims", severity: "fail", rule: "claims.unknown_fact_id", quote: unknown.join(", "), lang: "en",
        why: "The draft cites facts that aren't on the approved records." });
    }
    for (const name of mustNotName) {
      for (const lang of ["en", "ar"] as const) {
        if (texts[lang].includes(name)) {
          extra.push({ gate: "naming_approval", severity: "fail", rule: "naming_approval.client_named", quote: name, lang,
            why: "This client may not be named: there is no approval to name them in public." });
        }
      }
    }

    // The independent extraction (#7): its own context, its own list, checked by code.
    const ex = await env.callAgent(Extractor.AGENT, Extractor.PROMPT_VERSION, (m) => Extractor.extractClaims(m, red(`${texts.en}\n\n${texts.ar}`)));
    served.add(ex.modelServed);
    for (const c of ex.output.claims) {
      const text = texts[c.lang];
      const at = text.indexOf(c.span);
      if (at < 0) {
        extra.push({ gate: "claims", severity: "signal", rule: "claims.extractor_span_not_found", quote: c.span, lang: c.lang, why: "The extractor quoted words that aren't in the text; ignored." });
        continue;
      }
      if (c.kind === "ranking") {
        extra.push({ gate: "claims", severity: "fail", rule: "claims.ranking", quote: c.span, lang: c.lang, start: at, end: at + c.span.length,
          why: "A ranking or comparison. The rulebook allows none: say the scope or the figure instead." });
      } else if (PROMISE_KINDS.has(c.kind)) {
        extra.push({ gate: "claims", severity: "signal", rule: "claims.promise", quote: c.span, lang: c.lang, start: at, end: at + c.span.length,
          why: "A promise about what Qottuf will give or do. Check that the company makes it before this is used." });
      }
      for (const m of findNumericMentions(c.span)) {
        const abs = at + m.start;
        const covered = base.verified.some((v) => v.lang === c.lang && abs >= v.start && abs < v.end)
          || base.blocking.some((b) => b.lang === c.lang && b.start !== undefined && abs >= b.start && abs < (b.end ?? b.start + 1));
        if (!covered) {
          extra.push({ gate: "claims", severity: "fail", rule: "claims.extractor_unverified", quote: c.span, lang: c.lang, start: abs, end: abs + m.raw.length,
            why: `The extractor found '${m.raw}', which no approved figure backs.` });
        }
      }
    }

    report = withFindings(base, extra);
    await env.step({ step: `gates round ${round}`, outcome: report.passed ? "ok" : "blocked",
      details: { blocking: report.blocking.length, warnings: report.warnings.length, verified: report.verified.length } });
    if (report.passed) break;
    findings = report.blocking.map((f, i) => `${i + 1}. [${f.lang}] ${f.rule}: "${f.quote}". ${f.why}${f.fix ? ` Fix: ${f.fix}` : ""}`);
  }

  const final = out!;
  const rendered = spec.render(final);
  const note = report!.passed
    ? spec.note?.(final) ?? (final.for_asil_to_check.length ? `${final.for_asil_to_check.length} point(s) for Asil to check.` : undefined)
    : `${report!.blocking.length} finding(s) still open after the revision: it can't be approved until they're fixed. Asil decides.`;
  return {
    status: report!.passed ? "succeeded" : "needs_human",
    ...(note ? { note } : {}),
    artifact: {
      artifactType: spec.artifactType,
      title: spec.title(final),
      audience: spec.audience,
      content: { ...spec.content(final), for_asil_to_check: final.for_asil_to_check, fact_ids: final.fact_ids, request },
      renderedEn: rendered.en,
      renderedAr: rendered.ar,
      evidenceTierMax: spec.evidenceTierMax,
      gateReport: report!,
      provenance: {
        prompt_versions: [spec.promptVersion, Extractor.PROMPT_VERSION],
        models_served: [...served],
        rules_version: env.rulesVersion,
        evidence_ids: [...new Set(final.fact_ids.map((id) => id.split("#")[0]!))],
      },
    },
  };
}
