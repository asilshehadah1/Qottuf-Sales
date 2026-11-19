import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { decideBid, moveOpportunity, newOpportunity, renewalCandidates, RuleError, screenOpportunity, type ConsoleOpp } from "../src/console/engine.ts";
import { buildSamplePrompt, SampleModelClient, type SampleFn } from "../src/console/sampleClient.ts";
import { loadBusinessRules, type BusinessRules } from "../src/config/rules.ts";
import type { BrandRules } from "../src/gates/brand.ts";
import { trustedText } from "../src/gates/pii.ts";
import type { EvidenceRecord } from "../src/ledger/schemas.ts";
import { ModelCancelledError, ModelOutputError, ModelTransientError, ModelUnavailableError } from "../src/model/core.ts";
import { caseStudyWorkflow } from "../src/workflows/caseStudy.ts";
import type { WorkflowEnv } from "../src/workflows/types.ts";
import { fixtureRules } from "./helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
let rules: BusinessRules;
let brand: BrandRules;
beforeAll(async () => {
  rules = await loadBusinessRules();
  brand = await fixtureRules();
});

const Out = z.object({ answer: z.string(), n: z.number() });
const call = { agent: "test_agent", promptVersion: "t/1", system: "You answer.", schema: Out, effort: "medium" as const };

describe("the Claude-plan model client", () => {
  it("sends the instructions, the JSON Schema and the redacted input, and reads JSON from a fenced reply", async () => {
    const seen: Array<{ input: string; tier?: string; cache?: boolean }> = [];
    const sample: SampleFn = async (input, o) => {
      seen.push({ input, ...(o?.modelTier ? { tier: o.modelTier } : {}), ...(o?.cache !== undefined ? { cache: o.cache } : {}) });
      return { text: 'Here it is:\n```json\n{"answer":"ok","n":2}\n```', truncated: false, modelTierApplied: "default" };
    };
    const r = await new SampleModelClient(sample).call({ ...call, input: trustedText("Question.") });
    expect(r.output).toEqual({ answer: "ok", n: 2 });
    expect(r.modelServed).toBe("claude-plan:default");
    expect(seen[0]).toMatchObject({ tier: "default", cache: false });
    expect(seen[0]!.input).toContain("You answer.");
    expect(seen[0]!.input).toContain('"additionalProperties":false');
    expect(seen[0]!.input).toContain("<input>\nQuestion.\n</input>");
    expect(buildSamplePrompt({ ...call, input: trustedText("x") }).startsWith("You answer.")).toBe(true);
  });

  it("uses the quick tier for extraction, and refuses unredacted text before calling", async () => {
    let tier: string | undefined;
    let calls = 0;
    const sample: SampleFn = async (_i, o) => { calls++; tier = o?.modelTier; return { text: '{"answer":"a","n":1}', truncated: false }; };
    await new SampleModelClient(sample).call({ ...call, effort: "low", input: trustedText("q") });
    expect(tier).toBe("quick");
    await expect(new SampleModelClient(sample).call({ ...call, input: "Call 0551234567" as never })).rejects.toThrow(/personal data/);
    expect(calls).toBe(1);
  });

  it("maps the runtime's error codes to the agents' error types", async () => {
    const failing = (code: string): SampleFn => async () => { throw { code, message: code }; };
    await expect(new SampleModelClient(failing("not_granted")).call({ ...call, input: trustedText("q") })).rejects.toThrow(ModelUnavailableError);
    await expect(new SampleModelClient(failing("rate_limited")).call({ ...call, input: trustedText("q") })).rejects.toThrow(ModelTransientError);
    await expect(new SampleModelClient(failing("cancelled")).call({ ...call, input: trustedText("q") })).rejects.toThrow(ModelCancelledError);
    const wrong: SampleFn = async () => ({ text: '{"answer":3}', truncated: false });
    await expect(new SampleModelClient(wrong).call({ ...call, input: trustedText("q") })).rejects.toThrow(ModelOutputError);
  });

  it("runs a whole case-study workflow through the plan, gates and all", async () => {
    const records: EvidenceRecord[] = [{
      id: "EV-T1", type: "case_facts", tier: "public", project_ref: "PRJ-903", title: "Example Tower facts", issuer: null, issued_at: null,
      expires_at: null, permitted_uses: [], status: "approved",
      facts: [{ id: "floors", kind: "figure", name: "floors", value: 13, unit: "floor", label: "13 floors" }],
    }];
    const sample: SampleFn = async (input) => {
      if (input.includes("list every claim")) return { text: '{"claims":[]}', truncated: false };
      return { text: JSON.stringify({
        title_en: "Example Tower", title_ar: "برج المثال",
        sentences: [
          { lang: "en", text: "Qottuf Aljazeera fitted out Example Tower, a 13-floor building.", fact_ids: ["EV-T1#floors"] },
          { lang: "ar", text: "نفّذت قطوف الجزيرة تشطيبات برج المثال المكوّن من ١٣ طابقاً.", fact_ids: ["EV-T1#floors"] },
        ],
        declared_claims: [{ value: 13, unit: "floor", fact_id: "EV-T1#floors" }],
      }), truncated: false };
    };
    const model = new SampleModelClient(sample);
    const steps: string[] = [];
    const env: WorkflowEnv = {
      brand, rulesVersion: "test", people: [], publicNumbers: [],
      callAgent: (_a, _p, fn) => fn(model),
      step: (s) => { steps.push(`${s.step}:${s.outcome}`); },
    };
    const r = await caseStudyWorkflow(env, { project_ref: "PRJ-903", audience: "public" }, records);
    expect(r.status).toBe("succeeded");
    expect(r.artifact!.gateReport.passed).toBe(true);
    expect(steps).toEqual(["gates round 1:ok"]);
  });
});

