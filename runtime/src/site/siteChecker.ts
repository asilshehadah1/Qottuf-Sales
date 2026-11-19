// The Site Checker (merged roster #32; ported from marketing C-02 Technical SEO Auditor and C-05 Schema Agent,
// with their bugs fixed). Code only. It checks a page against the website's due-diligence bar for G0
// (business-development roadmap §3): nothing false, working contacts, both languages, an enquiry form with consent
// wording, plus the technical basics and structured data that answer engines and search read.
//
// Fixed from the marketing versions:
// - redirects resolve against the current hop, not the first URL, and every hop sends the same User-Agent;
// - structured data takes the company name from the master record, never the retired "Qottuf Al Jazeera".
// Not done, and said so in `gaps`: Core Web Vitals (needs PageSpeed/Lighthouse) and Google's Rich Results Test.

import { phoneKey, urlKey, type EntityFields } from "../entity/compare.ts";
import { brandCheck, compileBrandRules, type BrandRules } from "../gates/brand.ts";
import { checkClaims, type ApprovedFigure } from "../gates/claims.ts";
import type { Finding } from "../gates/findings.ts";
import type { EvidenceRecord } from "../ledger/schemas.ts";

const USER_AGENT = "QottufSiteChecker/1.0 (+internal)";

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number | null;
  html: string;
  redirects: string[];
  error?: string;
}

/** Fetch a page, following up to five redirects by hand so each hop is recorded. */
export async function fetchPage(url: string, fetchFn: typeof fetch = fetch): Promise<FetchedPage> {
  const redirects: string[] = [];
  let current = url;
  try {
    for (let hop = 0; hop <= 5; hop++) {
      const res = await fetchFn(current, { redirect: "manual", headers: { "User-Agent": USER_AGENT } });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) return { url, finalUrl: current, status: res.status, html: "", redirects, error: "redirect without a Location header" };
        current = new URL(location, current).toString(); // relative to the hop that sent it
        redirects.push(current);
        continue;
      }
      return { url, finalUrl: current, status: res.status, html: await res.text(), redirects };
    }
    return { url, finalUrl: current, status: null, html: "", redirects, error: "more than five redirects" };
  } catch (err) {
    return { url, finalUrl: current, status: null, html: "", redirects, error: (err as Error).message };
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rlm: "", lrm: "" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** The words a visitor reads: scripts, styles, the head and comments removed (port of brand_check.py extract_text). */
export function visibleText(html: string): string {
  let raw = html.replace(/<(head|script|style|template|noscript)\b[\s\S]*?<\/\1>/gi, " ");
  raw = raw.replace(/<!--[\s\S]*?-->/g, " ");
  raw = raw.replace(/<(br|\/p|\/div|\/h\d|\/li|\/section|\/header|\/footer|\/figcaption|\/span|\/a|\/button|\/td|\/th)[^>]*>/gi, "\n");
  raw = raw.replace(/<[^>]+>/g, " ");
  return decodeEntities(raw)
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "") : null;
}

function tags(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => m[0]);
}

export function extractJsonLd(html: string): { blocks: Array<Record<string, unknown>>; errors: string[] } {
  const blocks: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1]!);
      const list = Array.isArray(parsed) ? parsed : parsed["@graph"] ? parsed["@graph"] : [parsed];
      for (const b of list) if (b && typeof b === "object") blocks.push(b as Record<string, unknown>);
    } catch (err) {
      errors.push(`JSON-LD that doesn't parse: ${(err as Error).message}`);
    }
  }
  return { blocks, errors };
}

const ORG_TYPES = new Set(["Organization", "Corporation", "LocalBusiness", "GeneralContractor", "HomeAndConstructionBusiness", "ProfessionalService"]);

