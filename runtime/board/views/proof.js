// Proof: the 17 December proof test, and the evidence store the agents write from (#20). Evidence filed here is a
// draft until Asil approves it (S-G5); approved evidence can't change, only be withdrawn.
import { chip, fmtDate, h, words } from "../ui.js";

export const needs = ["evidence"];

const TYPES = ["contract", "completion_certificate", "referee_consent", "reference_letter", "certificate", "case_facts", "company_record", "client_naming_approval", "financial_statement", "bank_letter", "cost_record"];
const NAMES = ["", "contract_value", "start_date", "completion_date", "project_title", "scope", "constraint", "client_name", "client_descriptor", "floors", "area", "beds", "elevators", "seats"];
const opt = (v, l, cur) => `<option value="${h(v)}" ${String(cur) === String(v) ? "selected" : ""}>${h(l)}</option>`;
const yes = (v) => (v ? chip("yes", "ok") : chip("missing", "bad"));

export function render(c) {
  const e = c.data.evidence;
  const t = e.test;
  const documented = e.proof.filter((p) => p.documented).length;
  const projects = [...new Set(e.records.map((r) => r.project_ref).filter(Boolean))].sort();
  const pf = c.ui.evProject ?? "all";
  const list = e.records.filter((r) => pf === "all" || (pf === "company" ? !r.project_ref : r.project_ref === pf))
    .sort((a, b) => Number(b.status === "draft") - Number(a.status === "draft") || (a.project_ref ?? "").localeCompare(b.project_ref ?? "") || a.type.localeCompare(b.type));
  return `<div class="page-head"><div><h1>Proof</h1><p>The proof test asks for Qottuf's own documents for ${t.projects_required} projects by ${h(fmtDate(t.due))}: ${h(t.required_facts.map(words).join(", "))}, with ${h(t.required_types.map(words).join(" and "))}. ${documented} of ${t.projects_required} so far.</p></div>
    <button class="btn primary" data-act="toggle-file">File evidence</button></div>
  ${!e.imported ? `<div class="banner">${e.brandDir ? `Start from the brand fact base: the projects as public evidence, the clients the company already names, the lifts on record and the company record.
      <div class="mt8"><button class="btn small primary" data-act="import">Import the fact base</button> <span class="small muted">${h(e.brandDir)}</span></div>`
      : "The qottuf-brand skill wasn't found on this computer, so the fact base can't be imported yet. Set QOTTUF_BRAND_DIR in runtime/.env to the skill's folder and restart the board."}</div>` : ""}
  ${c.ui.fileEvidence ? fileForm(c, projects) : ""}
  <section><h2>Projects and the proof test</h2><div class="panel table-wrap"><table><thead><tr><th>Project</th><th>Contract value</th><th>Dates</th><th>Contract</th><th>Completion certificate</th><th>Referee consent</th><th>Proof test</th></tr></thead><tbody>
    ${e.proof.map((p) => `<tr><td class="mono">${h(p.projectRef)}</td><td class="num">${p.contractValueSar != null ? `SAR ${h(p.contractValueSar.toLocaleString("en-US"))}` : chip("missing", "bad")}</td>
      <td>${p.startDate && p.completionDate ? h(`${p.startDate} to ${p.completionDate}`) : chip("missing", "bad")}</td><td>${yes(p.hasContract)}</td><td>${yes(p.hasCompletionCertificate)}</td><td>${yes(p.hasRefereeConsent)}</td>
      <td>${p.documented ? chip("documented", "ok") : chip("not yet", "warn")}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">No approved project evidence yet.</td></tr>`}
  </tbody></table></div></section>
  <section><h2>Evidence on file (${e.records.length})</h2>
    <div class="row mb8"><label class="f">Show<select id="ev-filter" data-act="ev-project">${opt("all", "Everything", pf)}${opt("company", "Company records", pf)}${projects.map((p) => opt(p, p, pf)).join("")}</select></label></div>
    <div class="stack">${list.map((r) => card(r)).join("") || `<p class="empty">No evidence filed.</p>`}</div></section>`;
}

function card(r) {
  const naming = r.type === "client_naming_approval";
  const client = naming ? r.title.replace(/ may be named.*$/, "") : null;
  return `<div class="panel panel-pad stack">
    <div class="row between"><div><strong>${h(r.title)}</strong><div class="small muted"><span class="mono">${h(r.id)}</span>${r.project_ref ? ` · ${h(r.project_ref)}` : ""} · ${h(words(r.type))}${r.issuer ? ` · ${h(r.issuer)}` : ""}</div></div>
      <div class="row">${chip(r.tier)}${chip(r.status, r.status === "approved" ? "ok" : r.status === "withdrawn" ? "bad" : "warn")}${r.expires_at ? chip(`expires ${fmtDate(r.expires_at)}`, "warn") : ""}</div></div>
    ${r.facts?.length ? `<div class="small">${r.facts.map((f) => `<div>${h(f.label)}${f.kind !== "statement" ? `: <span class="num">${h(typeof f.value === "number" ? f.value.toLocaleString("en-US") : f.value)}</span>${f.unit ? ` ${h(f.unit)}` : ""}` : ""}</div>`).join("")}</div>` : ""}
    ${naming ? `<div class="small muted">May be named: ${h((r.permitted_uses ?? []).map((u) => u.replace("name_client:", "")).join(", ") || "nowhere")}.</div>` : ""}
    <div class="row">${r.status === "draft" ? `<button class="btn small primary" data-act="ev-approve" data-id="${h(r.id)}">Approve (S-G5)</button>` : ""}
      ${r.status !== "withdrawn" ? `<button class="btn small danger" data-act="ev-withdraw" data-id="${h(r.id)}">Withdraw</button>` : ""}
      ${naming && r.status === "approved" && !(r.permitted_uses ?? []).includes("name_client:tender") && r.project_ref ? `<button class="btn small" data-act="ev-tender" data-ref="${h(r.project_ref)}" data-client="${h(client)}">Allow naming in tenders</button>` : ""}</div>
  </div>`;
}

function fileForm(c, projects) {
  const F = "ev";
  const rows = Number(c.dv(F, "rows", "2"));
  return `<form class="panel panel-pad" data-form="${F}"><div class="row between"><h3>File evidence</h3><button type="button" class="btn small" data-act="toggle-file">Cancel</button></div>
    <div class="fields">
      <label class="f">Type<select id="${F}-type" name="type">${TYPES.map((t) => opt(t, words(t), c.dv(F, "type", "contract"))).join("")}</select></label>
      <label class="f">Tier<select id="${F}-tier" name="tier">${opt("tender", "Tender: shared in bids", c.dv(F, "tier"))}${opt("public", "Public", c.dv(F, "tier"))}${opt("confidential", "Confidential: released by Asil only", c.dv(F, "tier"))}${opt("internal", "Internal: never leaves", c.dv(F, "tier"))}</select></label>
      <label class="f">Project <span class="hint">PRJ-000, or blank for the company</span><input type="text" id="${F}-project" name="project_ref" list="ev-projects" pattern="PRJ-[0-9]+" value="${h(c.dv(F, "project_ref"))}"></label>
      <label class="f">Title<input type="text" id="${F}-title" name="title" required minlength="3" value="${h(c.dv(F, "title"))}"></label>
      <label class="f">Issued by <span class="hint">optional</span><input type="text" id="${F}-issuer" name="issuer" value="${h(c.dv(F, "issuer"))}"></label>
      <label class="f">Issued<input type="date" id="${F}-issued" name="issued_at" value="${h(c.dv(F, "issued_at"))}"></label>
      <label class="f">Expires<input type="date" id="${F}-expires" name="expires_at" value="${h(c.dv(F, "expires_at"))}"></label>
      <label class="f">Certificate for <span class="hint">CR, Zakat, GOSI…</span><input type="text" id="${F}-cert" name="cert" value="${h(c.dv(F, "cert"))}"></label>
    </div>
    <div class="h2">Facts on the document</div>
    ${Array.from({ length: rows }, (_, i) => `<div class="fields">
      <label class="f">Fact<select id="${F}-n${i}" name="n${i}">${NAMES.map((n) => opt(n, n ? words(n) : "choose", c.dv(F, `n${i}`))).join("")}</select></label>
      <label class="f">Value<input type="text" id="${F}-v${i}" name="v${i}" value="${h(c.dv(F, `v${i}`))}" placeholder="38000000, 2021-09, or text"></label>
      <label class="f">Unit<input type="text" id="${F}-u${i}" name="u${i}" value="${h(c.dv(F, `u${i}`))}" placeholder="sar, sqm, floor, bed"></label></div>`).join("")}
    <div><button type="button" class="btn small" data-act="ev-more">Add a fact</button></div>
    <p class="small muted m0">Filed as a draft; approve it and agents can use it. The document itself stays in Qottuf's files.</p>
    <div class="row"><button class="btn primary">File as draft</button><span class="form-error"></span></div>
    <datalist id="ev-projects">${projects.map((p) => `<option value="${h(p)}">`).join("")}</datalist></form>`;
}

export const actions = {
  "toggle-file": (c) => { c.ui.fileEvidence = !c.ui.fileEvidence; c.schedule(); },
  "ev-project": (c, t) => { c.ui.evProject = t.value; c.schedule(); },
  "ev-more": (c) => { (c.S.drafts.ev ??= {}).rows = String(Number(c.dv("ev", "rows", "2")) + 1); c.schedule(); },
  import: async (c) => {
    const r = await c.api("POST", "/api/import-facts");
    c.toast(`Imported ${r.evidence} evidence records, ${r.lifts} lifts${r.proposal ? " and the proposed company record" : ""}.${r.skipped.length ? ` Skipped: ${r.skipped.join("; ")}.` : ""}`);
    c.refresh("evidence", "lifts", "footprint", "board");
  },
  "ev-approve": async (c, t) => { await c.api("POST", `/api/evidence/${encodeURIComponent(t.dataset.id)}/approve`); c.toast("Approved. Agents can use it now."); c.refresh("evidence", "board"); },
  "ev-withdraw": async (c, t) => {
    if (c.ui.confirmWithdraw !== t.dataset.id) { c.ui.confirmWithdraw = t.dataset.id; t.textContent = "Click again to withdraw"; setTimeout(() => { c.ui.confirmWithdraw = null; c.schedule(); }, 5000); return; }
    c.ui.confirmWithdraw = null;
    await c.api("POST", `/api/evidence/${encodeURIComponent(t.dataset.id)}/withdraw`, { reason: "Withdrawn on the board by Asil" });
    c.toast("Withdrawn. No agent will use it."); c.refresh("evidence", "board");
  },
  "ev-tender": async (c, t) => { await c.api("POST", "/api/evidence/naming", { project_ref: t.dataset.ref, client: t.dataset.client, use: "tender" }); c.toast("The client may now be named in tenders."); c.refresh("evidence"); },
};

export const forms = {
  ev: async (c, form, fd) => {
    const v = (k) => (fd.get(k) ?? "").toString().trim();
    const facts = [];
    for (let i = 0; i < Number(c.dv("ev", "rows", "2")); i++) {
      const n = v(`n${i}`), val = v(`v${i}`);
      if (!n || !val) continue;
      const isNum = /^-?\d+(\.\d+)?$/.test(val.replace(/,/g, "")), isDate = /^\d{4}-\d{2}(-\d{2})?$/.test(val);
      facts.push({ id: `${n}${i}`, kind: isDate ? "date" : isNum ? "figure" : "statement", name: n, value: isNum ? Number(val.replace(/,/g, "")) : val,
        ...(v(`u${i}`) ? { unit: v(`u${i}`) } : {}), label: `${words(n)}${v("project_ref") ? `, ${v("project_ref")}` : ""}` });
    }
    await c.api("POST", "/api/evidence", { type: v("type"), tier: v("tier"), title: v("title"), facts,
      ...(v("project_ref") ? { project_ref: v("project_ref") } : {}), ...(v("issuer") ? { issuer: v("issuer") } : {}),
      ...(v("issued_at") ? { issued_at: v("issued_at") } : {}), ...(v("expires_at") ? { expires_at: v("expires_at") } : {}),
      permitted_uses: v("cert") ? [`certificate:${v("cert")}`] : [] });
    c.clearDraft("ev"); c.ui.fileEvidence = false; c.toast("Filed as a draft. Approve it to let agents use it."); c.refresh("evidence", "board");
  },
};
