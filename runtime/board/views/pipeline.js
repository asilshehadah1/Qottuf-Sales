// Pipeline: accounts and opportunities in the Ledger, run by the Pipeline Engine (#2). Every open opportunity has an
// owner, a next step and a date; an invited tender is screened against the knock-outs, and only Asil decides the bid.
import { band, chip, dueText, fmtDateTime, fromLocal, h, localInput, words } from "../ui.js";

export const needs = ["pipeline"];

const STAGE_TONE = { won: "ok", lost: "bad", screened: "warn", go: "live" };
const stageChip = (s) => chip(words(s), STAGE_TONE[s] ?? "");
const koTone = (s) => (s === "pass" ? "ok" : s === "fail" ? "bad" : "warn");
const opt = (v, l, cur) => `<option value="${h(v)}" ${String(cur) === String(v) ? "selected" : ""}>${h(l)}</option>`;

function ruler(o, b) {
  const max = 150e6, x = (v) => Math.max(0, Math.min(300, (v / max) * 300));
  const lo = o.value_min_sar ?? o.value_max_sar, hi = o.value_max_sar ?? o.value_min_sar;
  return `<svg class="ruler" viewBox="0 0 320 34" width="320" height="34" role="img" aria-label="Value against the SAR ${b.min / 1e6} to ${b.max / 1e6} million band">
    <rect class="track" x="10" y="11" width="300" height="4" rx="2"></rect>
    <rect class="band" x="${10 + x(b.min)}" y="9" width="${x(b.max) - x(b.min)}" height="8" rx="2"></rect>
    ${lo == null ? "" : `<rect class="val" x="${10 + x(lo)}" y="6" width="${Math.max(3, x(hi) - x(lo))}" height="14" rx="2"></rect>`}
    ${[0, 20e6, 50e6, 100e6, 150e6].map((t) => `<text x="${10 + x(t)}" y="31" text-anchor="middle">${t / 1e6}</text>`).join("")}
  </svg>`;
}

export function render(c) {
  const { data, ui } = c;
  const p = data.pipeline;
  const f = ui.pipeMotion ?? "all";
  const accName = (id) => p.accounts.find((a) => a.id === id)?.name_en ?? "";
  const list = p.opportunities.filter((o) => (f === "all" || o.motion === f) && (ui.showClosed || o.open))
    .sort((a, b) => (a.next_step?.due_at ?? "9").localeCompare(b.next_step?.due_at ?? "9"));
  const seg = [["all", "All"], ["contracting", "Contracting"], ["elevator", "Elevators"]].map(([v, l]) => `<button data-act="pipe-filter" data-v="${v}" aria-pressed="${f === v}">${l}</button>`).join("");
  const rows = list.map((o) => {
    const late = o.next_step && Date.parse(o.next_step.due_at) < Date.now();
    return `<tr class="click ${c.sub === o.id ? "sel" : ""}" data-act="go" data-view="pipeline" data-sub="${h(o.id)}">
      <td><div>${h(o.title)}</div><div class="small muted"><span class="mono">${h(o.id)}</span> ${h(accName(o.account_id))}</div></td>
      <td>${stageChip(o.stage)}</td><td class="num small">${o.motion === "contracting" ? h(band(o)) : "elevator"}</td>
      <td class="small">${o.next_step ? `${h(o.next_step.action)}<div class="${late ? "bad-text" : "muted"}">${h(o.next_step.owner)}, ${h(dueText(o.next_step.due_at))}</div>` : `<span class="muted">${h(words(o.outcome?.result ?? "closed"))}</span>`}</td>
      <td>${o.scorecard ? chip(o.scorecard.overall, koTone(o.scorecard.overall)) : ""}</td></tr>`;
  }).join("");
  return `<div class="page-head"><div><h1>Pipeline</h1><p>Main contracts of SAR ${p.band.min / 1e6}–${p.band.max / 1e6} m, as main contractor, and elevator opportunities. Every open opportunity has an owner, a next step and a date.</p></div>
    <div class="row"><button class="btn" data-act="toggle" data-key="newAccount">New account</button><button class="btn primary" data-act="toggle" data-key="newOpp">New opportunity</button></div></div>
  ${ui.newAccount ? accountForm(c) : ""}
  ${ui.newOpp ? oppForm(c) : ""}
  ${p.alerts.length ? `<section><h2>Alerts</h2><div class="panel panel-pad stack small">${p.alerts.map((a) => `<div class="row between"><span>${h(a.title)}: ${h(a.detail ?? words(a.kind))}</span><span class="muted">${h(a.owner ?? "")}</span></div>`).join("")}</div></section>` : ""}
  <div class="row between"><div class="seg" role="group">${seg}</div><label class="check-inline small"><input type="checkbox" id="show-closed" data-act="show-closed" ${ui.showClosed ? "checked" : ""}> Show closed</label></div>
  <div class="panel table-wrap">${list.length ? `<table><thead><tr><th>Opportunity</th><th>Stage</th><th>Value</th><th>Next step</th><th>Knock-outs</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="empty panel-pad">${p.opportunities.length ? "None match." : "No opportunities yet. Add the account first, then the opportunity."}</p>`}</div>
  ${p.accounts.length ? `<section><h2>Accounts (${p.accounts.length})</h2><div class="panel panel-pad small">${p.accounts.map((a) => `<span class="acct">${h(a.name_en)}${a.name_ar ? ` <span lang="ar">${h(a.name_ar)}</span>` : ""} <span class="muted">${h(words(a.type))}</span></span>`).join(" · ")}</div></section>` : ""}`;
}

