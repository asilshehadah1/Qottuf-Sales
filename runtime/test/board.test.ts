import { request, type IncomingMessage } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startBoard, type Board } from "../src/board/main.ts";
import { ROSTER, PHASE_1, rosterSummary } from "../src/board/roster.ts";
import { ScriptedModelClient } from "../src/model/client.ts";
import { testEnv, type TestEnv } from "./setup.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const BRAND_DIR = path.join(here, "fixtures", "brand-skill");

// ---------------------------------------------------------------- a fake CRM and a fake website, behind one fetch
const CUSTOMER = { first_name: "Test", last_name: "Customer", email: "customer@example.com", phone: "0551234567", company: "Customer Holding", customer_notes: "Call after 5" };
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString().replace("T", " ").slice(0, 19);
const QUOTES = [
  { id: 1, ref: "QTF-A1", status: "new", source: "enduser", priority: "normal", city: "Riyadh", product: "passenger", display_name: "Villa lift", stops: 3, persons: 4,
    price_min: 90000, price_max: 110000, currency: "SAR", created_at: hoursAgo(30), updated_at: hoursAgo(30), ageHours: 30, slaBreached: 1, ...CUSTOMER,
    spec: { product: "passenger", note: "private" }, clientMeta: { ip: "203.0.113.9", userAgent: "x" } },
  { id: 2, ref: "QTF-A2", status: "tech_review", source: "manual", priority: "high", city: "Jeddah", product: "goods", stops: 6, created_at: hoursAgo(80),
    updated_at: hoursAgo(60), handoff_at: hoursAgo(60), ...CUSTOMER, clientMeta: { channel: "whatsapp", enteredBy: 3 } },
  { id: 3, ref: "QTF-A3", status: "won", source: "dealer", created_at: hoursAgo(400), closed_at: hoursAgo(100), won_amount: 150000, ...CUSTOMER },
];
const SITE = `<html lang="en"><head><title>Qottuf Jazeera | Home</title><meta name="description" content="Contractor in Riyadh."></head>
  <body><h1>Home</h1><p>We respond within 24 hours.</p><a href="tel:+966110000000">Call</a></body></html>`;

const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const json = (status: number, body: unknown, headers: [string, string][] = []) =>
    new Response(JSON.stringify(body), { status, headers: [["content-type", "application/json"], ...headers] });
  if (url.host === "site.test") return new Response(SITE, { status: 200, headers: { "content-type": "text/html" } });
  if (url.host !== "crm.test") throw new Error(`unexpected fetch ${url}`);
  if (url.pathname === "/api/auth/login") {
    const b = JSON.parse(String(init?.body ?? "{}"));
    if (b.email === "mfa@example.com" && !b.code) return json(401, { error: "Enter the code", details: { code: "mfa_required" } });
    if (b.password !== "right") return json(401, { error: "Incorrect email or password" });
    return json(200, { user: { name: "Board Reader", role: "coordinator" } }, [["set-cookie", "qottuf_crm_sid=s3cret; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200"]]);
  }
  if (url.pathname === "/api/quotes") {
    if (!String((init?.headers as Record<string, string>)?.cookie ?? "").includes("qottuf_crm_sid=s3cret")) return json(401, { error: "Authentication required" });
    return json(200, { quotes: QUOTES, total: QUOTES.length, limit: 200, offset: 0, counts: { new: 1, tech_review: 1, won: 1 } });
  }
  return json(404, { error: "Not found" });
}) as typeof fetch;

// ---------------------------------------------------------------- a scripted model for the writers
const model = new ScriptedModelClient({
  case_study_writer: (input) => {
    const ids = [...input.matchAll(/"id": "(EV-\d+#[a-z_0-9]+)"/g)].map((m) => m[1]!);
    const beds = ids.find((x) => x.endsWith("#bed")) ?? ids[0]!;
    return { title_en: "Example Hospital", title_ar: "مستشفى المثال",
      sentences: [{ lang: "en", text: "Qottuf Aljazeera fitted out Example Hospital, a 120-bed hospital.", fact_ids: [beds] },
        { lang: "ar", text: "نفّذت قطوف الجزيرة تشطيبات مستشفى المثال بسعة ١٢٠ سريراً.", fact_ids: [beds] }],
      declared_claims: [{ value: 120, unit: "bed", fact_id: beds }] };
  },
  claim_extractor: () => ({ claims: [] }),
});