function stripUndefined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Organization structured data, from the approved master record only (fixes the marketing generator's name). */
export function organizationJsonLd(e: EntityFields): Record<string, unknown> {
  return stripUndefined({
    "@context": "https://schema.org",
    "@type": "GeneralContractor",
    name: e.trading_name_en,
    legalName: e.legal_name_en,
    alternateName: e.trading_name_ar,
    url: e.website,
    telephone: e.phone_main,
    email: e.email_main,
    foundingDate: e.founded_year !== undefined ? String(e.founded_year) : undefined,
    identifier: { "@type": "PropertyValue", propertyID: "CR", value: e.cr_number },
    address: e.address_en || e.po_box
      ? stripUndefined({ "@type": "PostalAddress", streetAddress: e.address_en, postOfficeBoxNumber: e.po_box, addressCountry: "SA" })
      : undefined,
  });
}

/**
 * Project structured data from public-tier, approved evidence only. The client is named only when Asil approved
 * naming for public use; otherwise the descriptor is used.
 */
export function projectJsonLd(records: EvidenceRecord[], e: EntityFields): Record<string, unknown> {
  if (records.some((r) => r.tier !== "public" || r.status !== "approved")) {
    throw new Error("project structured data uses public, approved evidence only");
  }
  const facts = records.flatMap((r) => r.facts);
  const fact = (name: string) => facts.find((f) => f.name === name)?.value;
  const named = records.some((r) => r.type === "client_naming_approval" && r.permitted_uses.includes("name_client:public"));
  const name = fact("project_name");
  if (!name) throw new Error("no project_name fact on the public record");
  return stripUndefined({
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: String(name),
    about: fact("scope") !== undefined ? String(fact("scope")) : undefined,
    dateCreated: fact("completion_date") !== undefined ? String(fact("completion_date")) : undefined,
    locationCreated: fact("location") !== undefined ? { "@type": "Place", name: String(fact("location")) } : undefined,
    creator: { "@type": "GeneralContractor", name: e.trading_name_en, url: e.website },
    sponsor: named && fact("client_name") !== undefined ? { "@type": "Organization", name: String(fact("client_name")) } : undefined,
  });
}

export interface SiteFinding {
  check: string;
  severity: "fail" | "signal";
  detail: string;
}

export interface PageAudit {
  url: string;
  status: number | null;
  lang: string | null;
  dir: string | null;
  isArabic: boolean;
  findings: SiteFinding[];
  contacts: { phones: string[]; emails: string[] };
  forms: { count: number; withConsentWording: number };
  hreflang: string[];
  /** Brand and claims findings on the visible text. */
  textFindings: Finding[];
  gaps: string[];
}

const CONSENT_WORDING = /consent|privacy|personal data|data protection|PDPL|أوافق|موافق|موافقة|الخصوصية|البيانات الشخصية|حماية البيانات/i;

/** Numbers on a web page that are interface, not claims: slide counters ("1 / 5"), section numbers ("01"), sizes. */
const UI_NUMBERS = [
  /(?<!\d)\d{1,2}\s*\/\s*\d{1,2}(?!\d)/gu,
  /^\s*0\d(?=\s*(?:—|–|-|\.|:|$))/gmu,
  /\d{3,4}\s?[x×]\s?\d{3,4}(?:\s?[x×]\s?\d{3,4})?/gu,
  /#[0-9a-f]{3,8}\b/giu, // colour codes on swatches
];
const ERROR_PAGE = /(^|\/)(404|_?not-found)(\.html)?$/i;

export interface AuditContext {
  /** The approved master record, or the subset of it a page is compared with. */
  entity?: Pick<EntityFields, "trading_name_en" | "legal_name_en" | "phone_main" | "email_main" | "website">;
  brand?: BrandRules;
  figures?: ApprovedFigure[];
}

export function auditHtml(page: { url: string; html: string; status?: number | null; redirects?: string[] }, ctx: AuditContext = {}): PageAudit {
  const html = page.html;
  const findings: SiteFinding[] = [];
  const fail = (check: string, detail: string) => findings.push({ check, severity: "fail", detail });
  const signal = (check: string, detail: string) => findings.push({ check, severity: "signal", detail });

  if (page.status && page.status >= 400) fail("status", `The page answered ${page.status}.`);
  if ((page.redirects?.length ?? 0) > 1) signal("redirects", `${page.redirects!.length} redirects before the page: ${page.redirects!.join(" → ")}`);

  const htmlTag = tags(html, "html")[0] ?? "";
  const lang = attr(htmlTag, "lang");
  const dir = attr(htmlTag, "dir");
  const isArabic = Boolean(lang?.toLowerCase().startsWith("ar"));
  if (!lang) fail("lang", "No lang attribute on <html>: browsers, screen readers and search engines can't tell the language.");
  if (isArabic && dir?.toLowerCase() !== "rtl") fail("dir", 'An Arabic page without dir="rtl" renders right-to-left text the wrong way round.');
  if (!isArabic && dir?.toLowerCase() === "rtl") fail("dir", 'An English page marked dir="rtl".');

  const links = tags(html, "link");
  if (!links.some((l) => attr(l, "rel")?.toLowerCase() === "canonical")) signal("canonical", "No canonical link.");
  const hreflang = links.filter((l) => attr(l, "rel")?.toLowerCase() === "alternate" && attr(l, "hreflang")).map((l) => attr(l, "hreflang")!.toLowerCase());
  if (!hreflang.some((h) => h.startsWith("ar")) || !hreflang.some((h) => h.startsWith("en"))) {
    fail("both_languages", "No Arabic and English alternate links (hreflang): the bar for G0 is both languages, linked to each other.");
  }
  if (!tags(html, "meta").some((m) => attr(m, "name")?.toLowerCase() === "viewport")) fail("viewport", "No viewport meta tag: the page won't fit a phone.");
  if (!/<title\b[^>]*>[^<]+<\/title>/i.test(html)) fail("title", "No page title.");
  if (!tags(html, "meta").some((m) => attr(m, "name")?.toLowerCase() === "description")) signal("description", "No meta description.");

  // Structured data
  const ld = extractJsonLd(html);
  for (const e of ld.errors) fail("structured_data", e);
  const orgs = ld.blocks.filter((b) => ORG_TYPES.has(String(b["@type"])));
  if (ld.blocks.length === 0) signal("structured_data", "No structured data: search and answer engines can't read the company's facts from the page.");
  if (ctx.brand) {
    const c = compileBrandRules(ctx.brand);
    for (const b of ld.blocks) {
      const text = JSON.stringify(b);
      for (const { variant, re } of c.forbidden) {
        re.lastIndex = 0;
        if (re.test(text)) fail("structured_data_name", `Structured data uses the retired spelling "${variant}".`);
        re.lastIndex = 0;
      }
    }
  }
  if (ctx.entity) {
    for (const o of orgs) {
      if (o.name && o.name !== ctx.entity.trading_name_en && o.name !== ctx.entity.legal_name_en) fail("structured_data_name", `Organization name "${String(o.name)}" isn't the master record's.`);
      if (o.telephone && phoneKey(String(o.telephone)) !== phoneKey(ctx.entity.phone_main)) fail("structured_data_phone", `Organization telephone ${String(o.telephone)} isn't the master record's.`);
      if (o.url && urlKey(String(o.url)) !== urlKey(ctx.entity.website)) fail("structured_data_url", `Organization url ${String(o.url)} isn't the master record's.`);
    }
  }

  // Contacts
  const hrefs = tags(html, "a").map((a) => attr(a, "href") ?? "");
  const phones = [...new Set(hrefs.filter((h) => /^tel:/i.test(h)).map((h) => h.slice(4)))];
  const emails = [...new Set(hrefs.filter((h) => /^mailto:/i.test(h)).map((h) => h.slice(7).split("?")[0]!.toLowerCase()))];
  if (ctx.entity) {
    for (const p of phones) {
      if (phoneKey(p) !== phoneKey(ctx.entity.phone_main)) fail("contacts_phone", `A call link dials ${p}, which isn't the master record's number: possibly a retired line.`);
    }
    const domain = ctx.entity.email_main.split("@")[1]!.toLowerCase();
    for (const e of emails) {
      if (!e.endsWith(`@${domain}`)) fail("contacts_email", `A mail link goes to ${e}, outside the company domain.`);
    }
  }

  // Forms
  const formBodies = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((m) => m[0]);
  const withConsent = formBodies.filter((f) => CONSENT_WORDING.test(visibleText(f)) || CONSENT_WORDING.test(f)).length;
  if (formBodies.length > withConsent) {
    fail("form_consent", `${formBodies.length - withConsent} form(s) collect details with no consent or privacy wording (PDPL).`);
  }

  // The words on the page: the same brand and claims gates as everything else that is public. Form labels are the
  // visitor's voice ("I consent to…"), not Qottuf's, so they are left out here and checked for consent wording above.
  const textFindings: Finding[] = [];
  if (ctx.brand) {
    const text = visibleText(html.replace(/<form\b[\s\S]*?<\/form>/gi, " "));
    // The title and description live in the head, but they are what search results and browser tabs show.
    const title = decodeEntities(/<title\b[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? "").trim();
    const description = tags(html, "meta").find((m) => attr(m, "name")?.toLowerCase() === "description");
    const headCopy = [title, description ? attr(description, "content") ?? "" : ""].filter(Boolean).join("\n");
    if (headCopy) textFindings.push(...brandCheck(headCopy, ctx.brand).map((f) => ({ ...f, quote: `${f.quote} (page title or description)` })));
    textFindings.push(...brandCheck(text, ctx.brand));
    // An error page's "404" is a status, not a claim.
    if (ctx.figures && !ERROR_PAGE.test(new URL(page.url, "https://site.invalid/").pathname)) {
      textFindings.push(...checkClaims(text, { figures: ctx.figures, rules: ctx.brand, strict: true, extraAllow: UI_NUMBERS }).findings);
    }
  }

  return {
    url: page.url, status: page.status ?? null, lang, dir, isArabic, findings,
    contacts: { phones, emails },
    forms: { count: formBodies.length, withConsentWording: withConsent },
    hreflang,
    textFindings,
    gaps: ["Core Web Vitals were not measured (needs PageSpeed Insights or Lighthouse).", "Structured data was checked for completeness, not run through Google's Rich Results Test."],
  };
}

export interface SiteVerdict {
  pages: number;
  /** The G0 due-diligence bar, item by item. */
  bar: { nothing_false: boolean; working_contacts: boolean; both_languages: boolean; enquiry_form_with_consent: boolean };
  fails: number;
  signals: number;
}

export function siteVerdict(audits: PageAudit[]): SiteVerdict {
  const all = audits.flatMap((a) => a.findings);
  const text = audits.flatMap((a) => a.textFindings);
  return {
    pages: audits.length,
    bar: {
      nothing_false: text.every((f) => f.severity !== "fail"),
      working_contacts: audits.some((a) => a.contacts.phones.length > 0) && audits.some((a) => a.contacts.emails.length > 0)
        && all.every((f) => !f.check.startsWith("contacts_")),
      both_languages: audits.some((a) => a.isArabic) && audits.every((a) => !a.findings.some((f) => f.check === "both_languages")),
      enquiry_form_with_consent: audits.some((a) => a.forms.withConsentWording > 0),
    },
    fails: all.filter((f) => f.severity === "fail").length + text.filter((f) => f.severity === "fail").length,
    signals: all.filter((f) => f.severity === "signal").length + text.filter((f) => f.severity === "signal").length,
  };
}
