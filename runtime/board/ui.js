// Shared helpers for the board's views: escaping, chips, dates and money, documents and findings.

export const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const chip = (text, tone = "") => `<span class="chip ${tone}">${h(text)}</span>`;

const TZ = "Asia/Riyadh";
const asDate = (iso) => new Date(String(iso).length === 10 ? `${iso}T12:00:00+03:00` : iso);
export const fmtDate = (iso) => iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }).format(asDate(iso)) : "";
export const fmtDateTime = (iso) => iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(asDate(iso)) : "";
export const fmtTime = (iso) => iso ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(asDate(iso)) : "";
export function ago(iso) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return fmtDate(iso);
}
export function dueText(iso) {
  const hl = Math.round((Date.parse(iso) - Date.now()) / 3600000);
  if (hl < 0) return `overdue ${hl > -48 ? `${-hl} h` : `${Math.round(-hl / 24)} days`}`;
  return hl < 48 ? `in ${hl} h` : `in ${Math.round(hl / 24)} days`;
}
export const sarM = (n) => n == null ? "" : `${(n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })} m`;
export const sar = (n) => n == null ? "" : `SAR ${Number(n).toLocaleString("en-US")}`;
export const band = (o) => o.value_min_sar == null && o.value_max_sar == null ? "value unknown"
  : `SAR ${sarM(o.value_min_sar ?? o.value_max_sar)}${o.value_max_sar != null && o.value_max_sar !== o.value_min_sar ? `–${sarM(o.value_max_sar)}` : ""}`;
export const words = (s) => String(s ?? "").replace(/_/g, " ");
export const localInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export const fromLocal = (v) => (v ? new Date(v).toISOString() : "");

const ARABIC = /[؀-ۿ]/;
/** Escape, then isolate each Arabic run inside English text, so bidi can't reorder the punctuation around it. */
export const bidi = (s) => h(s).replace(/[؀-ۿ](?:[؀-ۿ\s.،]*[؀-ۿ.])?/g, (m) => `<bdi class="ar-run" lang="ar">${m}</bdi>`);

/** A small markdown subset: # and ## headings, - lists, **bold**, paragraphs. */
export function renderDoc(text, lang = "en") {
  if (!text) return "";
  const out = [];
  let list = null;
  const inline = (s) => h(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const flush = () => { if (list) { out.push(`<ul>${list.join("")}</ul>`); list = null; } };
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith("- ")) { (list ??= []).push(`<li>${inline(line.slice(2))}</li>`); continue; }
    flush();
    if (line.startsWith("# ")) out.push(`<h3>${inline(line.slice(2))}</h3>`);
    else if (line.startsWith("## ")) out.push(`<h4>${inline(line.slice(3))}</h4>`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  const ar = lang === "ar" || (ARABIC.test(text) && !/[A-Za-z]{4,}/.test(String(text).replace(/[؀-ۿ\s.,،؛#*-]/g, "").slice(0, 200)));
  return `<div class="doc ${ar ? "ar" : ""}" ${ar ? 'dir="rtl" lang="ar"' : ""}>${out.join("")}</div>`;
}

export function findingHtml(f) {
  return `<div class="finding ${h(f.severity)}"><span class="rule">${h(f.rule)}${f.lang ? ` · ${h(f.lang)}` : ""}</span><q>${bidi(f.quote)}</q>
    ${f.why ? `<span class="small muted">${h(f.why)}${f.fix ? ` Fix: ${h(f.fix)}` : ""}</span>` : ""}</div>`;
}

export const STATUS_TONE = { succeeded: "ok", needs_human: "warn", dead: "bad", running: "live", queued: "" };
export const STATUS_WORD = { succeeded: "done", needs_human: "needs you", dead: "failed", running: "running", queued: "queued" };
export const runChip = (status) => chip(STATUS_WORD[status] ?? status, STATUS_TONE[status] ?? "");

export const ARTIFACT_NAMES = {
  case_study: "Case study", meeting_brief: "Meeting brief", meeting_debrief: "Debrief", bilingual_edit: "Bilingual edit",
  linkedin_post: "LinkedIn post", elevator_ad: "Elevator content", web_page: "Web page", site_check: "Website check",
  mail_domain_check: "Mail domain check", board_pack: "Board pack", maintenance_renewals: "Maintenance renewals", prequal_pack: "Prequalification pack",
};
export const artifactName = (t) => ARTIFACT_NAMES[t] ?? words(t);
