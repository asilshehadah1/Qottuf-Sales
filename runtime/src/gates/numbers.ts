// The bilingual number normaliser (spec §7.1 step 3).
//
// It finds every quantity in a text, however it is written, and reports its exact span, value and unit:
//   digits (Western, Arabic-Indic, Persian), thousands and decimal separators in both scripts,
//   English and Arabic number words (including compounds), Arabic duals such as «أسبوعين» (two weeks),
//   hyphenated compounds ("14-storey", "5-year"), ranges, percentages, "24/7", multipliers ("45 million"), and dates.
// A decimal-comma ambiguity ("16.000", "1,5") is flagged, never guessed.
// The claims gate then checks every mention against approved records; anything it can't match fails.

export type Unit =
  | "sqm" | "floor" | "elevator" | "bed" | "seat" | "building" | "branch" | "guest" | "project"
  | "day" | "week" | "month" | "year" | "hour" | "minute" | "sar" | "percent" | "mashrabiya" | "people"
  | "sector" | "service_line" | "pool" | "power" | "unit" | "availability";

export type MentionKind = "count" | "duration" | "area" | "money" | "percent" | "year" | "date" | "availability";

export interface NumericMention {
  raw: string;
  start: number;
  end: number;
  value: number | null;
  valueMax?: number;
  unit: Unit | null;
  kind: MentionKind;
  source: "digits" | "words_en" | "words_ar" | "dual_ar" | "pattern";
  ambiguous?: string;
  /** For dates: ISO-like text (YYYY, YYYY-MM or YYYY-MM-DD). */
  date?: string;
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

/** Map Arabic-Indic and Persian digits to ASCII. Every digit is one UTF-16 unit both ways, so offsets don't move. */
export function asciiDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC_INDIC.indexOf(d);
    return String(i >= 0 ? i : PERSIAN.indexOf(d));
  });
}

export interface ParsedNumber {
  value: number | null;
  ambiguous?: string;
}

/** Parse a digit token (ASCII digits plus , ٬ ، . ٫). Returns value null and a reason when the separators are ambiguous. */
export function parseDigitToken(token: string): ParsedNumber {
  if (token.includes("٫")) {
    const [intPart, frac] = token.split("٫");
    const i = intPart!.replace(/[,٬،]/g, "");
    if (!/^\d+$/.test(i) || !/^\d+$/.test(frac ?? "")) return { value: null, ambiguous: "malformed" };
    return { value: Number(`${i}.${frac}`) };
  }
  const groups = token.split(/[,٬،]/);
  if (groups.length > 1) {
    const last = groups[groups.length - 1]!;
    const [lastInt, lastFrac, extra] = last.split(".");
    const ok =
      extra === undefined &&
      /^\d{1,3}$/.test(groups[0]!) &&
      groups.slice(1, -1).every((g) => /^\d{3}$/.test(g)) &&
      /^\d{3}$/.test(lastInt ?? "");
    if (!ok) return { value: null, ambiguous: "separator" };
    const intDigits = [...groups.slice(0, -1), lastInt].join("");
    return { value: Number(lastFrac ? `${intDigits}.${lastFrac}` : intDigits) };
  }
  const dots = token.split(".");
  if (dots.length === 1) return { value: Number(token) };
  if (dots.length === 2) {
    if (/^\d{3}$/.test(dots[1]!)) return { value: null, ambiguous: "decimal_or_thousands" };
    return { value: Number(token) };
  }
  return { value: null, ambiguous: "decimal_or_thousands" };
}

// ------------------------------------------------------------------ unit lexicons

const EN_UNITS: Array<[RegExp, Unit]> = [
  [/^(?:square\s+met(?:er|re)s?|sq\.?\s?m\b|sqm\b|m²|m2\b)/i, "sqm"],
  [/^(?:stor(?:e)?ys?|stories|floors?|levels?)\b/i, "floor"],
  [/^(?:elevators?|lifts?)\b/i, "elevator"],
  [/^beds?\b/i, "bed"],
  [/^seats?\b/i, "seat"],
  [/^buildings?\b/i, "building"],
  [/^branch(?:es)?\b/i, "branch"],
  [/^(?:guests?|covers?)\b/i, "guest"],
  [/^projects?\b/i, "project"],
  [/^days?\b/i, "day"],
  [/^weeks?\b/i, "week"],
  [/^months?\b/i, "month"],
  [/^(?:years?|yrs?)\b/i, "year"],
  [/^(?:hours?|hrs?)\b/i, "hour"],
  [/^(?:minutes?|mins?)\b/i, "minute"],
  [/^(?:sar|sr|saudi\s+riyals?|riyals?)\b/i, "sar"],
  [/^(?:percent|per\s?cent|%)/i, "percent"],
  [/^mashrabiy+as?\b/i, "mashrabiya"],
  [/^(?:people|employees|staff|engineers|workers|technicians)\b/i, "people"],
  [/^sectors?\b/i, "sector"],
  [/^(?:service\s+lines?|services)\b/i, "service_line"],
  [/^pools?\b/i, "pool"],
  [/^(?:kva|kw|mw)\b/i, "power"],
  [/^units?\b/i, "unit"],
];