function nextStepFields(c, F) {
  return `<div class="fields">
    <label class="f">Next step<input type="text" id="${F}-action" name="action" required minlength="3" value="${h(c.dv(F, "action"))}" placeholder="Call the project manager about the site walk"></label>
    <label class="f">Owner<input type="text" id="${F}-owner" name="owner" list="roles" required minlength="2" value="${h(c.dv(F, "owner", "asil"))}"></label>
    <label class="f">Due<input type="datetime-local" id="${F}-due" name="due" required value="${h(c.dv(F, "due", localInput(new Date(Date.now() + 86400000))))}"></label></div>
    <datalist id="roles">${["asil", "bid_coordinator", "desk_lead", "technical_office", "estimator", "maintenance_supervisor"].map((r) => `<option value="${r}">`).join("")}</datalist>`;
}

const TYPES = ["owner", "developer", "pmc", "consultant", "main_contractor", "university", "hospital_group", "bank", "corporate", "government", "other"];
function accountForm(c) {
  const F = "acct";
  return `<form class="panel panel-pad" data-form="${F}"><div class="row between"><h3>New account</h3><button type="button" class="btn small" data-act="toggle" data-key="newAccount">Cancel</button></div>
    <div class="fields"><label class="f">Name<input type="text" id="${F}-name" name="name_en" required minlength="2" value="${h(c.dv(F, "name_en"))}"></label>
      <label class="f">Name in Arabic <span class="hint">optional</span><input type="text" id="${F}-name-ar" name="name_ar" dir="rtl" lang="ar" class="ar" value="${h(c.dv(F, "name_ar"))}"></label>
      <label class="f">Type<select id="${F}-type" name="type">${TYPES.map((t) => opt(t, words(t), c.dv(F, "type", "owner"))).join("")}</select></label>
      <label class="f">Sector <span class="hint">optional</span><input type="text" id="${F}-sector" name="sector" value="${h(c.dv(F, "sector"))}" placeholder="education, healthcare, banking"></label>
      <label class="f">Priority <span class="hint">1 to 20, optional</span><input type="number" min="1" max="20" id="${F}-rank" name="priority_rank" value="${h(c.dv(F, "priority_rank"))}"></label></div>
    <p class="small muted m0">An account is an organisation. People's names and numbers aren't kept here.</p>
    <div class="row"><button class="btn primary">Add account</button><span class="form-error"></span></div></form>`;
}

