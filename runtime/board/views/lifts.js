// Lifts: the installed base and maintenance registry (#27). Every lift Qottuf installed or maintains, with the dates
// that give a reason to call; renewals become pipeline opportunities, for owners who agreed to be contacted.
import { chip, fmtDate, h, words } from "../ui.js";
import { runProgress } from "./agents.js";

export const needs = ["lifts"];

const GAP = { won_without_unit: "sold but not registered", no_maintenance_offer: "maintenance never offered", no_origin_document: "no certificate of origin",
  no_owner_consent: "no owner agreement to contact", no_inspection_date: "no inspection date" };

export function render(c) {
  const l = c.data.lifts;
  const counts = {};
  for (const g of l.gaps) counts[g.kind] = (counts[g.kind] ?? 0) + 1;
  const sel = c.sub;
  return `<div class="page-head"><div><h1>Lifts</h1><p>Every lift Qottuf installed or maintains, with the dates that give a reason to call: warranty end, contract end, the annual inspection and registration.</p></div>
    <div class="row"><button class="btn" data-act="toggle-unit">Register a lift</button><button class="btn primary" data-act="renewals">Create renewal opportunities</button></div></div>
  ${c.runs.renewals ? runProgress(c.runs.renewals, { compact: true }) : ""}
  ${c.ui.addUnit ? unitForm(c) : ""}
  <div class="grid cols-2">
    <section><h2>Due in the next ${l.windowDays} days</h2><div class="panel panel-pad stack small">${l.due.map((d) => `<div class="row between"><span>${h(words(d.kind))}: ${h(d.site)}${d.contactable ? "" : ` <span class="muted">(owner not yet agreed)</span>`}</span>${chip(d.overdue ? "overdue" : `${d.days} days`, d.overdue || d.days <= 30 ? "bad" : "warn")}</div>`).join("") || `<p class="empty m0">Nothing due.</p>`}</div></section>
    <section><h2>Gaps to close</h2><div class="panel panel-pad stack small">
      ${l.toConfirm ? `<div class="row between"><span>lifts from project records, details not confirmed yet</span>${chip(String(l.toConfirm), "warn")}</div>` : ""}
      ${Object.entries(counts).map(([k, n]) => `<div class="row between"><span>${h(GAP[k] ?? words(k))}</span>${chip(String(n), "warn")}</div>`).join("")}
      ${!l.toConfirm && !l.gaps.length ? `<p class="empty m0">No gaps.</p>` : ""}</div></section>
  </div>
  <div class="panel table-wrap">${l.units.length ? `<table><thead><tr><th>Lift</th><th>Source</th><th>Warranty ends</th><th>Maintenance</th><th>Next inspection</th><th>Owner agreed</th></tr></thead><tbody>${l.units.map((u) => `
    <tr class="click ${sel === u.id ? "sel" : ""}" data-act="go" data-view="lifts" data-sub="${h(u.id)}"><td>${h(u.site)}<div class="small muted mono">${h(u.id)}${u.project_ref ? ` · ${h(u.project_ref)}` : ""}</div></td><td>${h(u.source)}</td>
    <td>${u.warranty_ends_at ? h(fmtDate(u.warranty_ends_at)) : chip("unknown")}</td>
    <td>${u.maintenance_contract ? h(`to ${fmtDate(u.maintenance_contract.ends_at)}`) : u.unverified ? chip("to confirm", "warn") : chip(words(u.maintenance_offer), u.maintenance_offer === "accepted" ? "ok" : "warn")}</td>
    <td>${u.next_inspection_due ? h(fmtDate(u.next_inspection_due)) : chip("unknown")}</td><td>${u.owner_consent_at ? chip("yes", "ok") : chip("no", "bad")}</td></tr>`).join("")}</tbody></table>`
    : `<p class="empty panel-pad">No lifts registered yet. Import the fact base on the Proof page to start from the lifts on record, or register one.</p>`}</div>`;
}