const AR_PREFIX = "(?:[وفبلك])?(?:ال)?";
const AR_UNITS: Array<[RegExp, Unit]> = [
  [new RegExp(`^${AR_PREFIX}(?:متر|أمتار|امتار)\\s+(?:ال)?مربع[ةاً]*|^م\\s?[٢2²](?![\\p{L}])`, "u"), "sqm"],
  [new RegExp(`^${AR_PREFIX}(?:طابق|طوابق|أدوار|ادوار|دور)`, "u"), "floor"],
  [new RegExp(`^${AR_PREFIX}(?:مصعد|مصاعد)`, "u"), "elevator"],
  [new RegExp(`^${AR_PREFIX}(?:سرير|أسرّة|أسرة|اسرة)`, "u"), "bed"],
  [new RegExp(`^${AR_PREFIX}(?:مقعد|مقاعد)`, "u"), "seat"],
  [new RegExp(`^${AR_PREFIX}(?:مبنى|مباني|مبانٍ|مبان)`, "u"), "building"],
  [new RegExp(`^${AR_PREFIX}(?:فرع|فروع)`, "u"), "branch"],
  [new RegExp(`^${AR_PREFIX}(?:ضيف|ضيوف)`, "u"), "guest"],
  [new RegExp(`^${AR_PREFIX}(?:مشروع|مشاريع|مشروعات)`, "u"), "project"],
  [new RegExp(`^${AR_PREFIX}(?:يوم|أيام|ايام)`, "u"), "day"],
  [new RegExp(`^${AR_PREFIX}(?:أسبوع|أسابيع|اسبوع|اسابيع)`, "u"), "week"],
  [new RegExp(`^${AR_PREFIX}(?:شهر|أشهر|اشهر|شهور)`, "u"), "month"],
  [new RegExp(`^${AR_PREFIX}(?:سنة|سنوات|عام|أعوام|اعوام)`, "u"), "year"],
  [new RegExp(`^${AR_PREFIX}(?:ساعة|ساعات)`, "u"), "hour"],
  [/^(?:ريال|ر\.?\s?س\.?|﷼)/u, "sar"],
  [/^(?:بالمئة|بالمائة|في\s+المئة|في\s+المائة|٪|%)/u, "percent"],
  [new RegExp(`^${AR_PREFIX}(?:مشربية|مشربيات)`, "u"), "mashrabiya"],
  [new RegExp(`^${AR_PREFIX}(?:موظف|مهندس|عامل|عمال|فني)`, "u"), "people"],
  [new RegExp(`^${AR_PREFIX}(?:قطاع|قطاعات)`, "u"), "sector"],
  [new RegExp(`^${AR_PREFIX}(?:مسبح|مسابح)`, "u"), "pool"],
];

const AR_DUALS: Array<[string, Unit]> = [
  ["(?:أسبوع|اسبوع)(?:ين|ان)", "week"],
  ["يوم(?:ين|ان)", "day"],
  ["شهر(?:ين|ان)", "month"],
  ["(?:سنت|عام)(?:ين|ان)", "year"],
  ["ساعت(?:ين|ان)", "hour"],
  ["(?:طابق|دور)(?:ين|ان)", "floor"],
  ["مصعد(?:ين|ان)", "elevator"],
  ["مبني(?:ين|ان)", "building"],
  ["فرع(?:ين|ان)", "branch"],
  ["مشروع(?:ين|ان)", "project"],
  ["مسبح(?:ين|ان)", "pool"],
];

