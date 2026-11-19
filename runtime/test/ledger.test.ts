import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { projectProof } from "../src/ledger/proof.ts";
import {
  consentStatus, createAccount, createContact, fileEvidence, GateError, readEvidence, recordConsent,
  releaseConfidential, approveEvidence,
} from "../src/ledger/repo.ts";
import { approvedEvidence, documentedProject, testEnv, type TestEnv } from "./setup.ts";

let env: TestEnv;
beforeAll(async () => {
  env = await testEnv();
});
afterAll(async () => env.db.close());

describe("evidence tiers (enforced by the database)", () => {
  it("shows a reader only the tiers it may see, and confidential rows only after Asil releases them", async () => {
    await approvedEvidence(env, { type: "case_facts", tier: "public", title: "Public fact" });
    await approvedEvidence(env, { type: "reference_letter", tier: "tender", title: "Reference letter" });
    const fs = await approvedEvidence(env, { type: "financial_statement", tier: "confidential", title: "Audited statements 2025" });
    await approvedEvidence(env, { type: "cost_record", tier: "internal", title: "Margin analysis" });

    const tierOf = async (maxTier: "public" | "tender" | "confidential" | "internal") =>
      (await readEvidence(env.db, { maxTier, readBy: "test", purpose: "test" })).map((e) => e.tier).sort();

    expect(await tierOf("public")).toEqual(["public"]);
    expect(await tierOf("tender")).toEqual(["public", "tender"]);
    expect(await tierOf("confidential")).toEqual(["public", "tender"]); // not released yet
    await expect(releaseConfidential(env.db, fs, "Prequalification pack for a priority account", "bid_coordinator", env.rules)).rejects.toThrow(GateError);
    await releaseConfidential(env.db, fs, "Prequalification pack for a priority account", "asil", env.rules);
    expect(await tierOf("confidential")).toEqual(["confidential", "public", "tender"]);
    expect(await tierOf("internal")).toEqual(["confidential", "internal", "public", "tender"]);

    const log = (await env.db.query<{ tier: string }>("SELECT tier FROM evidence_read_log ORDER BY id")).rows.map((r) => r.tier);
    expect(log).toEqual(["confidential", "confidential", "internal"]);
  });

  it("uses only approved, unexpired evidence by default", async () => {
    await fileEvidence(env.db, { type: "certificate", tier: "tender", title: "Draft GOSI certificate", created_by: "bid_coordinator" });
    await approvedEvidence(env, { type: "certificate", tier: "tender", title: "Expired chamber certificate", expires_at: "2025-01-01" });
    const titles = (await readEvidence(env.db, { maxTier: "tender", readBy: "test", purpose: "test" })).map((e) => e.title);
    expect(titles).not.toContain("Draft GOSI certificate");
    expect(titles).not.toContain("Expired chamber certificate");
  });

  it("refuses to change an approved record; corrections are a new record", async () => {
    const id = await approvedEvidence(env, { type: "case_facts", tier: "public", title: "Fixed fact" });
    await expect(env.db.query("UPDATE evidence_records SET title = 'edited' WHERE id = $1", [id])).rejects.toThrow(/immutable/);
    await expect(approveEvidence(env.db, id, "desk_lead", env.rules)).rejects.toThrow(GateError);
  });
});

describe("proof", () => {
  it("counts a project as documented only with contract value, dates and a completion certificate", async () => {
    await documentedProject(env, "PRJ-911", 31_000_000, "2021-09");
    await documentedProject(env, "PRJ-912", 24_000_000, "2022-12", false);
    await approvedEvidence(env, { type: "contract", tier: "tender", project_ref: "PRJ-913", title: "Contract without a certificate",
      facts: [{ id: "v", kind: "figure", name: "contract_value", value: 50_000_000, unit: "sar", label: "Contract value PRJ-913" }] });
    const proofs = projectProof(await readEvidence(env.db, { maxTier: "tender", readBy: "test", purpose: "proof" }), env.rules);
    const by = Object.fromEntries(proofs.map((p) => [p.projectRef, p]));
    expect(by["PRJ-911"]).toMatchObject({ documented: true, referenceReady: true });
    expect(by["PRJ-912"]).toMatchObject({ documented: true, referenceReady: false });
    expect(by["PRJ-913"]!.documented).toBe(false);
    expect(by["PRJ-913"]!.missing).toEqual(expect.arrayContaining(["completion certificate", "start date", "completion date"]));
  });
});

describe("consent log", () => {
  it("is append-only and the latest event decides", async () => {
    const acc = await createAccount(env.db, { name_en: "Example Developer (fictional)", type: "developer", relationship_owner: "asil" }, "asil");
    const cnt = await createContact(env.db, { account_id: acc, full_name_en: "Example Person" }, "asil");
    expect((await consentStatus(env.db, cnt, "email", "one_to_one")).granted).toBe(false);
    const base = { contact_id: cnt, channel: "email" as const, scope: "one_to_one" as const, wording_version: "v1", source: "meeting", recorded_by: "asil" };
    await recordConsent(env.db, { ...base, action: "grant" });
    expect((await consentStatus(env.db, cnt, "email", "one_to_one")).granted).toBe(true);
    await recordConsent(env.db, { ...base, action: "withdraw" });
    expect((await consentStatus(env.db, cnt, "email", "one_to_one")).granted).toBe(false);
    await expect(env.db.query("DELETE FROM consent_events")).rejects.toThrow(/append-only/);
  });
});
