import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSystem } from "../src/agents/bilingualEditor.ts";
import { listQueue } from "../src/approvals/queue.ts";
import { enqueue, runAll, type DispatcherDeps } from "../src/dispatcher/dispatcher.ts";
import type { BrandRules } from "../src/gates/brand.ts";
import { checkNoAddedFigures, checkParity, glossarySignals } from "../src/gates/parity.ts";
import { ScriptedModelClient } from "../src/model/client.ts";
import { BilingualInput } from "../src/pipelines/bilingual.ts";
import { fixtureRules } from "./helpers.ts";
import { testEnv, type TestEnv } from "./setup.ts";

let env: TestEnv;
let brand: BrandRules;

beforeAll(async () => {
  env = await testEnv();
  brand = { ...(await fixtureRules()), glossary: [{ en: "tender", ar: "منافسة / مناقصة" }, { en: "renovation / restoration", ar: "ترميم", notes: "Not تجديد." }] };
});
afterAll(async () => env.db.close());

describe("parity in code", () => {
  it("passes the same figures written differently in each language", () => {
    const en = "Example Tower has 13 floors and 6 elevators. Handed over in June 2020.";
    const ar = "يتكوّن برج المثال من ثلاثة عشر طابقاً و٦ مصاعد. سُلّم في يونيو ٢٠٢٠.";
    expect(checkParity(en, ar, brand, true)).toEqual([]);
  });

  it("fails a figure missing from one language, and an Arabic dual that isn't in the English", () => {
    const missing = checkParity("Example Tower has 13 floors and 6 elevators.", "يتكوّن برج المثال من ١٣ طابقاً.", brand, true);
    expect(missing.map((f) => `${f.rule}:${f.quote}`)).toEqual(["parity.missing_in_ar:6"]);
    const dual = checkParity("Delivery on site.", "التسليم في الموقع خلال أسبوعين.", brand, true);
    expect(dual.map((f) => f.rule)).toEqual(["parity.missing_in_en"]);
  });

  it("refuses figures an editor added to the source", () => {
    expect(checkNoAddedFigures("We fitted out a hospital.", "We fitted out a 120-bed hospital.", brand).map((f) => f.rule)).toEqual(["editor.added_figure"]);
    expect(checkNoAddedFigures("A 120-bed hospital fit-out.", "The fit-out of a 120-bed hospital.", brand)).toEqual([]);
  });

  it("signals a glossary term rendered another way", () => {
    expect(glossarySignals("Renovation of the library.", "تجديد المكتبة.", brand).map((f) => f.quote)).toEqual(["Renovation"]);
    expect(glossarySignals("Renovation of the library.", "ترميم المكتبة.", brand)).toEqual([]);
  });

  it("puts the rulebook's glossary into the system prompt", () => {
    expect(buildSystem(brand)).toContain("tender = منافسة / مناقصة");
  });
});

describe("the register rule", () => {
  it("allows Saudi conversational Arabic only for public elevator ads", () => {
    const base = { source_lang: "en", source_text: "Home lifts for villas.", audience: "public", purpose: "elevator_ad", register: "saudi_conversational" };
    expect(BilingualInput.safeParse(base).success).toBe(true);
    expect(BilingualInput.safeParse({ ...base, purpose: "tender_cover_letter", audience: "client" }).success).toBe(false);
  });
});

describe("the bilingual pipeline", () => {
  const deps = (model: ScriptedModelClient): DispatcherDeps => ({ db: env.db, rules: env.rules, brand, model, now: env.now });

  it("catches a dropped figure, gets it back in the revision, and lists points for Asil", async () => {
    const model = new ScriptedModelClient({
      bilingual_editor: (_input, attempt) => ({
        en: "Qottuf Aljazeera fitted out Example Hospital, a 120-bed facility.",
        ar: attempt === 1 ? "نفّذت قطوف الجزيرة تشطيبات مستشفى المثال." : "نفّذت قطوف الجزيرة تشطيبات مستشفى المثال بسعة ١٢٠ سريراً.",
        changes_to_source: ["Replaced 'did the fit-out of' with 'fitted out'."],
        untransferable: [],
        for_asil_to_check: ["«تشطيبات» or «أعمال التشطيب» for this audience?"],
      }),
    });
    await enqueue(env.db, { artifactType: "bilingual_edit", createdBy: "asil", input: {
      source_lang: "en", source_text: "Qottuf Aljazeera did the fit-out of Example Hospital, a 120-bed facility.", audience: "client", purpose: "prequalification pack",
    } });
    const [r] = await runAll(deps(model));
    expect(r).toMatchObject({ status: "succeeded", note: "1 point(s) for Asil to check." });
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1]!.input).toContain("parity.missing_in_ar");
    const item = (await listQueue(env.db)).find((q) => q.artifact_id === r!.artifactId)!;
    expect(item).toMatchObject({ passed: true, audience: "client" });
    expect(item.rendered_ar).toContain("١٢٠ سريراً");
  });

  it("blocks a pair that adds a figure to the source, and hands it to Asil", async () => {
    const model = new ScriptedModelClient({
      bilingual_editor: () => ({
        en: "Qottuf Aljazeera fitted out Example Hospital in 45 days.",
        ar: "نفّذت قطوف الجزيرة تشطيبات مستشفى المثال خلال ٤٥ يوماً.",
        changes_to_source: [], untransferable: [], for_asil_to_check: [],
      }),
    });
    await enqueue(env.db, { artifactType: "bilingual_edit", createdBy: "asil", input: {
      source_lang: "en", source_text: "Qottuf Aljazeera fitted out Example Hospital.", audience: "client", purpose: "prequalification pack",
    } });
    const [r] = await runAll(deps(model));
    expect(r!.status).toBe("needs_human");
    const item = (await listQueue(env.db)).find((q) => q.artifact_id === r!.artifactId)!;
    expect(item.passed).toBe(false);
    expect(item.gate_report.blocking.map((b) => b.rule)).toEqual(expect.arrayContaining(["editor.added_figure", "claims.unapproved_commitment"]));
  });
});
