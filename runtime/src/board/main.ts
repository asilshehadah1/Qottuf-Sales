// The Qottuf BD Board, on this computer: npm run board, then open http://localhost:4300.
// One process: the Ledger (an embedded Postgres in .data/board, or DATABASE_URL), the Dispatcher's worker that runs
// the agents, the read-only CRM connection, the live website and mail checks, and the board's page.
// Settings come from runtime/.env (see .env.example). Nothing here listens beyond 127.0.0.1.

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBusinessRules } from "../config/rules.ts";
import { CrmClient } from "../crm/client.ts";
import { syncCrm } from "../crm/sync.ts";
import { openEmbeddedDb, openPostgres, type Db } from "../db/db.ts";
import { migrate } from "../db/migrate.ts";
import { dohResolver, systemResolver, type DnsResolver } from "../deliverability/mailDomain.ts";
import { runNext, type DispatcherDeps } from "../dispatcher/dispatcher.ts";
import type { BrandRules } from "../gates/brand.ts";
import { loadBrandRules } from "../gates/brandLoader.ts";
import { AnthropicModelClient } from "../model/client.ts";
import { ClaudeCodeModelClient, claudeCodeStatus, findClaudeBin, type RunCommand } from "../model/claudeCode.ts";
import type { ModelClient } from "../model/core.ts";
import { buildRouter, errorReply, type BoardDeps } from "./api.ts";
import { checkRequest, EventHub, readJson, sendJson, serveStatic } from "./http.ts";
import { findBrandDir } from "./importFacts.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.resolve(here, "../..");
const BOARD_DIR = path.join(RUNTIME, "board");
const FIXTURE_RULES = path.join(RUNTIME, "test", "fixtures", "brand-rules.fixture.json");

const DEFAULT_PAGES = ["https://www.qottuf.com/", "https://www.qottuf.com/elevators/simple/", "https://www.qottuf.com/elevators/technical/"];

export interface BoardOptions {
  port?: number;
  db?: Db;
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
  model?: ModelClient | null;
  now?: () => Date;
  /** Run the worker loop (tests drive the dispatcher themselves). */
  worker?: boolean;
  quiet?: boolean;
}

export interface Board {
  server: Server;
  deps: BoardDeps;
  url: string;
  work: () => Promise<void>;
  close: () => Promise<void>;
}

async function brandRules(env: NodeJS.ProcessEnv): Promise<{ brand: BrandRules; source: BoardDeps["brandSource"] }> {
  const dir = await findBrandDir(env);
  const file = env.QOTTUF_BRAND_RULES ?? (dir ? path.join(dir, "assets", "brand-rules.json") : null);
  if (file && existsSync(file)) return { brand: await loadBrandRules(file), source: { path: file, dir, real: true } };
  return { brand: await loadBrandRules(FIXTURE_RULES), source: { path: null, dir, real: false } };
}

export type ModelMode = "claude-plan" | "api" | "off";

/**
 * The writers' model, from QOTTUF_MODEL_CALLS: "claude-plan" runs them through Claude Code signed in to the person's
 * own Claude account (their plan); "enabled" runs them on an Anthropic API key (billed per use); anything else, off.
 */
export async function modelClient(env: NodeJS.ProcessEnv, publicNumbers: string[], run?: RunCommand): Promise<{ model: ModelClient | null; note: string; mode: ModelMode }> {
  if (env.QOTTUF_MODEL_CALLS === "claude-plan") {
    const bin = findClaudeBin(env);
    if (!bin) {
      return { mode: "claude-plan", model: null,
        note: "Set to run on your Claude plan, but Claude Code isn't on this computer. In Terminal, install it with: curl -fsSL https://claude.ai/install.sh | bash, sign in with: claude auth login, then restart the board." };
    }
    const status = await claudeCodeStatus(bin, env, run);
    if (status.problem) return { mode: "claude-plan", model: null, note: status.problem };
    return {
      mode: "claude-plan",
      model: new ClaudeCodeModelClient({ bin, env, publicNumbers, ...(run ? { run } : {}), ...(env.QOTTUF_CLAUDE_MODEL ? { model: env.QOTTUF_CLAUDE_MODEL } : {}) }),
      note: `On: the agents run on your Claude plan, through Claude Code ${status.version} signed in to your Claude account.`,
    };
  }
  if (env.QOTTUF_MODEL_CALLS !== "enabled") {
    return { mode: "off", model: null,
      note: "The agents that write are switched off. To run them on your Claude plan, set QOTTUF_MODEL_CALLS=claude-plan in runtime/.env (Claude Code installed and signed in to your Claude account); for an Anthropic API key instead, set QOTTUF_MODEL_CALLS=enabled and ANTHROPIC_API_KEY. Then restart the board." };
  }
  if (!env.ANTHROPIC_API_KEY) return { mode: "api", model: null, note: "QOTTUF_MODEL_CALLS is enabled but ANTHROPIC_API_KEY is missing from runtime/.env. To use your Claude plan instead, set QOTTUF_MODEL_CALLS=claude-plan." };
  return { mode: "api", model: new AnthropicModelClient({ enabled: true, publicNumbers, ...(env.QOTTUF_MODEL ? { model: env.QOTTUF_MODEL } : {}) }), note: "On: the agents run on your Anthropic API account, billed per use." };
}

