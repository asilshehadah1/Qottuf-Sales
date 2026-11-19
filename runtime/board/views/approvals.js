// Approvals: one queue for everything the agents produce. Drafts are approved or rejected by Asil; reports are read.
// There is no send button: approved material is copied and used by hand.
import { artifactName, bidi, chip, findingHtml, fmtDateTime, h, renderDoc } from "../ui.js";

export const needs = ["approvals"];

function listFilter(ui) {
  const f = ui.apStatus ?? "pending", k = ui.apKind ?? "draft";
  const seg = (key, cur, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-act="ap-filter" data-key="${key}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join("")}</div>`;
  return `<div class="row">${seg("apStatus", f, [["pending", "Waiting"], ["approved", "Approved"], ["rejected", "Rejected"]])}${seg("apKind", k, [["draft", "Drafts"], ["report", "Reports"]])}</div>`;
}

export function render(c) {
  const { data, ui, sub } = c;
  const f = ui.apStatus ?? "pending", k = ui.apKind ?? "draft";
  const list = data.approvals.filter((a) => a.status === f && a.kind === k);
  const items = list.map((a) => `<button class="list-item" data-act="go" data-view="approvals" data-sub="${h(a.id)}" aria-current="${sub === a.id}">
      <span class="row between"><strong>${h(a.title)}</strong>${a.kind === "report" ? chip("report") : a.passed ? chip("checks passed", "ok") : chip("blocked", "bad")}</span>
      <span class="small muted">${h(artifactName(a.type))}${a.agent ? ` · agent #${a.agent}` : ""} · for ${h(a.audience)} · ${h(fmtDateTime(a.requested_at))}</span></button>`).join("");
  return `<div class="page-head"><div><h1>Approvals</h1><p>Nothing leaves the board without your approval, and there is no send button: approved material is copied and used by hand.</p></div>${listFilter(ui)}</div>
  <div class="split">
    <div class="panel"><div class="list">${items || `<p class="empty panel-pad">${f === "pending" ? "Nothing waiting. Run an agent to produce a draft." : "None yet."}</p>`}</div></div>
    <div>${sub ? detail(c) : `<div class="panel panel-pad"><p class="empty m0">Choose a draft to read it in both languages, with its checks.</p></div>`}</div>
  </div>`;
}

function ensure(c, id) {
  const cache = c.ui.art ?? (c.ui.art = {});
  const fresh = c.data.approvals.find((a) => a.id === id);
  const have = cache[id];
  if ((!have || (fresh && have.status !== fresh.status)) && !c.ui.artLoading?.[id]) {
    (c.ui.artLoading ??= {})[id] = true;
    c.api("GET", `/api/artifacts/${encodeURIComponent(id)}`).then((a) => { cache[id] = a; }).catch((e) => { cache[id] = { error: e.message }; })
      .finally(() => { delete c.ui.artLoading[id]; c.schedule(); });
  }
  return have;
}

function detail(c) {
  const a = ensure(c, c.sub);
  if (!a) return `<div class="panel panel-pad"><p class="empty m0">Loading…</p></div>`;
  if (a.error) return `<div class="banner bad">${h(a.error)}</div>`;
  const g = a.gate_report ?? {};
  const content = a.content ?? {};
  const external = a.audience === "client" || a.audience === "public";
  const blocker = external && g.passed === false ? "It failed its checks, so it can't be approved: reject it with a reason, or run the agent again."
    : external && a.evidence_tier_max === "internal" ? "It rests on internal evidence, which never leaves Qottuf." : null;
  const toCheck = content.for_asil_to_check ?? [];
  const changes = content.changes ?? [];
  const removed = content.removed ?? [];
  const prov = a.provenance ?? {};
  return `<div class="panel panel-pad stack">
    <div class="row between"><div><h3>${h(a.title)}</h3><div class="small muted">${h(artifactName(a.artifact_type))}${a.agent ? ` · agent #${a.agent.no} ${h(a.agent.name)}` : ""} · ${h(fmtDateTime(a.created_at))}</div></div>
      <button class="btn small" data-act="go" data-view="approvals">Close</button></div>
    <div class="row">${chip(`for ${a.audience}`)}${a.kind === "report" ? chip("report") : g.passed ? chip("checks passed", "ok") : chip("checks blocked", "bad")}
      ${Array.isArray(g.verified) ? chip(`${g.verified.length} figures verified`) : ""}${chip(a.status === "pending" ? "waiting" : a.status, a.status === "approved" ? "ok" : a.status === "rejected" ? "bad" : "warn")}</div>
    ${g.note ? `<p class="small muted m0">${h(g.note)}</p>` : ""}
    <div class="grid ${a.rendered_ar ? "cols-2" : ""}">
      ${a.rendered_en ? `<div class="panel panel-pad stack"><div id="doc-en">${renderDoc(a.rendered_en, "en")}</div><div><button class="btn small" data-act="copy" data-target="#doc-en">Copy English</button></div></div>` : ""}
      ${a.rendered_ar ? `<div class="panel panel-pad stack"><div id="doc-ar">${renderDoc(a.rendered_ar, "ar")}</div><p class="small muted m0">Arabic needs your review before first use.</p><div><button class="btn small" data-act="copy" data-target="#doc-ar">Copy Arabic</button></div></div>` : ""}
    </div>
    ${toCheck.length ? `<div class="stack"><div class="h2">For you to check</div>${toCheck.map((x) => `<div class="finding signal"><span>${bidi(x)}</span></div>`).join("")}</div>` : ""}
    ${changes.length ? `<details ${c.ui.openChanges ? "open" : ""}><summary>Changes to the live page (${changes.length})</summary><div class="stack mt8">${changes.map((x) => `<div class="finding"><span class="small muted">Was</span><q>${bidi(x.was)}</q><span class="small muted">Now</span><q>${bidi(x.now)}</q><span class="small muted">${h(x.why)}</span></div>`).join("")}</div></details>` : ""}
    ${removed.length ? `<div class="stack"><div class="h2">Sentences the checks removed</div>${removed.map((r) => `<div class="finding fail"><span class="rule">${h((r.reasons ?? []).join(", "))} · ${h(r.lang)}</span><q>${bidi(r.sentence)}</q></div>`).join("")}</div>` : ""}
    ${g.blocking?.length ? `<div class="stack"><div class="h2">Blocking</div>${g.blocking.map(findingHtml).join("")}</div>` : ""}
    ${g.warnings?.length ? `<details><summary>Warnings (${g.warnings.length})</summary><div class="stack mt8">${g.warnings.map(findingHtml).join("")}</div></details>` : ""}
    <details><summary>How it was made</summary><dl class="kv small mt8"><dt>Prompts</dt><dd class="mono">${h((prov.prompt_versions ?? []).join(", ") || "code only")}</dd>
      <dt>Answered by</dt><dd>${h((prov.models_served ?? []).join(", ") || "code only")}</dd><dt>Rules</dt><dd class="mono">${h(prov.rules_version ?? "")}</dd>
      <dt>Evidence</dt><dd class="mono">${h((prov.evidence_ids ?? []).join(", ") || "none")}</dd><dt>Content hash</dt><dd class="mono">${h(String(a.content_hash ?? "").slice(0, 16))}</dd></dl></details>
    ${a.status !== "pending" ? `<p class="small m0">${a.status === "approved" ? "Approved" : "Rejected"} by ${h(a.decided_by)} on ${h(fmtDateTime(a.decided_at))}${a.reason ? `: ${h(a.reason)}` : ""}.</p>`
      : `<form data-form="decide" data-id="${h(a.id)}" class="stack">
        ${blocker ? `<div class="banner warn">${h(blocker)}</div>` : ""}
        <label class="f">Reason <span class="hint">needed to reject; it teaches the next draft</span><input type="text" id="decide-reason" name="reason" value="${h(c.dv("decide", "reason"))}"></label>
        <div class="row"><button class="btn primary" name="decision" value="approved" ${blocker ? "disabled" : ""}>${a.kind === "report" ? "Mark as read" : "Approve"}</button>
          <button class="btn danger" name="decision" value="rejected">Reject</button><span class="form-error"></span></div>
      </form>`}
  </div>`;
}

export const actions = {
  "ap-filter": (c, t) => { c.ui[t.dataset.key] = t.dataset.v; c.schedule(); },
};

export const forms = {
  decide: async (c, form, fd, btn) => {
    const decision = btn?.value;
    const reason = (fd.get("reason") ?? "").toString().trim();
    if (decision === "rejected" && !reason) throw new Error("Give a reason for the rejection, so the next draft can be better.");
    await c.api("POST", `/api/artifacts/${encodeURIComponent(form.dataset.id)}/decide`, { decision, ...(reason ? { reason } : {}) });
    c.clearDraft("decide");
    delete (c.ui.art ?? {})[form.dataset.id];
    c.toast(decision === "approved" ? "Approved. Copy it and use it by hand." : "Rejected.");
    c.refresh("approvals", "board");
  },
};

