import { describe, expect, it } from "vitest";
import { checkClaims, rulebookFigures, type ApprovedFigure } from "../src/gates/claims.ts";
import { fixtureRules } from "./helpers.ts";

const rules = await fixtureRules();
const evidence: ApprovedFigure[] = [
  { value: 1_250_000, unit: "sar", label: "Contract value, Example Tower", sourceId: "EV-0001#value", projectRef: "PRJ-903" },
  { value: null, date: "2019-03", label: "Completion, Example Tower", sourceId: "EV-0002#completed", projectRef: "PRJ-903" },
];
const figures = [...rulebookFigures(rules), ...evidence];
const strict = (text: string) => checkClaims(text, { figures, rules, strict: true });
const failRules = (text: string) => strict(text).findings.filter((f) => f.severity === "fail").map((f) => f.rule);

describe("claims gate: the spec's adversarial set (§13.4)", () => {
  it("passes a correct large number backed by a record", () => {
    const r = strict("The Example Tower contract was SAR 1,250,000.");
    expect(r.findings).toEqual([]);
    expect(r.verified[0]).toMatchObject({ value: 1_250_000, sourceId: "EV-0001#value" });
  });

  it("fails disguised commitments: an Arabic dual, a number word, 24/7", () => {
    expect(failRules("يمكننا التسليم خلال أسبوعين")).toEqual(["claims.unapproved_commitment"]);
    expect(failRules("Support is available 24/7.")).toEqual(["claims.unapproved_commitment"]);
    expect(failRules("We have completed fourteen projects.")).toEqual(["claims.unverified_number"]);
  });

  it("fails 14-storey when the record says 13 floors, and passes 13", () => {
    expect(failRules("Example Tower is a 14-storey building.")).toEqual(["claims.unverified_number"]);
    expect(failRules("Example Tower is a 13-storey building.")).toEqual([]);
  });
});

describe("claims gate: context and attribution", () => {
  it("fails a figure attached to the wrong project", () => {
    expect(failRules("Example Campus has 13 floors.")).toEqual(["claims.misattributed_figure"]);
  });

  it("does not let a value pass in the wrong context for client material", () => {
    // 6 is a verified figure (6 elevators), but "6 months" is a different claim.
    expect(failRules("A warranty of 6 months.")).toEqual(["claims.unapproved_commitment"]);
    // For Asil's own briefs the same value-only match is a warning, not a block.
    const internal = checkClaims("A warranty of 6 months.", { figures, rules, strict: false });
    expect(internal.findings.map((f) => `${f.severity}:${f.rule}`)).toEqual(["signal:claims.value_only_match"]);
  });

  it("matches dates against dated records", () => {
    expect(failRules("Example Tower was completed in March 2019.")).toEqual([]);
    expect(failRules("Example Tower was completed in March 2020.")).toEqual(["claims.unverified_number"]);
  });

  it("ignores numbers the rulebook allows (record ids, Vision 2030)", () => {
    expect(failRules("Aligned with Vision 2030, see PRJ-903.")).toEqual([]);
  });

  it("flags ambiguous separators instead of guessing", () => {
    expect(failRules("Flooring of 18.000 m² was laid.")).toEqual(["claims.ambiguous_number"]);
    expect(failRules("Flooring of 18,000 m² was laid at Example Hospital.")).toEqual([]);
  });
});

describe("claims gate: the author's declared list must match the text", () => {
  it("fails an undeclared figure and a declared figure that isn't there", () => {
    const r = checkClaims("Example Hospital: a 120-bed fit-out.", {
      figures, rules, strict: true, declared: [{ value: 18000, unit: "sqm" }],
    });
    expect(r.findings.map((f) => f.rule).sort()).toEqual(["claims.declared_not_found", "claims.undeclared"]);
  });

  it("passes when the lists agree", () => {
    const r = checkClaims("Example Hospital: a 120-bed fit-out.", {
      figures, rules, strict: true, declared: [{ value: 120, unit: "bed" }],
    });
    expect(r.findings).toEqual([]);
  });
});
