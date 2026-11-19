import { describe, expect, it } from "vitest";
import type { EntityFields } from "../src/entity/entity.ts";
import { rulebookFigures } from "../src/gates/claims.ts";
import {
  auditHtml, extractJsonLd, fetchPage, organizationJsonLd, projectJsonLd, siteVerdict, visibleText,
} from "../src/site/siteChecker.ts";
import type { EvidenceRecord } from "../src/ledger/schemas.ts";
import { fixtureRules } from "./helpers.ts";

const brand = await fixtureRules();
const entity: EntityFields = {
  legal_name_en: "Qottuf Aljazeera Company L.L.C.", legal_name_ar: "شركة قطوف الجزيرة", trading_name_en: "Qottuf Aljazeera",
  trading_name_ar: "قطوف الجزيرة", cr_number: "1010000000", phone_main: "+966 11 000 0000", email_main: "info@example.com",
  website: "https://www.example.com", founded_year: 2014,
};
const ctx = { entity, brand, figures: rulebookFigures(brand) };

const GOOD_EN = `<!doctype html><html lang="en" dir="ltr"><head><title>Qottuf Aljazeera</title>
<meta name="viewport" content="width=device-width"><meta name="description" content="Main contractor in Riyadh.">
<link rel="canonical" href="https://www.example.com/"><link rel="alternate" hreflang="ar-SA" href="https://www.example.com/ar/">
<link rel="alternate" hreflang="en" href="https://www.example.com/">
<script type="application/ld+json">${JSON.stringify(organizationJsonLd(entity))}</script></head>
<body><h1>Qottuf Aljazeera</h1><p>Since 2014, fit-out and MEP works in Riyadh. Example Hospital: a 120-bed fit-out.</p>
<a href="tel:+966110000000">Call</a> <a href="mailto:info@example.com">Email</a>
<form><input name="phone"><label><input type="checkbox"> I consent to Qottuf Aljazeera processing my details under its privacy notice.</label></form>
</body></html>`;

const BAD = `<html class="x"><head><script type="application/ld+json">{"@type":"LocalBusiness","name":"Qottuf Al Jazeera","telephone":"0119999999"}</script></head>
<body><p>With 13+ years of experience, we are the best!</p><a href="tel:0119999999">Call the office</a>
<a href="mailto:sales@other-domain.example">Mail</a><form><input name="mobile"><button>Send</button></form></body></html>`;

describe("page audit", () => {
  it("passes a page that meets the bar", () => {
    const a = auditHtml({ url: "https://www.example.com/", html: GOOD_EN, status: 200 }, ctx);
    expect(a.findings).toEqual([]);
    expect(a.textFindings.filter((f) => f.severity === "fail")).toEqual([]);
    expect(a.forms).toEqual({ count: 1, withConsentWording: 1 });
  });

  it("finds every problem on a bad page", () => {
    const a = auditHtml({ url: "https://www.example.com/old", html: BAD, status: 200 }, ctx);
    const checks = a.findings.filter((f) => f.severity === "fail").map((f) => f.check).sort();
    expect(checks).toEqual([
      "both_languages", "contacts_email", "contacts_phone", "form_consent", "lang", "structured_data_name", "structured_data_name",
      "structured_data_phone", "title", "viewport",
    ]);
    const text = a.textFindings.filter((f) => f.severity === "fail").map((f) => f.rule);
    expect(text).toEqual(expect.arrayContaining(["tone.banned_phrase", "tone.exclamation", "red_flag.years"]));
  });

  it("requires dir=rtl on Arabic pages", () => {
    const a = auditHtml({ url: "https://www.example.com/ar/", html: `<html lang="ar"><head><title>قطوف الجزيرة</title></head><body></body></html>` }, ctx);
    expect(a.findings.map((f) => f.check)).toContain("dir");
  });

  it("reads the visible text only, decoding entities", () => {
    expect(visibleText(`<head><title>x</title></head><script>var a="13+ years"</script><p>Fit-out &amp; MEP&nbsp;works</p>`)).toBe("Fit-out & MEP works");
  });
});

describe("structured data", () => {
  it("generates Organization data from the master record, with the right name", () => {
    const o = organizationJsonLd(entity);
    expect(o).toMatchObject({ "@type": "GeneralContractor", name: "Qottuf Aljazeera", legalName: "Qottuf Aljazeera Company L.L.C." });
    expect(JSON.stringify(o)).not.toContain("Al Jazeera");
    expect(extractJsonLd(`<script type="application/ld+json">${JSON.stringify(o)}</script>`).blocks).toHaveLength(1);
  });

  it("names a client in project data only with Asil's public approval", () => {
    const rec = (over: Partial<EvidenceRecord>): EvidenceRecord => ({
      id: "EV-1", type: "case_facts", tier: "public", project_ref: "PRJ-901", title: "t", issuer: null, issued_at: null, expires_at: null,
      permitted_uses: [], status: "approved",
      facts: [
        { id: "n", kind: "statement", name: "project_name", value: "Example Hospital fit-out", label: "name" },
        { id: "c", kind: "statement", name: "client_name", value: "Example Health Group", label: "client" },
      ],
      ...over,
    });
    expect(projectJsonLd([rec({})], entity)).not.toHaveProperty("sponsor");
    const approved = projectJsonLd([rec({}), rec({ id: "EV-2", type: "client_naming_approval", facts: [], permitted_uses: ["name_client:public"] })], entity);
    expect(approved).toMatchObject({ sponsor: { name: "Example Health Group" }, creator: { name: "Qottuf Aljazeera" } });
    expect(() => projectJsonLd([rec({ tier: "tender" })], entity)).toThrow(/public, approved/);
  });
});

describe("fetching", () => {
  it("resolves each redirect against the hop that sent it (the marketing bug) and sends the same User-Agent every time", async () => {
    const seen: Array<{ url: string; ua: string | null }> = [];
    const fake = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      seen.push({ url, ua: new Headers(init?.headers as unknown as Record<string, string>).get("user-agent") });
      if (url === "https://a.example/old/page") return new Response(null, { status: 301, headers: { location: "../new/" } });
      if (url === "https://a.example/new/") return new Response(null, { status: 302, headers: { location: "final" } });
      if (url === "https://a.example/new/final") return new Response("<html lang='en'></html>", { status: 200 });
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const page = await fetchPage("https://a.example/old/page", fake);
    expect(page).toMatchObject({ status: 200, finalUrl: "https://a.example/new/final", redirects: ["https://a.example/new/", "https://a.example/new/final"] });
    expect(seen.every((s) => s.ua === "QottufSiteChecker/1.0 (+internal)")).toBe(true);
  });
});

describe("the site verdict against the G0 bar", () => {
  it("reports each item of the bar", () => {
    const ar = auditHtml({ url: "https://www.example.com/ar/", html: GOOD_EN.replace('lang="en" dir="ltr"', 'lang="ar" dir="rtl"') }, ctx);
    const en = auditHtml({ url: "https://www.example.com/", html: GOOD_EN }, ctx);
    expect(siteVerdict([en, ar]).bar).toEqual({ nothing_false: true, working_contacts: true, both_languages: true, enquiry_form_with_consent: true });
    const bad = auditHtml({ url: "https://www.example.com/", html: BAD }, ctx);
    expect(siteVerdict([bad]).bar).toEqual({ nothing_false: false, working_contacts: false, both_languages: false, enquiry_form_with_consent: false });
  });
});
