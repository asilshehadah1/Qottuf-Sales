import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decide, listQueue } from "../src/approvals/queue.ts";
import { enqueue, runAll, runNext, type DispatcherDeps } from "../src/dispatcher/dispatcher.ts";
import type { BrandRules } from "../src/gates/brand.ts";
import { isArabicLine, splitSentences } from "../src/gates/text.ts";
import { createAccount, createContact, GateError } from "../src/ledger/repo.ts";
import { ModelTransientError, ScriptedModelClient, type ModelClient } from "../src/model/client.ts";
import { createOpportunity, screen } from "../src/pipeline/engine.ts";
import { buildBoardPack } from "../src/reporting/boardPack.ts";
import { fixtureRules } from "./helpers.ts";
import { approvedEvidence, documentedProject, inHours, testEnv, type TestEnv } from "./setup.ts";

let env: TestEnv;
let brand: BrandRules;
let account: string;
let F: Record<string, string>; // fact ids

const enSentences = (floors: string) => [
  { lang: "en", text: `Qottuf Aljazeera delivered the fit-out of Example Tower, a ${floors}-floor building for a university endowment.`, fact_ids: [F.floors!, F.descriptor!] },
  { lang: "en", text: "The contract value was SAR 38,000,000.", fact_ids: [F.value!] },
  { lang: "en", text: "Work was completed in June 2020.", fact_ids: [F.done!] },
];
const arSentences = [
  { lang: "ar", text: "نفّذت قطوف الجزيرة أعمال تشطيب برج المثال المكوّن من ١٣ طابقاً لصالح جهة وقفية جامعية.", fact_ids: [] as string[] },
  { lang: "ar", text: "بلغت قيمة العقد ٣٨٬٠٠٠٬٠٠٠ ريال.", fact_ids: [] as string[] },
  { lang: "ar", text: "اكتملت الأعمال في يونيو ٢٠٢٠.", fact_ids: [] as string[] },
];

/** A scripted extractor that quotes every sentence carrying a number, and flags outcome claims as factual. */
function scriptedExtractor(input: string) {
  const claims: Array<{ span: string; lang: "en" | "ar"; kind: string }> = [];
  for (const s of splitSentences(input)) {
    const lang = isArabicLine(s.text) ? "ar" : "en";
    if (/[0-9٠-٩]/.test(s.text)) claims.push({ span: s.text, lang, kind: "number" });
    if (/without disruption/i.test(s.text)) claims.push({ span: "without disruption", lang, kind: "factual" });
  }
  return { claims };
}

function deps(model: ModelClient | null): DispatcherDeps {
  return { db: env.db, rules: env.rules, brand, model, now: env.now };
}

beforeAll(async () => {
  env = await testEnv();
  brand = await fixtureRules();
  account = await createAccount(env.db, { name_en: "Example University (fictional)", type: "university", sector: "education", relationship_owner: "asil", priority_rank: 1 }, "asil");
  await documentedProject(env, "PRJ-901", 31_000_000, "2021-09");
  const caseFacts = await approvedEvidence(env, {
    type: "case_facts", tier: "tender", project_ref: "PRJ-903", title: "Example Tower facts",
    facts: [
      { id: "floors", kind: "figure", name: "floors", value: 13, unit: "floor", label: "13 floors" },
      { id: "client", kind: "statement", name: "client_name", value: "Example Endowment Trust", label: "Client name" },
      { id: "descriptor", kind: "statement", name: "client_descriptor", value: "a university endowment", label: "Client descriptor" },
    ],
  });
  const contract = await approvedEvidence(env, {
    type: "contract", tier: "tender", project_ref: "PRJ-903", title: "Contract PRJ-903",
    facts: [
      { id: "value", kind: "figure", name: "contract_value", value: 38_000_000, unit: "sar", label: "Contract value" },
      { id: "start", kind: "date", name: "start_date", value: "2018-01", label: "Start" },
    ],
  });
  const cert = await approvedEvidence(env, {
    type: "completion_certificate", tier: "tender", project_ref: "PRJ-903", title: "Completion certificate PRJ-903",
    facts: [{ id: "done", kind: "date", name: "completion_date", value: "2020-06", label: "Completed June 2020" }],
  });
  F = { floors: `${caseFacts}#floors`, descriptor: `${caseFacts}#descriptor`, value: `${contract}#value`, done: `${cert}#done` };
  await approvedEvidence(env, { type: "certificate", tier: "tender", title: "Commercial Registration", expires_at: "2027-08-01", permitted_uses: ["certificate:CR"] });
  await approvedEvidence(env, { type: "certificate", tier: "tender", title: "Zakat certificate", expires_at: "2026-12-12", permitted_uses: ["certificate:Zakat"] });
});
afterAll(async () => env.db.close());

