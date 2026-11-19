// Runs every text gate on an artifact's final text, in both languages, and decides what happens:
// - client and public material: any brand, claims or personal-data failure blocks;
// - material for Asil or internal use: the same checks run, and failures are shown as warnings.
// Failures tied to a sentence can be repaired by removing exactly that sentence in that language (§7.1 step 6);
// a document-level failure can't, and leaves the artifact blocked for a human.

import { brandCheck, normFigure, type BrandRules } from "./brand.ts";
import { checkClaims, type ApprovedFigure, type DeclaredClaim, type VerifiedClaim } from "./claims.ts";
import type { Finding } from "./findings.ts";
import { scanPii, type KnownPerson } from "./pii.ts";
import { removeSentences, splitSentences, type Lang } from "./text.ts";

export type Audience = "asil" | "internal" | "client" | "public";

export interface GateContext {
  rules: BrandRules;
  figures: ApprovedFigure[];
  audience: Audience;
  /** Tenders, profiles and letters carry the legal name on first mention. */
  formal: boolean;
  declared?: DeclaredClaim[];
  people?: KnownPerson[];
  publicNumbers?: string[];
}

export interface LanguageReport {
  findings: Finding[];
  verified: VerifiedClaim[];
}

export interface GateReport {
  passed: boolean;
  audience: Audience;
  blocking: Array<Finding & { lang: Lang }>;
  warnings: Array<Finding & { lang: Lang }>;
  verified: Array<VerifiedClaim & { lang: Lang }>;
}

export function isStrict(audience: Audience): boolean {
  return audience === "client" || audience === "public";
}

export function runTextGates(texts: Partial<Record<Lang, string>>, ctx: GateContext): GateReport {
  const strict = isStrict(ctx.audience);
  const verifiedValues = new Set<string>([
    ...ctx.rules.verified_figures.map((f) => f.value),
    ...ctx.figures.filter((f) => f.value !== null).map((f) => normFigure(String(f.value))),
  ]);
  const blocking: GateReport["blocking"] = [];
  const warnings: GateReport["warnings"] = [];
  const verified: GateReport["verified"] = [];

  for (const lang of ["en", "ar"] as const) {
    const text = texts[lang];
    if (!text) continue;
    const brand = brandCheck(text, ctx.rules, { formal: ctx.formal, verifiedValues });
    const claims = checkClaims(text, {
      figures: ctx.figures,
      rules: ctx.rules,
      strict,
      ...(ctx.declared && lang === "en" ? { declared: ctx.declared } : {}),
    });
    const pii: Finding[] = scanPii(text, {
      ...(ctx.people ? { people: ctx.people } : {}),
      ...(ctx.publicNumbers ? { publicNumbers: ctx.publicNumbers } : {}),
    }).map((h) => ({
      gate: "pii" as const,
      severity: "fail" as const,
      rule: `pii.${h.kind}`,
      quote: h.kind === "person" && h.contactId ? `[${h.contactId}]` : `[${h.kind}]`,
      why: "Personal data in the output. It never goes into client material unless a human adds it at send time.",
      start: h.start,
      end: h.end,
    }));
    for (const f of [...brand, ...claims.findings, ...pii]) {
      const item = { ...f, lang };
      if (f.severity === "fail" && strict) blocking.push(item);
      else warnings.push(item);
    }
    verified.push(...claims.verified.map((v) => ({ ...v, lang })));
  }

  return { passed: blocking.length === 0, audience: ctx.audience, blocking, warnings, verified };
}

export interface RepairResult {
  texts: Partial<Record<Lang, string>>;
  removed: Array<{ lang: Lang; sentence: string; reasons: string[] }>;
  /** Document-level failures that sentence removal can't fix. */
  unrepairable: Finding[];
}

/** Remove each sentence that carries a blocking finding, in its own language only. */
export function removeFailingSentences(texts: Partial<Record<Lang, string>>, report: GateReport): RepairResult {
  const out: RepairResult = { texts: { ...texts }, removed: [], unrepairable: [] };
  for (const lang of ["en", "ar"] as const) {
    const text = texts[lang];
    if (!text) continue;
    const sentences = splitSentences(text);
    const toRemove = new Map<number, { start: number; end: number; sentence: string; reasons: Set<string> }>();
    for (const f of report.blocking.filter((b) => b.lang === lang)) {
      if (f.start === undefined) {
        out.unrepairable.push(f);
        continue;
      }
      const hit = sentences.filter((s) => f.start! < s.end && s.start < (f.end ?? f.start! + 1));
      if (hit.length === 0) {
        out.unrepairable.push(f);
        continue;
      }
      for (const s of hit) {
        const entry = toRemove.get(s.start) ?? { start: s.start, end: s.end, sentence: s.text, reasons: new Set<string>() };
        entry.reasons.add(f.rule);
        toRemove.set(s.start, entry);
      }
    }
    if (toRemove.size > 0) {
      out.texts[lang] = removeSentences(text, [...toRemove.values()]);
      for (const r of toRemove.values()) out.removed.push({ lang, sentence: r.sentence, reasons: [...r.reasons] });
    }
  }
  return out;
}