describe("the console's pipeline rules", () => {
  const now = new Date("2026-11-22T09:00:00+03:00");
  const ctx = { now, by: "u_asil", rulesVersion: "t" };
  const step = { action: "Screen it", owner: "bid_coordinator", due_at: "2026-11-23T09:00:00+03:00" };
  const tender = (lo: number, hi: number): ConsoleOpp => newOpportunity({
    id: "OPP-T", motion: "contracting", title: "Example tender", route: "invited_private", qottuf_role: "main_contractor", sector: "education",
    service_lines: ["fit_out"], stage: "invitation", owner: "asil", next_step: step, value_min_sar: lo, value_max_sar: hi,
    dates: { submission_deadline: "2026-12-20T12:00:00+03:00" },
  }, ctx);

  it("needs a next step, screens against the band, and lets only the owner decide", () => {
    expect(() => newOpportunity({ id: "x", motion: "contracting", title: "t", route: "invited_private", qottuf_role: "main_contractor", stage: "invitation", owner: "asil", next_step: null }, ctx)).toThrow(RuleError);
    const below = screenOpportunity(tender(9_000_000, 11_000_000), { now, by: "u", rules, evidence: [] });
    expect(below.screening!.knockouts.find((k) => k.code === "K-BAND")!.status).toBe("fail");
    expect(() => decideBid(below, { decision: "no_bid", reason: "below band" }, { now, by: "u2", isOwner: false, rules })).toThrow(/Only Asil/);
    expect(() => decideBid(below, { decision: "go", reason: "strategic", nextStep: step }, { now, by: "u", isOwner: true, rules })).toThrow(/reason for overriding/);
    const go = decideBid(below, { decision: "go", reason: "strategic", override: "door-opener", nextStep: step }, { now, by: "u", isOwner: true, rules });
    expect(go.stage).toBe("go");
    expect(go.history.map((h) => h.event)).toEqual(["created", "screened", "override", "decision"]);
  });

  it("needs a loss reason from the list and refuses to skip the gate", () => {
    const o = tender(40_000_000, 50_000_000);
    expect(() => moveOpportunity(o, "go", { nextStep: step }, ctx)).toThrow(/own steps/);
    const screened = screenOpportunity(o, { now, by: "u", rules, evidence: [] });
    const go = decideBid(screened, { decision: "go", reason: "fit", nextStep: step }, { now, by: "u", isOwner: true, rules });
    const sub = moveOpportunity(go, "submitted", { nextStep: step }, ctx);
    expect(() => moveOpportunity(sub, "lost", { outcome: { primary_reason: "bad luck" } }, ctx)).toThrow(/reason from the list/);
    expect(moveOpportunity(sub, "lost", { outcome: { primary_reason: "price" } }, ctx).outcome).toMatchObject({ result: "lost", primary_reason: "price" });
  });

  it("finds renewal candidates only for consenting owners with nothing open", () => {
    const unit = { id: "UNIT-1", site: "Example lift", owner_account_id: null, model: null, manufacturer: null, origin_document: null,
      handed_over_at: null, warranty_ends_at: "2026-12-20", maintenance_contract: null, next_inspection_due: null, next_registration_due: null,
      status: "active" as const, source: "installed" as const, owner_consent_at: "2026-11-01", maintenance_offer: "offered" as const,
      installed_from_opportunity: null, modernisation_candidate: false };
    expect(renewalCandidates([unit], [], "2026-11-22", 60)).toHaveLength(1);
    expect(renewalCandidates([{ ...unit, owner_consent_at: null }], [], "2026-11-22", 60)).toHaveLength(0);
  });
});

describe("the built bundle", () => {
  it("loads in a bare browser-like context with no Node features", () => {
    const file = path.join(here, "../console/qottuf-console.js");
    const code = readFileSync(file, "utf-8");
    const context: Record<string, unknown> = { console, TextEncoder, TextDecoder, URL, crypto: globalThis.crypto };
    context.window = context;
    context.globalThis = context;
    vm.runInNewContext(code, context);
    const api = context.QottufConsole as Record<string, unknown>;
    for (const name of ["caseStudyWorkflow", "meetingBriefWorkflow", "bilingualWorkflow", "SampleModelClient", "runTextGates", "screenOpportunity", "auditHtml"]) {
      expect(typeof api[name], name).toBe("function");
    }
  });
});
