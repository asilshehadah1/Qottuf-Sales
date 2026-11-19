import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyAuditChain } from "../src/audit/audit.ts";
import { GateError } from "../src/ledger/repo.ts";
import {
  createOpportunity, decideBid, EngineError, getOpportunity, pipelineAlerts, screen, setNextStep, transition,
  type EngineDeps, type OpportunityCreate,
} from "../src/pipeline/engine.ts";
import { approvedEvidence, documentedProject, inHours, testEnv, type TestEnv } from "./setup.ts";

let env: TestEnv;
let deps: EngineDeps;

beforeAll(async () => {
  env = await testEnv();
  deps = { db: env.db, rules: env.rules, now: env.now };
  await documentedProject(env, "PRJ-901", 38_000_000, "2022-06");
  await documentedProject(env, "PRJ-902", 26_000_000, "2023-02");
  await approvedEvidence(env, { type: "certificate", tier: "tender", title: "Commercial Registration", expires_at: "2027-08-01", permitted_uses: ["certificate:CR"] });
  await approvedEvidence(env, { type: "certificate", tier: "tender", title: "Zakat certificate", expires_at: "2026-12-01", permitted_uses: ["certificate:Zakat"] });
});
afterAll(async () => env.db.close());

const tender = (over: Partial<OpportunityCreate> = {}): OpportunityCreate => ({
  motion: "contracting",
  title: "University teaching building (fictional)",
  route: "invited_private",
  qottuf_role: "main_contractor",
  sector: "education",
  service_lines: ["fit_out", "mep"],
  stage: "invitation",
  owner: "asil",
  next_step: { action: "Read the tender and screen it", owner: "bid_coordinator", due_at: inHours(env, 24) },
  value_min_sar: 40_000_000,
  value_max_sar: 50_000_000,
  value_source: "estimate",
  dates: { submission_deadline: "2026-12-20T12:00:00+03:00" },
  requirements: {
    certificates: ["CR"],
    references: { min_count: 2, min_value_sar: 20_000_000, within_years: 7 },
    guarantee_capacity_confirmed: true,
    payer_band: "A",
  },
  ...over,
});

describe("next-step rule (principle 11)", () => {
  it("refuses an open opportunity without a next step", async () => {
    await expect(createOpportunity(deps, { ...tender(), next_step: undefined as never }, "asil")).rejects.toThrow(EngineError);
  });

  it("refuses a next step dated in the past", async () => {
    const id = await createOpportunity(deps, tender(), "asil");
    await expect(setNextStep(deps, id, { action: "Call the PMC", owner: "asil", due_at: inHours(env, -48) }, "asil")).rejects.toThrow(/past/);
  });
});

