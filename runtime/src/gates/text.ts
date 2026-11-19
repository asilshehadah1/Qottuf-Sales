// Text helpers shared by the gates: language detection per line, sentence splitting in Arabic and English,
// and URL stripping. Sentences carry their offsets so a gate can remove exactly one failing sentence
// in one language (spec §7.1 step 6) without touching the rest.

const ARABIC_CHAR = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/gu;
const LATIN_WORD = /[A-Za-z]{2,}/g;

export type Lang = "ar" | "en";

export function isArabicLine(line: string): boolean {
  const ar = (line.match(ARABIC_CHAR) ?? []).length;
  const la = (line.match(LATIN_WORD) ?? []).reduce((n, w) => n + w.length, 0);
  return ar > la;
}

export function hasArabic(text: string): boolean {
  return /[؀-ۿ]/u.test(text);
}

export interface Sentence {
  text: string;
  start: number;
  end: number; // exclusive
  lang: Lang;
}

const ABBREVIATIONS = new Set([
  "eng", "dr", "mr", "mrs", "ms", "st", "no", "co", "ltd", "inc", "vs", "approx", "e.g", "i.e", "p.o", "l.l.c", "jr", "sr",
]);

/** Split text into sentences on . ? ! ؟ ۔ and line breaks, keeping offsets. Decimals and common abbreviations don't split. */
export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  let start = 0;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const trimmedStart = start + (raw.length - raw.trimStart().length);
    const trimmed = raw.trim();
    if (trimmed) {
      out.push({
        text: trimmed,
        start: trimmedStart,
        end: trimmedStart + trimmed.length,
        lang: isArabicLine(trimmed) ? "ar" : "en",
      });
    }
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\n") {
      push(i + 1);
      continue;
    }
    if (ch === "?" || ch === "!" || ch === "؟" || ch === "۔" || ch === "！") {
      push(i + 1);
      continue;
    }
    if (ch === ".") {
      const prev = text[i - 1] ?? "";
      const next = text[i + 1] ?? "";
      if (/\d/.test(prev) && /\d/.test(next)) continue; // 1.5
      if (next && !/\s/.test(next)) continue; // P.O.Box, file.pdf, L.L.C.
      const before = text.slice(Math.max(0, i - 8), i);
      const word = /([A-Za-z.]+)$/.exec(before)?.[1]?.toLowerCase() ?? "";
      if (ABBREVIATIONS.has(word) || ABBREVIATIONS.has(word.replace(/\.$/, ""))) continue;
      push(i + 1);
    }
  }
  push(text.length);
  return out;
}

/** The sentence containing offset idx (the brand checker reports findings by sentence). */
export function sentenceAt(sentences: Sentence[], idx: number): Sentence | undefined {
  return sentences.find((s) => idx >= s.start && idx < s.end) ?? sentences.find((s) => idx === s.end);
}

/** Replace URLs and email addresses with spaces of the same length, so offsets stay valid. */
export function blankUrls(text: string): string {
  return text.replace(/https?:\/\/\S+|www\.\S+|\S+@\S+|\b[\w-]+\.(?:com|sa|net)\b/giu, (m) => " ".repeat(m.length));
}

/** Remove the given sentences (by offsets) from text. Used when a gate fails individual sentences. */
export function removeSentences(text: string, remove: Array<{ start: number; end: number }>): string {
  const sorted = [...remove].sort((a, b) => b.start - a.start);
  let out = text;
  for (const r of sorted) {
    out = out.slice(0, r.start) + out.slice(r.end);
  }
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