const NOT_LETTER_BEFORE = "(?<![\\p{L}\\p{M}])";
const NOT_LETTER_AFTER = "(?![\\p{L}\\p{M}])";

// ------------------------------------------------------------------ number words

const EN_SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  dozen: 12,
};
const EN_SCALE: Record<string, number> = { hundred: 100, thousand: 1_000, million: 1_000_000, billion: 1_000_000_000 };
const EN_WORD = `(?:${[...Object.keys(EN_SMALL), ...Object.keys(EN_SCALE)].join("|")})`;
const EN_WORDS_RE = new RegExp(`\\b(?:a\\s+)?${EN_WORD}(?:(?:\\s+and\\s+|[\\s-]+)${EN_WORD})*\\b`, "gi");

function parseEnglishWords(phrase: string): number | null {
  const words = phrase.toLowerCase().replace(/^a\s+/, "one ").split(/[\s-]+/).filter((w) => w && w !== "and");
  let total = 0;
  let current = 0;
  for (const w of words) {
    if (w === "dozen") {
      current = (current || 1) * 12;
    } else if (w in EN_SMALL) {
      current += EN_SMALL[w]!;
    } else if (w === "hundred") {
      current = (current || 1) * 100;
    } else if (w in EN_SCALE) {
      total += (current || 1) * EN_SCALE[w]!;
      current = 0;
    } else {
      return null;
    }
  }
  return total + current;
}

// Arabic number words: units (masculine and feminine forms), tens, hundreds, scales.
const AR_UNITS_WORDS: Array<[string, number]> = [
  ["واحدة|واحد", 1],
  ["اثنتان|اثنتين|اثنان|اثنين", 2],
  ["ثلاثة|ثلاث", 3],
  ["أربعة|اربعة|أربع|اربع", 4],
  ["خمسة|خمس", 5],
  ["ستة|ست", 6],
  ["سبعة|سبع", 7],
  ["ثمانية|ثماني|ثمان", 8],
  ["تسعة|تسع", 9],
  ["عشرة|عشر", 10],
];
const AR_TENS: Array<[string, number]> = [
  ["عشرون|عشرين", 20],
  ["ثلاثون|ثلاثين", 30],
  ["أربعون|أربعين|اربعون|اربعين", 40],
  ["خمسون|خمسين", 50],
  ["ستون|ستين", 60],
  ["سبعون|سبعين", 70],
  ["ثمانون|ثمانين", 80],
  ["تسعون|تسعين", 90],
];
const AR_HUNDREDS: Array<[string, number]> = [
  ["مئتان|مئتين|مائتان|مائتين", 200],
  ["ثلاثمئة|ثلاثمائة", 300],
  ["أربعمئة|أربعمائة|اربعمئة|اربعمائة", 400],
  ["خمسمئة|خمسمائة", 500],
  ["ستمئة|ستمائة", 600],
  ["سبعمئة|سبعمائة", 700],
  ["ثمانمئة|ثمانمائة|ثمانيمئة", 800],
  ["تسعمئة|تسعمائة", 900],
  ["مئة|مائة", 100],
];
const AR_SCALES: Array<[string, number]> = [
  ["ألفان|ألفين|الفان|الفين", 2000],
  ["آلاف|الاف|ألف|الف", 1000],
  ["مليونان|مليونين", 2_000_000],
  ["ملايين|مليون", 1_000_000],
  ["مليار|مليارات", 1_000_000_000],
];
const AR_TEENS = "(?:أحد|احد|إحدى|احدى|اثنا|اثني|اثنتا|اثنتي|ثلاثة|ثلاث|أربعة|اربعة|أربع|اربع|خمسة|خمس|ستة|ست|سبعة|سبع|ثمانية|ثماني|ثمان|تسعة|تسع)\\s+(?:عشر|عشرة)";

const AR_ANY_WORD = [
  AR_TEENS,
  ...AR_HUNDREDS.map(([w]) => w),
  ...AR_TENS.map(([w]) => w),
  ...AR_SCALES.map(([w]) => w),
  ...AR_UNITS_WORDS.map(([w]) => w),
].join("|");
const AR_WORDS_RE = new RegExp(
  `${NOT_LETTER_BEFORE}(?:[وبلفك])?(?:ال)?(?:${AR_ANY_WORD})(?:\\s+و?(?:${AR_ANY_WORD}))*${NOT_LETTER_AFTER}`,
  "gu",
);