let env: TestEnv;
let board: Board;
const call = async (method: string, p: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await fetch(`${board.url}${p}`, { method, headers: { ...(method !== "GET" ? { "content-type": "application/json" } : {}), ...headers }, ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}) });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, any> };
};

beforeAll(async () => {
  env = await testEnv(new Date().toISOString());
  board = await startBoard({ port: 0, db: env.db, env: { QOTTUF_BRAND_DIR: BRAND_DIR, CRM_URL: "http://crm.test", WEBSITE_PAGES: "http://site.test/", HOME: "/nonexistent" },
    fetchFn: fakeFetch, model, worker: false, quiet: true });
});
afterAll(async () => { await board.close(); await env.db.close(); });

describe("the roster", () => {
  it("holds the spec's 38 agents, phase 1 live, and the three marketing writers pulled forward", () => {
    expect(ROSTER).toHaveLength(38);
    expect(new Set(ROSTER.map((a) => a.no)).size).toBe(38);
    for (const n of PHASE_1) expect(ROSTER.find((a) => a.no === n)!.status).toBe("live");
    expect(ROSTER.filter((a) => a.status === "live").map((a) => a.no).sort((x, y) => x - y)).toEqual([...PHASE_1, 29, 30, 34].sort((x, y) => x - y));
    expect(rosterSummary().groups.map((g) => g.total)).toEqual([12, 9, 6, 11]);
  });
});

