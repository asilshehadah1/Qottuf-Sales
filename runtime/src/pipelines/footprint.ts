// Pipelines for the public footprint and after-sales (code only): the site check (#32), the mail-domain check (#38)
// and maintenance renewals from the installed base (#27).

import { z } from "zod";
import { submitArtifact } from "../approvals/queue.ts";
import { checkMailDomain, systemResolver } from "../deliverability/mailDomain.ts";
import { addListing, currentEntity, recordObservation } from "../entity/entity.ts";
import { rulebookFigures } from "../gates/claims.ts";
import { generateRenewals } from "../installedBase/registry.ts";
import { figuresFromEvidence, readEvidence } from "../ledger/repo.ts";
import { auditHtml, fetchPage, siteVerdict, type PageAudit } from "../site/siteChecker.ts";
import type { Pipeline } from "./context.ts";

export const SiteCheckInput = z.object({
  pages: z.array(z.object({ url: z.string().url(), html: z.string().optional() })).min(1),
});

const YES = (b: boolean) => (b ? "yes" : "NO");

export function renderSiteReport(audits: PageAudit[], masterVersion: number | null): string {
  const v = siteVerdict(audits);
  const lines = [
    `# Website check: ${audits.length} page(s)`,
    masterVersion ? `Compared with master record version ${masterVersion}.` : "No approved master record yet: contact details were listed, not judged.",
    "## The G0 due-diligence bar",
    `- Nothing false: ${YES(v.bar.nothing_false)}`,
    `- Working contacts: ${YES(v.bar.working_contacts)}`,
    `- Both languages: ${YES(v.bar.both_languages)}`,
    `- An enquiry form with consent wording: ${YES(v.bar.enquiry_form_with_consent)}`,
  ];
  for (const a of audits) {
    lines.push(`## ${a.url}${a.status ? ` (${a.status})` : ""}`);
    const fails = [...a.findings.filter((f) => f.severity === "fail").map((f) => `${f.check}: ${f.detail}`),
      ...a.textFindings.filter((f) => f.severity === "fail").map((f) => `${f.rule}: "${f.quote}"`)];
    const signals = a.findings.filter((f) => f.severity === "signal").map((f) => `${f.check}: ${f.detail}`);
    lines.push(fails.length ? fails.map((f) => `- FAIL ${f}`).join("\n") : "- No failures.");
    if (signals.length) lines.push(signals.map((s) => `- check: ${s}`).join("\n"));
    if (a.contacts.phones.length || a.contacts.emails.length) lines.push(`- Contacts on the page: ${[...a.contacts.phones, ...a.contacts.emails].join(", ")}`);
  }
  lines.push("## Not checked", ...audits[0]!.gaps.map((g) => `- ${g}`));
  return lines.join("\n\n");
}

