// Agents: the merged department's 38 agents, from sales and marketing, by group. Live agents run from here; each
// run shows its steps as it works and lands in Approvals. Planned agents say when they come.
import { ago, artifactName, chip, fmtDateTime, h, runChip, words } from "../ui.js";

export const needs = ["roster", "runs", "evidence", "pipeline"];

const ORIGIN = { sales: ["Sales", "sales"], marketing: ["Marketing", "marketing"], both: ["Sales + marketing", ""] };
const PHASE = { 1: "phase 1, by G0 (31 Jan 2027)", 2: "phase 2, by G1 (end of Q2 2027)", 3: "phase 3, when volume proves the need" };
const VIEW_NAMES = { pipeline: "Pipeline", proof: "Proof", lifts: "Lifts", website: "Website", check: "Check text", agents: "Agents" };

function filters(ui) {
  const o = ui.agOrigin ?? "all", s = ui.agStatus ?? "all";
  const seg = (key, cur, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-act="ag-filter" data-key="${key}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join("")}</div>`;
  return `<div class="row">${seg("agOrigin", o, [["all", "All"], ["sales", "Sales"], ["marketing", "Marketing"]])}${seg("agStatus", s, [["all", "All"], ["live", "Live"], ["planned", "Planned"]])}</div>`;
}

export function render({ data, ui, sub }) {
  const r = data.roster;
  const o = ui.agOrigin ?? "all", s = ui.agStatus ?? "all";
  const show = (a) => (o === "all" || a.origin === o || a.origin === "both") && (s === "all" || a.status === s);
  const groups = Object.entries(r.groups).map(([key, g]) => {
    const list = r.agents.filter((a) => a.group === key && show(a));
    const all = r.agents.filter((a) => a.group === key);
    return `<div class="group"><div class="group-head"><span class="name">${h(g.name)}</span><span class="does">${h(g.does)} · ${all.filter((a) => a.status === "live").length} of ${all.length} live</span></div>
      ${list.map((a) => card(a, sub)).join("") || `<p class="empty">None match the filter.</p>`}</div>`;
  }).join("");
  return `<div class="page-head"><div><h1>Agents</h1><p>The merged department: ${r.summary.total} agents from the sales and marketing designs, ${r.summary.live} live. Everything an agent writes lands in Approvals; nothing is sent or published.</p></div>${filters(ui)}</div>
  ${!r.model ? `<div class="banner warn">The writers are switched off, so agents that call a model can't run yet. Code agents (checks, reports, renewals) still run. <button class="linkish" data-act="go" data-view="connections">How to switch them on</button></div>` : ""}
  <div class="groups">${groups}</div>`;
}

function card(a, sub) {
  const [oname, otone] = ORIGIN[a.origin];
  return `<button class="agent ${a.status}" data-act="go" data-view="agents" data-sub="${a.no}" aria-pressed="${String(sub) === String(a.no)}">
    <span class="top"><span class="no">#${a.no}</span>${a.status === "live" ? chip("live", "live") : chip(`phase ${a.phase}`)}</span>
    <span class="name">${h(a.name)}</span>
    <span class="tags">${chip(oname, otone)}${chip(a.engine)}</span>
    ${a.lastRun ? `<span class="last">Last run ${h(ago(a.lastRun.at))} · ${h(words(a.lastRun.status === "succeeded" ? "done" : a.lastRun.status))}</span>` : ""}
  </button>`;
}

// ---------------------------------------------------------------- the drawer: one agent
export function drawer(c) {
  const { data, sub, runs } = c;
  if (!sub) return "";
  const a = data.roster.agents.find((x) => String(x.no) === sub);
  if (!a) return "";
  const [oname, otone] = ORIGIN[a.origin];
  const types = a.runs?.artifactTypes ?? [];
  const track = runs[`agent-${a.no}`];
  const recent = data.runs.filter((r) => types.includes(r.type)).slice(0, 6);
  const runnable = a.status === "live" && types.length > 0;
  return `<div class="head"><div class="stack"><div class="row"><span class="mono muted">#${a.no}</span>${a.status === "live" ? chip("live", "live") : chip(`planned · ${PHASE[a.phase]}`)}${chip(oname, otone)}${chip(a.engine)}</div>
      <h2 class="title">${h(a.name)}</h2></div><button class="btn small" data-act="close-drawer">Close</button></div>
    <p class="m0">${h(a.does)}</p>
    <dl class="kv small"><dt>Group</dt><dd>${h(data.roster.groups[a.group].name)}</dd><dt>Merges</dt><dd class="mono">${h(a.merges)}</dd>
      <dt>Phase</dt><dd>${h(PHASE[a.phase])}</dd>${a.gate ? `<dt>Who decides</dt><dd>${h(a.gate)}</dd>` : ""}</dl>
    ${a.note ? `<div class="banner">${h(a.note)}</div>` : ""}
    ${runnable ? (a.runnable ? runForm(c, a) : `<div class="banner warn">${h(data.status.model.note)} <button class="linkish" data-act="go" data-view="connections">Connections</button></div>`) : ""}
    ${a.runs?.view && a.runs.view !== "agents" ? `<div><button class="btn small" data-act="go" data-view="${a.runs.view}">Open ${h(VIEW_NAMES[a.runs.view] ?? a.runs.view)}</button></div>` : ""}
    ${a.no === 1 ? dispatcherRuns(data.runs) : ""}
    ${track ? runProgress(track) : ""}
    ${recent.length ? `<section><h2>Recent runs</h2><div class="panel"><div class="list">${recent.map((r) => `
      <button class="list-item" data-act="${r.artifact_id ? "go" : "show-run"}" data-view="approvals" data-sub="${h(r.artifact_id ?? "")}" data-run="${h(r.id)}" data-agent="${a.no}">
        <span class="row between"><span>${h(artifactName(r.type))} <span class="mono muted">${h(r.id)}</span></span>${runChip(r.status)}</span>
        <span class="small muted">${h(fmtDateTime(r.created_at))}${r.tokens ? ` · ${r.tokens.toLocaleString("en-US")} tokens` : ""}${r.note ? ` · ${h(r.note)}` : ""}</span></button>`).join("")}</div></div></section>` : ""}`;
}

function dispatcherRuns(list) {
  return `<section><h2>The queue</h2><div class="panel"><div class="list">${list.slice(0, 12).map((r) => `
    <div class="list-item"><span class="row between"><span><span class="mono muted">${h(r.id)}</span> ${h(artifactName(r.type))}</span>${runChip(r.status)}</span>
    <span class="small muted">${h(fmtDateTime(r.created_at))} · ${r.steps} steps · ${r.tokens.toLocaleString("en-US")} of ${r.budget.toLocaleString("en-US")} tokens${r.attempts > 1 ? ` · attempt ${r.attempts}` : ""}</span></div>`).join("") || `<p class="empty panel-pad">Nothing has run yet.</p>`}</div></div></section>`;
}

const STEP_LABEL = {
  case_study_writer: "Claude drafts the case study", claim_extractor: "A second pass lists every claim", meeting_brief: "Claude prepares the brief",
  meeting_debrief: "Claude structures the notes", bilingual_editor: "Claude writes the other language", linkedin_writer: "Claude drafts the post",
  elevator_ad_writer: "Claude drafts the elevator content", web_page_writer: "Claude rewrites the page",
};
function stepLabel(s) {
  if (STEP_LABEL[s.step]) return STEP_LABEL[s.step];
  if (s.step.startsWith("gates")) return `Checks: brand, figures, personal data${/2$/.test(s.step) ? " (after the revision)" : ""}`;
  return s.step.charAt(0).toUpperCase() + s.step.slice(1);
}

export function runProgress(track, { compact = false } = {}) {
  const d = track.detail;
  if (!d) return `<div class="panel panel-pad"><p class="empty m0">Starting the run…</p></div>`;
  const done = ["succeeded", "needs_human", "dead"].includes(d.status);
  // Beside its own results, a finished run needs only a line: the results above already show what it found.
  if (compact && done) {
    return `<div class="row between small"><span>${runChip(d.status)} <span class="mono muted">${h(d.id)}</span> ${h(d.note ?? "")}</span>${d.artifact_id ? `<button class="btn small" data-act="go" data-view="approvals" data-sub="${h(d.artifact_id)}">Open the report</button>` : ""}</div>`;
  }
  const steps = d.steps.map((s) => {
    const det = s.details ?? {};
    const bits = [s.model_served ? `answered by ${s.model_served}` : "", s.input_tokens != null ? `${(Number(s.input_tokens) + Number(s.output_tokens ?? 0)).toLocaleString("en-US")} tokens` : "",
      det.blocking != null ? `${det.blocking} blocking, ${det.warnings} warnings` : "", det.error ? String(det.error) : "", det.reason ? String(det.reason) : ""].filter(Boolean).join(" · ");
    return `<li><span class="s ${h(s.outcome)}"></span><span>${h(stepLabel(s))}${bits ? `<div class="small muted">${h(bits)}</div>` : ""}</span><span class="small muted num">${s.latency_ms ? `${Math.round(s.latency_ms / 1000)} s` : ""}</span></li>`;
  }).join("");
  return `<section><h2>This run</h2><div class="panel panel-pad stack">
    <div class="row between"><span class="mono muted">${h(d.id)}</span>${runChip(d.status)}</div>
    <ul class="steps">${steps}${!done ? `<li><span class="s running"></span><span>${d.status === "queued" ? "Waiting for the dispatcher" : "Working"}</span><span></span></li>` : ""}</ul>
    ${d.note ? `<p class="small m0">${h(d.note)}</p>` : ""}
    ${d.artifact_id ? `<div><button class="btn small primary" data-act="go" data-view="approvals" data-sub="${h(d.artifact_id)}">Open the result in Approvals</button></div>` : ""}
  </div></section>`;
}

// ---------------------------------------------------------------- run forms, one per artifact type
const opt = (v, l, cur) => `<option value="${h(v)}" ${String(cur) === String(v) ? "selected" : ""}>${h(l)}</option>`;
const go = (label, c) => `<div class="row"><button class="btn primary">${h(label)}</button><span class="form-error"></span></div>`;

function projects(data) {
  return [...new Set(data.evidence.records.filter((e) => e.status === "approved" && e.type === "case_facts" && e.project_ref).map((e) => e.project_ref))].sort()
    .map((p) => [p, `${p}: ${(data.evidence.records.find((e) => e.project_ref === p && e.type === "case_facts")?.title ?? "").replace(/: project facts$/, "")}`]);
}

function runForm(c, a) {
  const { data, dv } = c;
  const types = a.runs.artifactTypes;
  const F = `run-${a.no}`;
  const type = dv(F, "type", types[0]);
  const pick = types.length > 1 ? `<div class="seg" role="group">${types.map((t) => `<button type="button" data-act="pick-type" data-form="${F}" data-v="${t}" aria-pressed="${t === type}">${h(artifactName(t))}</button>`).join("")}</div>` : "";
  const projs = projects(data);
  const accounts = data.pipeline.accounts;
  const acc = dv(F, "account_id", "");
  const opps = data.pipeline.opportunities.filter((o) => !acc || o.account_id === acc);
  const accountFields = `<label class="f">Account<select id="${F}-acc" name="account_id" data-redraw required>${opt("", "Choose", acc)}${accounts.map((x) => opt(x.id, x.name_en, acc)).join("")}</select></label>
    <label class="f">Opportunity <span class="hint">optional</span><select id="${F}-opp" name="opportunity_id">${opt("", "None", dv(F, "opportunity_id"))}${opps.map((o) => opt(o.id, o.title, dv(F, "opportunity_id"))).join("")}</select></label>`;
  const noAccounts = accounts.length ? "" : `<p class="small muted m0">No accounts yet. <button type="button" class="linkish" data-act="go" data-view="pipeline">Add one in Pipeline</button>.</p>`;
  const noProjects = projs.length ? "" : `<p class="small muted m0">No approved project evidence yet. <button type="button" class="linkish" data-act="go" data-view="proof">Import the fact base in Proof</button>.</p>`;
  let body = "";
  switch (type) {
    case "case_study":
      body = `<div class="fields"><label class="f">Project<select id="${F}-prj" name="project_ref" required>${projs.map(([v, l]) => opt(v, l, dv(F, "project_ref"))).join("")}</select></label>
        <label class="f">For<select id="${F}-aud" name="audience">${opt("public", "Public: website, LinkedIn", dv(F, "audience"))}${opt("tender", "A tender or prequalification pack", dv(F, "audience"))}</select></label></div>${noProjects}${go("Write the case study")}`;
      break;
    case "meeting_brief":
      body = `<div class="fields">${accountFields}<label class="f">Meeting date<input type="date" id="${F}-date" name="meeting_at" required value="${h(dv(F, "meeting_at", new Date().toISOString().slice(0, 10)))}"></label>
        <label class="f">Purpose<input type="text" id="${F}-purpose" name="purpose" required minlength="3" value="${h(dv(F, "purpose"))}" placeholder="First meeting with the project manager"></label></div>
        <label class="f">Your notes <span class="hint">optional; write roles, not names</span><textarea id="${F}-notes" name="notes" dir="auto">${h(dv(F, "notes"))}</textarea></label>${noAccounts}${go("Prepare the brief")}`;
      break;
    case "meeting_debrief":
      body = `<div class="fields">${accountFields}</div><label class="f">Your notes from the meeting <span class="hint">English, Arabic or both; write roles, not names</span>
        <textarea class="tall" id="${F}-notes" name="notes" required minlength="10" dir="auto">${h(dv(F, "notes"))}</textarea></label>${noAccounts}${go("Structure the notes")}`;
      break;
    case "bilingual_edit":
      body = `<div class="fields"><label class="f">Source language<select id="${F}-lang" name="source_lang">${opt("en", "English", dv(F, "source_lang"))}${opt("ar", "Arabic", dv(F, "source_lang"))}</select></label>
        <label class="f">For<select id="${F}-aud" name="audience">${opt("client", "A client or tender", dv(F, "audience"))}${opt("public", "Public", dv(F, "audience"))}${opt("internal", "Internal", dv(F, "audience"))}${opt("asil", "Me", dv(F, "audience"))}</select></label>
        <label class="f">Purpose<input type="text" id="${F}-purpose" name="purpose" required minlength="3" value="${h(dv(F, "purpose", "prequalification pack"))}"></label>
        <label class="f">Arabic register<select id="${F}-reg" name="register">${opt("formal_msa", "Formal Modern Standard Arabic", dv(F, "register"))}${opt("saudi_conversational", "Saudi conversational (public elevator ads only)", dv(F, "register"))}</select></label></div>
        <label class="f">Text<textarea class="tall" id="${F}-text" name="source_text" required minlength="3" dir="auto">${h(dv(F, "source_text"))}</textarea></label>${go("Write the other language")}`;
      break;
    case "linkedin_post":
      body = `<div class="fields"><label class="f">Voice<select id="${F}-voice" name="voice">${opt("company", "Company page", dv(F, "voice"))}${opt("asil", "Asil's own account", dv(F, "voice"))}</select></label>
        <label class="f">Project <span class="hint">optional</span><select id="${F}-prj" name="project_ref">${opt("", "None: a topic", dv(F, "project_ref"))}${projs.map(([v, l]) => opt(v, l, dv(F, "project_ref"))).join("")}</select></label></div>
        <label class="f">Topic or angle <span class="hint">optional if a project is chosen</span><textarea id="${F}-topic" name="topic" dir="auto" placeholder="What MEP looks like when the building stays open">${h(dv(F, "topic"))}</textarea></label>${noProjects}${go("Draft the post")}`;
      break;
    case "elevator_ad":
      body = `<div class="fields"><label class="f">Format<select id="${F}-fmt" name="format">${opt("post", "Post or ad", dv(F, "format"))}${opt("reel_script", "Reel script (real footage only)", dv(F, "format"))}</select></label>
        <label class="f">Channel<select id="${F}-ch" name="channel">${["instagram", "x", "snapchat", "tiktok", "whatsapp"].map((x) => opt(x, x === "x" ? "X" : x.charAt(0).toUpperCase() + x.slice(1), dv(F, "channel"))).join("")}</select></label>
        <label class="f">Arabic register<select id="${F}-reg" name="register">${opt("saudi_conversational", "Saudi conversational", dv(F, "register"))}${opt("formal_msa", "Formal Modern Standard Arabic", dv(F, "register"))}</select></label></div>
        <label class="f">Focus <span class="hint">optional</span><input type="text" id="${F}-focus" name="focus" value="${h(dv(F, "focus"))}" placeholder="Villa lifts; the online configurator"></label>${go("Draft the elevator content")}`;
      break;
    case "web_page": {
      const pages = data.status.website.pages;
      body = `<label class="f">Page<select id="${F}-page" name="page_url">${pages.map((p) => opt(p, p, dv(F, "page_url"))).join("")}</select></label>
        <label class="f">Instructions <span class="hint">optional</span><textarea id="${F}-ins" name="instructions" dir="auto">${h(dv(F, "instructions"))}</textarea></label>
        <p class="small muted m0">The writer reads the live page and its current failures first. The rewrite lands in Approvals; nothing changes on the website.</p>${go("Rewrite the page")}`;
      break;
    }
    case "site_check":
      body = `<p class="small m0">Checks ${data.status.website.pages.map((p) => `<span class="mono">${h(p)}</span>`).join(", ")} against the G0 bar.</p>${go("Check the live site now")}`;
      break;
    case "mail_domain_check":
      body = `<label class="f">Domain<input type="text" id="${F}-dom" name="domain" required value="${h(dv(F, "domain", data.status.website.mailDomain))}"></label>${go("Check the domain now")}`;
      break;
    case "board_pack":
      body = `<p class="small m0">Decisions, proof, pipeline, alerts, expiring evidence, the installed base and the public footprint, as one document.</p>${go("Build this week's board pack")}`;
      break;
    case "maintenance_renewals":
      body = `<p class="small m0">Creates a renewal opportunity for each lift whose contract or warranty ends in the next ${h(String(60))} days, where the owner agreed to be contacted.</p>${go("Create the renewals")}`;
      break;
    default:
      body = `<p class="small muted m0">This agent runs from its own page.</p>`;
  }
  return `<form class="panel panel-pad" data-form="${F}" data-agent="${a.no}"><input type="hidden" name="type" value="${h(type)}">${pick}${body}</form>`;
}

function inputFor(type, fd, status) {
  const v = (k) => (fd.get(k) ?? "").toString().trim();
  const opt = (k) => (v(k) ? { [k]: v(k) } : {});
  switch (type) {
    case "case_study": return { project_ref: v("project_ref"), audience: v("audience") };
    case "meeting_brief": return { account_id: v("account_id"), ...opt("opportunity_id"), meeting_at: v("meeting_at"), purpose: v("purpose"), ...opt("notes") };
    case "meeting_debrief": return { account_id: v("account_id"), ...opt("opportunity_id"), notes: v("notes") };
    case "bilingual_edit": return { source_lang: v("source_lang"), source_text: v("source_text"), audience: v("audience"), register: v("register"), purpose: v("purpose") };
    case "linkedin_post": return { voice: v("voice"), ...opt("project_ref"), ...opt("topic") };
    case "elevator_ad": return { format: v("format"), channel: v("channel"), register: v("register"), ...opt("focus") };
    case "web_page": return { page_url: v("page_url"), ...opt("instructions") };
    case "site_check": return { pages: status.website.pages.map((url) => ({ url })) };
    case "mail_domain_check": return { domain: v("domain") };
    default: return {};
  }
}

export const actions = {
  "ag-filter": (c, t) => { c.ui[t.dataset.key] = t.dataset.v; c.schedule(); },
  "pick-type": (c, t) => { (c.S.drafts[t.dataset.form] ??= {}).type = t.dataset.v; c.schedule(); },
  "show-run": (c, t) => { c.trackRun(`agent-${t.dataset.agent}`, t.dataset.run); },
};

export const forms = new Proxy({}, {
  get: (_t, name) => typeof name === "string" && name.startsWith("run-") ? async (c, form, fd) => {
    const type = (fd.get("type") ?? "").toString();
    const { id } = await c.api("POST", "/api/runs", { type, input: inputFor(type, fd, c.data.status) });
    await c.trackRun(`agent-${form.dataset.agent}`, id);
    c.toast(`${artifactName(type)} started.`);
    c.refresh("runs", "roster");
  } : undefined,
});
