import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addYears, dueItems, generateRenewals, getUnit, listUnits, recordInspection, recordMaintenanceOffer, recordOwnerConsent,
  registerUnit, registryGaps, setMaintenanceContract,
} from "../src/installedBase/registry.ts";
import { createAccount, GateError } from "../src/ledger/repo.ts";
import { createOpportunity, transition, type EngineDeps } from "../src/pipeline/engine.ts";
import { inHours, testEnv, type TestEnv } from "./setup.ts";

let env: TestEnv;
let deps: EngineDeps;
let owner: string;

beforeAll(async () => {
  env = await testEnv("2026-11-22T09:00:00+03:00");
  deps = { db: env.db, rules: env.rules, now: env.now };
  owner = await createAccount(env.db, { name_en: "Example Villa Owner (fictional)", type: "other", relationship_owner: "desk_lead" }, "asil");
});
afterAll(async () => env.db.close());

async function wonLiftSale(title: string): Promise<string> {
  const step = (a: string) => ({ action: a, owner: "desk_lead", due_at: inHours(env, 24) });
  const id = await createOpportunity(deps, { motion: "elevator", title, account_id: owner, route: "inbound_elevator", qottuf_role: "supplier_installer", stage: "new", owner: "desk_lead", next_step: step("First call") }, "system");
  await transition(deps, id, "contacted", { actor: "desk_lead", nextStep: step("Verify needs") });
  await transition(deps, id, "verified", { actor: "desk_lead", nextStep: step("Budget quote") });
  await transition(deps, id, "quoted", { actor: "desk_lead", nextStep: step("Follow up") });
  await transition(deps, id, "won", { actor: "desk_lead", outcome: { value_sar: 185_000 } });
  return id;
}

describe("dates", () => {
  it("adds years, handling 29 February", () => {
    expect(addYears("2026-03-15", 1)).toBe("2027-03-15");
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
  });
});

describe("registering lifts", () => {
  it("accepts a unit from a won elevator sale and refuses one from an open sale", async () => {
    const sale = await wonLiftSale("Villa lift, fictional");
    const id = await registerUnit(env.db, env.rules, {
      site: "Villa, Al Malqa (fictional)", owner_account_id: owner, source: "installed", installed_from_opportunity: sale,
      handed_over_at: "2025-12-20", warranty_ends_at: "2026-12-20", next_inspection_due: "2026-12-10", next_registration_due: "2027-03-01",
    }, "desk_lead");
    expect((await getUnit(env.db, id)).maintenance_offer).toBe("not_offered");
    const open = await createOpportunity(deps, { motion: "elevator", title: "Open lead", route: "inbound_elevator", qottuf_role: "supplier_installer", stage: "new", owner: "desk_lead", next_step: { action: "First call", owner: "desk_lead", due_at: inHours(env, 4) } }, "system");
    await expect(registerUnit(env.db, env.rules, { site: "Somewhere (fictional)", installed_from_opportunity: open }, "desk_lead")).rejects.toThrow(/not a won elevator sale/);
    await expect(registerUnit(env.db, env.rules, { site: "Somewhere (fictional)" }, "bid_coordinator")).rejects.toThrow(GateError);
  });

  it("keeps calendar dates exact (no timezone shift)", async () => {
    const u = (await listUnits(env.db))[0]!;
    expect(u.warranty_ends_at).toBe("2026-12-20");
    expect(u.next_inspection_due).toBe("2026-12-10");
  });
});

describe("what is due, and the gaps", () => {
  it("lists the warranty end, inspection and registration inside the window", async () => {
    const units = await listUnits(env.db);
    const due = dueItems(units, "2026-11-22", 60);
    expect(due.map((d) => d.kind)).toEqual(["inspection", "warranty_end"]);
    expect(due[0]).toMatchObject({ days: 18, overdue: false, contactable: false });
  });

  it("names every gap: no maintenance offer, no certificate of origin, no consent, an unregistered sale", async () => {
    await wonLiftSale("Second villa lift, fictional (not registered)");
    const kinds = (await registryGaps(env.db)).map((g) => g.kind).sort();
    expect(kinds).toEqual(["no_maintenance_offer", "no_origin_document", "no_owner_consent", "won_without_unit"]);
  });
});

describe("renewals become pipeline opportunities", () => {
  it("only with the owner's consent, once per unit", async () => {
    const unit = (await listUnits(env.db))[0]!;
    expect(await generateRenewals(deps)).toEqual([]); // no consent yet
    await recordOwnerConsent(env.db, env.rules, unit.id, "2026-11-20", "desk_lead");
    const [opp] = await generateRenewals(deps);
    expect(opp).toBeDefined();
    const row = (await env.db.query<{ route: string; installed_unit_id: string; next_step: { action: string } }>(
      "SELECT route, installed_unit_id, next_step FROM opportunities WHERE id = $1", [opp])).rows[0]!;
    expect(row).toMatchObject({ route: "maintenance_renewal", installed_unit_id: unit.id });
    expect(row.next_step.action).toContain("before the warranty ends on 2026-12-20");
    expect(await generateRenewals(deps)).toEqual([]); // idempotent
  });

  it("moves to the contract end once maintenance is sold, and rolls inspections forward a year", async () => {
    const unit = (await listUnits(env.db))[0]!;
    await recordMaintenanceOffer(env.db, env.rules, unit.id, "offered", "desk_lead");
    await setMaintenanceContract(env.db, env.rules, unit.id, { contract_ref: "MC-001", tier: "standard", starts_at: "2026-12-21", ends_at: "2027-12-20" }, "desk_lead");
    await recordInspection(env.db, env.rules, unit.id, "2026-12-08", "maintenance_supervisor");
    const after = await getUnit(env.db, unit.id);
    expect(after).toMatchObject({ maintenance_offer: "accepted", next_inspection_due: "2027-12-08" });
    expect(dueItems([after], "2026-11-22", 60)).toEqual([]);
    const events = (await env.db.query<{ event: string }>("SELECT event FROM installed_unit_events WHERE unit_id = $1 ORDER BY id", [unit.id])).rows.map((r) => r.event);
    expect(events).toEqual(["registered", "owner_consent", "maintenance_offer", "maintenance_contract", "inspection"]);
  });
});
