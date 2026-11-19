// The board's core: data from the board's own API (on this computer), live updates over server-sent events, hash
// routes, rendering, forms and drafts. Views live in views/*.js; each exports render(ctx), and optionally needs,
// drawer(ctx), actions and forms.
import { ago, chip, h } from "./ui.js";
import * as board from "./views/board.js";
import * as agents from "./views/agents.js";
import * as approvals from "./views/approvals.js";
import * as pipeline from "./views/pipeline.js";
import * as elevators from "./views/elevators.js";
import * as website from "./views/website.js";
import * as proof from "./views/proof.js";
import * as lifts from "./views/lifts.js";
import * as check from "./views/check.js";
import * as connections from "./views/connections.js";

const VIEWS = { board, agents, approvals, pipeline, elevators, website, proof, lifts, check, connections };
const NAV = [["board", "Board"], ["agents", "Agents"], ["approvals", "Approvals"], "-", ["pipeline", "Pipeline"], ["elevators", "Elevators"], ["website", "Website"],
  ["proof", "Proof"], ["lifts", "Lifts"], "-", ["check", "Check text"], ["connections", "Connections"]];
const RESOURCES = {
  status: "/api/status", board: "/api/board", roster: "/api/roster", runs: "/api/runs?limit=40", approvals: "/api/approvals?status=all",
  pipeline: "/api/pipeline", evidence: "/api/evidence", lifts: "/api/lifts", footprint: "/api/footprint", crm: "/api/crm",
};

const S = { view: "board", sub: null, data: {}, stale: new Set(Object.keys(RESOURCES)), errors: {}, ui: {}, drafts: {}, runs: {}, offline: false };
const viewEl = document.getElementById("view");
const drawerRoot = document.getElementById("drawer-root");

// ---------------------------------------------------------------- data
async function api(method, path, body) {
  const init = { method, headers: { accept: "application/json" } };
  if (method !== "GET") { init.headers["content-type"] = "application/json"; init.body = JSON.stringify(body ?? {}); }
  let res;
  try { res = await fetch(path, init); } catch { throw new Error("The board's server isn't answering. Is it still running in the terminal?"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `The board answered ${res.status}.`), { status: res.status, data });
  return data;
}

const inflight = new Map();
function load(name) {
  if (inflight.has(name)) return inflight.get(name);
  const p = (async () => {
    try { S.data[name] = await api("GET", RESOURCES[name]); S.stale.delete(name); delete S.errors[name]; }
    catch (e) { S.errors[name] = e.message; }
    finally { inflight.delete(name); schedule(); }
  })();
  inflight.set(name, p);
  return p;
}
const needs = () => [...new Set(["status", "board", ...(VIEWS[S.view].needs ?? [])])];
function ensure() { for (const n of needs()) if ((S.stale.has(n) || !(n in S.data)) && !inflight.has(n)) load(n); }
function refresh(...names) { for (const n of names) S.stale.add(n); ensure(); }

/** Follow a work order: its steps arrive as the agent works; the view reads S.runs[key]. */
async function trackRun(key, id) {
  S.runs[key] = { id, detail: S.runs[key]?.id === id ? S.runs[key].detail : null };
  await pollRun(key);
}
async function pollRun(key) {
  const r = S.runs[key];
  if (!r) return;
  try { r.detail = await api("GET", `/api/runs/${encodeURIComponent(r.id)}`); } catch { /* keep the last view */ }
  schedule();
}
const finished = (d) => d && ["succeeded", "needs_human", "dead"].includes(d.status);

