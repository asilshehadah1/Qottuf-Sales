// The Brand Gate, code part (merged roster #5). A faithful port of the qottuf-brand skill's
// scripts/brand_check.py, driven by the same rulebook, brand-rules.json: one rulebook, never a copy
// (business-development spec §4). Number verification lives in the claims gate (claims.ts), which
// uses the same verified figures plus the evidence store.

import { z } from "zod";
import { FindingList, type Finding } from "./findings.ts";
import { escapeRegex, pyRegex } from "./regex.ts";
import { blankUrls, isArabicLine, splitSentences, sentenceAt } from "./text.ts";
import { asciiDigits } from "./numbers.ts";

const RedFlag = z.object({
  id: z.string(),
  category: z.string(),
  severity: z.enum(["fail", "signal", "demand_proof"]),
  lang: z.enum(["en", "ar", "any"]),
  regex: z.string(),
  explain: z.string(),
  source: z.string().optional(),
});

export const BrandRulesSchema = z.object({
  naming: z.object({
    first_mention: z.string(),
    subsequent: z.string(),
    legal_en: z.string(),
    arabic: z.string(),
    forbidden_variants: z.array(z.string()),
    misspellings_regex: z.string(),
  }),
  banned_phrases_en: z.array(z.string()),
  banned_phrases_ar: z.array(z.string()),
  banned_punctuation: z.array(z.string()),
  first_person_singular_en: z.array(z.string()),
  first_person_singular_ar: z.array(z.string()),
  number_allow_regex: z.string(),
  red_flag_patterns: z.array(RedFlag),
  thresholds: z.object({
    em_dash_per_100_words: z.number(),
    signal_count_for_finding: z.number(),
    parallel_bullet_min: z.number(),
  }),
  verified_figures: z.array(
    z.object({ value: z.string(), context: z.string().optional(), label: z.string(), id: z.string() }),
  ),
  glossary: z.array(z.object({ en: z.string(), ar: z.string(), notes: z.string().optional() })).default([]),
  project_mentions: z.record(z.string(), z.string()),
});
export type BrandRules = z.infer<typeof BrandRulesSchema>;

interface CompiledRules {
  rules: BrandRules;
  forbidden: Array<{ variant: string; re: RegExp }>;
  misspellings: RegExp;
  bannedEn: Array<{ phrase: string; re: RegExp }>;
  bannedAr: Array<{ phrase: string; re: RegExp }>;
  firstPersonEn: RegExp[];
  firstPersonAr: RegExp[];
  redFlags: Array<{ flag: z.infer<typeof RedFlag>; re: RegExp }>;
  allow: RegExp;
  projects: Array<{ id: string; re: RegExp }>;
}

const cache = new WeakMap<BrandRules, CompiledRules>();

/** Compile every rule once. Throws if any rule can't be translated, so a broken rule never silently passes. */
export function compileBrandRules(rules: BrandRules): CompiledRules {
  const hit = cache.get(rules);
  if (hit) return hit;
  const compiled: CompiledRules = {
    rules,
    forbidden: rules.naming.forbidden_variants.map((v) => ({ variant: v, re: pyRegex(escapeRegex(v) + "(?!\\w)") })),
    misspellings: pyRegex(rules.naming.misspellings_regex, "i"),
    bannedEn: rules.banned_phrases_en.map((p) => ({
      phrase: p,
      re: pyRegex(/^[\p{L}\p{N}]/u.test(p) ? `(?<![\\w#])${escapeRegex(p)}(?!\\w)` : escapeRegex(p), "i"),
    })),
    bannedAr: rules.banned_phrases_ar.map((p) => ({ phrase: p, re: pyRegex(`(?<!\\w)${escapeRegex(p)}(?!\\w)`) })),
    firstPersonEn: rules.first_person_singular_en.map((p) => pyRegex(p)),
    firstPersonAr: rules.first_person_singular_ar.map((p) => pyRegex(p)),
    redFlags: rules.red_flag_patterns.map((flag) => ({
      flag,
      re: pyRegex(flag.regex, "i" + (flag.regex.startsWith("^") ? "m" : "")),
    })),
    allow: pyRegex(rules.number_allow_regex, "i"),
    projects: Object.entries(rules.project_mentions).map(([id, rx]) => ({ id, re: pyRegex(rx, "i") })),
  };
  cache.set(rules, compiled);
  return compiled;
}

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{2318}\u{23E9}-\u{23FA}]/gu;
const SPELLED_MEASUREMENT =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand|million)\b(?:[\s-]+(?:hundred|thousand|million|and|one|two|three|four|five|six|seven|eight|nine))*[\s-]+(?:[a-z]+[\s-]+)?(square met(er|re)s?|sqm|sq\.? ?m|m²|met(er|re)s|floors?|stor(e)?ys?|beds?|seats?|days?|weeks?|months?|elevators?|lifts?|buildings?|kva|kw)\b/gi;
const SMALL_WORDS = new Set(["a", "an", "the", "and", "or", "but", "nor", "for", "of", "in", "on", "at", "to", "by", "up", "as", "is", "vs", "via", "per", "with", "from", "into"]);
const MIXED_OK = /Freedom Scientific|Fuji|BMS|MEP|AHU|FCU|UPS|RMU|MDP|HVAC|CCTV|\bIP\b|CR\b|KSA|PRJ-\d+|https?:\/\/\S+|[\w.-]+\.com/gi;