function unitForm(c) {
  const F = "unit";
  return `<form class="panel panel-pad" data-form="${F}"><div class="row between"><h3>Register a lift</h3><button type="button" class="btn small" data-act="toggle-unit">Cancel</button></div>
    <div class="fields"><label class="f">Site<input type="text" id="${F}-site" name="site" required minlength="3" value="${h(c.dv(F, "site"))}"></label>
    <label class="f">Source<select id="${F}-source" name="source">${["installed", "maintained", "takeover"].map((s) => `<option ${c.dv(F, "source") === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
    <label class="f">Handed over<input type="date" id="${F}-ho" name="handed_over_at" value="${h(c.dv(F, "handed_over_at"))}"></label>
    <label class="f">Warranty ends<input type="date" id="${F}-we" name="warranty_ends_at" value="${h(c.dv(F, "warranty_ends_at"))}"></label>
    <label class="f">Next inspection<input type="date" id="${F}-ni" name="next_inspection_due" value="${h(c.dv(F, "next_inspection_due"))}"></label>
    <label class="f">Manufacturer<input type="text" id="${F}-mf" name="manufacturer" value="${h(c.dv(F, "manufacturer"))}"></label>
    <label class="f">Certificate of origin <span class="hint">reference</span><input type="text" id="${F}-coo" name="origin_document" value="${h(c.dv(F, "origin_document"))}"></label></div>
    <div class="row"><button class="btn primary">Register</button><span class="form-error"></span></div></form>`;
}

export function drawer(c) {
  const u = c.sub && c.data.lifts.units.find((x) => x.id === c.sub);
  if (!u) return "";
  // Drafts belong to one lift: opening another starts its forms afresh.
  if (c.ui.liftDraftsFor !== u.id) { for (const f of ["unitact", "consent", "contract", "done"]) c.clearDraft(f); c.ui.liftDraftsFor = u.id; }
  const F = "unitact";
  const val = (k, fb) => h(c.dv(F, k, fb ?? ""));
  return `<div class="head"><div class="stack"><span class="mono muted">${h(u.id)}${u.project_ref ? ` · ${h(u.project_ref)}` : ""}</span><h2 class="title">${h(u.site)}</h2></div><button class="btn small" data-act="close-drawer">Close</button></div>
    ${u.unverified ? `<div class="banner warn">Entered from the project record: only the lift's existence is on record. Confirm the dates and the manufacturer from the handover file; saving marks the lift as confirmed.</div>` : ""}
    <dl class="kv small"><dt>Handed over</dt><dd>${h(u.handed_over_at ? fmtDate(u.handed_over_at) : "unknown")}</dd><dt>Manufacturer</dt><dd>${h(u.manufacturer ?? "not recorded")}</dd>
      <dt>Certificate of origin</dt><dd>${h(u.origin_document ?? "not on file")}</dd><dt>Registration due</dt><dd>${h(u.next_registration_due ? fmtDate(u.next_registration_due) : "unknown")}</dd>
      <dt>Maintenance</dt><dd>${u.maintenance_contract ? h(`${u.maintenance_contract.tier}, ${u.maintenance_contract.contract_ref}, to ${fmtDate(u.maintenance_contract.ends_at)}`) : u.unverified ? "to confirm" : h(words(u.maintenance_offer))}</dd>
      <dt>Owner agreed</dt><dd>${h(u.owner_consent_at ? fmtDate(u.owner_consent_at) : "no")}</dd></dl>
    <form data-form="${F}" data-id="${h(u.id)}" class="stack"><div class="h2">From the handover file</div><div class="fields">
      <label class="f">Handed over on<input type="date" id="${F}-ho" name="handed_over_at" value="${val("handed_over_at", u.handed_over_at)}"></label>
      <label class="f">Warranty ends<input type="date" id="${F}-we" name="warranty_ends_at" value="${val("warranty_ends_at", u.warranty_ends_at)}"></label>
      <label class="f">Next inspection due<input type="date" id="${F}-ni" name="next_inspection_due" value="${val("next_inspection_due", u.next_inspection_due)}"></label>
      <label class="f">Manufacturer<input type="text" id="${F}-mf" name="manufacturer" value="${val("manufacturer", u.manufacturer)}"></label>
      <label class="f">Certificate of origin<input type="text" id="${F}-coo" name="origin_document" value="${val("origin_document", u.origin_document)}"></label></div>
      <div class="row"><button class="btn primary">Save these details</button><span class="form-error"></span></div></form>
    <form data-form="consent" data-id="${h(u.id)}" class="stack"><div class="h2">The owner's agreement</div><div class="fields">
      <label class="f">Agreed to be contacted on<input type="date" id="consent-on" name="on" required value="${h(c.dv("consent", "on", u.owner_consent_at ?? ""))}"></label></div>
      <div class="row"><button class="btn">Record the agreement</button><span class="form-error"></span></div></form>
    <form data-form="offer" data-id="${h(u.id)}" class="stack"><div class="h2">Maintenance offer</div><div class="row">
      ${["offered", "accepted", "declined"].map((o) => `<button class="btn small" name="outcome" value="${o}">${o === "offered" ? "Offered" : o === "accepted" ? "Accepted" : "Declined"}</button>`).join("")}<span class="form-error"></span></div></form>
    <form data-form="contract" data-id="${h(u.id)}" class="stack"><div class="h2">Maintenance contract</div><div class="fields">
      <label class="f">Reference<input type="text" id="contract-ref" name="contract_ref" required minlength="2" value="${h(c.dv("contract", "contract_ref", u.maintenance_contract?.contract_ref ?? ""))}"></label>
      <label class="f">Tier<input type="text" id="contract-tier" name="tier" required minlength="2" value="${h(c.dv("contract", "tier", u.maintenance_contract?.tier ?? "standard"))}"></label>
      <label class="f">Starts<input type="date" id="contract-start" name="starts_at" required value="${h(c.dv("contract", "starts_at", u.maintenance_contract?.starts_at ?? ""))}"></label>
      <label class="f">Ends<input type="date" id="contract-end" name="ends_at" required value="${h(c.dv("contract", "ends_at", u.maintenance_contract?.ends_at ?? ""))}"></label></div>
      <div class="row"><button class="btn">Save the contract</button><span class="form-error"></span></div></form>
    <form data-form="done" data-id="${h(u.id)}" class="stack"><div class="h2">Inspection and registration</div><div class="fields">
      <label class="f">Done on<input type="date" id="done-on" name="on" required value="${h(c.dv("done", "on"))}"></label></div>
      <div class="row"><button class="btn small" name="what" value="inspection">Inspection done</button><button class="btn small" name="what" value="registration">Registration renewed</button><span class="form-error"></span></div></form>`;
}

const post = async (c, id, action, body, msg) => {
  await c.api("POST", `/api/lifts/${encodeURIComponent(id)}/${action}`, body);
  c.toast(msg);
  c.refresh("lifts", "board");
};
const v = (fd, k) => (fd.get(k) ?? "").toString().trim();

export const actions = {
  "toggle-unit": (c) => { c.ui.addUnit = !c.ui.addUnit; c.schedule(); },
  renewals: async (c) => { const { id } = await c.api("POST", "/api/runs", { type: "maintenance_renewals", input: {} }); await c.trackRun("renewals", id); },
};

export const forms = {
  unit: async (c, form, fd) => {
    const body = { site: v(fd, "site"), source: v(fd, "source") };
    for (const k of ["handed_over_at", "warranty_ends_at", "next_inspection_due", "manufacturer", "origin_document"]) if (v(fd, k)) body[k] = v(fd, k);
    await c.api("POST", "/api/lifts", body);
    c.clearDraft("unit"); c.ui.addUnit = false; c.toast("Registered."); c.refresh("lifts", "board");
  },
  unitact: async (c, form, fd) => {
    const body = {};
    for (const k of ["handed_over_at", "warranty_ends_at", "next_inspection_due", "manufacturer", "origin_document"]) body[k] = v(fd, k) || null;
    await post(c, form.dataset.id, "confirm", body, "Saved and confirmed.");
    c.clearDraft("unitact");
  },
  consent: async (c, form, fd) => { await post(c, form.dataset.id, "consent", { on: v(fd, "on") }, "Agreement recorded."); },
  offer: async (c, form, fd, btn) => { await post(c, form.dataset.id, "offer", { outcome: btn?.value }, "Recorded."); },
  contract: async (c, form, fd) => {
    await post(c, form.dataset.id, "contract", { contract: { contract_ref: v(fd, "contract_ref"), tier: v(fd, "tier"), starts_at: v(fd, "starts_at"), ends_at: v(fd, "ends_at") } }, "Contract saved.");
    c.clearDraft("contract");
  },
  done: async (c, form, fd, btn) => { await post(c, form.dataset.id, btn?.value === "registration" ? "registration" : "inspection", { on: v(fd, "on") }, "Recorded; the next date is a year on."); },
};