export async function startBoard(o: BoardOptions = {}): Promise<Board> {
  const env = o.env ?? process.env;
  const log = (...a: unknown[]) => { if (!o.quiet) console.log(...a); };
  const port = o.port ?? Number(env.BOARD_PORT ?? 4300);
  let dbKind: string;
  let db: Db;
  if (o.db) { db = o.db; dbKind = "in memory (test)"; }
  else if (env.DATABASE_URL) { db = openPostgres(env.DATABASE_URL); dbKind = "Postgres (DATABASE_URL)"; }
  else {
    const dir = path.resolve(RUNTIME, env.QOTTUF_BOARD_DATA ?? ".data/board");
    await mkdir(dir, { recursive: true });
    db = await openEmbeddedDb(dir);
    dbKind = `embedded Postgres in ${path.relative(RUNTIME, dir) || dir}`;
  }
  const applied = await migrate(db);
  if (applied.length) log(`Ledger: applied ${applied.join(", ")}`);
  // A run that was cut off by a restart goes back in the queue; its attempt still counts against the retry limit.
  await db.query("UPDATE work_orders SET status = 'queued' WHERE status = 'running'");

  const rules = await loadBusinessRules();
  const { brand, source } = await brandRules(env);
  const publicNumbers = brand.verified_figures.filter((f) => f.id === "contact" && String(f.value).replace(/\D/g, "").length >= 7).map((f) => String(f.value));
  const m = o.model !== undefined
    ? { model: o.model, note: o.model ? "On (test model)." : "Off (test).", mode: (o.model ? "api" : "off") as ModelMode }
    : await modelClient(env, publicNumbers);
  const fetchFn = o.fetchFn ?? fetch;
  // The computer's own DNS first; when it returns nothing for a name, DNS over HTTPS, so a network that blocks or
  // filters DNS reads as "check again", not as a domain with no records.
  const doh = dohResolver(undefined, fetchFn);
  const sys = systemResolver();
  const orDoh = <T>(a: T[], b: () => Promise<T[]>) => (a.length ? a : b().catch(() => a));
  const dns: DnsResolver = env.QOTTUF_DNS === "doh" ? doh : {
    txt: async (n) => orDoh(await sys.txt(n).catch(() => []), () => doh.txt(n)),
    mx: async (n) => orDoh(await sys.mx(n).catch(() => []), () => doh.mx(n)),
  };
  const hub = new EventHub();
  const crm = new CrmClient(env.CRM_URL ?? "https://qottuf-crm.vercel.app", fetchFn);
  const now = o.now ?? (() => new Date());

  const dispatcher: DispatcherDeps = { db, rules, brand, model: m.model, now, publicNumbers, fetchFn, dns };
  let running = false;
  let lastStep = 0;
  const work = async () => {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const r = await runNext(dispatcher);
        if (!r) break;
        log(`Run ${r.workOrderId} (${r.artifactType}): ${r.status}${r.note ? `: ${r.note}` : ""}`);
        hub.emit(["runs", "approvals", "board", "roster", "pipeline", "lifts", "footprint", "evidence"]);
      }
    } catch (e) {
      console.error("worker:", e);
    } finally {
      running = false;
    }
  };

  const deps: BoardDeps = {
    db, rules, brand, brandSource: source, model: m.model, modelNote: m.note, modelMode: m.mode, crm, hub, now, fetchFn, dns,
    website: { pages: (env.WEBSITE_PAGES ?? "").split(",").map((s) => s.trim()).filter(Boolean).length ? env.WEBSITE_PAGES!.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_PAGES,
      mailDomain: env.MAIL_DOMAIN ?? "qottuf.com" },
    kick: () => { void work(); },
    actor: "asil",
    dbKind,
  };
  const router = buildRouter(deps);

  // The port the server really listens on (a test asks for any free port with 0).
  let boundPort = port;
  const server = createServer(async (req, res) => {
    const refused = checkRequest(req, boundPort);
    if (refused) return sendJson(res, 403, { error: refused });
    const url = new URL(req.url ?? "/", `http://localhost:${boundPort}`);
    if (url.pathname === "/api/events") return hub.open(res);
    if (url.pathname.startsWith("/api/")) {
      const match = router.match(req.method ?? "GET", url.pathname);
      if (!match) return sendJson(res, 404, { error: "There's nothing at that address." });
      if (match === "method") return sendJson(res, 405, { error: `${req.method} isn't supported there.` });
      try {
        const out = await match.handler({ req, res, params: match.params, url, body: () => readJson(req) });
        return sendJson(res, 200, out ?? { ok: true });
      } catch (e) {
        const { status, body } = errorReply(e);
        if (status >= 500) console.error(e);
        return sendJson(res, status, body);
      }
    }
    if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Not supported." });
    if (await serveStatic(res, BOARD_DIR, url.pathname)) return;
    return sendJson(res, 404, { error: "There's nothing at that address." });
  });

  const timers: NodeJS.Timeout[] = [];
  if (o.worker !== false) {
    timers.push(setInterval(() => void work(), 5_000));
    // Progress: tell the page when a running order logs a step, so it can show each step as it happens.
    timers.push(setInterval(async () => {
      try {
        const r = (await db.query<{ n: string }>("SELECT coalesce(max(id), 0) AS n FROM run_log")).rows[0];
        const n = Number(r?.n ?? 0);
        if (n !== lastStep) { lastStep = n; hub.emit(["runs"]); }
      } catch { /* the next tick tries again */ }
    }, 1_000));
    timers.push(setInterval(() => hub.ping(), 25_000));
    // Keep the CRM mirror fresh while signed in.
    timers.push(setInterval(async () => {
      if (!crm.signedIn) return;
      try { await syncCrm(db, crm, "board:auto-sync"); hub.emit(["crm", "board", "status"]); } catch (e) { log(`CRM sync: ${(e as Error).message}`); }
    }, 10 * 60_000));
  }
  if (env.CRM_EMAIL && env.CRM_PASSWORD) {
    try {
      await crm.signIn(env.CRM_EMAIL, env.CRM_PASSWORD);
      const s = await syncCrm(db, crm, "board:startup");
      log(`CRM: signed in as ${crm.user?.name || env.CRM_EMAIL} (${crm.user?.role}); ${s.quotes} quotations mirrored.`);
    } catch (e) {
      log(`CRM: not signed in (${(e as Error).message}). Sign in from the board's Elevators page.`);
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  boundPort = typeof address === "object" && address ? address.port : port;
  const url = `http://localhost:${boundPort}`;
  if (o.worker !== false) void work();
  return {
    server, deps, url, work,
    close: async () => {
      for (const t of timers) clearInterval(t);
      // close() waits for every connection to end, and an open board page holds an event stream that never does:
      // drop the connections first, or the board can't stop while a page is open.
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
      await closed;
      if (!o.db) await db.close();
    },
  };
}

// ---------------------------------------------------------------- npm run board
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const envFile = path.join(RUNTIME, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const board = await startBoard();
  const d = board.deps;
  console.log(`\nQottuf BD Board: ${board.url}\n`);
  console.log(`  Ledger:   ${d.dbKind}`);
  console.log(`  Agents:   ${d.modelNote}`);
  console.log(`  Rulebook: ${d.brandSource.real ? d.brandSource.path : "the test rulebook (set QOTTUF_BRAND_DIR to the qottuf-brand skill folder)"}`);
  console.log(`  CRM:      ${d.crm.baseUrl}${d.crm.signedIn ? ` (signed in as ${d.crm.user?.name})` : " (sign in from the board)"}`);
  console.log(`  Website:  ${d.website.pages.join(", ")}\n`);
  const stop = async () => { await board.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