describe("screening and the knock-outs", () => {
  it("passes an in-band main contract with documented references", async () => {
    const id = await createOpportunity(deps, tender(), "asil");
    const s = await screen(deps, id, { actor: "bid_coordinator" });
    expect(s.overall).toBe("pass");
    expect(s.knockouts.find((k) => k.code === "K-REF")!.detail).toContain("PRJ-901");
    const opp = await getOpportunity(env.db, id);
    expect(opp.stage).toBe("screened");
    expect(opp.next_step).toMatchObject({ action: "Bid decision (gate S-G1)", owner: "asil" });
    expect(new Date(opp.dates.bid_decision_due!).getTime() - env.clock.at.getTime()).toBe(48 * 3_600_000);
  });

  it("fails below the band, above the band, and a subcontract", async () => {
    const below = await createOpportunity(deps, tender({ value_min_sar: 12_000_000, value_max_sar: 12_000_000 }), "asil");
    const above = await createOpportunity(deps, tender({ value_min_sar: 140_000_000, value_max_sar: 160_000_000 }), "asil");
    const sub = await createOpportunity(deps, tender({ qottuf_role: "subcontractor" }), "asil");
    expect((await screen(deps, below, { actor: "bid_coordinator" })).knockouts.find((k) => k.code === "K-BAND")!.status).toBe("fail");
    expect((await screen(deps, above, { actor: "bid_coordinator" })).knockouts.find((k) => k.code === "K-BAND")!.detail).toContain("Above the band");
    expect((await screen(deps, sub, { actor: "bid_coordinator" })).knockouts.find((k) => k.code === "K-ROLE")!.status).toBe("fail");
  });

  it("says verify, not fail, when the value is unknown", async () => {
    const id = await createOpportunity(deps, tender({ value_min_sar: undefined, value_max_sar: undefined }), "asil");
    const s = await screen(deps, id, { actor: "bid_coordinator" });
    expect(s.knockouts.find((k) => k.code === "K-BAND")!.status).toBe("verify");
    expect(s.overall).toBe("verify");
  });

  it("fails a certificate that expires before the deadline", async () => {
    const id = await createOpportunity(deps, tender({ requirements: { ...tender().requirements, certificates: ["CR", "Zakat"] } }), "asil");
    const k3 = (await screen(deps, id, { actor: "bid_coordinator" })).knockouts.find((k) => k.code === "K3")!;
    expect(k3).toMatchObject({ status: "fail" });
    expect(k3.detail).toContain("Zakat");
  });

  it("fails references when too few documented projects reach the value", async () => {
    const id = await createOpportunity(deps, tender({ requirements: { ...tender().requirements, references: { min_count: 2, min_value_sar: 30_000_000, within_years: 7 } } }), "asil");
    expect((await screen(deps, id, { actor: "bid_coordinator" })).knockouts.find((k) => k.code === "K-REF")!.status).toBe("fail");
  });
});

describe("the bid gate S-G1", () => {
  it("lets only Asil decide, and needs a reason", async () => {
    const id = await createOpportunity(deps, tender(), "asil");
    await screen(deps, id, { actor: "bid_coordinator" });
    await expect(decideBid(deps, id, { actor: "bid_coordinator", decision: "go", reason: "fits" })).rejects.toThrow(GateError);
    await expect(decideBid(deps, id, { actor: "asil", decision: "go", reason: " " })).rejects.toThrow(/reason/);
  });

  it("records the score, the decision and the rules version", async () => {
    const id = await createOpportunity(deps, tender(), "asil");
    await screen(deps, id, { actor: "bid_coordinator" });
    const s = await decideBid(deps, id, {
      actor: "asil", decision: "go", reason: "Strong fit and access",
      scores: {
        fit: { score: 3, evidence: ["PRJ-901"] }, relationship: { score: 2, evidence: ["meeting 2026-11-10"] },
        shaping: { score: 1 }, competition: { score: 2 }, // a 2 without evidence counts as 1
        price_position: null, // no price-to-win data yet: excluded, scorecard partial
        evaluation_fit: { score: 2, evidence: ["weighted 70/30"] }, margin_risk: { score: 2, evidence: ["draft terms"] },
        payer: { score: 3, evidence: ["finance band A"] }, strategic: { score: 2, evidence: ["new university client"] },
        capacity: { score: 2, evidence: ["roster"] },
      },
      nextStep: { action: "Kick-off: compliance matrix", owner: "bid_coordinator", due_at: inHours(env, 24) },
    });
    expect(s.score).toMatchObject({ partial: true, excluded: ["price_position"] });
    expect(s.score!.warnings[0]).toContain("Competitive position");
    // 100 × (15 + 10 + 10/3 + 10/3 + 10/3 + 20/3 + 10 + 20/3 + 10/3) ÷ 90 = 68.5 → 69
    expect(s.score!.score).toBe(69);
    expect(s.score!.recommendation).toBe("go");
    const ev = (await env.db.query<{ event: string; rules_version: string }>(
      "SELECT event, rules_version FROM opportunity_events WHERE opportunity_id = $1 ORDER BY id", [id])).rows;
    expect(ev.map((e) => e.event)).toEqual(["created", "transition", "decision", "transition"]);
    expect(ev.every((e) => e.rules_version === env.rules.rulesVersion)).toBe(true);
  });

  it("needs an explicit override to bid despite a failed knock-out, and logs it", async () => {
    const id = await createOpportunity(deps, tender({ value_min_sar: 12_000_000, value_max_sar: 12_000_000 }), "asil");
    await screen(deps, id, { actor: "bid_coordinator" });
    const next = { action: "Compliance matrix", owner: "bid_coordinator", due_at: inHours(env, 24) };
    await expect(decideBid(deps, id, { actor: "asil", decision: "go", reason: "strategic client", nextStep: next })).rejects.toThrow(/knock-out failed/);
    await decideBid(deps, id, { actor: "asil", decision: "go", reason: "strategic client", override: "Door-opener with a priority account", nextStep: next });
    const kinds = (await env.db.query<{ event: string }>("SELECT event FROM opportunity_events WHERE opportunity_id = $1", [id])).rows.map((r) => r.event);
    expect(kinds).toContain("override");
  });
});

