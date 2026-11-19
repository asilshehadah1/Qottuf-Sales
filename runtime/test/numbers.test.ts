import { describe, expect, it } from "vitest";
import { findNumericMentions, parseDigitToken } from "../src/gates/numbers.ts";

const one = (text: string) => {
  const m = findNumericMentions(text);
  expect(m, `mentions in: ${text}`).toHaveLength(1);
  return m[0]!;
};

describe("digit tokens", () => {
  it("parses thousands separators in both scripts", () => {
    expect(parseDigitToken("1,250,000").value).toBe(1_250_000);
    expect(parseDigitToken("16,000").value).toBe(16_000);
    expect(parseDigitToken("1٬250٬000").value).toBe(1_250_000);
    expect(parseDigitToken("1,250,000.50").value).toBe(1_250_000.5);
    expect(parseDigitToken("12٫5").value).toBe(12.5);
  });

  it("flags decimal-comma ambiguity instead of guessing (spec §7.1 step 3)", () => {
    expect(parseDigitToken("16.000")).toEqual({ value: null, ambiguous: "decimal_or_thousands" });
    expect(parseDigitToken("1,5").ambiguous).toBe("separator");
    expect(parseDigitToken("1.250.000").ambiguous).toBe("decimal_or_thousands");
  });
});

describe("the spec's golden cases (§13.4)", () => {
  it("«يمكننا التسليم خلال أسبوعين» is two weeks, written as a dual with no digit", () => {
    const m = one("يمكننا التسليم خلال أسبوعين");
    expect(m).toMatchObject({ value: 2, unit: "week", kind: "duration", source: "dual_ar", raw: "أسبوعين" });
  });

  it('"fourteen" is 14', () => {
    expect(one("We have delivered fourteen projects in Riyadh.")).toMatchObject({ value: 14, unit: "project" });
  });

  it('"24/7" is an availability claim', () => {
    expect(one("Support is available 24/7.")).toMatchObject({ kind: "availability", unit: "availability" });
  });

  it('"14-storey" is 14 floors', () => {
    expect(one("A 14-storey tower.")).toMatchObject({ value: 14, unit: "floor", kind: "count" });
  });

  it('a correct "SAR 1,250,000" is read exactly', () => {
    expect(one("Contract value SAR 1,250,000.")).toMatchObject({ value: 1_250_000, unit: "sar", kind: "money" });
  });
});

describe("Arabic", () => {
  it("reads Arabic-Indic digits with units", () => {
    expect(one("مبنى من ١٣ طابقاً")).toMatchObject({ value: 13, unit: "floor", raw: "١٣" });
    expect(one("بمساحة ٢٩٬٠٠٠ متر مربع")).toMatchObject({ value: 29_000, unit: "sqm" });
    expect(one("ضمان لمدة ٥ سنوات")).toMatchObject({ value: 5, unit: "year", kind: "duration" });
  });

  it("reads Arabic number words, teens and compounds", () => {
    expect(one("ثلاثة عشر طابقاً")).toMatchObject({ value: 13, unit: "floor", source: "words_ar" });
    expect(one("خمسة وعشرون مصعداً")).toMatchObject({ value: 25, unit: "elevator" });
    expect(one("واحد وعشرون يوماً")).toMatchObject({ value: 21, unit: "day" });
    expect(one("ثلاثة آلاف متر مربع")).toMatchObject({ value: 3000, unit: "sqm" });
    expect(one("ألفان وأربعمئة مقعد")).toMatchObject({ value: 2400, unit: "seat" });
  });

  it("reads other duals", () => {
    expect(one("نلتزم بالرد خلال يومين")).toMatchObject({ value: 2, unit: "day" });
    expect(one("ركّبنا مصعدين")).toMatchObject({ value: 2, unit: "elevator" });
    expect(one("مبنى من طابقين")).toMatchObject({ value: 2, unit: "floor" });
  });

  it("does not read Monday as two", () => {
    expect(findNumericMentions("الاجتماع يوم الاثنين القادم")).toHaveLength(0);
  });

  it("does not treat the m² unit as a number", () => {
    expect(one("٤٠٠ م٢")).toMatchObject({ value: 400, unit: "sqm" });
  });
});

describe("English", () => {
  it("reads compounds and multipliers", () => {
    expect(one("two hundred and fifty seats")).toMatchObject({ value: 250, unit: "seat" });
    expect(one("twenty-four hours")).toMatchObject({ value: 24, unit: "hour", kind: "duration" });
    expect(one("a contract of SAR 45 million")).toMatchObject({ value: 45_000_000, unit: "sar" });
    expect(one("16 internal copper mashrabiyas")).toMatchObject({ value: 16, unit: "mashrabiya" });
    expect(one("a 5-year warranty")).toMatchObject({ value: 5, unit: "year" });
  });

  it("ignores 'one' used as a pronoun but keeps 'one year'", () => {
    expect(findNumericMentions("One of our projects, a one-stop approach.")).toHaveLength(0);
    expect(one("a one year warranty")).toMatchObject({ value: 1, unit: "year" });
  });

  it("drops the article in 'a ten-minute call'", () => {
    expect(one("a ten-minute call")).toMatchObject({ value: 10, unit: "minute", raw: "ten" });
  });

  it("reads ranges, percentages and dates", () => {
    expect(one("10-12 weeks")).toMatchObject({ value: 10, valueMax: 12, unit: "week" });
    expect(one("95% of milestones")).toMatchObject({ value: 95, unit: "percent", kind: "percent" });
    expect(one("Completed in March 2019.")).toMatchObject({ kind: "date", date: "2019-03" });
    expect(one("Signed on 2026-11-19.")).toMatchObject({ kind: "date", date: "2026-11-19" });
    expect(one("١٧ ديسمبر ٢٠٢٦")).toMatchObject({ kind: "date", date: "2026-12-17" });
  });

  it("keeps offsets on the original text", () => {
    const text = "مبنى من ١٣ طابقاً و٦ مصاعد";
    for (const m of findNumericMentions(text)) {
      expect(text.slice(m.start, m.end)).toBe(m.raw);
    }
  });
});