function lookupArabicWord(w: string): number | null {
  if (new RegExp(`^${AR_TEENS}$`, "u").test(w)) {
    const unit = w.split(/\s+/)[0]!;
    if (/^(?:أحد|احد|إحدى|احدى)$/u.test(unit)) return 11;
    if (/^(?:اثنا|اثني|اثنتا|اثنتي)$/u.test(unit)) return 12;
    const u = AR_UNITS_WORDS.find(([forms]) => new RegExp(`^(?:${forms})$`, "u").test(unit));
    return u ? 10 + u[1] : null;
  }
  for (const table of [AR_HUNDREDS, AR_TENS, AR_SCALES, AR_UNITS_WORDS]) {
    for (const [forms, value] of table) {
      if (new RegExp(`^(?:${forms})$`, "u").test(w)) return value;
    }
  }
  return null;
}

function arabicWordValue(word: string): number | null {
  // Try the word as written first: «واحد» starts with و, which is also the conjunction prefix.
  const candidates = [word, word.replace(/^(?:ال)/u, ""), word.replace(/^[وبلفك]/u, ""), word.replace(/^[وبلفك]?(?:ال)/u, "")];
  for (const c of candidates) {
    const v = lookupArabicWord(c);
    if (v !== null) return v;
  }
  return null;
}

function parseArabicWords(phrase: string): number | null {
  // Split on spaces, but keep teens ("ثلاثة عشر") together.
  const parts: string[] = [];
  const tokens = phrase.trim().split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!.replace(/^و(?=\S)/u, (m) => (i === 0 ? m : ""));
    const next = tokens[i + 1];
    if (next && /^(?:عشر|عشرة)$/u.test(next) && new RegExp(`^(?:[وبلفك])?(?:ال)?${AR_TEENS.split("\\s+")[0]}$`, "u").test(t)) {
      parts.push(`${t} ${next}`);
      i++;
    } else {
      parts.push(t);
    }
  }
  let total = 0;
  let current = 0;
  for (const p of parts) {
    const v = arabicWordValue(p);
    if (v === null) return null;
    if (v === 2000 || v === 2_000_000) {
      // The duals «ألفان» and «مليونان» stand alone: 2,000 and 2,000,000.
      total += current + v;
      current = 0;
    } else if (v === 1000 || v === 1_000_000 || v === 1_000_000_000) {
      // «ثلاثة آلاف» = 3 × 1,000; «ألف» alone = 1,000.
      total += (current || 1) * v;
      current = 0;
    } else {
      current += v;
    }
  }
  return total + current;
}

// ------------------------------------------------------------------ the scanner

