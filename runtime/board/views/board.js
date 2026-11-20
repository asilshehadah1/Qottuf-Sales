// Board: what needs Asil, the numbers that matter this week, and the department at a glance.
import { ago, artifactName, chip, dueText, fmtDate, h, runChip, sarM, words } from "../ui.js";

export const needs = ["board"];

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const kpi = (view, label, value, sub, alert = false, sub2 = "") =>
  `<button class="kpi ${alert ? "alert" : ""}" data-act="go" data-view="${view}"><span class="label">${h(label)}</span><span class="value">${value}</span><span class="sub">${h(sub)}</span>${sub2 ? `<span class="sub">${h(sub2)}</span>` : ""}</button>`;

export function render({ data }) {
  const b = data.board;
  const st = data.status;
  const waiting = b.decisions.length + b.drafts.length + b.evidenceDrafts;
  const crm = b.crm.summary;
  const bar = b.website?.verdict?.bar;
  const met = bar ? Object.values(bar).filter(Boolean).length : null;
  const late = crm.firstContactLate + crm.technicalLate;

  const items = [
    ...b.decisions.map((d) => ({ view: "pipeline", sub: d.id, title: d.title, chips: [chip(`knock-outs ${d.overall}`, d.overall === "pass" ? "ok" : d.overall === "fail" ? "bad" : "warn")],
      line: `Bid decision (S-G1), ${dueText(d.due)}`, action: "Decide" })),
    ...b.drafts.map((d) => ({ view: "approvals", sub: d.id, title: d.title, chips: [chip(artifactName(d.type)), d.passed ? chip("checks passed", "ok") : chip("blocked", "bad")],
      line: `From agent #${d.agent ?? "?"} for ${d.audience}`, action: "Review" })),
    ...(b.evidenceDrafts ? [{ view: "proof", title: `${b.evidenceDrafts} evidence record${b.evidenceDrafts === 1 ? "" : "s"} to approve`, chips: [chip("S-G5")], line: "Agents can't use evidence until you approve it.", action: "Open" }] : []),
    ...(late ? [{ view: "elevators", title: `${late} elevator enquir${late === 1 ? "y is" : "ies are"} late in the CRM`, chips: [chip("CRM", "bad")],
      line: `${crm.firstContactLate} past the 24-hour first contact, ${crm.technicalLate} with the technical office past 48 hours.`, action: "Open" }] : []),
    ...(b.entity.openQuestions ? [{ view: "website", title: `The master company record has ${b.entity.openQuestions} open question${b.entity.openQuestions === 1 ? "" : "s"}`, chips: [chip("#31")],
      line: "Settle them to approve the record every listing is checked against.", action: "Open" }] : []),
    ...(b.liftsToConfirm ? [{ view: "lifts", title: `${b.liftsToConfirm} lifts from project records to confirm`, chips: [chip("#27")], line: "Dates, maintenance status and the owner's agreement.", action: "Open" }] : []),
  ];

  const groups = b.roster.groups.map((g) => `<div class="row between small"><span>${h(g.name)}</span><span class="num muted">${g.live} of ${g.total} live</span></div>
    <div class="meter">${Array.from({ length: g.total }, (_, i) => `<i class="${i < g.live ? "on" : ""}"></i>`).join("")}</div>`).join("");

  return `<div class="page-head"><div><h1>Board</h1><p>${fmtDate(b.today)}. The merged department: ${b.roster.total} agents across sales and marketing, ${b.roster.live} live.</p></div>
    ${!b.model ? `<button class="btn small" data-act="go" data-view="connections">Switch the writers on</button>` : ""}</div>
  <div class="kpis">
    ${kpi("approvals", "Waiting for you", `${waiting}`, `${plural(b.decisions.length, "bid decision")} · ${plural(b.drafts.length, "draft")}`, false, b.evidenceDrafts ? `${plural(b.evidenceDrafts, "evidence record")} to approve` : "")}
    ${kpi("proof", "Proof test", `${b.proof.documented}<small> of ${b.proof.required}</small>`, `documented · due ${fmtDate(b.proof.due)}`, b.proof.documented < b.proof.required)}
    ${kpi("pipeline", "Contracting", `${b.pipeline.contractingOpen}`, b.pipeline.contractingMaxSar ? `open · up to SAR ${sarM(b.pipeline.contractingMaxSar)}` : "open opportunities")}
    ${kpi("elevators", "Elevators (CRM)", `${crm.open}`, b.crm.syncedAt ? `open · ${crm.newLast7Days} new this week` : "not connected yet", late > 0, late ? `${late} late` : "")}
    ${kpi("website", "Website", met == null ? "–" : `${met}<small> of 4</small>`, met == null ? "not checked yet" : `G0 bar · checked ${ago(b.website.checked_at)}`, met != null && met < 4)}
    ${kpi("website", "Quote inbox", b.mail ? `<span class="word">${h(words(b.mail.verdict))}</span>` : "–", b.mail ? (b.mail.verdict === "unknown" ? "the DNS lookups failed; check again" : `@${st.website.mailDomain}`) : "not checked yet", Boolean(b.mail) && ["unprotected", "at_risk"].includes(b.mail.verdict))}
  </div>
  <div class="grid cols-2">
    <section><h2>Needs you</h2><div class="panel">${items.length ? `<div class="list">${items.map((i) => `
      <button class="list-item" data-act="go" data-view="${i.view}" ${i.sub ? `data-sub="${h(i.sub)}"` : ""}>
        <span class="row between"><strong>${h(i.title)}</strong><span class="row">${i.chips.join("")}</span></span>
        <span class="small muted">${h(i.line)}</span></button>`).join("")}</div>` : `<p class="empty panel-pad">Nothing is waiting for you.</p>`}</div></section>
    <section><h2>The department</h2><div class="panel panel-pad stack">
      ${groups}
      <p class="small muted m0">Sales ${b.roster.sales} · Marketing ${b.roster.marketing} · Both ${b.roster.both}. Live agents run here; planned ones show when they come.</p>
      <div><button class="btn small" data-act="go" data-view="agents">Open the department</button></div>
    </div></section>
  </div>
  <div class="grid cols-2">
    <section><h2>Agent runs</h2><div class="panel">${b.runs.length ? `<div class="list">${b.runs.map((r) => `
      <button class="list-item" data-act="go" data-view="${r.artifact_id ? "approvals" : "agents"}" data-sub="${h(r.artifact_id ?? (r.agent ?? ""))}">
        <span class="row between"><span>${r.agent ? `<span class="mono muted">#${r.agent}</span> ` : ""}${h(artifactName(r.type))}</span>${runChip(r.status)}</span>
        <span class="small muted">${h(ago(r.created_at))}${r.note ? ` · ${h(r.note)}` : ""}</span></button>`).join("")}</div>`
      : `<p class="empty panel-pad">No runs yet. Start one from Agents.</p>`}</div></section>
    <section><h2>Alerts and dates</h2><div class="panel panel-pad stack small">
      ${b.alerts.map((a) => `<div class="row between"><span>${h(a.title)}: ${h(a.detail ?? words(a.kind))}</span><span class="muted">${h(a.owner ?? "")}</span></div>`).join("")}
      ${b.due.map((d) => `<div class="row between"><span>${h(words(d.kind))}: ${h(d.site)}</span>${chip(d.overdue ? "overdue" : `${d.days} days`, d.overdue || d.days <= 30 ? "bad" : "warn")}</div>`).join("")}
      ${b.expiring.map((e) => `<div class="row between"><span>${h(e.title)}</span>${chip(`expires ${fmtDate(e.expires_at)}`, "warn")}</div>`).join("")}
      ${!b.alerts.length && !b.due.length && !b.expiring.length ? `<p class="empty m0">No alerts and nothing due in the next ${h(String(60))} days.</p>` : ""}
    </div></section>
  </div>`;
}
