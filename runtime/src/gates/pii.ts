// The PII guard (spec §7.2 SG-04, merged roster #8). Personal data is replaced with placeholders before any
// text reaches a model. Known contacts become their pseudonymous id ([CNT-0007]); other people, phone numbers,
// emails, national ID and iqama numbers, IBANs, plot numbers and short addresses become numbered placeholders.
// Recall is measured on golden sets (test/pii.test.ts); what the patterns can't see (a bare name with no title
// and no registry entry) is a documented limit, not an assumption.

import { asciiDigits } from "./numbers.ts";

export type PiiKind = "email" | "phone" | "national_id" | "iban" | "plot" | "short_address" | "person";

export interface PiiHit {
  kind: PiiKind;
  start: number;
  end: number;
  value: string;
  /** For known contacts: their pseudonymous id. */
  contactId?: string;
}

export interface KnownPerson {
  contactId: string;
  names: string[];
}

export interface PiiOptions {
  people?: KnownPerson[];
  /** Digit strings that are public company contact details and stay (e.g. the main office number). */
  publicNumbers?: string[];
}

declare const redactedBrand: unique symbol;
/** Text that has passed through redact(). The model client accepts nothing else. */
export type RedactedText = string & { readonly [redactedBrand]: true };

/** Normalise Arabic for name matching: no diacritics or tatweel, one alef form, ta marbuta as ha. */
export function normaliseArabic(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/gu, "")
    .replace(/[إأآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ة/gu, "ه");
}

const PATTERNS: Array<{ kind: PiiKind; re: RegExp }> = [
  { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: "iban", re: /\bSA\d{2}(?:[\s-]?[0-9A-Z]){20}\b/g },
  // Saudi mobiles and landlines in local and international forms, plus toll-free and unified numbers.
  { kind: "phone", re: /(?<![\d+])(?:\+|00)?(?:966[\s-]?)?0?5\d(?:[\s-]?\d){7}(?!\d)/g },
  { kind: "phone", re: /(?<![\d+])(?:\+|00)?(?:966[\s-]?)?0?1[1-7](?:[\s-]?\d){7}(?!\d)/g },
  { kind: "phone", re: /(?<!\d)(?:800|9200)[\s-]?\d{3}[\s-]?\d{3,4}(?!\d)/g },
  { kind: "phone", re: /\+\d{1,3}[\s-]?\d(?:[\s-]?\d){6,12}(?!\d)/g },
  // National ID (starts with 1) and iqama (starts with 2): ten digits.
  { kind: "national_id", re: /(?<!\d)[12]\d{9}(?!\d)/g },
  { kind: "plot", re: /(?:\bplot|قطعة|قطعه)\s*(?:no\.?|number|رقم|#)?\s*\d+[A-Za-z]?/giu },
  { kind: "short_address", re: /\b[A-Z]{4}\d{4}\b/g },
];

const EN_TITLE = String.raw`(?:Eng\.?|Engr\.?|Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?|Sheikh|Shaikh|H\.?E\.?)`;
const EN_NAME_PART = String.raw`(?:(?:Al|al|El|el|Bin|bin|Bint|bint|Abu|abu)[\s-])?[A-Z][a-zA-Z'’-]+`;
const EN_TITLED = new RegExp(`\\b${EN_TITLE}\\s+(${EN_NAME_PART}(?:\\s+${EN_NAME_PART}){0,3})`, "g");
const AR_TITLE = "(?:المهندسة|المهندس|المهندسه|م\\.|د\\.|الدكتورة|الدكتور|الأستاذة|الأستاذ|الاستاذة|الاستاذ|أ\\.|الشيخ|سعادة|معالي)";
const AR_NAME_PART = "[\\p{L}\\p{M}]{2,}";
const AR_TITLED = new RegExp(
  `${AR_TITLE}\\s*((?:${AR_NAME_PART})(?:\\s+(?:بن|بنت|آل|ال)?\\s*${AR_NAME_PART}){0,3})`,
  "gu",
);
// Words that follow a title but are not names ("the engineer responsible for ...").
const AR_NOT_NAMES = /^(?:المسؤول|المسؤولة|المختص|المشرف|المقيم|المشروع|المعني|في|من|على|عن|مع)$/u;

export function scanPii(text: string, options: PiiOptions = {}): PiiHit[] {
  const t = asciiDigits(text);
  const hits: PiiHit[] = [];
  const publicNumbers = (options.publicNumbers ?? []).map((n) => n.replace(/\D/g, ""));
  const overlaps = (s: number, e: number) => hits.some((h) => s < h.end && h.start < e);

  // Known contacts first, so they keep their pseudonymous id.
  for (const person of options.people ?? []) {
    for (const name of person.names) {
      if (!name.trim()) continue;
      const isArabic = /[؀-ۿ]/u.test(name);
      const haystack = isArabic ? normaliseArabic(t) : t;
      const needle = isArabic ? normaliseArabic(name) : name;
      const re = new RegExp(`(?<![\\p{L}\\p{M}])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{M}])`, isArabic ? "gu" : "giu");
      // Arabic normalisation keeps string length except for removed diacritics, so map positions back.
      const map = isArabic ? positionMap(t) : null;
      for (const m of haystack.matchAll(re)) {
        const start = map ? map[m.index]! : m.index;
        const end = map ? map[m.index + m[0].length - 1]! + 1 : m.index + m[0].length;
        if (!overlaps(start, end)) hits.push({ kind: "person", start, end, value: text.slice(start, end), contactId: person.contactId });
      }
    }
  }

  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      if (kind === "phone" && publicNumbers.some((p) => p && m[0].replace(/\D/g, "").endsWith(p))) continue;
      hits.push({ kind, start, end, value: text.slice(start, end) });
    }
  }

  for (const re of [EN_TITLED, AR_TITLED]) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      const name = m[1]!;
      if (re === AR_TITLED && AR_NOT_NAMES.test(name.split(/\s+/)[0]!)) continue;
      const start = m.index + m[0].length - name.length;
      const end = m.index + m[0].length;
      if (overlaps(start, end)) continue;
      hits.push({ kind: "person", start, end, value: text.slice(start, end) });
    }
  }

  return hits.sort((a, b) => a.start - b.start);
}

