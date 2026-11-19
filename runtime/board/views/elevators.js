// Elevators: the CRM's pipeline, read-only, with the 24-hour first-contact and 48-hour technical promises checked
// against the timestamps. The CRM stays the desk's tool: each card opens the quotation in the CRM itself.
import { ago, chip, fmtDateTime, h, sar, words } from "../ui.js";

export const needs = ["crm"];

const LANES = ["new", "contacted", "verified", "tech_review", "tech_ready", "quoted"];
const LANE_NAME = { new: "New", contacted: "Contacted", verified: "Verified", tech_review: "Technical office", tech_ready: "Priced", quoted: "Quoted" };
const SOURCE = { enduser: "Website configurator", dealer: "Dealer configurator", manual: "Entered by hand" };

function signIn(c) {
  const F = "crm";
  return `<form class="panel panel-pad" data-form="${F}">
    <h3>Connect the CRM</h3>
    <p class="small m0">Sign in with a CRM account. A <strong>coordinator</strong> account sees the whole pipeline and changes no quotation, which suits the board. The board keeps only the session, in memory, until it closes; it never stores the password, never writes to the CRM, and keeps no customer names, phone numbers or emails.</p>
    <div class="fields"><label class="f">Email<input type="email" id="${F}-email" name="email" autocomplete="username" required value="${h(c.dv(F, "email"))}"></label>
      <label class="f">Password<input type="password" id="${F}-password" name="password" autocomplete="current-password" required value="${h(c.dv(F, "password"))}"></label>
      <label class="f">Six-digit code <span class="hint">if the account has two-factor sign-in</span><input type="text" id="${F}-code" name="code" inputmode="numeric" autocomplete="one-time-code" value=""></label></div>
    <div class="row"><button class="btn primary">Sign in and sync</button><span class="form-error"></span></div>
    <p class="small muted m0">${h(c.data.crm.url)}</p></form>`;
}

export function render(c) {
  const d = c.data.crm;
  const s = d.summary;
  const quotes = d.quotes;
  const late = (q) => q.first_contact_late || q.technical_late;
  const card = (q) => `<a class="qcard ${late(q) ? "late" : ""}" href="${h(q.crm_url)}" target="_blank" rel="noopener noreferrer">
      <span class="row between"><span class="ref">${h(q.ref)}</span>${q.priority === "high" ? chip("high", "warn") : ""}</span>
      <strong>${h(q.design || words(q.product || "elevator"))}</strong>
      <span class="muted">${[q.city, q.stops ? `${q.stops} stops` : "", q.persons ? `${q.persons} persons` : ""].filter(Boolean).map(h).join(" · ")}</span>
      ${q.price_min || q.price_max ? `<span class="num">${h(sar(q.price_min ?? q.price_max))}${q.price_max && q.price_max !== q.price_min ? `–${h(Number(q.price_max).toLocaleString("en-US"))}` : ""}</span>` : ""}
      <span class="muted">${h(SOURCE[q.source] ?? q.source)}${q.channel ? ` (${h(q.channel)})` : ""} · ${h(ago(q.created_at))}${q.assigned_name ? ` · ${h(q.assigned_name)}` : ""}</span>
      <span class="row">${q.first_contact_late ? chip(`no contact > ${d.sla.firstContactHours} h`, "bad") : ""}${q.technical_late ? chip(`technical > ${d.sla.technicalHours} h`, "bad") : ""}${q.followup_late ? chip("follow-up late", "warn") : ""}</span>
    </a>`;
  const lanes = LANES.map((l) => {
    const list = quotes.filter((q) => q.status === l);
    return `<div class="lane"><div class="lane-head"><span>${h(LANE_NAME[l])}</span><span class="num">${list.length}</span></div>${list.slice(0, 40).map(card).join("")}${list.length > 40 ? `<p class="small muted">and ${list.length - 40} more in the CRM</p>` : ""}</div>`;
  }).join("");
  const header = d.signedIn
    ? `<div class="row"><span class="small muted">Signed in as ${h(d.user?.name || "")} (${h(d.user?.role || "")}) · synced ${h(ago(d.syncedAt))}</span><button class="btn small" data-act="crm-sync">Sync now</button><button class="btn small" data-act="crm-signout">Sign out</button></div>`
    : d.syncedAt ? `<span class="small muted">Showing the copy from ${h(fmtDateTime(d.syncedAt))}. Sign in to refresh it.</span>` : "";
  return `<div class="page-head"><div><h1>Elevators</h1><p>The CRM's pipeline, read-only, from enquiry to quote. The CRM stays the desk's tool and the record of every customer; each card opens the quotation there.</p></div>${header}</div>
  ${!d.signedIn ? signIn(c) : ""}
  ${quotes.length ? `<div class="kpis">
      <div class="kpi"><span class="label">Open</span><span class="value">${s.open}</span><span class="sub">${s.total} in the CRM</span></div>
      <div class="kpi"><span class="label">New this week</span><span class="value">${s.newLast7Days}</span><span class="sub">${Object.entries(s.bySource).map(([k, n]) => `${n} ${words(k.replace("manual:", "by "))}`).join(" · ")}</span></div>
      <div class="kpi ${s.firstContactLate ? "alert" : ""}"><span class="label">No contact in ${d.sla.firstContactHours} h</span><span class="value">${s.firstContactLate}</span><span class="sub">still new after the promise</span></div>
      <div class="kpi ${s.technicalLate ? "alert" : ""}"><span class="label">Technical past ${d.sla.technicalHours} h</span><span class="value">${s.technicalLate}</span><span class="sub">with the technical office</span></div>
      <div class="kpi"><span class="label">Follow-ups late</span><span class="value">${s.followupLate}</span><span class="sub">next follow-up date passed</span></div>
      <div class="kpi"><span class="label">Won, 30 days</span><span class="value">${s.wonLast30Days.count}</span><span class="sub">${s.wonLast30Days.amount ? h(sar(s.wonLast30Days.amount)) : "no amount recorded"}</span></div>
    </div>
    <div class="kanban">${lanes}</div>
    <p class="small muted m0">Closed: ${s.byStage.won ?? 0} won, ${s.byStage.lost ?? 0} lost. Lifts sold go into the registry on the Lifts page.</p>`
    : d.signedIn ? `<p class="empty">The CRM has no quotations this account can see.</p>` : ""}`;
}

export const actions = {
  "crm-sync": async (c) => { const r = await c.api("POST", "/api/crm/sync"); c.toast(`Synced ${r.quotes} quotations.`); c.refresh("crm", "board", "status"); },
  "crm-signout": async (c) => { await c.api("POST", "/api/crm/sign-out"); c.toast("Signed out of the CRM. The copy stays until the next sync."); c.refresh("crm", "status"); },
};

export const forms = {
  crm: async (c, form, fd) => {
    const code = (fd.get("code") ?? "").toString().trim();
    const r = await c.api("POST", "/api/crm/sign-in", { email: (fd.get("email") ?? "").toString(), password: (fd.get("password") ?? "").toString(), ...(code ? { code } : {}) });
    c.clearDraft("crm");
    c.toast(`Signed in as ${r.user.name || "the CRM user"}; ${r.quotes} quotations synced.`);
    c.refresh("crm", "board", "status");
  },
};
