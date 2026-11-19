// Website: the live site checked from this computer (#32), each failing page one click from a rewrite (#29), the
// quote inbox's domain (#38), and the master company record that every listing is compared with (#31).
import { ago, bidi, chip, fmtDate, fmtDateTime, h, words } from "../ui.js";
import { runProgress } from "./agents.js";

export const needs = ["footprint", "runs"];

const LABEL = { legal_name_en: "Legal name", legal_name_ar: "Legal name (Arabic)", trading_name_en: "Name", trading_name_ar: "Name (Arabic)", cr_number: "CR number",
  vat_number: "VAT number", phone_main: "Main phone", email_main: "Main email", website: "Website", address_en: "Address", address_ar: "Address (Arabic)", po_box: "P.O. Box", founded_year: "Founded" };
const PLATFORM = { website: "Website", google_business_profile: "Google Business Profile", linkedin: "LinkedIn", company_profile: "Company profile", etimad: "Etimad",
  chamber: "Chamber of Commerce", maroof: "Maroof", national_address: "National Address", other: "Other" };
const BAR = [["nothing_false", "Nothing false"], ["working_contacts", "Working contacts"], ["both_languages", "Both languages"], ["enquiry_form_with_consent", "Enquiry form with consent wording"]];

function sitePanel(c) {
  const f = c.data.footprint;
  const site = f.site?.content;
  const model = c.data.status.model.on;
  const track = c.runs.site;
  const pages = site?.pages ?? [];
  const pageBlock = (p) => {
    const groups = new Map();
    for (const x of (p.findings ?? []).filter((y) => y.severity === "fail")) { const g = groups.get(x.check) ?? []; g.push(x.detail); groups.set(x.check, g); }
    for (const x of p.text_failures ?? []) { const g = groups.get(x.rule) ?? []; g.push(x.quote); groups.set(x.rule, g); }
    const n = [...groups.values()].reduce((s, g) => s + g.length, 0);
    const key = `page-${p.url}`;
    return `<details class="panel panel-pad"><summary class="sum"><span class="mono grow">${h(p.url)}</span>${n ? chip(`${n} failures`, "bad") : chip("passes", "ok")}</summary>
      <div class="stack mt8">${[...groups.entries()].map(([rule, quotes]) => `<div class="finding fail"><span class="rule">${h(rule)} · ${quotes.length}</span>${[...new Set(quotes)].slice(0, 4).map((q) => `<q>${bidi(q)}</q>`).join("")}</div>`).join("")}
      ${/^https?:/.test(p.url) ? `<div class="row"><button class="btn small ${model ? "primary" : ""}" data-act="rewrite" data-url="${h(p.url)}" ${model ? "" : "disabled"}>Rewrite this page (#29)</button>${model ? "" : `<span class="small muted">The writers are off. See Connections.</span>`}</div>` : ""}
      ${c.runs[key] ? runProgress(c.runs[key]) : ""}</div></details>`;
  };
  return `<section><h2>The live website</h2><div class="panel panel-pad stack">
    <div class="row between"><div class="small muted">${f.site ? `Checked ${h(ago(f.site.created_at))} (${h(fmtDateTime(f.site.created_at))})` : "Not checked yet."} Pages: ${f.pages.map((p) => `<span class="mono">${h(p)}</span>`).join(", ")}</div>
      <button class="btn primary small" data-act="check-site">Check the live site now</button></div>
    ${track ? runProgress(track, { compact: true }) : ""}
    ${site ? `<div class="grid cols-4">${BAR.map(([k, l]) => `<div class="row">${chip(site.verdict.bar[k] ? "met" : "not met", site.verdict.bar[k] ? "ok" : "bad")}<span class="small">${l}</span></div>`).join("")}</div>
      <p class="small m0">${site.verdict.fails} failures and ${site.verdict.signals} signals across ${site.verdict.pages} pages. Open a page to see what was found and to have the Web Page Writer fix it.</p>
      <div class="stack">${pages.map(pageBlock).join("")}</div>` : ""}
  </div></section>`;
}

function mailPanel(c) {
  const f = c.data.footprint;
  const m = f.mail?.content;
  const fixes = [];
  if (m?.spf?.record && /\?all\s*$/.test(m.spf.record)) fixes.push({ note: "Replace the SPF record (it ends in ?all, which protects nothing):", line: `${m.domain}  TXT  "${m.spf.record.replace(/\?all\s*$/, "~all")}"` });
  if (m && !m.dmarc?.record) fixes.push({ note: "Add DMARC in monitoring mode; change the address to a mailbox someone reads, then tighten p=none to p=quarantine after two to four weeks of clean reports:", line: `_dmarc.${m.domain}  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@${m.domain}"` });
  return `<section><h2>Quote inbox</h2><div class="panel panel-pad stack">
    <div class="row between"><div>${m ? `<strong>@${h(m.domain)}</strong> ${chip(words(m.verdict), m.verdict === "protected" ? "ok" : "bad")}` : `<span class="muted">Not checked yet.</span>`}</div>
      <button class="btn small" data-act="check-mail">Check ${h(f.mailDomain)} now</button></div>
    ${c.runs.mail ? runProgress(c.runs.mail, { compact: true }) : ""}
    ${m ? `<p class="m0">${h(m.summary)}</p>
      <dl class="kv small"><dt>MX</dt><dd class="mono">${h((m.mx?.hosts ?? []).join(", ") || "none")}</dd><dt>SPF</dt><dd class="mono">${h(m.spf?.record ?? "none")}</dd>
        <dt>DKIM</dt><dd>${h((m.dkim?.found ?? []).join(", ") || "not found at the selectors tried")}</dd><dt>DMARC</dt><dd class="mono">${h(m.dmarc?.record ?? "none")}</dd></dl>
      ${[...(m.spf?.issues ?? []), ...(m.dmarc?.issues ?? []), ...(m.mx?.issues ?? []), ...(m.dkim?.issues ?? [])].map((i) => `<div class="finding fail">${h(i)}</div>`).join("")}
      ${fixes.length ? `<div class="h2">The fix, for whoever manages the domain</div>${fixes.map((x, i) => `<p class="small m0">${h(x.note)}</p><div class="row between nowrap"><span class="mono wrap-any" id="fix-${i}">${h(x.line)}</span><button class="btn small" data-act="copy" data-target="#fix-${i}">Copy</button></div>`).join("")}` : ""}
      <p class="small muted m0">Checked ${h(fmtDateTime(f.mail.created_at))}.</p>` : ""}
  </div></section>`;
}

function recordPanel(c) {
  const f = c.data.footprint;
  const p = f.proposal;
  const e = f.entity;
  const editing = c.ui.editEntity;
  const fields = p?.fields ?? e?.fields ?? {};
  const view = `<dl class="kv">${Object.entries(LABEL).filter(([k]) => fields[k] != null && fields[k] !== "").map(([k, l]) => `<dt>${h(l)}</dt><dd ${/_ar$/.test(k) ? 'lang="ar" class="ar"' : ""}>${h(fields[k])}</dd>`).join("")}</dl>`;
  const missing = Object.keys(LABEL).filter((k) => !fields[k] && !["address_ar", "vat_number"].includes(k));
  const F = "entity";
  const form = `<form data-form="${F}" class="stack"><div class="fields">${Object.entries(LABEL).map(([k, l]) => `<label class="f">${h(l)}<input type="${k === "founded_year" ? "number" : "text"}" id="${F}-${k}" name="${k}" ${/_ar$/.test(k) ? 'dir="rtl" lang="ar" class="ar"' : ""} value="${h(c.dv(F, k, fields[k] ?? ""))}"></label>`).join("")}</div>
    <label class="f">Questions still open <span class="hint">one per line; delete a line once it's settled</span><textarea id="${F}-questions" name="questions" dir="auto">${h(c.dv(F, "questions", (p?.questions ?? []).join("\n")))}</textarea></label>
    <div class="row"><button class="btn primary">Save as proposed</button><button type="button" class="btn" data-act="edit-entity">Cancel</button><span class="form-error"></span></div></form>`;
  return `<section><h2>Master company record (#31)</h2><div class="panel panel-pad stack">
    <div class="row between"><h3>${p ? "Proposed: awaiting your approval" : e ? `Approved, version ${e.version}, ${h(fmtDate(e.approved_at))}` : "No record yet"}</h3>
      <button class="btn small" data-act="edit-entity">${editing ? "Close the editor" : p || e ? "Edit" : "Start the record"}</button></div>
    ${editing ? form : view}
    ${!editing && missing.length && (p || e) ? `<p class="small muted m0">Not filled in: ${h(missing.map((k) => LABEL[k]).join(", "))}.</p>` : ""}
    ${!editing && p?.questions?.length ? `<div class="stack"><div class="h2">Questions to settle first</div>${p.questions.map((q) => `<div class="finding signal"><span>${bidi(q)}</span></div>`).join("")}</div>` : ""}
    ${!editing && p ? `<div class="row"><button class="btn primary" data-act="approve-entity">Approve as the master record</button><span class="small muted">Every listing is then checked against it.</span></div>` : ""}
    ${!p && !e ? `<p class="small muted m0">Import the fact base from Proof to start from the company record there.</p>` : ""}
  </div></section>`;
}

function listingsPanel(c) {
  const l = c.data.footprint.listings;
  const judged = Boolean(c.data.footprint.entity);
  return `<section><h2>Listings</h2><div class="panel table-wrap">${l.length ? `<table><thead><tr><th>Where</th><th>Last seen</th><th>Against the master record</th></tr></thead><tbody>${l.map((x) => {
    const bad = (x.findings ?? []).filter((y) => y.severity === "fail");
    return `<tr><td>${h(PLATFORM[x.platform] ?? words(x.platform))}<div class="small muted">${h(x.url ?? "")}</div></td><td class="small">${x.lastObservedAt ? h(fmtDate(x.lastObservedAt)) : chip("never", "warn")}${x.stale && x.lastObservedAt ? ` ${chip("recheck", "warn")}` : ""}</td>
      <td class="small">${bad.length ? bad.map((b) => `<div class="bad-text">${h(b.why)} <span class="muted">Seen: ${bidi(b.observed)}</span></div>`).join("") : !judged ? `<span class="muted">Not compared: approve the master record first.</span>` : x.lastObservedAt ? chip("matches", "ok") : `<span class="muted">Not seen yet.</span>`}</td></tr>`;
  }).join("")}</tbody></table>` : `<p class="empty panel-pad">The website check records the site as the first listing. No approved master record yet means listings are recorded, not judged.</p>`}</div></section>`;
}

export function render(c) {
  return `<div class="page-head"><div><h1>Website</h1><p>The live site and the inbox quotes go out from, checked from this computer, and the company record every public listing must match.</p></div></div>
  ${sitePanel(c)}
  <div class="grid cols-2">${mailPanel(c)}${listingsPanel(c)}</div>
  ${recordPanel(c)}`;
}

export const actions = {
  "check-site": async (c) => {
    const { id } = await c.api("POST", "/api/runs", { type: "site_check", input: { pages: c.data.footprint.pages.map((url) => ({ url })) } });
    await c.trackRun("site", id);
  },
  "check-mail": async (c) => {
    const { id } = await c.api("POST", "/api/runs", { type: "mail_domain_check", input: { domain: c.data.footprint.mailDomain } });
    await c.trackRun("mail", id);
  },
  rewrite: async (c, t) => {
    const { id } = await c.api("POST", "/api/runs", { type: "web_page", input: { page_url: t.dataset.url } });
    await c.trackRun(`page-${t.dataset.url}`, id);
    c.toast("The Web Page Writer is reading the page.");
  },
  "edit-entity": (c) => { c.ui.editEntity = !c.ui.editEntity; c.clearDraft("entity"); c.schedule(); },
  "approve-entity": async (c) => { const r = await c.api("POST", "/api/entity/approve"); c.toast(`Approved as version ${r.version}.`); c.refresh("footprint", "board"); },
};

export const forms = {
  entity: async (c, form, fd) => {
    const fields = {};
    for (const k of Object.keys(LABEL)) { const v = (fd.get(k) ?? "").toString().trim(); if (v) fields[k] = k === "founded_year" ? Number(v) : v; }
    const questions = (fd.get("questions") ?? "").toString().split("\n").map((x) => x.trim()).filter(Boolean);
    await c.api("POST", "/api/entity/proposal", { fields, questions });
    c.clearDraft("entity"); c.ui.editEntity = false; c.toast("Saved. The record stays proposed until you approve it."); c.refresh("footprint", "board");
  },
};
