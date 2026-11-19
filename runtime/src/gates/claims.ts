// The claims gate (spec §7.1, merged roster #7 Fact and Evidence Verifier, code part).
// Every quantity found by the normaliser must match an approved figure: the rulebook's verified figures
// (public tier) or a fact on an approved, unexpired evidence record the artifact may use. A figure must also
// sit next to the right project: a number from one project attached to another fails as misattributed.
// When the author declared its own claims list, the two lists must agree exactly (§7.1 step 5).

import type { BrandRules } from "./brand.ts";
import { allowedNumberSpans, mentionedProjects } from "./brand.ts";
import type { Finding } from "./findings.ts";
import { COMMITMENT_WORDS, findNumericMentions, PROMISABLE_KINDS, unitOfWord, type NumericMention, type Unit } from "./numbers.ts";
import { pyRegex } from "./regex.ts";
import { sentenceAt, splitSentences } from "./text.ts";

export interface ApprovedFigure {
  value: number | null;
  unit?: Unit | null;
  /** Python-style regex (the rulebook's format); must match within 40 characters of the number. */
  context?: string;
  /**
   * Units the context words name ("bed" → bed). A mention with one of these units is in context even when the
   * context words are English only and the text is Arabic («١٠٠ سرير»).
   */
  contextUnits?: Unit[];
  /** For date facts: YYYY, YYYY-MM or YYYY-MM-DD. */
  date?: string;
  label: string;
  /** Where it comes from: a rulebook id (PRJ-003, CAP-003) or an evidence fact (EV-0007#f2). */
  sourceId: string;
  projectRef?: string | null;
}

export interface DeclaredClaim {
  value: number;
  unit?: string | null;
  sourceId?: string;
}

export interface VerifiedClaim {
  raw: string;
  value: number | null;
  unit: Unit | null;
  kind: NumericMention["kind"];
  sourceId: string;
  label: string;
  start: number;
  end: number;
}

export interface ClaimsOptions {
  figures: ApprovedFigure[];
  rules: BrandRules;
  /** Client and public material: the unit or context must match too. Internal material may match on value alone. */
  strict: boolean;
  declared?: DeclaredClaim[];
}

export function rulebookFigures(rules: BrandRules): ApprovedFigure[] {
  return rules.verified_figures.map((f) => {
    const contextUnits = f.context
      ? [...new Set(f.context.split("|").map((w) => unitOfWord(w.replace(/\\.|[()?*+[\]]/g, ""))).filter((u): u is Unit => u !== null))]
      : [];
    return {
      value: Number(f.value),
      ...(f.context ? { context: f.context } : {}),
      ...(contextUnits.length ? { contextUnits } : {}),
      label: f.label,
      sourceId: f.id,
      projectRef: f.id.startsWith("PRJ-") ? f.id : null,
    };
  });
}

function datesAgree(mention: string, figure: string): boolean {
  return mention.startsWith(figure) || figure.startsWith(mention);
}

function unitsCompatible(a: Unit | null | undefined, b: Unit | null | undefined): boolean {
  return !a || !b || a === b;
}

