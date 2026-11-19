import { describe, expect, it } from "vitest";
import { pyRegex, translatePythonRegex, UntranslatableRegexError } from "../src/gates/regex.ts";

describe("Python to JavaScript regex translation", () => {
  it("makes \\b and \\w understand Arabic, as Python does", () => {
    expect(/\bأنا\b/.test("قال أنا هنا")).toBe(false); // the trap: plain JavaScript never matches
    expect(pyRegex("\\bأنا\\b").test("قال أنا هنا")).toBe(true);
    expect(pyRegex("\\bأنا\\b").test("أنانية")).toBe(false);
    expect(pyRegex("(?<!\\w)الأفضل(?!\\w)").test("نقدم الأفضل دائماً")).toBe(true);
    expect(pyRegex("(?<!\\w)الأفضل(?!\\w)").test("بالأفضلية")).toBe(false);
  });

  it("turns a whole-pattern (?i:...) group into the i flag", () => {
    const t = translatePythonRegex("(?i:\\bmy\\b)");
    expect(t.flags).toContain("i");
    expect(pyRegex("(?i:\\bmy\\b)").test("This is MY view")).toBe(true);
  });

  it("translates \\U escapes and keeps negative lookaheads", () => {
    expect(pyRegex("^\\s*[\\u2705\\U0001F680]", "m").test("🚀 launch")).toBe(true);
    expect(pyRegex("وزارة (?!البلديات والإسكان)\\S+").test("وزارة البلديات والإسكان")).toBe(false);
    expect(pyRegex("وزارة (?!البلديات والإسكان)\\S+").test("وزارة الداخلية")).toBe(true);
  });

  it("accepts Python identity escapes the u flag would reject", () => {
    expect(pyRegex("a\\-b\\#").test("a-b#")).toBe(true);
  });

  it("fails loud on features it can't translate", () => {
    expect(() => translatePythonRegex("ab(?i:c)d")).toThrow(UntranslatableRegexError);
    expect(() => translatePythonRegex("(?#comment)x")).toThrow(UntranslatableRegexError);
  });
});
