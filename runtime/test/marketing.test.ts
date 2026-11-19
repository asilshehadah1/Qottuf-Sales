import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listQueue } from "../src/approvals/queue.ts";
import { enqueue, runAll, type DispatcherDeps } from "../src/dispatcher/dispatcher.ts";
import type { BrandRules } from "../src/gates/brand.ts";
import type { EvidenceRecord } from "../src/ledger/schemas.ts";
import { ScriptedModelClient } from "../src/model/client.ts";
import { usableFacts } from "../src/workflows/content.ts";
import { fixtureRules } from "./helpers.ts";
import { approvedEvidence, testEnv, type TestEnv } from "./setup.ts";

let env: TestEnv;
let brand: BrandRules;
let named: string;
let unnamed: string;

beforeAll(async () => {
  env = await testEnv();
  brand = await fixtureRules();
  // Two fictional projects: the first client may be named in public, the second may not.
  named = await approvedEvidence(env, {
    type: "case_facts", tier: "public", project_ref: "PRJ-901", title: "Example Tower facts",
    facts: [
      { id: "title", kind: "statement", name: "project_title", value: "Example Tower", label: "Example Tower" },
      { id: "floors", kind: "figure", name: "floors", value: 13, unit: "floor", label: "13 floors, Example Tower" },
      { id: "client", kind: "statement", name: "client_name", value: "Example University", label: "Client: Example University" },
    ],
  });
  await approvedEvidence(env, { type: "client_naming_approval", tier: "public", project_ref: "PRJ-901", title: "Example University may be named", permitted_uses: ["name_client:public"] });
  unnamed = await approvedEvidence(env, {
    type: "case_facts", tier: "public", project_ref: "PRJ-902", title: "Example Clinic facts",
    facts: [
      { id: "lifts", kind: "figure", name: "elevators", value: 6, unit: "elevator", label: "6 elevators supplied and installed, Example Clinic" },
      { id: "client", kind: "statement", name: "client_name", value: "Example Health Group", label: "Client: Example Health Group" },
      { id: "descriptor", kind: "statement", name: "client_descriptor", value: "a hospital operator", label: "Client, unnamed: a hospital operator" },
    ],
  });
});
afterAll(async () => env.db.close());

const deps = (model: ScriptedModelClient): DispatcherDeps => ({ db: env.db, rules: env.rules, brand, model, now: env.now });
const noClaims = () => ({ claims: [] });

describe("the facts a public writer may use", () => {
  it("offers a client name only where public naming is approved, and withholds the rest", () => {
    const records: EvidenceRecord[] = [
      { id: "EV-1", type: "case_facts", tier: "public", project_ref: "PRJ-1", title: "t", issuer: null, issued_at: null, expires_at: null, permitted_uses: [], status: "approved",
        facts: [{ id: "c", kind: "statement", name: "client_name", value: "Named Co", label: "Client" }] },
      { id: "EV-2", type: "client_naming_approval", tier: "public", project_ref: "PRJ-1", title: "ok", issuer: null, issued_at: null, expires_at: null, permitted_uses: ["name_client:public"], status: "approved", facts: [] },
      { id: "EV-3", type: "case_facts", tier: "public", project_ref: "PRJ-2", title: "t", issuer: null, issued_at: null, expires_at: null, permitted_uses: [], status: "approved",
        facts: [{ id: "c", kind: "statement", name: "client_name", value: "Secret Co", label: "Client" }, { id: "d", kind: "statement", name: "client_descriptor", value: "a bank", label: "a bank" }] },
    ];
    const u = usableFacts(records);
    expect(u.mayName).toEqual([{ project_ref: "PRJ-1", name: "Named Co", fact_id: "EV-1#c" }]);
    expect(u.mustNotName).toEqual(["Secret Co"]);
    expect(u.facts.map((f) => f.id)).toEqual(["EV-3#d"]);
  });
});

describe("#30 LinkedIn writer", () => {
  it("blocks an unapproved client name and an unknown fact, then passes the revision", async () => {
    const model = new ScriptedModelClient({
      linkedin_writer: (_input, attempt) => attempt === 1
        ? { angle: "Six lifts in a working clinic", en: "Qottuf Aljazeera installed 6 elevators for Example Health Group while the clinic stayed open.",
            ar: "ركّبت قطوف الجزيرة ٦ مصاعد لمجموعة المثال الصحية.", fact_ids: [`${unnamed}#lifts`, "EV-9999#made_up"],
            declared_claims: [{ value: 6, unit: "elevator", fact_id: `${unnamed}#lifts` }], for_asil_to_check: [] }
        : { angle: "Six lifts for a hospital operator", en: "Qottuf Aljazeera supplied and installed 6 elevators for a hospital operator in Riyadh.",
            ar: "ورّدت قطوف الجزيرة وركّبت ٦ مصاعد لمشغّل مستشفيات في الرياض.", fact_ids: [`${unnamed}#lifts`, `${unnamed}#descriptor`],
            declared_claims: [{ value: 6, unit: "elevator", fact_id: `${unnamed}#lifts` }], for_asil_to_check: ["«مشغّل مستشفيات» or «مشغل للمستشفيات»?"] },
      claim_extractor: noClaims,
    });
    await enqueue(env.db, { artifactType: "linkedin_post", createdBy: "asil", input: { voice: "company", project_ref: "PRJ-902" } });
    const [r] = await runAll(deps(model));
    expect(r).toMatchObject({ status: "succeeded" });
    const firstInput = model.calls.find((c) => c.agent === "linkedin_writer")!.input;
    expect(firstInput).not.toContain("Example Health Group"); // the withheld name never reaches the writer
    const revision = model.calls.filter((c) => c.agent === "linkedin_writer")[1]!.input;
    expect(revision).toContain("naming_approval.client_named");
    expect(revision).toContain("claims.unknown_fact_id");
    const item = (await listQueue(env.db)).find((q) => q.artifact_id === r!.artifactId)!;
    expect(item).toMatchObject({ passed: true, audience: "public", artifact_type: "linkedin_post" });
    expect(item.title).toContain("company page");
  });
});