interface Line {
  text: string;
  start: number;
  arabic: boolean;
}

function linesOf(text: string): Line[] {
  const out: Line[] = [];
  let start = 0;
  for (const part of text.split("\n")) {
    out.push({ text: part, start, arabic: isArabicLine(part) });
    start += part.length + 1;
  }
  return out;
}

/** Normalise a number token the way the reference checker does: integer part, no separators. */
export function normFigure(raw: string): string {
  const v = asciiDigits(raw).replace(/[,،٬]/g, "");
  return v.split(".")[0] ?? "";
}

export interface BrandCheckOptions {
  /** Tender, profile or letter: the legal name is required on first mention. */
  formal?: boolean;
  /** Normalised figures that count as proof for a superlative (rulebook figures plus evidence facts). */
  verifiedValues?: Set<string>;
}

/** Check one text against the rulebook. Offsets in findings refer to `text`. */
export function brandCheck(text: string, rules: BrandRules, options: BrandCheckOptions = {}): Finding[] {
  const c = compileBrandRules(rules);
  const rep = new FindingList();
  const clean = blankUrls(text);
  const lines = linesOf(clean);
  const sentences = splitSentences(clean);
  const words = clean.split(/\s+/).filter(Boolean).length;
  const verified = options.verifiedValues ?? new Set(rules.verified_figures.map((f) => f.value));
  const sentenceOf = (idx: number) => sentenceAt(sentences, idx);
  const fail = (rule: string, quote: string, why: string, start?: number, end?: number, fix?: string) =>
    rep.add({ gate: "brand", severity: "fail", rule, quote, why, ...(fix ? { fix } : {}), ...(start !== undefined ? { start, end: end ?? start } : {}) });
  const signal = (rule: string, quote: string, why: string, start?: number, end?: number, fix?: string) =>
    rep.add({ gate: "brand", severity: "signal", rule, quote, why, ...(fix ? { fix } : {}), ...(start !== undefined ? { start, end: end ?? start } : {}) });
  const nm = rules.naming;

  // 1. Naming
  for (const { variant, re } of c.forbidden) {
    for (const m of clean.matchAll(re)) {
      fail("naming.forbidden_variant", m[0], `'${variant}' is a retired spelling.`, m.index, m.index + m[0].length,
        `Use '${nm.first_mention}' on first mention, '${nm.subsequent}' after.`);
    }
  }
  for (const m of clean.matchAll(/\bqottuf\s+aljazeera\b/gi)) {
    if (m[0] !== nm.first_mention && m[0].toUpperCase() !== m[0]) {
      fail("naming.capitalisation", m[0], "Name must be written exactly 'Qottuf Aljazeera'.", m.index, m.index + m[0].length);
    }
  }
  for (const m of clean.matchAll(c.misspellings)) {
    fail("naming.misspelling", m[0], "Misspelt company name.", m.index, m.index + m[0].length, nm.subsequent);
  }
  for (const m of clean.matchAll(/\bQOTTUF(\s+(AL\s*)?JAZEERA)?\b/g)) {
    if (m[0] !== "QOTTUF ALJAZEERA") {
      signal("naming.all_caps", m[0], "All-caps name in copy. The logo artwork reads 'QOTTUF JAZEERA', but typed copy uses 'Qottuf Aljazeera'.", m.index, m.index + m[0].length);
    }
  }
  const enLines = lines.filter((l) => !l.arabic);
  const arLines = lines.filter((l) => l.arabic);
  for (const line of enLines) {
    const first = /\bQottuf\b(\s+Aljazeera)?(\s+Company L\.L\.C\.)?(\s+(Al|al)?\s*Jazeera)?/.exec(line.text);
    if (!first) continue;
    if (!first[4]) {
      const at = line.start + first.index;
      if (!first[1]) {
        signal("naming.first_mention", first[0], "First English mention should be 'Qottuf Aljazeera'; 'Qottuf' alone comes after.", at, at + first[0].length);
      } else if (options.formal && !first[2]) {
        fail("naming.legal_first_mention", first[0], "Formal document: first mention carries the legal name.", at, at + first[0].length, nm.legal_en);
      }
    }
    break; // only the first English mention matters
  }

  // 2. Banned phrases, punctuation, emoji, first person
  for (const line of enLines) {
    for (const { re } of c.bannedEn) {
      for (const m of line.text.matchAll(re)) {
        const s = line.start + m.index;
        if (!rep.claimSpan("en", s, s + m[0].length)) continue;
        fail("tone.banned_phrase", m[0], "Banned unverifiable superlative / legal exposure.", s, s + m[0].length,
          "Replace with a fact-base proof point (a quantity, a duration, a named scope).");
      }
    }
    for (const re of c.firstPersonEn) {
      for (const m of line.text.matchAll(re)) {
        const s = line.start + m.index;
        const sent = sentenceOf(s);
        fail("tone.first_person_singular", sent?.text ?? m[0], "Qottuf speaks as 'we', never 'I/me/my'.", sent?.start ?? s, sent?.end ?? s + m[0].length);
      }
    }
  }
  for (const line of arLines) {
    for (const { re } of c.bannedAr) {
      for (const m of line.text.matchAll(re)) {
        const s = line.start + m.index;
        if (!rep.claimSpan("ar", s, s + m[0].length)) continue;
        fail("tone.banned_phrase_ar", m[0], "عبارة تفضيل مطلق محظورة.", s, s + m[0].length, "استبدلها بمعلومة موثقة من قاعدة الحقائق.");
      }
    }
    for (const re of c.firstPersonAr) {
      for (const m of line.text.matchAll(re)) {
        const s = line.start + m.index;
        const sent = sentenceOf(s);
        fail("tone.first_person_singular_ar", sent?.text ?? m[0], "صيغة الجمع دائماً: نحن / نقدّم / فريقنا.", sent?.start ?? s, sent?.end ?? s + m[0].length);
      }
    }
  }
  for (const ch of rules.banned_punctuation) {
    for (const m of clean.matchAll(new RegExp(escapeRegex(ch), "gu"))) {
      const sent = sentenceOf(m.index);
      fail("tone.exclamation", sent?.text ?? ch, "No exclamation marks anywhere.", sent?.start ?? m.index, sent?.end ?? m.index + 1, "End on a full stop.");
    }
  }
  for (const m of clean.matchAll(EMOJI)) {
    const sent = sentenceOf(m.index);
    fail("visual.no_emoji", sent?.text ?? m[0],
      `Emoji/pictograph U+${m[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}. The Brand Guidelines ban emoji in all brand materials.`,
      sent?.start ?? m.index, sent?.end ?? m.index + m[0].length, "Remove it. Use a word, a DM Sans label, or the teal dot device.");
  }

  // 3. Generic-AI red flags
  for (const { flag, re } of c.redFlags) {
    const targets = flag.lang === "any" ? [{ text: clean, start: 0, arabic: false }] : flag.lang === "ar" ? arLines : enLines;
    for (const target of targets) {
      for (const m of target.text.matchAll(re)) {
        if (!m[0].trim()) continue;
        const s = target.start + m.index;
        let severity: "fail" | "signal" = flag.severity === "signal" ? "signal" : "fail";
        if (flag.severity === "demand_proof") {
          const sent = sentenceOf(s);
          if (sent && hasProof(sent.text, verified)) continue;
          severity = "fail";
        }
        if (flag.lang !== "any" && !rep.claimSpan(flag.lang, s, s + m[0].length)) continue;
        rep.add({ gate: "brand", severity, rule: `red_flag.${flag.id}`, quote: m[0], why: flag.explain, start: s, end: s + m[0].length });
      }
    }
  }

  // 4. Structure tells
  const th = rules.thresholds;
  const dashes = (clean.match(/—/g) ?? []).length;
  const per100 = words ? (dashes / words) * 100 : 0;
  if (per100 > th.em_dash_per_100_words) {
    signal("red_flag.em_dash_cadence", `${dashes} em dashes / ${words} words`,
      `${per100.toFixed(1)} per 100 words (limit ${th.em_dash_per_100_words}): AI cadence tell.`, undefined, undefined, "Rewrite as full stops or commas.");
  }
  const bullets = text.split("\n").map((l) => l.trim()).filter((l) => /^([-*•]|\d+[.)])\s+/.test(l));
  if (bullets.length >= th.parallel_bullet_min) {
    const lens = bullets.map((b) => b.length);
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    if (mean && (Math.max(...lens) - Math.min(...lens)) / mean < 0.25) {
      signal("red_flag.parallel_bullets", bullets.slice(0, 3).join(" | "), `${bullets.length} bullets within 25% of the same length: template rhythm.`);
    }
  }
  const enText = enLines.map((l) => l.text).join("\n");
  const contrasts = enText.match(/\b(is|are)\s+not\s+(an?\s+)?[\w-]+[^.]{0,40}\.\s+(it['’]?s|they['’]?re|it is)\b/gi) ?? [];
  if (contrasts.length > 1) {
    signal("voice.two_beat_overuse", `${contrasts.length} 'is not X. It's Y.' lines`,
      "The two-beat contrast is an approved Qottuf device, but once per piece. More reads as a formula.");
  }
  if ((text.match(/Built to Think/gi) ?? []).length > 1) {
    signal("voice.tagline_reserved", "Built to Think", "Tagline is reserved for hero/masthead, once.");
  }

  // 5. Numeral format (number verification itself is the claims gate)
  for (const line of enLines) {
    for (const m of line.text.matchAll(SPELLED_MEASUREMENT)) {
      const s = line.start + m.index;
      fail("format.numerals", m[0], "Measurements always in digits.", s, s + m[0].length, "e.g. '3,200 sqm'");
    }
    if (/[٠-٩]/.test(line.text)) {
      fail("format.english_digits", line.text, "English copy uses Western digits.", line.start, line.start + line.text.length);
    }
  }
  for (const line of arLines) {
    if (/[0-9]/.test(line.text)) {
      c.allow.lastIndex = 0;
      if (!c.allow.test(line.text)) {
        signal("format.arabic_digits", line.text,
          "Working rule: Arabic-Indic digits (٢٠١٤) in Arabic display copy; Western digits in specs, tables and CR/phone numbers.",
          line.start, line.start + line.text.length);
      }
      c.allow.lastIndex = 0;
    }
  }

  // 6. Bilingual hygiene
  for (const line of lines) {
    if (/[؀-ۿ]/u.test(line.text) && /[A-Za-z]{2,}/.test(line.text.replace(MIXED_OK, " ")) && line.text.length > 12) {
      signal("bilingual.mixed_sentence", line.text,
        "Arabic and English mixed in one line. Allowed for partner names and acronyms (Freedom Scientific, MEP); otherwise split into two lines.",
        line.start, line.start + line.text.length);
    }
  }
  for (const line of arLines) {
    for (const m of line.text.matchAll(/\bMEP\b/g)) {
      const s = line.start + m.index;
      signal("glossary.mep_ar", line.text, "In Arabic copy MEP is 'الأعمال الكهروميكانيكية'.", s, s + 3);
    }
  }

  // 7. English headings in Title Case
  for (const line of text.split("\n")) {
    const h = /^\s*#{1,4}\s+(.+)/.exec(line);
    if (!h || /[؀-ۿ]/u.test(line)) continue;
    const bad = (h[1]!.match(/[A-Za-z][\w'-]*/g) ?? []).filter(
      (w, i) => w[0] === w[0]!.toLowerCase() && (i === 0 || !SMALL_WORDS.has(w.toLowerCase())),
    );
    if (bad.length) signal("format.title_case", h[1]!, `English headings use Title Case (${bad.slice(0, 4).join(", ")}).`);
  }

  return rep.items;
}

/** A superlative is backed only by a verified figure or a record id in the same sentence. */
export function hasProof(sentence: string, verified: Set<string>): boolean {
  if (/\b(PRJ|CAP|EV)-\d+/.test(sentence)) return true;
  const NUMBER = /(?<![0-9A-Za-z.,٠-٩٬])[0-9٠-٩][0-9٠-٩,،٬.]*/gu;
  for (const m of sentence.matchAll(NUMBER)) {
    if (verified.has(normFigure(m[0].replace(/[.,،]+$/u, "")))) return true;
  }
  return false;
}

/** Projects named in a sentence (rulebook project_mentions), for misattribution checks. */
export function mentionedProjects(sentence: string, rules: BrandRules): Set<string> {
  const c = compileBrandRules(rules);
  const found = new Set<string>();
  for (const { id, re } of c.projects) {
    re.lastIndex = 0;
    if (re.test(sentence)) found.add(id);
    re.lastIndex = 0;
  }
  return found;
}

/** Spans the rulebook allows to carry numbers without a claim (record ids, phone, P.O. Box, Vision 2030, times, sizes). */
export function allowedNumberSpans(text: string, rules: BrandRules): Array<{ start: number; end: number }> {
  const c = compileBrandRules(rules);
  return [...text.matchAll(c.allow)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
}