export function checkClaims(text: string, options: ClaimsOptions): { findings: Finding[]; verified: VerifiedClaim[] } {
  const findings: Finding[] = [];
  const verified: VerifiedClaim[] = [];
  const sentences = splitSentences(text);
  const allowed = allowedNumberSpans(text, options.rules);
  const mentions = findNumericMentions(text).filter(
    (m) => !allowed.some((a) => m.start >= a.start && m.start < a.end),
  );
  const contextCache = new Map<string, RegExp>();
  const contextRe = (src: string) => {
    let re = contextCache.get(src);
    if (!re) {
      re = pyRegex(src, "i");
      contextCache.set(src, re);
    }
    re.lastIndex = 0;
    return re;
  };

  const fail = (rule: string, m: NumericMention, why: string, fix?: string) => {
    const sent = sentenceAt(sentences, m.start);
    findings.push({
      gate: "claims",
      severity: "fail",
      rule,
      quote: `${m.raw} | ${sent?.text ?? ""}`,
      why,
      ...(fix ? { fix } : {}),
      start: m.start,
      end: m.end,
    });
  };

  for (const m of mentions) {
    const sent = sentenceAt(sentences, m.start);
    const sentence = sent?.text ?? text.slice(Math.max(0, m.start - 80), m.end + 80);
    const commitment = m.kind === "availability" || (PROMISABLE_KINDS.has(m.kind) && COMMITMENT_WORDS.test(sentence));

    if (m.ambiguous) {
      fail("claims.ambiguous_number", m, `'${m.raw}' can be read two ways (${m.ambiguous}). Write it unambiguously, e.g. 16,000.`);
      continue;
    }
    if (m.valueMax !== undefined) {
      fail(commitment ? "claims.unapproved_commitment" : "claims.unverified_range", m,
        `'${m.raw}' is a range; no approved record carries it.`, "Use the exact figure from the record, or cut it.");
      continue;
    }

    let candidates: ApprovedFigure[];
    if (m.kind === "date" || m.kind === "year") {
      const mDate = m.date ?? String(m.value);
      candidates = options.figures.filter(
        (f) => (f.date && datesAgree(mDate, f.date)) || (m.kind === "year" && f.value === m.value && !f.unit),
      );
    } else {
      candidates = options.figures.filter((f) => f.value !== null && f.value === m.value);
    }

    const window = text.slice(Math.max(0, m.start - 40), m.end + 40);
    const inContext = candidates.filter((f) => {
      if (!unitsCompatible(m.unit, f.unit)) return false;
      if (f.context) return contextRe(f.context).test(window) || Boolean(m.unit && f.contextUnits?.includes(m.unit));
      if (f.unit) return f.unit === m.unit;
      return true;
    });
    const named = mentionedProjects(sentence, options.rules);
    const inNamed = (pool: ApprovedFigure[]) => pool.filter((f) => f.projectRef && named.has(f.projectRef));
    const pools = options.strict
      ? [inNamed(inContext), inContext]
      : [inNamed(inContext), inContext, inNamed(candidates), candidates];
    const match = pools.find((p) => p.length > 0)?.[0];

    if (!match) {
      const label = m.kind === "date" || m.kind === "year" ? "date" : "figure";
      if (commitment || m.kind === "availability") {
        fail("claims.unapproved_commitment", m,
          `'${m.raw}' reads as a promise (a time, a warranty, availability) and no approved record carries it.`,
          "Commitments come only from an approved technical response or estimate (gate S-G2). Cut it.");
      } else {
        fail("claims.unverified_number", m,
          `'${m.raw}' doesn't match any approved ${label}${options.strict ? " in this context" : ""}. Unsourced claims are stripped, not softened.`,
          "Use a figure from the evidence store, or cut the number.");
      }
      continue;
    }
    if (match.projectRef && named.size > 0 && !named.has(match.projectRef)) {
      fail("claims.misattributed_figure", m,
        `'${m.raw}' is a ${match.projectRef} figure (${match.label}), but this sentence names ${[...named].sort().join(", ")}.`,
        "Attach each figure to its own project.");
      continue;
    }
    if (!options.strict && !inContext.includes(match)) {
      findings.push({
        gate: "claims", severity: "signal", rule: "claims.value_only_match", quote: `${m.raw} | ${sentence}`,
        why: `'${m.raw}' matches ${match.sourceId} (${match.label}) by value only; check it means the same thing.`,
        start: m.start, end: m.end,
      });
    }
    verified.push({ raw: m.raw, value: m.value, unit: m.unit, kind: m.kind, sourceId: match.sourceId, label: match.label, start: m.start, end: m.end });
  }

  if (options.declared) {
    // The declared list covers figures; dates are checked against dated records above.
    const isFigure = (kind: NumericMention["kind"]) => kind !== "date" && kind !== "year";
    const found = verified.filter((v) => isFigure(v.kind)).map((v) => ({ value: v.value, unit: v.unit, start: v.start, end: v.end, raw: v.raw }));
    for (const f of findings) {
      const m = mentions.find((x) => x.start === f.start);
      if (m && m.value !== null && isFigure(m.kind)) found.push({ value: m.value, unit: m.unit, start: m.start, end: m.end, raw: m.raw });
    }
    for (const x of found) {
      const declared = options.declared.some((d) => d.value === x.value && unitsCompatible(d.unit as Unit | null, x.unit));
      if (!declared) {
        findings.push({
          gate: "claims", severity: "fail", rule: "claims.undeclared", quote: x.raw,
          why: `'${x.raw}' is in the text but not in the author's declared claims: the author's list must match what was written.`,
          start: x.start, end: x.end,
        });
      }
    }
    for (const d of options.declared) {
      const present = found.some((x) => x.value === d.value && unitsCompatible(d.unit as Unit | null, x.unit));
      if (!present) {
        findings.push({
          gate: "claims", severity: "fail", rule: "claims.declared_not_found", quote: `${d.value}${d.unit ? " " + d.unit : ""}`,
          why: "The author declared this claim but it isn't in the text: the declared list and the text disagree.",
        });
      }
    }
  }

  return { findings, verified };
}