function oppForm(c) {
  const F = "newopp";
  const p = c.data.pipeline;
  const motion = c.dv(F, "motion", "contracting");
  return `<form class="panel panel-pad" data-form="${F}"><div class="row between"><h3>New opportunity</h3><button type="button" class="btn small" data-act="toggle" data-key="newOpp">Cancel</button></div>
    <div class="fields">
      <label class="f">Motion<select id="${F}-motion" name="motion" data-redraw>${opt("contracting", "Contracting (main contract)", motion)}${opt("elevator", "Elevator or maintenance", motion)}</select></label>
      <label class="f">Title<input type="text" id="${F}-title" name="title" required minlength="3" value="${h(c.dv(F, "title"))}"></label>
      <label class="f">Account<select id="${F}-acc" name="account_id">${opt("", "None yet", c.dv(F, "account_id"))}${p.accounts.map((a) => opt(a.id, a.name_en, c.dv(F, "account_id"))).join("")}</select></label>
      <label class="f">Stage<select id="${F}-stage" name="stage">${p.initial[motion].map((s) => opt(s, words(s), c.dv(F, "stage"))).join("")}</select></label>
      ${motion === "contracting" ? `
      <label class="f">Route<select id="${F}-route" name="route">${["invited_private", "etimad_public", "direct_negotiated", "framework", "prequalification_list"].map((s) => opt(s, words(s), c.dv(F, "route"))).join("")}</select></label>
      <label class="f">Qottuf's role<select id="${F}-role" name="qottuf_role">${["main_contractor", "jv_partner", "subcontractor"].map((s) => opt(s, words(s), c.dv(F, "qottuf_role"))).join("")}</select></label>
      <label class="f">Sector<input type="text" id="${F}-sector" name="sector" value="${h(c.dv(F, "sector", "education"))}"></label>
      <label class="f">Value from <span class="hint">SAR million</span><input type="number" step="0.1" min="0" id="${F}-lo" name="lo" value="${h(c.dv(F, "lo"))}"></label>
      <label class="f">Value to <span class="hint">SAR million</span><input type="number" step="0.1" min="0" id="${F}-hi" name="hi" value="${h(c.dv(F, "hi"))}"></label>
      <label class="f">Submission deadline<input type="datetime-local" id="${F}-deadline" name="deadline" value="${h(c.dv(F, "deadline"))}"></label>`
      : `<label class="f">Route<select id="${F}-route" name="route">${["inbound_elevator", "maintenance_renewal"].map((s) => opt(s, words(s), c.dv(F, "route"))).join("")}</select></label>`}
    </div>
    ${motion === "contracting" ? `<fieldset><legend>Service lines</legend>${p.serviceLines.map((l) => `<label class="check-inline"><input type="checkbox" id="${F}-line-${h(l)}" name="lines" value="${h(l)}" ${c.dv(F, `lines:${l}`, l === "fit_out") ? "checked" : ""}> ${h(words(l))}</label>`).join("")}</fieldset>` : ""}
    ${nextStepFields(c, F)}
    <div class="row"><button class="btn primary">Add opportunity</button><span class="form-error"></span></div></form>`;
}