function listen() {
  const es = new EventSource("/api/events");
  es.addEventListener("change", (ev) => {
    let topics = [];
    try { topics = JSON.parse(ev.data); } catch { /* ignore */ }
    for (const t of topics) if (RESOURCES[t]) S.stale.add(t);
    S.stale.add("status");
    if (topics.includes("runs")) S.stale.add("board");
    clearTimeout(listen.timer);
    listen.timer = setTimeout(() => {
      ensure();
      if (topics.includes("runs")) for (const [k, r] of Object.entries(S.runs)) if (!finished(r.detail)) pollRun(k);
    }, 120);
  });
  es.onerror = () => { if (!S.offline) { S.offline = true; schedule(); } };
  es.onopen = () => { if (S.offline) { S.offline = false; for (const k of Object.keys(RESOURCES)) S.stale.add(k); ensure(); schedule(); } };
}

// ---------------------------------------------------------------- drafts, toasts, routing
function dv(form, name, fallback = "") {
  const d = S.drafts[form];
  return d && name in d ? d[name] : fallback;
}
function clearDraft(form) { delete S.drafts[form]; }
function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  document.getElementById("toast").append(t);
  setTimeout(() => t.remove(), 5000);
}
function go(view, sub) {
  const hash = sub ? `${view}/${sub}` : view;
  if (location.hash.slice(1) === hash) { route(); return; }
  location.hash = hash;
}
function route() {
  const [view, ...rest] = decodeURIComponent(location.hash.replace(/^#/, "")).split("/");
  const prev = S.view;
  S.view = VIEWS[view] ? view : "board";
  S.sub = rest.join("/") || null;
  if (prev !== S.view) window.scrollTo(0, 0);
  ensure();
  render();
}
window.addEventListener("hashchange", route);

const ctx = () => ({ S, data: S.data, ui: S.ui, sub: S.sub, api, go, refresh, schedule, toast, dv, clearDraft, trackRun, runs: S.runs, errors: S.errors });

// ---------------------------------------------------------------- render
let raf = 0;
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }

function navHtml() {
  const b = S.data.board;
  const counts = { board: b ? b.decisions.length : 0, approvals: b ? b.drafts.length : 0, elevators: b ? (b.crm.summary.firstContactLate + b.crm.summary.technicalLate) : 0 };
  return NAV.map((n) => n === "-" ? `<div class="sep" role="separator"></div>`
    : `<button data-act="go" data-view="${n[0]}" ${S.view === n[0] ? 'aria-current="page"' : ""}>${h(n[1])}${counts[n[0]] ? `<span class="count">${counts[n[0]]}</span>` : ""}</button>`).join("");
}

function statusHtml() {
  const st = S.data.status;
  if (S.offline) return `<span class="item"><span class="dot off"></span>The board's server isn't answering. Start it again with npm run board.</span>`;
  if (!st) return `<span class="item muted">Connecting…</span>`;
  const items = [
    [st.model.on ? "on" : "off", !st.model.on ? "Agents: writers off" : st.model.kind === "anthropic" ? "Agents: on (Anthropic API)" : "Agents: on (a stand-in, not Claude)", "connections"],
    [st.crm.signedIn ? "on" : st.crm.syncedAt ? "warn" : "off", st.crm.signedIn ? `CRM: ${st.crm.user?.name || "signed in"}${st.crm.syncedAt ? `, synced ${ago(st.crm.syncedAt)}` : ""}` : st.crm.syncedAt ? `CRM: signed out, last sync ${ago(st.crm.syncedAt)}` : "CRM: not connected", "elevators"],
    [st.website.siteCheckedAt ? "on" : "warn", st.website.siteCheckedAt ? `Website: checked ${ago(st.website.siteCheckedAt)}` : "Website: not checked yet", "website"],
    [st.brand.real ? "on" : "warn", st.brand.real ? "Rulebook: Qottuf brand" : "Rulebook: test copy", "connections"],
  ];
  return items.map(([tone, text, view]) => `<button class="item" data-act="go" data-view="${view}"><span class="dot ${tone}"></span>${h(text)}</button>`).join("")
    + `<span class="spacer small" title="${h(st.db)}">Ledger: ${h(st.db)}</span>`;
}

function render() {
  const active = document.activeElement;
  const focusId = active?.id && (viewEl.contains(active) || drawerRoot.contains(active)) ? active.id : null;
  const sel = focusId && typeof active.selectionStart === "number" ? [active.selectionStart, active.selectionEnd] : null;
  const drawerScroll = drawerRoot.querySelector(".drawer")?.scrollTop ?? 0;
  document.getElementById("nav").innerHTML = navHtml();
  document.getElementById("statusbar").innerHTML = statusHtml();
  const st = S.data.status;
  document.getElementById("railfoot").innerHTML = st ? `<span>Rules ${h(st.rules.version)}</span><span>${h(st.rules.approvedBy)}</span>` : "";
  const v = VIEWS[S.view];
  const c = ctx();
  const missing = needs().filter((n) => !(n in S.data));
  const failed = missing.find((n) => S.errors[n]);
  viewEl.innerHTML = failed ? `<div class="banner bad">${h(S.errors[failed])}</div>`
    : missing.length ? `<p class="empty">Loading…</p>` : v.render(c);
  const drawer = !missing.length && v.drawer ? v.drawer(c) : "";
  drawerRoot.innerHTML = drawer ? `<div class="scrim" data-act="close-drawer"></div><aside class="drawer" role="dialog" aria-modal="true">${drawer}</aside>` : "";
  if (drawer) drawerRoot.querySelector(".drawer").scrollTop = drawerScroll;
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch { /* not a text field */ } } }
  }
}

