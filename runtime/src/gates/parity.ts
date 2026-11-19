// Bilingual parity, in code: the same figures in both languages, no figure added to the source by an editor, and
// the glossary's fixed Arabic for contracting vocabulary. The brand checker's own notes say "bilingual claim parity"
// is beyond its reach; for figures it isn't, because the normaliser reads both scripts.

import { allowedNumberSpans, type BrandRules } from "./brand.ts";
import type { Finding } from "./findings.ts";
import { findNumericMentions, type NumericMention } from "./numbers.ts";
import { normaliseArabic } from "./pii.ts";

function key(m: NumericMention): string {
  if (m.kind === "date") return `date:${m.date}`;
  if (m.value === null) return `?:${m.raw}`;
  const value = m.valueMax !== undefined ? `${m.value}-${m.valueMax}` : String(m.value);
  return `${value}|${m.unit ?? ""}`;
}

/** The figures in a text, keyed by value and unit, ignoring numbers the rulebook allows (ids, phone, Vision 2030). */
export function figureKeys(text: string, brand: BrandRules): Map<string, string> {
  const allowed = allowedNumberSpans(text, brand);
  const out = new Map<string, string>();
  for (const m of findNumericMentions(text)) {
    if (allowed.some((a) => m.start >= a.start && m.start < a.end)) continue;
    if (!out.has(key(m))) out.set(key(m), m.raw);
  }
  return out;
}

/** Every figure must appear in both languages, with the same value and unit. */
export function checkParity(en: string, ar: string, brand: BrandRules, strict: boolean): Finding[] {
  const e = figureKeys(en, brand);
  const a = figureKeys(ar, brand);
  const out: Finding[] = [];
  const severity = strict ? "fail" : "signal";
  for (const [k, raw] of e) {
    if (!a.has(k)) out.push({ gate: "claims", severity, rule: "parity.missing_in_ar", quote: raw, why: `'${raw}' is in the English but not in the Arabic: the two versions must carry the same figures.` });
  }
  for (const [k, raw] of a) {
    if (!e.has(k)) out.push({ gate: "claims", severity, rule: "parity.missing_in_en", quote: raw, why: `'${raw}' is in the Arabic but not in the English: the two versions must carry the same figures.` });
  }
  return out;
}

/** An editor may polish the source; it may never add a figure that wasn't there. */
export function checkNoAddedFigures(source: string, edited: string, brand: BrandRules): Finding[] {
  const before = figureKeys(source, brand);
  return [...figureKeys(edited, brand)]
    .filter(([k]) => !before.has(k))
    .map(([, raw]) => ({ gate: "claims" as const, severity: "fail" as const, rule: "editor.added_figure", quote: raw, why: `The edit added '${raw}', which isn't in the source text. Editors polish; they don't add facts.` }));
}

/** Where the English uses a glossary term, the Arabic should use the glossary's fixed term. Signals for Asil's review. */
export function glossarySignals(en: string, ar: string, brand: BrandRules): Finding[] {
  const arNorm = normaliseArabic(ar);
  const out: Finding[] = [];
  for (const g of brand.glossary) {
    const enTerms = g.en.split(/\s*\/\s*|\s*\(|\)/).map((t) => t.trim()).filter((t) => t.length > 2 && !/^brand tagline$/i.test(t));
    const arTerms = g.ar.split(/\s*\/\s*/).map((t) => normaliseArabic(t.trim())).filter(Boolean);
    const used = enTerms.map((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").exec(en)?.[0]).find(Boolean);
    if (used && !arTerms.some((t) => arNorm.includes(t))) {
      out.push({ gate: "brand", severity: "signal", rule: "glossary.term", quote: used, why: `The English says "${used}"; the glossary's Arabic is «${g.ar}».${g.notes ? ` ${g.notes}` : ""}` });
    }
  }
  return out;
}
