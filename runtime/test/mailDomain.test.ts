import { describe, expect, it } from "vitest";
import { checkMailDomain, dohResolver, parseDmarc, parseTxtData, type DnsResolver } from "../src/deliverability/mailDomain.ts";

function fakeDns(records: Record<string, string[]>, mx: string[] = ["mx1.example.net"]): DnsResolver {
  return {
    txt: async (name) => (records[name] ?? []).map((r) => [r]),
    mx: async () => mx.map((exchange, i) => ({ exchange, priority: (i + 1) * 10 })),
  };
}

describe("mail domain check", () => {
  it("passes a well-protected domain", async () => {
    const r = await checkMailDomain("example.com", fakeDns({
      "example.com": ["v=spf1 include:_spf.mail.example -all", "google-site-verification=abc"],
      "selector1._domainkey.example.com": ["v=DKIM1; k=rsa; p=MIIBIjANBgkq"],
      "_dmarc.example.com": ["v=DMARC1; p=reject; rua=mailto:dmarc@example.com"],
    }));
    expect(r.verdict).toBe("protected");
    expect(r.dkim.found).toEqual(["selector1"]);
  });

  it("calls a domain with no SPF and no DMARC unprotected", async () => {
    const r = await checkMailDomain("example.com", fakeDns({ "example.com": ["google-site-verification=abc"] }));
    expect(r.verdict).toBe("unprotected");
    expect(r.summary).toContain("no SPF and no DMARC");
  });

  it("says it can't tell when every lookup is empty, instead of a false 'unprotected'", async () => {
    const r = await checkMailDomain("example.com", fakeDns({}, []));
    expect(r.verdict).toBe("unknown");
    expect(r.summary).toContain("--doh");
  });

  it("does not mistake the subdomain policy for the policy (the marketing bug)", async () => {
    const r = await checkMailDomain("example.com", fakeDns({
      "example.com": ["v=spf1 mx -all"],
      "selector1._domainkey.example.com": ["v=DKIM1; p=MIIB"],
      "_dmarc.example.com": ["v=DMARC1; sp=reject; p=none; rua=mailto:d@example.com"],
    }));
    expect(r.dmarc).toMatchObject({ policy: "none", subdomainPolicy: "reject" });
    expect(r.verdict).toBe("at_risk");
    expect(parseDmarc("v=DMARC1; sp=reject; p=none").p).toBe("none");
  });

  it("counts SPF lookups as the RFC does and flags +all, two records, missing MX and revoked keys", async () => {
    const many = `v=spf1 a mx ${Array.from({ length: 10 }, (_, i) => `include:s${i}.example`).join(" ")} ~all`;
    const r = await checkMailDomain("example.com", fakeDns({ "example.com": [many], "_dmarc.example.com": ["v=DMARC1; p=quarantine"] }, []));
    expect(r.spf.lookups).toBe(12);
    expect(r.spf.issues[0]).toContain("limit is 10");
    expect(r.mx.issues[0]).toContain("No MX");
    const open = await checkMailDomain("example.com", fakeDns({ "example.com": ["v=spf1 +all"], "_dmarc.example.com": ["v=DMARC1; p=reject"] }));
    expect(open.verdict).toBe("unprotected");
    const two = await checkMailDomain("example.com", fakeDns({ "example.com": ["v=spf1 -all", "v=spf1 mx -all"], "_dmarc.example.com": ["v=DMARC1; p=reject"] }));
    expect(two.spf.issues[0]).toContain("2 SPF records");
    const revoked = await checkMailDomain("example.com", fakeDns({ "example.com": ["v=spf1 -all"], "default._domainkey.example.com": ["v=DKIM1; p="], "_dmarc.example.com": ["v=DMARC1; p=reject"] }));
    expect(revoked.dkim.issues[0]).toContain("revoked");
  });
});

describe("DNS over HTTPS", () => {
  it("parses TXT and MX answers and treats NXDOMAIN as no records", async () => {
    const fake = (async (url: string | URL | Request) => {
      const u = new URL(String(url));
      const name = u.searchParams.get("name");
      const type = u.searchParams.get("type");
      if (name === "missing.example") return Response.json({ Status: 3 });
      if (type === "TXT") return Response.json({ Status: 0, Answer: [{ type: 16, data: '"v=spf1 include:a.example" " -all"' }] });
      return Response.json({ Status: 0, Answer: [{ type: 15, data: "10 mx.example.net." }] });
    }) as typeof fetch;
    const r = dohResolver("https://doh.example/dns-query", fake);
    expect(await r.txt("example.com")).toEqual([["v=spf1 include:a.example", " -all"]]);
    expect(await r.mx("example.com")).toEqual([{ priority: 10, exchange: "mx.example.net" }]);
    expect(await r.txt("missing.example")).toEqual([]);
    expect(parseTxtData('"a\\"b"')).toEqual(['a"b']);
  });
});
