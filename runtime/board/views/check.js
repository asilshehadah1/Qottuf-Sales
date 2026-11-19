// Check text: any copy, in English, Arabic or both, through the same gates the agents' drafts pass (#5, #7, #8).
// Runs on the board's server without a model.
import { chip, findingHtml, h } from "../ui.js";

export const needs = [];

export function render(c) {
  const F = "check";
  const r = c.ui.checkResult;
  return `<div class="page-head"><div><h1>Check text</h1><p>Paste any copy and check it the way the agents' drafts are checked: the brand rulebook, every figure against approved evidence, personal data, and both languages carrying the same figures. No model is used.</p></div></div>
  <form class="panel panel-pad" data-form="${F}">
    <div class="grid cols-2"><label class="f">English<textarea class="tall" id="${F}-en" name="en">${h(c.dv(F, "en"))}</textarea></label>
      <label class="f">Arabic<textarea class="tall ar" id="${F}-ar" name="ar" dir="rtl" lang="ar">${h(c.dv(F, "ar"))}</textarea></label></div>
    <div class="row"><label class="f">For<select id="${F}-aud" name="audience">${[["public", "Public"], ["client", "A client or tender"], ["internal", "Internal"]].map(([v, l]) => `<option value="${v}" ${c.dv(F, "audience", "public") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <button class="btn primary self-end">Check</button><span class="form-error"></span></div>
  </form>
  ${r ? `<section class="stack"><div class="row">${chip(r.passed ? "passes" : `${r.blocking.length} blocking`, r.passed ? "ok" : "bad")}${chip(`${r.warnings.length} warnings`)}${chip(`${r.verified.length} figures verified`)}</div>
    ${r.blocking.map(findingHtml).join("")}
    ${r.warnings.map((f) => findingHtml({ ...f, severity: "signal" })).join("")}
    ${r.verified.length ? `<details><summary>Verified figures (${r.verified.length})</summary><div class="stack small mt8">${r.verified.map((v) => `<div><span class="num">${h(v.raw)}</span>: ${h(v.label)} <span class="mono muted">${h(v.sourceId)}</span></div>`).join("")}</div></details>` : ""}
  </section>` : ""}`;
}

export const forms = {
  check: async (c, form, fd) => {
    const en = (fd.get("en") ?? "").toString(), ar = (fd.get("ar") ?? "").toString();
    c.ui.checkResult = await c.api("POST", "/api/check-text", { ...(en.trim() ? { en } : {}), ...(ar.trim() ? { ar } : {}), audience: (fd.get("audience") ?? "public").toString() });
    c.schedule();
  },
};