describe("case study: draft, gate, revise, approve", () => {
  it("catches a wrong figure, gets it fixed in the revision, and passes", async () => {
    const model = new ScriptedModelClient({
      case_study_writer: (_input, attempt) => ({
        title_en: "Example Tower fit-out", title_ar: "تشطيب برج المثال",
        sentences: [...enSentences(attempt === 1 ? "14" : "13"), ...arSentences],
        declared_claims: [{ value: attempt === 1 ? 14 : 13, unit: "floor", fact_id: F.floors }, { value: 38_000_000, unit: "sar", fact_id: F.value }],
      }),
      claim_extractor: scriptedExtractor,
    });
    await enqueue(env.db, { artifactType: "case_study", input: { project_ref: "PRJ-903", audience: "tender" }, createdBy: "asil" });
    const [r] = await runAll(deps(model));
    expect(r).toMatchObject({ status: "succeeded" });
    expect(model.calls.map((c) => c.agent)).toEqual(["case_study_writer", "claim_extractor", "case_study_writer", "claim_extractor"]);
    // The revision request carried the numbered finding.
    expect(model.calls[2]!.input).toContain("claims.unverified_number");
    // The client name never reached the model: it isn't approved for naming.
    expect(model.calls.every((c) => !c.input.includes("Example Endowment Trust"))).toBe(true);
    const item = (await listQueue(env.db)).find((q) => q.artifact_id === r!.artifactId)!;
    expect(item).toMatchObject({ audience: "client", passed: true });
    expect(item.rendered_en).toContain("13-floor");
    expect(item.gate_report.verified.length).toBeGreaterThanOrEqual(6);
  });

  it("removes a sentence that stays wrong after two rounds, in that language only", async () => {
    const model = new ScriptedModelClient({
      case_study_writer: () => ({
        title_en: "Example Tower fit-out", title_ar: "تشطيب برج المثال",
        sentences: [...enSentences("13"), { lang: "en", text: "Qottuf delivered it without disruption.", fact_ids: [] }, ...arSentences],
        declared_claims: [{ value: 13, unit: "floor", fact_id: F.floors }, { value: 38_000_000, unit: "sar", fact_id: F.value }],
      }),
      claim_extractor: scriptedExtractor,
    });
    await enqueue(env.db, { artifactType: "case_study", input: { project_ref: "PRJ-903", audience: "tender" }, createdBy: "asil" });
    const [r] = await runAll(deps(model));
    const item = (await listQueue(env.db)).find((q) => q.artifact_id === r!.artifactId)!;
    expect(item.passed).toBe(true);
    expect(item.rendered_en).not.toContain("without disruption");
    expect(item.rendered_ar).toContain("١٣ طابقاً");
    expect(r!.note).toContain("1 sentence(s) removed");
  });

  it("lets only Asil approve, and never a blocked client artifact", async () => {
    const q = await listQueue(env.db);
    const passing = q.find((x) => x.artifact_type === "case_study" && x.passed)!;
    await expect(decide(env.db, passing.artifact_id, { actor: "bid_coordinator", decision: "approved", rules: env.rules })).rejects.toThrow(GateError);
    await expect(decide(env.db, passing.artifact_id, { actor: "asil", decision: "rejected", rules: env.rules })).rejects.toThrow(/reason/);
    await decide(env.db, passing.artifact_id, { actor: "asil", decision: "approved", rules: env.rules });
    await expect(decide(env.db, passing.artifact_id, { actor: "asil", decision: "approved", rules: env.rules })).rejects.toThrow(/already decided/);
  });
});

describe("meeting brief and debrief for Asil", () => {
  it("prepares a brief from the Ledger, keeps people as ids, and warns on unknown proof", async () => {
    const cnt = await createContact(env.db, { account_id: account, full_name_en: "Fahad Example", full_name_ar: "فهد المثال", committee_role: "decision_maker" }, "asil");
    const opp = await createOpportunity({ db: env.db, rules: env.rules, now: env.now }, {
      motion: "contracting", title: "Faculty building (fictional)", account_id: account, route: "invited_private",
      qottuf_role: "main_contractor", sector: "education", service_lines: ["fit_out", "mep"], stage: "invitation", owner: "asil",
      next_step: { action: "Screen the invitation", owner: "bid_coordinator", due_at: inHours(env, 24) },
      value_min_sar: 45_000_000, value_max_sar: 55_000_000, value_source: "estimate",
    }, "asil");
    const model = new ScriptedModelClient({
      meeting_brief: (input) => {
        expect(input).toContain(`[${cnt}]`);
        expect(input).not.toContain("Fahad Example");
        return {
          objective: "Agree the prequalification documents the PMC needs.",
          context: ["Invited to tender; value band SAR 45-55 m."],
          what_they_care_about: ["Programme certainty on an occupied campus."],
          proof_to_bring: [{ ref: "PRJ-901", why: "Comparable education fit-out." }, { ref: "PRJ-999", why: "Invented." }],
          questions_to_ask: ["Which evaluation method applies?"],
          asks: [{ ask: "A site walk before the clarification deadline.", fallback: "Drawings of the occupied wings." }],
          risks: ["The incumbent has the relationship."],
          do_not_say: ["Any price or discount."],
          next_step_to_secure: { action: "Site walk", owner: "asil", due_in_days: 7 },
        };
      },
      meeting_debrief: () => ({
        summary: "Positive meeting with the PMC.",
        decisions: ["We will submit the prequalification pack."],
        commitments_we_made: [{ what: "Send the reference list", by_whom: "asil", due_date: null }],
        next_steps: [{ action: "Send the pack", owner: "bid_coordinator", due_date: null }],
        buying_committee: [{ person: `[${cnt}]`, role: "decision maker", stance: "supportive" }],
        objections_verbatim: ["Your references are mostly fit-out."],
        proof_requested: ["Completion certificates"],
      }),
    });
    await enqueue(env.db, { artifactType: "meeting_brief", input: { account_id: account, opportunity_id: opp, meeting_at: "2026-11-25T10:00:00+03:00", purpose: "First PMC meeting", notes: "Eng. Fahad Example prefers WhatsApp." }, createdBy: "asil" });
    await enqueue(env.db, { artifactType: "meeting_debrief", input: { account_id: account, opportunity_id: opp, notes: "Met فهد المثال. He wants the reference list. We said we'd send it." }, createdBy: "asil" });
    const results = await runAll(deps(model));
    expect(results.map((r) => r.status)).toEqual(["succeeded", "succeeded"]);
    expect(results[1]!.note).toContain("1 commitment(s)");
    const brief = (await listQueue(env.db)).find((q) => q.artifact_type === "meeting_brief")!;
    expect(brief.rendered_en).toContain("PRJ-901");
    expect(brief.gate_report.warnings.some((w) => w.rule === "brief.unknown_proof" && w.quote === "PRJ-999")).toBe(true);
    // The debrief's input was redacted: the Arabic name became the contact id.
    expect(model.calls[1]!.input).toContain(`[${cnt}]`);
    expect(model.calls[1]!.input).not.toContain("فهد المثال");
  });
});

