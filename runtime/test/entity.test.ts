import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addListing, approveEntityVersion, compareToEntity, currentEntity, listingsReport, phoneKey, recordObservation, type EntityFields,
} from "../src/entity/entity.ts";
import type { BrandRules } from "../src/gates/brand.ts";
import { GateError } from "../src/ledger/repo.ts";
import { fixtureRules } from "./helpers.ts";
import { testEnv, type TestEnv } from "./setup.ts";

let env: TestEnv;
let brand: BrandRules;
// Fictional values in the real format.
const master: EntityFields = {
  legal_name_en: "Qottuf Aljazeera Company L.L.C.", legal_name_ar: "شركة قطوف الجزيرة", trading_name_en: "Qottuf Aljazeera",
  trading_name_ar: "قطوف الجزيرة", cr_number: "1010000000", phone_main: "+966 11 000 0000", email_main: "info@example.com",
  website: "https://www.example.com", address_en: "King Fahd Road, Riyadh", po_box: "1234",
};

beforeAll(async () => {
  env = await testEnv();
  brand = await fixtureRules();
});
afterAll(async () => env.db.close());

describe("the master company record", () => {
  it("is approved only by Asil and must agree with the brand rulebook", async () => {
    await expect(approveEntityVersion(env.db, env.rules, brand, { fields: master }, "bid_coordinator")).rejects.toThrow(GateError);
    await expect(approveEntityVersion(env.db, env.rules, brand, { fields: { ...master, trading_name_en: "Qottuf Al Jazeera" } }, "asil")).rejects.toThrow(/rulebook/);
    await expect(approveEntityVersion(env.db, env.rules, brand, { fields: { ...master, cr_number: "123" } }, "asil")).rejects.toThrow(/ten digits/);
    const v = await approveEntityVersion(env.db, env.rules, brand, { fields: master, sources: { cr_number: "EV-0001" }, note: "first version" }, "asil");
    expect((await currentEntity(env.db))).toMatchObject({ version: v, approved_by: "asil", sources: { cr_number: "EV-0001" } });
    await expect(env.db.query("UPDATE entity_versions SET approved_by = 'x'")).rejects.toThrow(/append-only/);
  });
});

describe("comparing listings", () => {
  it("treats every written form of the same phone number as equal", () => {
    expect(phoneKey("+966 11 000 0000")).toBe(phoneKey("011-000-0000"));
    expect(phoneKey("٠١١٠٠٠٠٠٠٠")).toBe("110000000");
  });

  it("matches what is the same, and fails what differs or uses a retired spelling", () => {
    const f = compareToEntity(master, {
      trading_name_en: "Qottuf Al Jazeera", phone_main: "0110000000", email_main: "INFO@example.com", website: "example.com/",
      cr_number: "1010000001", address_en: "Olaya Street, Riyadh",
    }, brand);
    const by = (field: string) => f.filter((x) => x.field === field).map((x) => `${x.status}:${x.severity}`);
    expect(by("phone_main")).toEqual(["match:ok"]);
    expect(by("email_main")).toEqual(["match:ok"]);
    expect(by("website")).toEqual(["match:ok"]);
    expect(by("cr_number")).toEqual(["mismatch:fail"]);
    expect(by("address_en")).toEqual(["mismatch:signal"]);
    expect(by("trading_name_en")).toEqual(["mismatch:fail"]);
    expect(by("name")).toEqual(["forbidden_name:fail"]);
  });

  it("reports each listing's latest observation and flags listings nobody has checked recently", async () => {
    const gbp = await addListing(env.db, { platform: "google_business_profile", url: "https://maps.example/qottuf", owner: "asil" }, "asil");
    const li = await addListing(env.db, { platform: "linkedin", url: "https://linkedin.example/company/qottuf", owner: "asil" }, "asil");
    expect(await addListing(env.db, { platform: "linkedin", url: "https://linkedin.example/company/qottuf", owner: "asil" }, "asil")).toBe(li);
    await recordObservation(env.db, gbp, { phone_main: "011 999 9999" }, "asil");
    await recordObservation(env.db, gbp, { phone_main: "011 000 0000", trading_name_en: "Qottuf Aljazeera" }, "asil");
    const report = await listingsReport(env.db, brand, env.clock.at, env.rules.maintenance.listing_recheck_days);
    const g = report.find((r) => r.id === gbp)!;
    expect(g.stale).toBe(false);
    expect(g.findings.every((x) => x.severity === "ok")).toBe(true); // the latest observation wins
    expect(report.find((r) => r.id === li)!.stale).toBe(true); // never observed
  });
});
