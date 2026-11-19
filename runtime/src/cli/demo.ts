// End-to-end demonstration of the Phase 1 workflow on fictional data, with no setup and no network:
// an in-memory database, the fixture rulebook, and scripted model outputs standing in for Claude.
// Run: npm run demo     (writes the artifacts to runtime/out/, which git ignores)

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decide, listQueue } from "../approvals/queue.ts";
import { loadBusinessRules } from "../config/rules.ts";
import { openEmbeddedDb } from "../db/db.ts";
import { migrate } from "../db/migrate.ts";
import { enqueue, runAll } from "../dispatcher/dispatcher.ts";
import { brandCheck } from "../gates/brand.ts";
import { loadBrandRules } from "../gates/brandLoader.ts";
import { isArabicLine, splitSentences } from "../gates/text.ts";
import { approveEvidence, createAccount, createContact, fileEvidence } from "../ledger/repo.ts";
import type { EvidenceInput } from "../ledger/schemas.ts";
import { ScriptedModelClient } from "../model/client.ts";
import { createOpportunity, decideBid, screen, transition } from "../pipeline/engine.ts";
import { buildBoardPack } from "../reporting/boardPack.ts";
import type { DnsResolver } from "../deliverability/mailDomain.ts";
import { addListing, approveEntityVersion, recordObservation } from "../entity/entity.ts";
import { recordOwnerConsent, registerUnit } from "../installedBase/registry.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const OUT = path.join(ROOT, "out");
const line = (s = "") => console.log(s);
const head = (s: string) => line(`\n=== ${s} ${"=".repeat(Math.max(0, 70 - s.length))}`);