/** For a string, map each index of its diacritic-free normalised form back to the original index. */
function positionMap(original: string): number[] {
  const map: number[] = [];
  for (let i = 0; i < original.length; i++) {
    if (/[ً-ٰٟـ]/u.test(original[i]!)) continue;
    map.push(i);
  }
  return map;
}

export interface RedactionResult {
  text: RedactedText;
  hits: PiiHit[];
  /** placeholder -> original value; kept in memory only, never sent and never logged. */
  vault: Map<string, string>;
}

export function redact(text: string, options: PiiOptions = {}): RedactionResult {
  const hits = scanPii(text, options);
  const vault = new Map<string, string>();
  const byValue = new Map<string, string>();
  const counters = new Map<PiiKind, number>();
  let out = "";
  let cursor = 0;
  for (const h of hits) {
    out += text.slice(cursor, h.start);
    let placeholder: string;
    if (h.contactId) {
      placeholder = `[${h.contactId}]`;
    } else {
      const key = `${h.kind}:${h.value.toLowerCase()}`;
      placeholder = byValue.get(key) ?? "";
      if (!placeholder) {
        const n = (counters.get(h.kind) ?? 0) + 1;
        counters.set(h.kind, n);
        placeholder = `[${h.kind.toUpperCase()}-${n}]`;
        byValue.set(key, placeholder);
      }
    }
    vault.set(placeholder, h.value);
    out += placeholder;
    cursor = h.end;
  }
  out += text.slice(cursor);
  return { text: out as RedactedText, hits, vault };
}

/** Last line of defence in the model client: refuse to send text in which the scanner still finds personal data. */
export function assertRedacted(text: string, options: PiiOptions = {}): asserts text is RedactedText {
  const left = scanPii(text, options);
  if (left.length > 0) {
    throw new Error(`Refusing to send text to a model: ${left.length} item(s) of personal data remain (${[...new Set(left.map((h) => h.kind))].join(", ")}).`);
  }
}

/** For trusted, fixed text (system prompts, schemas, ids) that carries no personal data by construction. */
export function trustedText(text: string): RedactedText {
  assertRedacted(text);
  return text as RedactedText;
}