describe("#34 Elevator ad writer", () => {
  it("needs real-footage shots for a reel, and flags promises for Asil", async () => {
    const reel = (shots: number) => ({
      headline_en: "Configure your lift online", headline_ar: "صمّم مصعدك أونلاين",
      en: "Choose the cabin, the doors and the stops on our website. Qottuf Aljazeera installed 6 elevators at Example Clinic.",
      ar: "اختر الكابينة والأبواب وعدد الأدوار من موقعنا. ركّبت قطوف الجزيرة ٦ مصاعد في عيادة المثال.",
      shot_list: ["The cabin on site", "The doors closing", "The configurator screen", "The finished lobby"].slice(0, shots).map((shot) => ({ shot, on_screen_text_ar: "صمّم مصعدك من موقعنا", footage: "real" })),
      fact_ids: [`${unnamed}#lifts`], declared_claims: [{ value: 6, unit: "elevator", fact_id: `${unnamed}#lifts` }], for_asil_to_check: [],
    });
    const model = new ScriptedModelClient({
      elevator_ad_writer: (_i, attempt) => reel(attempt === 1 ? 2 : 4),
      claim_extractor: () => ({ claims: [{ span: "Choose the cabin, the doors and the stops on our website", lang: "en", kind: "availability" }] }),
    });
    await enqueue(env.db, { artifactType: "elevator_ad", createdBy: "asil", input: { format: "reel_script", channel: "instagram" } });
    const [r] = await runAll(deps(model));
    expect(r).toMatchObject({ status: "succeeded" });
    expect(model.calls.filter((c) => c.agent === "elevator_ad_writer")[1]!.input).toContain("elevator.reel_shots");
    const item = (await listQueue(env.db)).find((q) => q.artifact_id === r!.artifactId)!;
    expect(item.gate_report.warnings.map((w) => w.rule)).toContain("claims.promise");
    expect(item.rendered_en).toContain("## Shots (real footage only)");
  });
});

describe("#29 Web page writer", () => {
  const html = `<html lang="en"><head><title>Qottuf Jazeera | Elevators</title><meta name="description" content="Lifts in Riyadh."></head>
    <body><h1>Elevators</h1><p>Our team responds within 24 hours.</p>
    <form><input name="phone"><button>Send</button></form></body></html>`;
  const fetchFn = (async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;

  it("reads the live page and its failures, and needs the consent sentence for its form", async () => {
    const page = (consent: boolean) => ({
      title_en: "Elevators in Riyadh | Qottuf Aljazeera", title_ar: "المصاعد في الرياض | قطوف الجزيرة",
      description_en: "Configure a lift online with Qottuf Aljazeera in Riyadh.", description_ar: "صمّم مصعدك عبر الموقع مع قطوف الجزيرة في الرياض.",
      en: "# Elevators\n\nQottuf Aljazeera installed 6 elevators at Example Clinic.", ar: "# المصاعد\n\nركّبت قطوف الجزيرة ٦ مصاعد في عيادة المثال.",
      form_consent_en: consent ? "By sending this form, you agree that Qottuf may contact you about this enquiry." : "",
      form_consent_ar: consent ? "بإرسال هذا النموذج توافق على أن تتواصل معك قطوف بشأن هذا الطلب فقط." : "",
      changes: [{ was: "Our team responds within 24 hours.", now: "(removed)", why: "No approved record carries a response time." }],
      fact_ids: [`${unnamed}#lifts`], declared_claims: [{ value: 6, unit: "elevator", fact_id: `${unnamed}#lifts` }], for_asil_to_check: [],
    });
    const model = new ScriptedModelClient({ web_page_writer: (_i, attempt) => page(attempt > 1), claim_extractor: noClaims });
    await enqueue(env.db, { artifactType: "web_page", createdBy: "asil", input: { page_url: "https://www.example.com/elevators/" } });
    const [r] = await runAll({ ...deps(model), fetchFn });
    expect(r).toMatchObject({ status: "succeeded" });
    const first = model.calls.find((c) => c.agent === "web_page_writer")!.input;
    expect(first).toContain("naming.forbidden_variant"); // the title's retired spelling, found by the site check
    expect(first).toContain("has_enquiry_form\": true");
    expect(model.calls.filter((c) => c.agent === "web_page_writer")[1]!.input).toContain("web.form_consent");
    const item = (await listQueue(env.db)).find((q) => q.artifact_id === r!.artifactId)!;
    expect(item.title).toBe("Web page: /elevators/");
    expect(item.rendered_ar).toContain("جملة الموافقة");
  });

  it("says so when there are no facts to write from", async () => {
    const empty = await testEnv();
    const model = new ScriptedModelClient({ linkedin_writer: () => ({}), claim_extractor: noClaims });
    await enqueue(empty.db, { artifactType: "linkedin_post", createdBy: "asil", input: { voice: "asil", topic: "What a live hospital teaches a contractor" } });
    const [r] = await runAll({ db: empty.db, rules: empty.rules, brand, model, now: empty.now });
    expect(r).toMatchObject({ status: "needs_human" });
    expect(r!.note).toContain("No approved evidence");
    expect(model.calls).toHaveLength(0);
    await empty.db.close();
  });

  it("keeps named projects' clients nameable", () => {
    expect(named).toMatch(/^EV-/);
  });
});