describe("closing an opportunity", () => {
  it("needs an enumerated loss reason", async () => {
    const id = await createOpportunity(deps, tender(), "asil");
    await screen(deps, id, { actor: "bid_coordinator" });
    await decideBid(deps, id, { actor: "asil", decision: "go", reason: "fit", nextStep: { action: "Prepare bid", owner: "bid_coordinator", due_at: inHours(env, 24) } });
    await transition(deps, id, "submitted", { actor: "bid_coordinator", nextStep: { action: "Chase the result", owner: "asil", due_at: inHours(env, 240) } });
    await expect(transition(deps, id, "lost", { actor: "asil", outcome: { primary_reason: "they liked someone else" } })).rejects.toThrow(/taxonomy/);
    await transition(deps, id, "lost", { actor: "asil", outcome: { primary_reason: "price", winner: "Competitor A" } });
    expect((await getOpportunity(env.db, id)).outcome).toMatchObject({ result: "lost", primary_reason: "price" });
  });

  it("refuses moves that skip the gate or break the stage rules", async () => {
    const id = await createOpportunity(deps, tender(), "asil");
    await expect(transition(deps, id, "go", { actor: "asil", nextStep: { action: "x x x", owner: "asil", due_at: inHours(env, 1) } })).rejects.toThrow(/S-G1/);
    await expect(transition(deps, id, "won", { actor: "asil", outcome: { value_sar: 1 } })).rejects.toThrow(/not allowed/);
  });
});

describe("alerts", () => {
  it("raises overdue bid decisions after 48 hours, and elevator first contact after 24", async () => {
    const id = await createOpportunity(deps, tender(), "asil");
    await screen(deps, id, { actor: "bid_coordinator" });
    const lift = await createOpportunity(deps, {
      motion: "elevator", title: "Villa lift enquiry (fictional)", route: "inbound_elevator", qottuf_role: "supplier_installer",
      stage: "new", owner: "desk_lead", next_step: { action: "First call", owner: "desk_lead", due_at: inHours(env, 2) },
    }, "system");
    env.clock.at = new Date(env.clock.at.getTime() + 49 * 3_600_000);
    const alerts = await pipelineAlerts(deps);
    expect(alerts.some((a) => a.opportunityId === id && a.kind === "bid_decision_overdue")).toBe(true);
    expect(alerts.some((a) => a.opportunityId === lift && a.kind === "first_contact_overdue")).toBe(true);
    expect(alerts.some((a) => a.opportunityId === lift && a.kind === "next_step_overdue")).toBe(true);
  });
});

describe("audit", () => {
  it("keeps an intact hash chain", async () => {
    expect(await verifyAuditChain(env.db)).toBeNull();
  });
});
