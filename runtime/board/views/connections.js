// Connections: what the board is connected to, and how to change it. Settings live in runtime/.env on this computer.
import { ago, chip, fmtDateTime, h } from "../ui.js";

export const needs = [];

const WRITERS_STATE = { claude_plan: "your Claude plan", anthropic: "API key", scripted: "stand-in", off: "off" };

const row = (name, state, tone, body) => `<div class="panel panel-pad stack"><div class="row between"><h3>${h(name)}</h3>${chip(state, tone)}</div>${body}</div>`;

export function render(c) {
  const st = c.data.status;
  return `<div class="page-head"><div><h1>Connections</h1><p>The board runs on this computer and listens only to it. These are the services it reaches. Settings live in <span class="mono">runtime/.env</span>; change them and restart the board (in the desktop app: File, Restart the Board).</p></div></div>
  <div class="grid cols-2">
    ${row("The writers: Claude", WRITERS_STATE[st.model.on ? st.model.kind : "off"] ?? "on", st.model.on && st.model.kind !== "scripted" ? "ok" : "warn", `<p class="m0">${h(st.model.note)}</p>
      <p class="small muted m0">Agents that write (case studies, briefs, debriefs, bilingual edits, LinkedIn posts, elevator content, web pages) call Claude, one of two ways, set in <span class="mono">runtime/.env</span>.</p>
      <p class="small m0"><strong>Your Claude plan.</strong> Claude Code on this computer, signed in to your own Claude account, runs each call, so the writers count against your plan's usage and there is no API bill. It is for your own work: a colleague signs in to Claude Code on their own computer, with their own account.</p>
      <pre class="mono code">QOTTUF_MODEL_CALLS=claude-plan</pre>
      <p class="small m0"><strong>An Anthropic API key</strong>, billed per use.</p>
      <pre class="mono code">QOTTUF_MODEL_CALLS=enabled
ANTHROPIC_API_KEY=your key from console.anthropic.com</pre>
      <p class="small muted m0">Either way, personal data is removed before anything is sent, each run has a token budget, and the code agents (website and mail checks, the board pack, renewals) never call a model. On a Pro or Max plan, Claude's privacy settings decide whether your chats and coding sessions help train Claude; check them before company material goes through.</p>`)}
    ${row("The elevator CRM", st.crm.signedIn ? "signed in" : "not signed in", st.crm.signedIn ? "ok" : "warn", `<p class="m0">${st.crm.signedIn ? `Signed in as ${h(st.crm.user?.name ?? "")} (${h(st.crm.user?.role ?? "")}).` : "Sign in from the Elevators page."} ${st.crm.syncedAt ? `Last sync ${h(ago(st.crm.syncedAt))}.` : ""}</p>
      <p class="small muted m0">Read-only: the board keeps the session in memory, never stores the password, never writes to the CRM, and copies quotations without customer names, phone numbers or emails. While signed in, it syncs every 10 minutes. Use a coordinator account: it sees the whole pipeline and can't change a quotation.</p>
      <p class="small mono m0">${h(st.crm.url)}</p><div><button class="btn small" data-act="go" data-view="elevators">Open Elevators</button></div>`)}
    ${row("The website", st.website.siteCheckedAt ? `checked ${ago(st.website.siteCheckedAt)}` : "not checked", st.website.siteCheckedAt ? "ok" : "warn", `<p class="m0">The site check reads ${st.website.pages.map((p) => `<span class="mono">${h(p)}</span>`).join(", ")} from this computer; the mail check reads the DNS records of <span class="mono">${h(st.website.mailDomain)}</span>.</p>
      <p class="small muted m0">Enquiries from the website's configurators reach the board through the CRM. Nothing on the website changes from here: the Web Page Writer's rewrites land in Approvals for whoever edits the site. Change the pages with WEBSITE_PAGES and the domain with MAIL_DOMAIN.</p>
      <div><button class="btn small" data-act="go" data-view="website">Open Website</button></div>`)}
    ${row("The brand rulebook", st.brand.real ? "Qottuf brand" : "test copy", st.brand.real ? "ok" : "bad", `<p class="m0">${st.brand.real ? `Read from <span class="mono">${h(st.brand.path)}</span>.` : "The qottuf-brand skill wasn't found, so the board is using the test rulebook: the gates still run, but against test rules. Set QOTTUF_BRAND_DIR to the skill's folder."}</p>
      <p class="small muted m0">The rulebook is read at start and never copied into the repository. The fact base import on the Proof page reads the same skill.</p>`)}
    ${row("The Ledger", "local", "ok", `<p class="m0">${h(st.db)}.</p><p class="small muted m0">Evidence tiers are enforced by the database; logs are append-only and the audit log is hash-chained. The folder is outside git. Back it up with the rest of the computer.</p>`)}
    ${row("Business rules", st.rules.approvedBy.startsWith("PENDING") ? "not signed off" : "signed off", st.rules.approvedBy.startsWith("PENDING") ? "warn" : "ok", `<p class="m0">Version <span class="mono">${h(st.rules.version)}</span>, ${h(st.rules.approvedBy)}.</p>
      <p class="small muted m0">The band, the knock-outs, the scorecard and the SLAs live in <span class="mono">runtime/config/business-rules.json</span>. Every decision records the version it used.</p>`)}
  </div>
  <p class="small muted">Board time: ${h(fmtDateTime(st.now))}, Riyadh.</p>`;
}