// ---------------------------------------------------------------- events
const GLOBAL_ACTIONS = {
  go: (c, t) => go(t.dataset.view, t.dataset.sub),
  "close-drawer": () => go(S.view),
  copy: async (c, t) => {
    const el = t.dataset.target ? document.querySelector(t.dataset.target) : null;
    const text = t.dataset.text ?? el?.innerText ?? "";
    try { await navigator.clipboard.writeText(text); toast("Copied."); }
    catch {
      if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      toast("Selected: press ⌘C (Ctrl+C) to copy.");
    }
  },
};

document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-act]");
  if (!t || t.tagName === "INPUT" || t.tagName === "SELECT") return;
  const handler = VIEWS[S.view].actions?.[t.dataset.act] ?? GLOBAL_ACTIONS[t.dataset.act];
  if (!handler) return;
  e.preventDefault();
  try { await handler(ctx(), t, e); } catch (err) { toast(err.message); }
});

document.addEventListener("submit", async (e) => {
  const form = e.target.closest("form[data-form]");
  if (!form) return;
  e.preventDefault();
  const handler = VIEWS[S.view].forms?.[form.dataset.form];
  if (!handler) return;
  const err = form.querySelector(".form-error");
  if (err) err.textContent = "";
  const btn = e.submitter;
  if (btn) btn.disabled = true;
  try { await handler(ctx(), form, new FormData(form), btn); }
  catch (ex) { if (err && document.contains(err)) err.textContent = ex.message; else toast(ex.message); }
  finally { if (btn && document.contains(btn)) btn.disabled = false; }
});

document.addEventListener("input", (e) => {
  const form = e.target.closest("form[data-form]");
  if (!form || !e.target.name || e.target.type === "checkbox") return;
  (S.drafts[form.dataset.form] ??= {})[e.target.name] = e.target.value;
});

document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.dataset.act) {
    const handler = VIEWS[S.view].actions?.[t.dataset.act];
    if (handler) { try { await handler(ctx(), t, e); } catch (err) { toast(err.message); } }
    return;
  }
  const form = t.closest("form[data-form]");
  if (form && t.name) {
    const d = (S.drafts[form.dataset.form] ??= {});
    if (t.type === "checkbox") d[`${t.name}:${t.value}`] = t.checked;
    else d[t.name] = t.value;
    if (t.hasAttribute("data-redraw")) render();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && drawerRoot.firstChild) go(S.view);
});

route();
listen();