describe("the board's server", () => {
  it("answers only to its own page", async () => {
    const viaHost = await new Promise<number>((resolve) => {
      const u = new URL(board.url);
      request({ host: "127.0.0.1", port: u.port, path: "/api/status", headers: { host: `evil.example:${u.port}` } }, (r) => { resolve(r.statusCode ?? 0); r.resume(); }).end();
    });
    expect(viaHost).toBe(403);
    expect((await call("POST", "/api/crm/sync", {}, { origin: "https://evil.example" })).status).toBe(403);
    const plain = await fetch(`${board.url}/api/crm/sync`, { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
    expect(plain.status).toBe(403);
    const page = await fetch(`${board.url}/`);
    expect(page.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    expect((await fetch(`${board.url}/../package.json`)).status).toBe(404);
  });

  it("imports the fact base once: evidence, lifts to confirm without false gaps, and a proposed record", async () => {
    const r = await call("POST", "/api/import-facts");
    expect(r.body).toMatchObject({ evidence: 5, lifts: 6, proposal: true });
    expect((await call("POST", "/api/import-facts")).body.evidence).toBe(0);
    const ev = (await call("GET", "/api/evidence")).body;
    const hospital = ev.records.find((e: any) => e.project_ref === "PRJ-901" && e.type === "case_facts");
    expect(hospital.facts.filter((f: any) => f.kind === "figure").map((f: any) => `${f.value} ${f.unit}`)).toEqual(["120 bed", "18000 sqm"]);
    expect(ev.records.filter((e: any) => e.type === "client_naming_approval").map((e: any) => e.project_ref)).toEqual(["PRJ-901"]);
    const lifts = (await call("GET", "/api/lifts")).body;
    expect(lifts.toConfirm).toBe(6);
    expect(lifts.gaps).toEqual([]);
    const fp = (await call("GET", "/api/footprint")).body;
    expect(fp.proposal.fields).toMatchObject({ cr_number: "1234567890", founded_year: 2014, po_box: "1234" });
    expect(fp.proposal.questions.length).toBe(5);
  });

  it("runs a case study through the dispatcher and queues it for approval", async () => {
    const bad = await call("POST", "/api/runs", { type: "case_study", input: { project_ref: "nope" } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain("Check the form");
    const { body } = await call("POST", "/api/runs", { type: "case_study", input: { project_ref: "PRJ-901", audience: "public" } });
    await board.work();
    const run = (await call("GET", `/api/runs/${body.id}`)).body;
    expect(run.status).toBe("succeeded");
    expect(run.steps.map((s: any) => s.step)).toEqual(["case_study_writer", "claim_extractor", "gates round 1"]);
    const pending = (await call("GET", "/api/approvals?status=pending")).body;
    const item = pending.find((a: any) => a.id === run.artifact_id);
    expect(item).toMatchObject({ kind: "draft", passed: true, agent: 28 });
    expect((await call("POST", `/api/artifacts/${run.artifact_id}/decide`, { decision: "rejected" })).status).toBe(409);
    expect((await call("POST", `/api/artifacts/${run.artifact_id}/decide`, { decision: "approved" })).body).toEqual({ ok: true });
    const roster = (await call("GET", "/api/roster")).body;
    expect(roster.agents.find((a: any) => a.no === 28)).toMatchObject({ runnable: true, lastRun: { status: "succeeded" } });
  });

  it("runs the pipeline: account, opportunity, screening and Asil's bid decision", async () => {
    const acc = (await call("POST", "/api/accounts", { name_en: "Example University", type: "university" })).body.id;
    const due = new Date(Date.now() + 86_400_000).toISOString();
    const opp = (await call("POST", "/api/opportunities", { motion: "contracting", title: "Example faculty building", account_id: acc, route: "invited_private",
      qottuf_role: "main_contractor", sector: "education", service_lines: ["fit_out"], stage: "invitation", owner: "asil",
      next_step: { action: "Screen it", owner: "bid_coordinator", due_at: due }, value_min_sar: 40_000_000, value_max_sar: 45_000_000 })).body.id;
    const s = (await call("POST", `/api/opportunities/${opp}/screen`)).body;
    expect(s.knockouts.find((k: any) => k.code === "K-BAND").status).toBe("pass");
    const go = await call("POST", `/api/opportunities/${opp}/decide`, { decision: "go", reason: "In the band; a direct reference", nextStep: { action: "Order the documents", owner: "bid_coordinator", due_at: due } });
    expect(go.status).toBe(200);
    const p = (await call("GET", "/api/pipeline")).body;
    expect(p.opportunities.find((o: any) => o.id === opp).stage).toBe("go");
    const events = (await call("GET", `/api/opportunities/${opp}/events`)).body;
    expect(events.map((e: any) => e.event)).toEqual(["created", "transition", "decision", "transition"]);
  });

  it("reads the CRM without keeping personal data, and checks its promises", async () => {
    expect((await call("POST", "/api/crm/sign-in", { email: "reader@example.com", password: "wrong" })).body.code).toBe("bad_credentials");
    expect((await call("POST", "/api/crm/sign-in", { email: "mfa@example.com", password: "right" })).body.code).toBe("mfa_required");
    const ok = await call("POST", "/api/crm/sign-in", { email: "reader@example.com", password: "right" });
    expect(ok.body).toMatchObject({ user: { role: "coordinator" }, quotes: 3 });
    const crm = (await call("GET", "/api/crm")).body;
    const raw = JSON.stringify(crm) + JSON.stringify((await env.db.query("SELECT data FROM crm_quotes")).rows);
    for (const pii of [CUSTOMER.first_name, CUSTOMER.last_name, CUSTOMER.email, CUSTOMER.phone, CUSTOMER.company, CUSTOMER.customer_notes, "203.0.113.9", "s3cret"]) {
      expect(raw).not.toContain(pii);
    }
    expect(crm.summary).toMatchObject({ total: 3, open: 2, firstContactLate: 1, technicalLate: 1, wonLast30Days: { count: 1, amount: 150000 } });
    expect(crm.quotes.find((q: any) => q.ref === "QTF-A2")).toMatchObject({ channel: "whatsapp", technical_late: true, crm_url: "http://crm.test/#/quote/2" });
    const status = (await call("GET", "/api/status")).body;
    expect(status.crm).toMatchObject({ signedIn: true, user: { name: "Board Reader" } });
    await call("POST", "/api/crm/sign-out");
    expect((await call("POST", "/api/crm/sync")).body.code).toBe("not_signed_in");
    expect((await call("GET", "/api/crm")).body.quotes).toHaveLength(3); // the mirror stays until the next sync
  });

  it("checks the live website from the server and keeps the result", async () => {
    const { body } = await call("POST", "/api/runs", { type: "site_check", input: { pages: [{ url: "http://site.test/" }] } });
    await board.work();
    expect((await call("GET", `/api/runs/${body.id}`)).body.status).toBe("succeeded");
    const fp = (await call("GET", "/api/footprint")).body;
    const rules = fp.site.content.pages[0].text_failures.map((f: any) => f.rule);
    expect(rules).toContain("naming.forbidden_variant");
    expect(fp.site.content.verdict.bar.nothing_false).toBe(false);
    const board_ = (await call("GET", "/api/board")).body;
    expect(board_.website.verdict.fails).toBeGreaterThan(0);
    expect(board_.drafts.every((d: any) => d.type !== "site_check")).toBe(true); // reports aren't drafts to approve
  });

  it("checks pasted text with the same gates", async () => {
    const r = (await call("POST", "/api/check-text", { en: "Qottuf Jazeera is the best contractor, with a 140-bed hospital.", audience: "public" })).body;
    expect(r.passed).toBe(false);
    expect(r.blocking.map((f: any) => f.rule)).toEqual(expect.arrayContaining(["naming.forbidden_variant"]));
  });

  it("refuses to queue a writer when the model is off, but still runs code agents", async () => {
    const env2 = await testEnv(new Date().toISOString());
    const off = await startBoard({ port: 0, db: env2.db, env: { QOTTUF_BRAND_DIR: BRAND_DIR, HOME: "/nonexistent" }, fetchFn: fakeFetch, worker: false, quiet: true });
    try {
      const r = await fetch(`${off.url}/api/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "linkedin_post", input: { voice: "company", topic: "MEP in a live building" } }) });
      expect(r.status).toBe(409);
      expect(((await r.json()) as { error: string }).error).toContain("QOTTUF_MODEL_CALLS");
      const pack = await fetch(`${off.url}/api/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "board_pack", input: {} }) });
      expect(pack.status).toBe(200);
    } finally {
      await off.close();
      await env2.db.close();
    }
  });

  it("stops while a page holds the live event stream open", async () => {
    const env2 = await testEnv(new Date().toISOString());
    const b = await startBoard({ port: 0, db: env2.db, env: { QOTTUF_BRAND_DIR: BRAND_DIR, HOME: "/nonexistent" }, fetchFn: fakeFetch, worker: false, quiet: true });
    try {
      const port = new URL(b.url).port;
      const stream = await new Promise<IncomingMessage>((resolve, reject) => {
        request({ host: "127.0.0.1", port, path: "/api/events", headers: { host: `localhost:${port}` } }, resolve).on("error", reject).end();
      });
      expect(stream.statusCode).toBe(200);
      stream.on("error", () => {}); // the board ends it
      const stopped = await Promise.race([b.close().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 3000))]);
      expect(stopped).toBe(true);
    } finally {
      await env2.db.close();
    }
  });

  it("serves the manifest and icons the browser's install option and the desktop app use", async () => {
    const m = await fetch(`${board.url}/manifest.webmanifest`);
    expect(m.headers.get("content-type")).toBe("application/manifest+json");
    const manifest = (await m.json()) as { name: string; start_url: string; icons: { src: string; sizes: string }[] };
    expect(manifest.name).toBe("Qottuf BD Board");
    expect(manifest.icons.map((i) => i.sizes)).toEqual(["192x192", "512x512"]);
    for (const src of [...manifest.icons.map((i) => i.src), "favicon.png", "apple-touch-icon.png"]) {
      const r = await fetch(`${board.url}/${src}`);
      expect([src, r.status, r.headers.get("content-type")]).toEqual([src, 200, "image/png"]);
    }
  });
});