// ---------------------------------------------------------------- one opportunity
export function drawer(c) {
  const p = c.data.pipeline;
  const o = c.sub && p.opportunities.find((x) => x.id === c.sub);
  if (!o) return "";
  if (c.ui.oppDraftsFor !== o.id) { for (const f of ["move", "decide", "nextstep"]) c.clearDraft(f); c.ui.oppDraftsFor = o.id; }
  const s = o.scorecard;
  const events = loadEvents(c, o);
  const allowed = o.allowed.filter((x) => !(o.motion === "contracting" && ["screened", "go"].includes(x)) && o.stage !== "screened");
  const acc = p.accounts.find((a) => a.id === o.account_id);
  return `<div class="head"><div class="stack"><div class="row"><span class="mono muted">${h(o.id)}</span>${stageChip(o.stage)}</div><h2 class="title">${h(o.title)}</h2></div>
      <button class="btn small" data-act="close-drawer">Close</button></div>
    <dl class="kv small"><dt>Account</dt><dd>${h(acc?.name_en ?? "none")}</dd><dt>Motion</dt><dd>${h(o.motion)}</dd><dt>Route</dt><dd>${h(words(o.route))}</dd><dt>Role</dt><dd>${h(words(o.qottuf_role))}</dd>
      ${o.motion === "contracting" ? `<dt>Value</dt><dd>${h(band(o))}${ruler(o, p.band)}</dd><dt>Deadline</dt><dd>${o.dates?.submission_deadline ? h(fmtDateTime(o.dates.submission_deadline)) : "not recorded"}</dd>` : ""}
      <dt>Next step</dt><dd>${o.next_step ? `${h(o.next_step.action)} (${h(o.next_step.owner)}, ${h(fmtDateTime(o.next_step.due_at))})` : "none"}</dd></dl>
    ${s ? `<section><h2>Knock-outs</h2><div class="table-wrap panel"><table><tbody>${s.knockouts.map((k) => `<tr><td>${h(k.label)} <span class="mono muted">${h(k.code)}</span></td><td>${chip(k.status, koTone(k.status))}</td><td class="small">${h(k.detail)}${k.alternative ? `<div class="muted">Alternative: ${h(k.alternative)}</div>` : ""}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
    ${s?.decision ? `<div class="banner ${s.decision.decision === "go" ? "ok" : ""}">Decision: <strong>${s.decision.decision === "go" ? "bid" : "no-bid"}</strong> by ${h(s.decision.by)}, ${h(fmtDateTime(s.decision.at))}. ${h(s.decision.reason)}${s.decision.override ? ` Override: ${h(s.decision.override)}` : ""}${s.score ? ` Score ${s.score.score}${s.score.partial ? " (partial)" : ""}: ${h(words(s.score.recommendation))}.` : ""}</div>` : ""}
    ${o.open && o.motion === "contracting" && o.stage === "invitation" ? `<div class="row"><button class="btn primary" data-act="screen" data-id="${h(o.id)}">Screen against the rules</button><span class="small muted">Starts the 48-hour bid-decision clock.</span></div>` : ""}
    ${o.open && o.stage === "screened" && !s?.decision ? decideForm(c, o) : ""}
    ${o.open && o.stage !== "screened" && allowed.length ? moveForm(c, o, allowed) : ""}
    ${o.open ? `<details><summary>Change the next step</summary><form data-form="nextstep" data-id="${h(o.id)}" class="mt8">${nextStepFields(c, "nextstep")}<div class="row"><button class="btn small">Save the next step</button><span class="form-error"></span></div></form></details>` : ""}
    <section><h2>History</h2><div class="stack small">${events ? events.slice().reverse().map((e) => `<div>${h(fmtDateTime(e.at))}: ${h(words(e.event))}${e.from_stage && e.to_stage && e.from_stage !== e.to_stage ? ` ${h(words(e.from_stage))} → ${h(words(e.to_stage))}` : ""} <span class="muted">by ${h(e.actor)}</span>${e.details?.reason ? `, ${h(e.details.reason)}` : ""}</div>`).join("") : `<p class="empty m0">Loading…</p>`}</div></section>`;
}

function loadEvents(c, o) {
  const cache = c.ui.events ?? (c.ui.events = {});
  const key = `${o.id}:${o.version}`;
  if (!cache[key] && !cache[`${key}:loading`]) {
    cache[`${key}:loading`] = true;
    c.api("GET", `/api/opportunities/${encodeURIComponent(o.id)}/events`).then((ev) => { cache[key] = ev; }).catch(() => { cache[key] = []; }).finally(() => c.schedule());
  }
  return cache[key];
}

function decideForm(c, o) {
  const F = "decide";
  const fail = o.scorecard.overall === "fail";
  const decision = c.dv(F, "decision", fail ? "no_bid" : "go");
  const factors = c.data.pipeline.factors.map((x) => `<label class="f">${h(x.label)} <span class="hint">weight ${x.weight}</span>
    <select id="${F}-f-${x.id}" name="f-${x.id}">${opt("", "no data", c.dv(F, `f-${x.id}`))}${[0, 1, 2, 3].map((v) => opt(v, v, c.dv(F, `f-${x.id}`))).join("")}</select></label>`).join("");
  return `<form class="panel panel-pad stack" data-form="${F}" data-id="${h(o.id)}"><h3>Your decision (gate S-G1), ${h(dueText(o.scorecard.decision_due))}</h3>
    <div class="seg" role="radiogroup">${[["go", "Bid"], ["no_bid", "No-bid"]].map(([v, l]) => `<button type="button" data-act="decide-pick" data-v="${v}" aria-pressed="${decision === v}">${l}</button>`).join("")}</div>
    <input type="hidden" id="${F}-decision" name="decision" value="${h(decision)}">
    <label class="f">Reason<input type="text" id="${F}-reason" name="reason" required value="${h(c.dv(F, "reason"))}"></label>
    ${decision === "go" && fail ? `<label class="f">A knock-out failed. Why bid anyway?<input type="text" id="${F}-override" name="override" required value="${h(c.dv(F, "override"))}"></label>` : ""}
    ${decision === "go" ? nextStepFields(c, F) : ""}
    <details><summary>Scorecard (optional)</summary><div class="fields mt8">${factors}</div></details>
    <div class="row"><button class="btn primary">Record the decision</button><span class="form-error"></span></div></form>`;
}

function moveForm(c, o, allowed) {
  const F = "move";
  const to = c.dv(F, "to", allowed[0]);
  const closing = ["won", "lost", "no_bid", "withdrawn", "cancelled"].includes(to);
  return `<form class="stack" data-form="${F}" data-id="${h(o.id)}"><div class="fields">
      <label class="f">Move to<select id="${F}-to" name="to" data-redraw>${allowed.map((a) => opt(a, words(a), to)).join("")}</select></label>
      ${to === "lost" ? `<label class="f">Main reason<select id="${F}-reason-l" name="primary_reason">${c.data.pipeline.lossReasons.map((r) => opt(r, words(r), c.dv(F, "primary_reason"))).join("")}</select></label><label class="f">Winner, if known<input type="text" id="${F}-winner" name="winner" value="${h(c.dv(F, "winner"))}"></label>` : ""}
      ${to === "won" ? `<label class="f">Contract value <span class="hint">SAR</span><input type="number" min="1" id="${F}-value" name="value_sar" required value="${h(c.dv(F, "value_sar"))}"></label>` : ""}
      ${["no_bid", "withdrawn", "cancelled"].includes(to) ? `<label class="f">Why<input type="text" id="${F}-why" name="reason" required value="${h(c.dv(F, "reason"))}"></label>` : ""}</div>
    ${closing ? "" : nextStepFields(c, F)}
    <div class="row"><button class="btn">Move</button><span class="form-error"></span></div></form>`;
}

const v = (fd, k) => (fd.get(k) ?? "").toString().trim();
const step = (fd) => ({ action: v(fd, "action"), owner: v(fd, "owner"), due_at: fromLocal(v(fd, "due")) });

export const actions = {
  "pipe-filter": (c, t) => { c.ui.pipeMotion = t.dataset.v; c.schedule(); },
  "show-closed": (c, t) => { c.ui.showClosed = t.checked; c.schedule(); },
  toggle: (c, t) => { c.ui[t.dataset.key] = !c.ui[t.dataset.key]; c.schedule(); },
  "decide-pick": (c, t) => { (c.S.drafts.decide ??= {}).decision = t.dataset.v; c.schedule(); },
  screen: async (c, t) => {
    const s = await c.api("POST", `/api/opportunities/${encodeURIComponent(t.dataset.id)}/screen`);
    c.toast(`Screened: knock-outs ${s.overall}. The 48-hour decision clock has started.`);
    c.refresh("pipeline", "board");
  },
};

export const forms = {
  acct: async (c, form, fd) => {
    const rank = v(fd, "priority_rank");
    await c.api("POST", "/api/accounts", { name_en: v(fd, "name_en"), ...(v(fd, "name_ar") ? { name_ar: v(fd, "name_ar") } : {}), type: v(fd, "type"),
      ...(v(fd, "sector") ? { sector: v(fd, "sector") } : {}), ...(rank ? { priority_rank: Number(rank) } : {}) });
    c.clearDraft("acct"); c.ui.newAccount = false; c.toast("Account added."); c.refresh("pipeline");
  },
  newopp: async (c, form, fd) => {
    const motion = v(fd, "motion");
    const lo = v(fd, "lo") ? Math.round(Number(v(fd, "lo")) * 1e6) : undefined;
    const hi = v(fd, "hi") ? Math.round(Number(v(fd, "hi")) * 1e6) : lo;
    const { id } = await c.api("POST", "/api/opportunities", {
      motion, title: v(fd, "title"), ...(v(fd, "account_id") ? { account_id: v(fd, "account_id") } : {}), route: v(fd, "route"),
      qottuf_role: motion === "contracting" ? v(fd, "qottuf_role") : "supplier_installer", ...(motion === "contracting" && v(fd, "sector") ? { sector: v(fd, "sector") } : {}),
      service_lines: fd.getAll("lines").map(String), stage: v(fd, "stage"), owner: "asil", next_step: step(fd),
      ...(lo != null ? { value_min_sar: lo, value_max_sar: hi, value_source: "estimate" } : {}),
      ...(v(fd, "deadline") ? { dates: { submission_deadline: fromLocal(v(fd, "deadline")) } } : {}),
    });
    c.clearDraft("newopp"); c.ui.newOpp = false; c.toast("Added."); c.refresh("pipeline", "board"); c.go("pipeline", id);
  },
  nextstep: async (c, form, fd) => {
    await c.api("POST", `/api/opportunities/${encodeURIComponent(form.dataset.id)}/next-step`, step(fd));
    c.clearDraft("nextstep"); c.toast("Next step saved."); c.refresh("pipeline", "board");
  },
  move: async (c, form, fd) => {
    const to = v(fd, "to");
    const closing = ["won", "lost", "no_bid", "withdrawn", "cancelled"].includes(to);
    await c.api("POST", `/api/opportunities/${encodeURIComponent(form.dataset.id)}/move`, {
      to, ...(closing ? {} : { nextStep: step(fd) }), ...(v(fd, "reason") ? { reason: v(fd, "reason") } : {}),
      ...(to === "lost" ? { outcome: { primary_reason: v(fd, "primary_reason"), ...(v(fd, "winner") ? { winner: v(fd, "winner") } : {}) } } : {}),
      ...(to === "won" ? { outcome: { value_sar: Number(v(fd, "value_sar")) } } : {}),
    });
    c.clearDraft("move"); c.toast(`Moved to ${words(to)}.`); c.refresh("pipeline", "board");
  },
  decide: async (c, form, fd) => {
    const decision = v(fd, "decision");
    const scores = {};
    let any = false;
    for (const f of c.data.pipeline.factors) { const s = v(fd, `f-${f.id}`); if (s !== "") { any = true; scores[f.id] = { score: Number(s) }; } else scores[f.id] = null; }
    await c.api("POST", `/api/opportunities/${encodeURIComponent(form.dataset.id)}/decide`, {
      decision, reason: v(fd, "reason"), ...(v(fd, "override") ? { override: v(fd, "override") } : {}), ...(any ? { scores } : {}),
      ...(decision === "go" ? { nextStep: step(fd) } : {}),
    });
    c.clearDraft("decide"); c.toast(decision === "go" ? "Decision recorded: bid." : "Decision recorded: no-bid."); c.refresh("pipeline", "board");
  },
};