export const siteCheckPipeline: Pipeline = async (ctx, raw) => {
  const input = SiteCheckInput.parse(raw);
  const entity = await currentEntity(ctx.db);
  const evidence = await readEvidence(ctx.db, { maxTier: "public", readBy: "check:site", purpose: "website check" });
  const figures = [...rulebookFigures(ctx.brand), ...figuresFromEvidence(evidence)];
  const audits: PageAudit[] = [];
  for (const p of input.pages) {
    let page = { url: p.url, html: p.html ?? "", status: null as number | null, redirects: [] as string[] };
    if (p.html === undefined) {
      if (!ctx.fetchFn) return { status: "needs_human", note: "This deployment has no network access for fetching pages; pass the page HTML instead." };
      const f = await fetchPage(p.url, ctx.fetchFn);
      if (f.error) return { status: "needs_human", note: `Could not fetch ${p.url}: ${f.error}` };
      page = { url: f.finalUrl, html: f.html, status: f.status, redirects: f.redirects };
    }
    audits.push(auditHtml(page, { ...(entity ? { entity: entity.fields } : {}), brand: ctx.brand, figures }));
  }
  // What the website shows is a listing like any other: record it, so drift against the master record is tracked.
  const origin = new URL(input.pages[0]!.url).origin;
  const listing = await addListing(ctx.db, { platform: "website", url: origin, owner: "asil" }, "check:site");
  const phone = audits.flatMap((a) => a.contacts.phones)[0];
  const email = audits.flatMap((a) => a.contacts.emails)[0];
  await recordObservation(ctx.db, listing, { website: origin, ...(phone ? { phone_main: phone } : {}), ...(email ? { email_main: email } : {}) }, "check:site");

  const verdict = siteVerdict(audits);
  const artifactId = await submitArtifact(ctx.db, {
    workOrderId: ctx.workOrderId, artifactType: "site_check", title: `Website check: ${origin}`, audience: "internal",
    content: { verdict, pages: audits.map((a) => ({ url: a.url, status: a.status, findings: a.findings, text_failures: a.textFindings.filter((f) => f.severity === "fail").map((f) => ({ rule: f.rule, quote: f.quote })), contacts: a.contacts })) },
    renderedEn: renderSiteReport(audits, entity?.version ?? null), evidenceTierMax: "public",
    gateReport: { passed: true, note: "code-built report; the findings are its content" },
    provenance: { engine: "code", rules_version: ctx.rules.rulesVersion, master_record_version: entity?.version ?? null },
  }, "check:site");
  await ctx.step({ step: "site check", outcome: "ok", details: { pages: audits.length, fails: verdict.fails } });
  const bar = Object.values(verdict.bar).filter(Boolean).length;
  return { status: "succeeded", artifactId, note: `${bar} of 4 items of the G0 bar met; ${verdict.fails} failure(s).` };
};

export const MailCheckInput = z.object({
  domain: z.string().regex(/^@?[a-z0-9.-]+\.[a-z]{2,}$/i),
  dkim_selectors: z.array(z.string()).optional(),
});

export const mailDomainPipeline: Pipeline = async (ctx, raw) => {
  const input = MailCheckInput.parse(raw);
  const report = await checkMailDomain(input.domain, ctx.dns ?? systemResolver(), input.dkim_selectors ? { dkimSelectors: input.dkim_selectors } : {});
  const text = [
    `# Mail domain check: ${report.domain}`,
    `**Verdict: ${report.verdict.replace("_", " ").toUpperCase()}.** ${report.summary}`,
    `## MX\n${report.mx.hosts.length ? report.mx.hosts.map((h) => `- ${h}`).join("\n") : "- none"}${report.mx.issues.map((i) => `\n- ${i}`).join("")}`,
    `## SPF\n- ${report.spf.record ?? "none"}${report.spf.issues.map((i) => `\n- ${i}`).join("")}`,
    `## DKIM\n- Found at: ${report.dkim.found.join(", ") || "none"}${report.dkim.issues.map((i) => `\n- ${i}`).join("")}`,
    `## DMARC\n- ${report.dmarc.record ?? "none"}${report.dmarc.issues.map((i) => `\n- ${i}`).join("")}`,
    `## Not checked\n${report.gaps.map((g) => `- ${g}`).join("\n")}`,
  ].join("\n\n");
  const artifactId = await submitArtifact(ctx.db, {
    workOrderId: ctx.workOrderId, artifactType: "mail_domain_check", title: `Mail domain check: ${report.domain}`, audience: "internal",
    content: report, renderedEn: text, evidenceTierMax: "public",
    gateReport: { passed: true, note: "code-built report; the findings are its content" },
    provenance: { engine: "code", rules_version: ctx.rules.rulesVersion },
  }, "check:mail");
  return { status: "succeeded", artifactId, note: report.summary };
};

export const renewalsPipeline: Pipeline = async (ctx) => {
  const created = await generateRenewals({ db: ctx.db, rules: ctx.rules, now: ctx.now });
  await ctx.step({ step: "maintenance renewals", outcome: "ok", details: { created } });
  return { status: "succeeded", note: created.length ? `${created.length} renewal opportunit${created.length === 1 ? "y" : "ies"} created: ${created.join(", ")}` : "No renewals due." };
};
