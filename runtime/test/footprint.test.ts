import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listQueue } from "../src/approvals/queue.ts";
import type { DnsResolver } from "../src/deliverability/mailDomain.ts";
import { enqueue, runAll, type DispatcherDeps } from "../src/dispatcher/dispatcher.ts";
import { approveEntityVersion, listingsReport, type EntityFields } from "../src/entity/entity.ts";
import type { BrandRules } from "../src/gates/brand.ts";
import { recordOwnerConsent, registerUnit } from "../src/installedBase/registry.ts";
import { createAccount } from "../src/ledger/repo.ts";
import { buildBoardPack } from "../src/reporting/boardPack.ts";
import { fixtureRules } from "./helpers.ts";
import { testEnv, type TestEnv } from "./setup.ts";

let env: TestEnv;
let brand: BrandRules;
let deps: DispatcherDeps;
const master: EntityFields = {
  legal_name_en: "Qottuf Aljazeera Company L.L.C.", legal_name_ar: "شركة قطوف الجزيرة", trading_name_en: "Qottuf Aljazeera",
  trading_name_ar: "قطوف الجزيرة", cr_number: "1010000000", phone_main: "+966 11 000 0000", email_main: "info@example.com", website: "https://www.example.com",
};
const dns: DnsResolver = {
  txt: async (name) => (name === "example.com" ? [["v=spf1 include:_spf.mail.example ~all"]] : []),
  mx: async () => [{ exchange: "mx.mail.example", priority: 10 }],
};

beforeAll(async () => {
  env = await testEnv("2026-11-22T09:00:00+03:00");
  brand = await fixtureRules();
  deps = { db: env.db, rules: env.rules, brand, model: null, now: env.now, dns };
  await approveEntityVersion(env.db, env.rules, brand, { fields: master }, "asil");
});
afterAll(async () => env.db.close());

describe("code-only pipelines for the public footprint and after-sales", () => {
  it("checks the website, records what it shows as a listing, and compares it with the master record", async () => {
    const html = `<html lang="en"><head><title>Qottuf Aljazeera</title><meta name="viewport" content="w"></head>
      <body><p>With 13+ years of experience.</p><a href="tel:0119999999">Call</a><a href="mailto:info@example.com">Mail</a></body></html>`;
    await enqueue(env.db, { artifactType: "site_check", createdBy: "asil", input: { pages: [{ url: "https://www.example.com/", html }] } });
    const [r] = await runAll(deps);
    expect(r!.status).toBe("succeeded");
    expect(r!.note).toContain("of 4 items of the G0 bar met");
    const report = (await listQueue(env.db)).find((q) => q.artifact_type === "site_check")!;
    expect(report.rendered_en).toContain("Working contacts: NO");
    expect(report.rendered_en).toContain("red_flag.years");
    const site = (await listingsReport(env.db, brand, env.clock.at, 90)).find((l) => l.platform === "website")!;
    expect(site.findings.find((f) => f.field === "phone_main")).toMatchObject({ status: "mismatch", severity: "fail" });
  });

  it("checks the mail domain the quotes are sent from", async () => {
    await enqueue(env.db, { artifactType: "mail_domain_check", createdBy: "asil", input: { domain: "example.com" } });
    const [r] = await runAll(deps);
    expect(r!.note).toContain("can be spoofed");
    const report = (await listQueue(env.db)).find((q) => q.artifact_type === "mail_domain_check")!;
    expect(report.rendered_en).toContain("Verdict: UNPROTECTED");
  });

  it("turns due maintenance into renewal opportunities, and the board pack shows all of it", async () => {
    const owner = await createAccount(env.db, { name_en: "Example Clinic (fictional)", type: "corporate", relationship_owner: "desk_lead" }, "asil");
    const unit = await registerUnit(env.db, env.rules, { site: "Example Clinic, lift 1", owner_account_id: owner, source: "maintained",
      next_inspection_due: "2026-12-01", next_registration_due: "2027-06-01" }, "desk_lead");
    await env.db.query("UPDATE installed_units SET maintenance_contract = $2 WHERE id = $1",
      [unit, JSON.stringify({ contract_ref: "MC-9", tier: "standard", starts_at: "2025-12-31", ends_at: "2026-12-31" })]);
    await recordOwnerConsent(env.db, env.rules, unit, "2026-11-01", "desk_lead");
    await enqueue(env.db, { artifactType: "maintenance_renewals", createdBy: "system", input: {} });
    const [r] = await runAll(deps);
    expect(r!.note).toMatch(/1 renewal opportunity created: OPP-2026-\d+/);
    const pack = await buildBoardPack({ db: env.db, rules: env.rules, now: env.now, brand });
    expect(pack).toContain("## 6. Installed base and maintenance");
    expect(pack).toMatch(/inspection due 2026-12-01 \(9 days\)/);
    expect(pack).toContain("## 7. Public footprint");
    expect(pack).toContain("Master company record: version 1");
    expect(pack).toMatch(/website .* 1 field\(s\) differ/);
    expect(pack).toContain("Mail domain example.com: UNPROTECTED");
  });
});
