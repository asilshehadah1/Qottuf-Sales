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
import { brandCheck, loadBrandRules } from "../gates/brand.ts";
import { isArabicLine, splitSentences } from "../gates/text.ts";
import { approveEvidence, createAccount, createContact, fileEvidence } from "../ledger/repo.ts";
import type { EvidenceInput } from "../ledger/schemas.ts";
import { ScriptedModelClient } from "../model/client.ts";
import { createOpportunity, decideBid, screen } from "../pipeline/engine.ts";
import { buildBoardPack } from "../reporting/boardPack.ts";

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
  });
  const deps = { db, rules, brand, model, now };
  await enqueue(db, { artifactType: "case_study", input: { project_ref: "PRJ-903", audience: "tender" }, createdBy: "asil" });
  await enqueue(db, { artifactType: "meeting_brief", input: { account_id: uni, opportunity_id: ids.inBand, meeting_at: "2026-11-25T10:00:00+03:00", purpose: "First meeting on the tender" }, createdBy: "asil" });
  await enqueue(db, { artifactType: "prequal_pack", input: { account_id: uni, target: "Example University contractor list" }, createdBy: "asil" });
  for (const r of await runAll(deps)) line(`- ${r.workOrderId} ${r.artifactType.padEnd(14)} ${r.status}${r.note ? `: ${r.note}` : ""}`);
  const firstRound = (await db.query<{ details: { blocking: number } }>("SELECT details FROM run_log WHERE step = 'gates round 1' LIMIT 1")).rows[0];
  line(`The case study's first draft said 14 floors; the record says 13. Gates round 1 blocked ${firstRound?.details.blocking ?? "?"} finding(s), the writer fixed it in round 2, and it passed.`);
  line(`Contact ${contact} appears to agents only as [${contact}]; the name never leaves the Ledger.`);

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
  const pack = await buildBoardPack({ db, rules, now });
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