describe("code-only work and failure handling", () => {
  it("builds the prequalification pack and flags missing and expiring documents", async () => {
    await enqueue(env.db, { artifactType: "prequal_pack", input: { account_id: account, target: "Example University framework" }, createdBy: "asil" });
    const [r] = await runAll(deps(null)); // no model needed
    expect(r!.status).toBe("succeeded");
    const pack = (await listQueue(env.db)).find((q) => q.artifact_type === "prequal_pack")!;
    expect(pack.rendered_en).toMatch(/READY: Commercial Registration/);
    expect(pack.rendered_en).toMatch(/EXPIRING: Zakat certificate/);
    expect(pack.rendered_en).toMatch(/MISSING: GOSI certificate/);
    expect(pack.rendered_en).toMatch(/ASIL: Audited financial statements/);
    expect(pack.rendered_en).toContain("Referee consent for PRJ-903");
  });

  it("hands work to a human when the model is off, and retries transient errors with backoff", async () => {
    await enqueue(env.db, { artifactType: "meeting_debrief", input: { account_id: account, notes: "Short notes from a call." }, createdBy: "asil" });
    const [off] = await runAll(deps(null));
    expect(off).toMatchObject({ status: "needs_human" });

    let calls = 0;
    const flaky: ModelClient = { kind: "scripted", call: async () => { calls++; throw new ModelTransientError("overloaded"); } };
    const id = await enqueue(env.db, { artifactType: "meeting_debrief", input: { account_id: account, notes: "Short notes from a call." }, createdBy: "asil" });
    expect(await runNext(deps(flaky))).toMatchObject({ workOrderId: id, status: "retry" });
    expect(await runNext(deps(flaky))).toBeNull(); // not before the backoff
    env.clock.at = new Date(env.clock.at.getTime() + 61_000);
    expect(await runNext(deps(flaky))).toMatchObject({ status: "retry" });
    env.clock.at = new Date(env.clock.at.getTime() + 3_600_000);
    // Third transient failure: out of attempts, so the order goes to the dead-letter state.
    expect(await runNext(deps(flaky))).toMatchObject({ status: "dead" });
    expect(calls).toBe(3);
  });
});

describe("the weekly board pack", () => {
  it("puts decisions first, then proof, pipeline, alerts and expiring evidence", async () => {
    const d = { db: env.db, rules: env.rules, now: env.now };
    const opp = await createOpportunity(d, {
      motion: "contracting", title: "Hospital wing (fictional)", account_id: account, route: "invited_private",
      qottuf_role: "main_contractor", sector: "healthcare", service_lines: ["fit_out"], stage: "invitation", owner: "asil",
      next_step: { action: "Screen it", owner: "bid_coordinator", due_at: inHours(env, 24) },
      value_min_sar: 12_000_000, value_max_sar: 14_000_000, value_source: "tender",
    }, "asil");
    await screen(d, opp, { actor: "bid_coordinator" });
    const pack = await buildBoardPack(d);
    const order = ["## 1. Decisions for Asil", "## 2. Proof", "## 3. Pipeline", "## 4. Alerts", "## 5. Evidence expiring"];
    const positions = order.map((h) => pack.indexOf(h));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(pack).toContain("Hospital wing (fictional)");
    expect(pack).toContain("K-BAND FAIL: Below the band");
    expect(pack).toMatch(/2\. Proof: 2 of 3 projects documented/);
    expect(pack).toContain("Zakat certificate");
  });
});
