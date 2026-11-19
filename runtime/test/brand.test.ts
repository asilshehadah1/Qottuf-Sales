import { describe, expect, it } from "vitest";
import { brandCheck, compileBrandRules, loadBrandRules } from "../src/gates/brand.ts";
import { fixtureRules, realRulesPath } from "./helpers.ts";

const rules = await fixtureRules();
const rulesOf = (text: string) => brandCheck(text, rules).map((f) => `${f.severity}:${f.rule}`);

describe("brand gate (fixture rulebook)", () => {
  it("catches retired name variants and gives offsets into the text", () => {
    const text = "Last year Qottuf Al Jazeera handed over the site.";
    const f = brandCheck(text, rules).find((x) => x.rule === "naming.forbidden_variant")!;
    expect(f).toBeDefined();
    expect(text.slice(f.start!, f.end!)).toBe("Qottuf Al Jazeera");
  });

  it("applies Arabic rules: first person, ranking, ministry naming", () => {
    expect(rulesOf("أنا مسؤول عن هذا المشروع")).toContain("fail:tone.first_person_singular_ar");
    expect(rulesOf("شركة رائدة في المقاولات")).toContain("fail:red_flag.ar-raeda");
    expect(rulesOf("نفذنا مبنى لوزارة الداخلية")).toContain("fail:red_flag.ministry-ar");
    expect(rulesOf("اعتماد وزارة البلديات والإسكان")).toEqual([]);
  });

  it("lets a superlative stand only with a verified figure in the same sentence", () => {
    expect(rulesOf("A seamless handover.")).toContain("fail:red_flag.seamless");
    expect(rulesOf("A seamless handover of a 120-bed hospital.")).not.toContain("fail:red_flag.seamless");
  });

  it("bans exclamation marks, first person and emoji bullets", () => {
    expect(rulesOf("Ready to build!")).toContain("fail:tone.exclamation");
    expect(rulesOf("I think this works.")).toContain("fail:tone.first_person_singular");
    expect(rulesOf("🚀 Fast delivery")).toContain("fail:red_flag.emoji-bullet");
  });

  it("requires the legal name first in formal documents", () => {
    expect(brandCheck("Qottuf Aljazeera submits this tender.", rules, { formal: true }).map((f) => f.rule))
      .toContain("naming.legal_first_mention");
    expect(brandCheck("Qottuf Aljazeera Company L.L.C. submits this tender.", rules, { formal: true }).map((f) => f.rule))
      .not.toContain("naming.legal_first_mention");
  });

  it("passes clean copy in both languages", () => {
    expect(rulesOf("Qottuf Aljazeera fitted out a 120-bed hospital.")).toEqual([]);
    expect(rulesOf("نفّذت قطوف الجزيرة تشطيبات مستشفى من ١٢٠ سريراً.")).toEqual([]);
  });
});

const realPath = realRulesPath();
describe.skipIf(!realPath)("brand gate (the real rulebook, when installed)", async () => {
  const real = realPath ? await loadBrandRules(realPath) : rules;

  it("compiles every rule", () => {
    const c = compileBrandRules(real);
    expect(c.redFlags.length).toBe(real.red_flag_patterns.length);
  });

  it("flags the public claims the meeting found contradicted, and passes the approved credentials line", () => {
    const fails = (t: string) => brandCheck(t, real).filter((f) => f.severity === "fail").map((f) => f.rule);
    expect(fails("With 13+ Years of experience.")).toContain("red_flag.skill-years-fail");
    expect(fails("نفذنا مشروعاً لوزارة الداخلية")).toContain("red_flag.skill-ministry-ar");
    expect(fails("اعتماد وزارة البلديات والإسكان")).toEqual([]);
    expect(fails("Qottuf Jazeera builds.")).toContain("naming.forbidden_variant");
  });
});
