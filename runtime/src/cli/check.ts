// Stand-alone checks the team can run today, with no database and no client data.
//
//   npm run check -- site <file | folder | url> [...] [--phone N] [--email E] [--website URL]
//   npm run check -- mail <domain> [--doh] [--selector S]...
//
// The site check uses the real brand rulebook when the qottuf-brand skill is installed (or QOTTUF_BRAND_RULES).
// --phone/--email/--website give provisional values to compare contact links with, until Asil approves the
// master company record in the Ledger.

import { existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkMailDomain, dohResolver, systemResolver } from "../deliverability/mailDomain.ts";
import { loadBrandRules, type BrandRules } from "../gates/brand.ts";
import { rulebookFigures } from "../gates/claims.ts";
import { renderSiteReport } from "../pipelines/footprint.ts";
import { auditHtml, fetchPage, type AuditContext, type PageAudit } from "../site/siteChecker.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL_RULES = "/root/.claude/skills/synced/74ec83fd-3864-4662-9cec-2badc84a4927_96fab72d-0fe5-4af2-bdac-85f48a1e99ca/qottuf-brand/assets/brand-rules.json";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function positional(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i]!.startsWith("--")) {
      if (!["doh"].includes(args[i]!.slice(2))) i++;
      continue;
    }
    out.push(args[i]!);
  }
  return out;
}

async function rulebook(): Promise<{ rules: BrandRules; real: boolean }> {
  const candidate = process.env.QOTTUF_BRAND_RULES ?? SKILL_RULES;
  if (existsSync(candidate)) return { rules: await loadBrandRules(candidate), real: true };
  return { rules: await loadBrandRules(path.resolve(here, "../../test/fixtures/brand-rules.fixture.json")), real: false };
}

async function htmlFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out.sort();
}

async function site(args: string[]): Promise<number> {
  const { rules, real } = await rulebook();
  if (!real) console.log("Note: the real brand rulebook isn't installed here; using the test fixture. Set QOTTUF_BRAND_RULES.\n");
  const phone = flag(args, "phone");
  const email = flag(args, "email");
  const website = flag(args, "website");
  const ctx: AuditContext = { brand: rules, figures: rulebookFigures(rules) };
  if (phone && email && website) {
    ctx.entity = { trading_name_en: rules.naming.first_mention, legal_name_en: rules.naming.legal_en, phone_main: phone, email_main: email, website };
  }
  const audits: PageAudit[] = [];
  for (const target of positional(args)) {
    if (/^https?:\/\//.test(target)) {
      const page = await fetchPage(target);
      if (page.error) {
        console.log(`Could not fetch ${target}: ${page.error}`);
        continue;
      }
      audits.push(auditHtml({ url: page.finalUrl, html: page.html, status: page.status, redirects: page.redirects }, ctx));
    } else {
      const files = statSync(target).isDirectory() ? await htmlFiles(target) : [target];
      for (const f of files) {
        audits.push(auditHtml({ url: path.relative(statSync(target).isDirectory() ? target : path.dirname(target), f) || f, html: await readFile(f, { encoding: "utf-8" }) }, ctx));
      }
    }
  }
  if (audits.length === 0) {
    console.log("No pages to check.");
    return 2;
  }
  console.log(renderSiteReport(audits, null).replace("No approved master record yet: contact details were listed, not judged.",
    ctx.entity ? `Contact links compared with provisional values (${phone}, ${email}, ${website}), not an approved master record.` : "No comparison values given: contact links were listed, not judged."));
  return 0;
}

async function mail(args: string[]): Promise<number> {
  const [domain] = positional(args);
  if (!domain) {
    console.log("Usage: npm run check -- mail <domain> [--doh] [--selector S]");
    return 2;
  }
  const selectors = args.flatMap((a, i) => (a === "--selector" && args[i + 1] ? [args[i + 1]!] : []));
  const resolver = args.includes("--doh") ? dohResolver() : systemResolver();
  const r = await checkMailDomain(domain, resolver, selectors.length ? { dkimSelectors: selectors } : {});
  console.log(`Mail domain check: ${r.domain}${args.includes("--doh") ? " (DNS over HTTPS)" : ""}`);
  console.log(`Verdict: ${r.verdict.replace("_", " ").toUpperCase()}. ${r.summary}\n`);
  console.log(`MX:    ${r.mx.hosts.join(", ") || "none"}`);
  console.log(`SPF:   ${r.spf.record ?? "none"}`);
  console.log(`DKIM:  ${r.dkim.found.length ? `found at ${r.dkim.found.join(", ")}` : "not found at the selectors tried"}`);
  console.log(`DMARC: ${r.dmarc.record ?? "none"}\n`);
  for (const i of [...r.mx.issues, ...r.spf.issues, ...r.dkim.issues, ...r.dmarc.issues]) console.log(`- ${i}`);
  console.log(`\nNot checked:\n${r.gaps.map((g) => `- ${g}`).join("\n")}`);
  return 0;
}

const [command, ...rest] = process.argv.slice(2);
const run = command === "site" ? site : command === "mail" ? mail : null;
if (!run) {
  console.log("Usage:\n  npm run check -- site <file | folder | url> [...] [--phone N --email E --website URL]\n  npm run check -- mail <domain> [--doh] [--selector S]");
  process.exit(2);
}
run(rest).then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