const EN_MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
const AR_MONTHS = "يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر";
const MONTH_INDEX: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7,
  jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12, يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, ابريل: 4, مايو: 5, يونيو: 6, يوليو: 7, أغسطس: 8,
  اغسطس: 8, سبتمبر: 9, أكتوبر: 10, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function detectUnit(after: string, before: string): Unit | null {
  // Currency is often written before the number: "SAR 1,250,000", "ر.س ١٬٢٥٠٬٠٠٠".
  if (/(?:\bSAR|\bSR|ر\.?\s?س\.?|﷼)\s*$/iu.test(before)) return "sar";
  const s = after.replace(/^[\s\-–]+/u, "");
  // Look at the first three words after the number: "16 internal copper mashrabiyas", "6 passenger lifts".
  let rest = s;
  for (let i = 0; i < 3; i++) {
    for (const [re, unit] of [...EN_UNITS, ...AR_UNITS]) {
      if (re.test(rest)) return unit;
    }
    const skip = /^[\p{L}\p{M}'’]+[\s\-–]+/u.exec(rest);
    if (!skip) break;
    rest = rest.slice(skip[0].length);
  }
  return null;
}

function kindFor(unit: Unit | null, value: number | null, raw: string): MentionKind {
  switch (unit) {
    case "day":
    case "week":
    case "month":
    case "year":
    case "hour":
    case "minute":
      return "duration";
    case "sqm":
      return "area";
    case "sar":
      return "money";
    case "percent":
      return "percent";
    case "availability":
      return "availability";
    default:
      if (unit === null && value !== null && /^\d{4}$/.test(raw.trim()) && value >= 1950 && value <= 2100) return "year";
      return "count";
  }
}

interface Span {
  start: number;
  end: number;
}

function overlaps(spans: Span[], start: number, end: number): boolean {
  return spans.some((s) => start < s.end && s.start < end);
}

/** Find every quantity in text. Offsets refer to the original text. */
export function findNumericMentions(text: string): NumericMention[] {
  const t = asciiDigits(text);
  const taken: Span[] = [];
  const out: NumericMention[] = [];
  const add = (m: NumericMention) => {
    if (overlaps(taken, m.start, m.end)) return;
    taken.push({ start: m.start, end: m.end });
    out.push(m);
  };

  // 1. Dates.
  for (const m of t.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    add({ raw: text.slice(m.index, m.index + m[0].length), start: m.index, end: m.index + m[0].length, value: Number(m[1]),
      unit: null, kind: "date", source: "pattern", date: `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}` });
  }
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
    add({ raw: text.slice(m.index, m.index + m[0].length), start: m.index, end: m.index + m[0].length, value: Number(m[3]),
      unit: null, kind: "date", source: "pattern", date: `${m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}` });
  }
  const dayMonthYear = new RegExp(`(?<!\\d)(\\d{1,2})\\s+(${EN_MONTHS}|${AR_MONTHS})\\s*,?\\s+(\\d{4})(?!\\d)`, "giu");
  for (const m of t.matchAll(dayMonthYear)) {
    const month = MONTH_INDEX[m[2]!.toLowerCase()]!;
    add({ raw: text.slice(m.index, m.index + m[0].length), start: m.index, end: m.index + m[0].length, value: Number(m[3]),
      unit: null, kind: "date", source: "pattern", date: `${m[3]}-${pad2(month)}-${pad2(Number(m[1]))}` });
  }
  const monthDayYear = new RegExp(`\\b(${EN_MONTHS})\\s+(\\d{1,2}),?\\s+(\\d{4})(?!\\d)`, "gi");
  for (const m of t.matchAll(monthDayYear)) {
    const month = MONTH_INDEX[m[1]!.toLowerCase()]!;
    add({ raw: text.slice(m.index, m.index + m[0].length), start: m.index, end: m.index + m[0].length, value: Number(m[3]),
      unit: null, kind: "date", source: "pattern", date: `${m[3]}-${pad2(month)}-${pad2(Number(m[2]))}` });
  }
  const monthYear = new RegExp(`(?<![\\p{L}])(${EN_MONTHS}|${AR_MONTHS})\\s*,?\\s+(\\d{4})(?!\\d)`, "giu");
  for (const m of t.matchAll(monthYear)) {
    const month = MONTH_INDEX[m[1]!.toLowerCase()]!;
    add({ raw: text.slice(m.index, m.index + m[0].length), start: m.index, end: m.index + m[0].length, value: Number(m[2]),
      unit: null, kind: "date", source: "pattern", date: `${m[2]}-${pad2(month)}` });
  }

  // 2. Round-the-clock availability: 24/7, 24x7, 24×7.
  for (const m of t.matchAll(/(?<!\d)24\s*(?:\/|x|×)\s*7(?!\d)/gi)) {
    add({ raw: text.slice(m.index, m.index + m[0].length), start: m.index, end: m.index + m[0].length, value: 24,
      unit: "availability", kind: "availability", source: "pattern" });
  }

  // 3. Ranges: "10-12 weeks", "10 to 12", "من ١٠ إلى ١٢".
  const NUM = "\\d(?:\\d|[,٬،.٫](?=\\d))*";
  const rangeRe = new RegExp(`(?<![\\p{L}\\p{N}.,٬٫])(${NUM})\\s*(?:-|–|—|to|إلى|الى|حتى)\\s*(${NUM})(?![\\p{N}])`, "giu");
  for (const m of t.matchAll(rangeRe)) {
    // "14-storey" is not a range; a range needs a number on both sides.
    const a = parseDigitToken(m[1]!);
    const b = parseDigitToken(m[2]!);
    if (a.value === null || b.value === null || b.value <= a.value) continue;
    const end = m.index + m[0].length;
    const unit = detectUnit(t.slice(end, end + 40), t.slice(Math.max(0, m.index - 6), m.index));
    add({ raw: text.slice(m.index, end), start: m.index, end, value: a.value, valueMax: b.value, unit,
      kind: kindFor(unit, a.value, m[1]!), source: "digits" });
  }

  // 4. Digit tokens, with an optional multiplier word and percent sign.
  const digitRe = new RegExp(
    `(?<![\\p{L}\\p{N}_.,٬٫])(${NUM})(?:\\s*(million|billion|thousand|ألف|الف|مليون|مليار)(?![\\p{L}]))?\\s*([%٪])?`,
    "giu",
  );
  for (const m of t.matchAll(digitRe)) {
    const token = m[1]!;
    const parsed = parseDigitToken(token);
    let value = parsed.value;
    const multiplier = m[2]?.toLowerCase();
    if (value !== null && multiplier) {
      value *= multiplier === "million" || multiplier === "مليون" ? 1_000_000
        : multiplier === "billion" || multiplier === "مليار" ? 1_000_000_000 : 1_000;
    }
    const end = m.index + m[0].length;
    let unit: Unit | null = m[3] ? "percent" : detectUnit(t.slice(end, end + 48), t.slice(Math.max(0, m.index - 6), m.index));
    const raw = text.slice(m.index, end).trimEnd();
    const mention: NumericMention = { raw, start: m.index, end: m.index + raw.length, value, unit,
      kind: kindFor(unit, value, token), source: "digits" };
    if (parsed.ambiguous) mention.ambiguous = parsed.ambiguous;
    add(mention);
  }

  // 5. English number words ("fourteen", "two hundred and fifty", "twenty-four").
  for (const m of text.matchAll(EN_WORDS_RE)) {
    let phrase = m[0];
    let start = m.index;
    // "a" counts as one only before a scale word ("a hundred", "a dozen"); otherwise drop it ("a ten-minute call").
    const article = /^a\s+/i.exec(phrase);
    if (article && !/^a\s+(?:hundred|thousand|million|billion|dozen)\b/i.test(phrase)) {
      phrase = phrase.slice(article[0].length);
      start += article[0].length;
    }
    const value = parseEnglishWords(phrase);
    if (value === null) continue;
    const end = m.index + m[0].length;
    const unit = detectUnit(text.slice(end, end + 48), text.slice(Math.max(0, start - 6), start));
    // "one" on its own is usually a pronoun ("one of our", "no one"); count it only with a unit.
    if (value === 1 && unit === null) continue;
    if (/^one$/i.test(phrase) && /^[\s-]*(?:of|another|stop|to)\b/i.test(text.slice(end, end + 10))) continue;
    add({ raw: phrase, start, end, value, unit, kind: kindFor(unit, value, phrase), source: "words_en" });
  }

  // 6. Arabic duals: «أسبوعين» is two weeks even though no number is written.
  for (const [stem, unit] of AR_DUALS) {
    const re = new RegExp(`${NOT_LETTER_BEFORE}(?:[وبلفك])?(?:ال)?${stem}${NOT_LETTER_AFTER}`, "gu");
    for (const m of text.matchAll(re)) {
      add({ raw: m[0], start: m.index, end: m.index + m[0].length, value: 2, unit, kind: kindFor(unit, 2, m[0]),
        source: "dual_ar" });
    }
  }

  // 7. Arabic number words ("ثلاثة عشر طابقاً", "خمسة وعشرون").
  for (const m of text.matchAll(AR_WORDS_RE)) {
    // «الاثنين» is Monday, not two.
    if (/^[وبلفك]?ال[اإ]ثنين$/u.test(m[0])) continue;
    const value = parseArabicWords(m[0]);
    if (value === null) continue;
    const end = m.index + m[0].length;
    const unit = detectUnit(text.slice(end, end + 48), text.slice(Math.max(0, m.index - 6), m.index));
    if (value === 1 && unit === null) continue;
    add({ raw: m[0], start: m.index, end, value, unit, kind: kindFor(unit, value, m[0]), source: "words_ar" });
  }

  return out.sort((a, b) => a.start - b.start);
}

/** The commitment vocabulary (spec §7.2 SG-02): a duration or count near these words is a promise, not a fact. */
export const COMMITMENT_WORDS =
  /\b(?:deliver(?:y|ed|s)?|hand\s?over|complet(?:e|ion)|within|turnaround|respon(?:se|d)|guarantee[ds]?|warrant(?:y|ies)|commit(?:ment)?|lead\s?time|install(?:ation)?\s+in|on\s?site\s+in|available)\b|تسليم|نسلم|خلال|ضمان|نضمن|نلتزم|التزام|الرد|تركيب|تنفيذ|إنجاز|انجاز|متاح/iu;