async function main() {
  const clock = { at: new Date("2026-11-22T09:00:00+03:00") };
  const now = () => clock.at;
  const db = await openEmbeddedDb();
  await migrate(db);
  const rules = await loadBusinessRules();
  const brand = await loadBrandRules(path.join(ROOT, "test/fixtures/brand-rules.fixture.json"));
  const engine = { db, rules, now };
  const hours = (h: number) => new Date(clock.at.getTime() + h * 3_600_000).toISOString();

  head("Ledger (fictional data)");
  const evidence = async (e: Omit<EvidenceInput, "created_by">) => {
    const id = await fileEvidence(db, { ...e, created_by: "bid_coordinator" } as EvidenceInput);
    await approveEvidence(db, id, "asil", rules);
    return id;
  };
  const uni = await createAccount(db, { name_en: "Example University (fictional)", type: "university", sector: "education", relationship_owner: "asil", priority_rank: 1 }, "asil");
  const contact = await createContact(db, { account_id: uni, full_name_en: "Fahad Example", committee_role: "decision_maker" }, "asil");
  for (const [ref, value, done] of [["PRJ-901", 38_000_000, "2022-06"], ["PRJ-902", 26_000_000, "2023-02"]] as const) {
    await evidence({ type: "contract", tier: "tender", project_ref: ref, title: `Contract ${ref}`, facts: [
      { id: "value", kind: "figure", name: "contract_value", value, unit: "sar", label: "Contract value" },
      { id: "start", kind: "date", name: "start_date", value: "2019-01", label: "Start" }] });
    await evidence({ type: "completion_certificate", tier: "tender", project_ref: ref, title: `Completion certificate ${ref}`,
      facts: [{ id: "done", kind: "date", name: "completion_date", value: done, label: "Completion" }] });
  }
  await evidence({ type: "referee_consent", tier: "tender", project_ref: "PRJ-901", title: "Referee consent PRJ-901" });
  const cf = await evidence({ type: "case_facts", tier: "tender", project_ref: "PRJ-903", title: "Example Tower facts", facts: [
    { id: "floors", kind: "figure", name: "floors", value: 13, unit: "floor", label: "13 floors" },
    { id: "descriptor", kind: "statement", name: "client_descriptor", value: "a university endowment", label: "Client descriptor" }] });
  const ct = await evidence({ type: "contract", tier: "tender", project_ref: "PRJ-903", title: "Contract PRJ-903", facts: [
    { id: "value", kind: "figure", name: "contract_value", value: 31_000_000, unit: "sar", label: "Contract value" }] });
  await evidence({ type: "certificate", tier: "tender", title: "Commercial Registration", expires_at: "2027-08-01", permitted_uses: ["certificate:CR"] });
  await evidence({ type: "certificate", tier: "tender", title: "Zakat certificate", expires_at: "2026-12-12", permitted_uses: ["certificate:Zakat"] });
  line("1 priority account, 1 contact, 3 past projects (2 fully documented), 2 certificates (Zakat expires in 20 days).");

  head("Pipeline Engine: screening four invitations against the rules");
  const tender = (title: string, lo: number | undefined, hi: number | undefined) => createOpportunity(engine, {
    motion: "contracting", title, account_id: uni, route: "invited_private", qottuf_role: "main_contractor", sector: "education",
    service_lines: ["fit_out", "mep"], stage: "invitation", owner: "asil",
    next_step: { action: "Screen the invitation", owner: "bid_coordinator", due_at: hours(24) },
    ...(lo !== undefined ? { value_min_sar: lo, value_max_sar: hi } : {}), value_source: "estimate",
    dates: { submission_deadline: "2026-12-20T12:00:00+03:00" },
    requirements: { certificates: ["CR"], references: { min_count: 2, min_value_sar: 20_000_000, within_years: 7 }, guarantee_capacity_confirmed: true, payer_band: "A" },
  }, "asil");
  const ids = {
    inBand: await tender("Faculty of Engineering building", 40_000_000, 50_000_000),
    below: await tender("Cafeteria refurbishment", 9_000_000, 11_000_000),
    above: await tender("New teaching hospital", 140_000_000, 180_000_000),
    unknown: await tender("Library extension (value not published)", undefined, undefined),
  };
  for (const [name, id] of Object.entries(ids)) {
    const s = await screen(engine, id, { actor: "bid_coordinator" });
    const band = s.knockouts.find((k) => k.code === "K-BAND")!;
    line(`- ${id} ${name.padEnd(8)} knock-outs ${s.overall.toUpperCase().padEnd(6)} band: ${band.status} (${band.detail})`);
  }
  const decision = await decideBid(engine, ids.inBand, {
    actor: "asil", decision: "go", reason: "In band, documented references, priority account",
    scores: { fit: { score: 3, evidence: ["PRJ-901"] }, relationship: { score: 2, evidence: ["meeting notes"] }, shaping: { score: 1 },
      competition: { score: 2, evidence: ["invited list of 5"] }, price_position: null, evaluation_fit: { score: 2, evidence: ["70/30 weighted"] },
      margin_risk: { score: 2, evidence: ["draft terms"] }, payer: { score: 3, evidence: ["band A"] }, strategic: { score: 3, evidence: ["new faculty"] },
      capacity: { score: 2, evidence: ["roster"] } },
    nextStep: { action: "Compliance matrix and bid plan", owner: "bid_coordinator", due_at: hours(24) },
  });
  line(`Asil decided GO on ${ids.inBand}: score ${decision.score!.score} (${decision.score!.recommendation}${decision.score!.partial ? ", partial: no price-to-win data yet" : ""}).`);
  line("The other three wait in the board pack: a 48-hour timer runs on each.");

  head("Agents (scripted outputs stand in for Claude; no network)");
  const model = new ScriptedModelClient({
    case_study_writer: (_i, attempt) => ({
      title_en: "Example Tower fit-out", title_ar: "تشطيب برج المثال",
      sentences: [
        { lang: "en", text: `Qottuf Aljazeera delivered the fit-out of Example Tower, a ${attempt === 1 ? 14 : 13}-floor building for a university endowment.`, fact_ids: [`${cf}#floors`, `${cf}#descriptor`] },
        { lang: "en", text: "The contract value was SAR 31,000,000.", fact_ids: [`${ct}#value`] },
        { lang: "ar", text: "نفّذت قطوف الجزيرة أعمال تشطيب برج المثال المكوّن من ١٣ طابقاً لصالح جهة وقفية جامعية.", fact_ids: [`${cf}#floors`] },
        { lang: "ar", text: "بلغت قيمة العقد ٣١٬٠٠٠٬٠٠٠ ريال.", fact_ids: [`${ct}#value`] },
      ],
      declared_claims: [{ value: attempt === 1 ? 14 : 13, unit: "floor", fact_id: `${cf}#floors` }, { value: 31_000_000, unit: "sar", fact_id: `${ct}#value` }],
    }),
    claim_extractor: (input) => ({
      claims: splitSentences(input).filter((s) => /[0-9٠-٩]/.test(s.text)).map((s) => ({ span: s.text, lang: isArabicLine(s.text) ? "ar" : "en", kind: "number" })),
    }),
    meeting_brief: () => ({
      objective: "Get onto the Faculty of Engineering tender's site walk and learn the evaluation method.",
      context: ["Invited to tender, SAR 40–50 m; Asil decided to bid."],
      what_they_care_about: ["Working next to occupied teaching buildings."],
      proof_to_bring: [{ ref: "PRJ-901", why: "Comparable value and an education client; referee consent on file." }],
      questions_to_ask: ["Is the evaluation weighted, and what is the technical share?"],
      asks: [{ ask: "A site walk before the clarification deadline.", fallback: "Drawings of the occupied wings." }],
      risks: ["The incumbent contractor is on the list."],
      do_not_say: ["Any price, discount or programme date."],
      next_step_to_secure: { action: "Site walk", owner: "asil", due_in_days: 7 },
    }),
    bilingual_editor: (_i, attempt) => ({
      en: "Qottuf Aljazeera fitted out Example Tower, a 13-floor building for a university endowment.",
      ar: attempt === 1
        ? "نفّذت قطوف الجزيرة أعمال تشطيب برج المثال لصالح جهة وقفية جامعية."
        : "نفّذت قطوف الجزيرة أعمال تشطيب برج المثال المكوّن من ١٣ طابقاً لصالح جهة وقفية جامعية.",
      changes_to_source: ["'carried out the fit-out works of' became 'fitted out'."],
      untransferable: [],
      for_asil_to_check: ["«أعمال تشطيب» or «تشطيبات» for a consultant reader?"],
    }),
  });
  const deps = { db, rules, brand, model, now };
  await enqueue(db, { artifactType: "case_study", input: { project_ref: "PRJ-903", audience: "tender" }, createdBy: "asil" });
  await enqueue(db, { artifactType: "meeting_brief", input: { account_id: uni, opportunity_id: ids.inBand, meeting_at: "2026-11-25T10:00:00+03:00", purpose: "First meeting on the tender" }, createdBy: "asil" });
  await enqueue(db, { artifactType: "prequal_pack", input: { account_id: uni, target: "Example University contractor list" }, createdBy: "asil" });
  for (const r of await runAll(deps)) line(`- ${r.workOrderId} ${r.artifactType.padEnd(14)} ${r.status}${r.note ? `: ${r.note}` : ""}`);
  const firstRound = (await db.query<{ details: { blocking: number } }>("SELECT details FROM run_log WHERE step = 'gates round 1' LIMIT 1")).rows[0];
  line(`The case study's first draft said 14 floors; the record says 13. Gates round 1 blocked ${firstRound?.details.blocking ?? "?"} finding(s), the writer fixed it in round 2, and it passed.`);
  line(`Contact ${contact} appears to agents only as [${contact}]; the name never leaves the Ledger.`);

  head("Bilingual editor (Asil edits a near-final pair, never a blank page)");
  await enqueue(db, { artifactType: "bilingual_edit", createdBy: "asil", input: {
    source_lang: "en", audience: "client", purpose: "prequalification pack", project_ref: "PRJ-903",
    source_text: "Qottuf Aljazeera carried out the fit-out works of Example Tower, a 13-floor building for a university endowment.",
  } });
  for (const r of await runAll(deps)) line(`- ${r.workOrderId} ${r.artifactType.padEnd(14)} ${r.status}${r.note ? `: ${r.note}` : ""}`);
  line("The first Arabic draft left out the 13 floors; the parity check caught it and the revision put it back.");

  head("After-sales and public footprint (code only)");
  const sale = await createOpportunity(engine, { motion: "elevator", title: "Villa lift (fictional)", route: "inbound_elevator", qottuf_role: "supplier_installer",
    stage: "new", owner: "desk_lead", next_step: { action: "First call", owner: "desk_lead", due_at: hours(4) } }, "system");
  for (const [stage, action] of [["contacted", "Verify"], ["verified", "Budget quote"], ["quoted", "Follow up"]] as const) {
    await transition(engine, sale, stage, { actor: "desk_lead", nextStep: { action, owner: "desk_lead", due_at: hours(24) } });
  }
  await transition(engine, sale, "won", { actor: "desk_lead", outcome: { value_sar: 185_000 } });
  const lift = await registerUnit(db, rules, { site: "Villa, Al Malqa (fictional)", source: "installed", installed_from_opportunity: sale,
    handed_over_at: "2025-12-20", warranty_ends_at: "2026-12-20", next_inspection_due: "2026-12-10", origin_document: "COO-0001" }, "desk_lead");
  await recordOwnerConsent(db, rules, lift, "2026-11-15", "desk_lead");
  await approveEntityVersion(db, rules, brand, { fields: {
    legal_name_en: "Qottuf Aljazeera Company L.L.C.", legal_name_ar: "شركة قطوف الجزيرة", trading_name_en: "Qottuf Aljazeera", trading_name_ar: "قطوف الجزيرة",
    cr_number: "1010000000", phone_main: "+966 11 000 0000", email_main: "info@example.com", website: "https://www.example.com",
  }, note: "fictional demo values" }, "asil");
  const gbp = await addListing(db, { platform: "google_business_profile", url: "https://maps.example/qottuf", owner: "asil" }, "asil");
  await recordObservation(db, gbp, { trading_name_en: "Qottuf Al Jazeera", phone_main: "011 999 9999" }, "asil");
  const dns: DnsResolver = {
    txt: async (name) => (name === "example.com" ? [["v=spf1 include:_spf.mail.example ?all"]] : name === "dkim._domainkey.example.com" ? [["v=DKIM1; p=MIIB"]] : []),
    mx: async () => [{ exchange: "mx.example.com", priority: 10 }],
  };
  const page = `<html lang="en"><head><title>Qottuf Jazeera</title><meta name="viewport" content="w"></head><body>
    <p>Thirteen years of contracting.</p><a href="tel:0119999999">Call</a><form><input name="phone"><button>Send</button></form></body></html>`;
  await enqueue(db, { artifactType: "maintenance_renewals", createdBy: "system", input: {} });
  await enqueue(db, { artifactType: "site_check", createdBy: "asil", input: { pages: [{ url: "https://www.example.com/", html: page }] } });
  await enqueue(db, { artifactType: "mail_domain_check", createdBy: "asil", input: { domain: "example.com", dkim_selectors: ["dkim"] } });
  for (const r of await runAll({ ...deps, dns })) line(`- ${r.workOrderId} ${r.artifactType.padEnd(20)} ${r.status}${r.note ? `: ${r.note}` : ""}`);

  head("Approval queue (nothing leaves without Asil)");
  await mkdir(OUT, { recursive: true });
  for (const q of await listQueue(db)) {
    line(`- ${q.artifact_id} ${q.artifact_type.padEnd(14)} for ${q.audience.padEnd(8)} gates ${q.passed ? "PASSED" : "BLOCKED"}  ${q.title}`);
    const body = [q.rendered_en, q.rendered_ar].filter(Boolean).join("\n\n");
    await writeFile(path.join(OUT, `${q.artifact_id}-${q.artifact_type}.md`), body, { encoding: "utf-8" });
  }
  const cs = (await listQueue(db)).find((q) => q.artifact_type === "case_study")!;
  await decide(db, cs.artifact_id, { actor: "asil", decision: "approved", rules });
  line(`Asil approved ${cs.artifact_id}. In Phase 1 there is no send function: approved material is used by hand.`);

  head("Weekly board pack");
  const pack = await buildBoardPack({ db, rules, now, brand });
  await writeFile(path.join(OUT, "board-pack.md"), pack, { encoding: "utf-8" });
  line(pack);

  const real = process.env.QOTTUF_BRAND_RULES ?? "/root/.claude/skills/synced/74ec83fd-3864-4662-9cec-2badc84a4927_96fab72d-0fe5-4af2-bdac-85f48a1e99ca/qottuf-brand/assets/brand-rules.json";
  if (existsSync(real)) {
    head("Real brand rulebook: claims a reviewer could contradict today");
    const realRules = await loadBrandRules(real);
    for (const claim of ["13+ Years of experience", "Trusted by the Ministry of Interior", "Riyadh's leading contractor"]) {
      const fails = brandCheck(claim, realRules).filter((f) => f.severity === "fail").map((f) => f.rule);
      line(`- "${claim}": ${fails.length ? `FAIL (${fails.join(", ")})` : "passes"}`);
    }
  }

  line(`\nArtifacts written to ${path.relative(process.cwd(), OUT) || OUT}/ (git-ignored).`);
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
