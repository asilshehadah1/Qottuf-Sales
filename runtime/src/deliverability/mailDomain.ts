// The DNS and Deliverability Check (merged roster #38; ported from marketing A-05). Code only.
// It protects the inbox quotes are sent from: if the domain has no SPF, DKIM and DMARC, quotes land in spam and
// anyone can send mail that looks like Qottuf's. It reads the real DNS records; nothing is guessed.
//
// Fixed from the marketing version:
// - DMARC is parsed tag by tag, so the subdomain policy (sp=) can't be mistaken for the policy (p=);
// - SPF lookups are counted as RFC 7208 counts them (bare "a" and "mx" too), and ptr is flagged as deprecated;
// - MX is checked, because replies to quotes need somewhere to arrive;
// - the resolver is pluggable: the system's DNS, or DNS over HTTPS where a network only allows HTTPS.
// The bulk-mail warm-up curve is dropped: Business Development sends one-to-one, never campaigns.

import { promises as dns } from "node:dns";

export interface DnsResolver {
  /** TXT records, each as its list of strings. An empty list when the name has none. Throws on network failure. */
  txt(name: string): Promise<string[][]>;
  mx(name: string): Promise<Array<{ exchange: string; priority: number }>>;
}

const NO_DATA = new Set(["ENODATA", "ENOTFOUND", "NXDOMAIN"]);

export function systemResolver(): DnsResolver {
  const quiet = async <T>(fn: () => Promise<T>, empty: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      if (NO_DATA.has((err as NodeJS.ErrnoException).code ?? "")) return empty;
      throw err;
    }
  };
  return {
    txt: (name) => quiet(() => dns.resolveTxt(name), [] as string[][]),
    mx: (name) => quiet(() => dns.resolveMx(name), [] as Array<{ exchange: string; priority: number }>),
  };
}

/** Parse the quoted strings of a TXT answer in DNS-over-HTTPS JSON ("\"v=spf1 ...\" \"more\""). */
export function parseTxtData(data: string): string[] {
  const parts = [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]!.replace(/\\(.)/g, "$1"));
  return parts.length ? parts : [data];
}

/** DNS over HTTPS (RFC 8484 JSON form). The query carries only the public domain name. */
export function dohResolver(endpoint = "https://cloudflare-dns.com/dns-query", fetchFn: typeof fetch = fetch): DnsResolver {
  const ask = async (name: string, type: "TXT" | "MX") => {
    const res = await fetchFn(`${endpoint}?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: "application/dns-json" } });
    if (!res.ok) throw new Error(`DNS over HTTPS answered ${res.status} for ${name} ${type}`);
    const body = (await res.json()) as { Status: number; Answer?: Array<{ type: number; data: string }> };
    if (body.Status === 3) return []; // NXDOMAIN
    if (body.Status !== 0) throw new Error(`DNS over HTTPS status ${body.Status} for ${name} ${type}`);
    return (body.Answer ?? []).filter((a) => a.type === (type === "TXT" ? 16 : 15)).map((a) => a.data);
  };
  return {
    txt: async (name) => (await ask(name, "TXT")).map(parseTxtData),
    mx: async (name) => (await ask(name, "MX")).map((d) => {
      const [priority, exchange] = d.trim().split(/\s+/);
      return { priority: Number(priority), exchange: (exchange ?? "").replace(/\.$/, "") };
    }),
  };
}

export interface MailDomainReport {
  domain: string;
  mx: { hosts: string[]; issues: string[] };
  spf: { record: string | null; lookups: number; issues: string[] };
  dkim: { checked: string[]; found: string[]; issues: string[] };
  dmarc: { record: string | null; policy: string | null; subdomainPolicy: string | null; reports: boolean; issues: string[] };
  /** "unknown": every lookup came back empty, which usually means the network blocks DNS, not that the domain is bare. */
  verdict: "protected" | "at_risk" | "unprotected" | "unknown";
  summary: string;
  gaps: string[];
}

const DEFAULT_SELECTORS = ["default", "google", "selector1", "selector2", "zmail", "zoho", "k1", "s1", "s2", "mail", "dkim"];
const LOOKUP_MECHANISMS = /^(include:|a$|a:|a\/|mx$|mx:|mx\/|ptr$|ptr:|exists:|redirect=)/i;

export function parseDmarc(record: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const part of record.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    tags[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return tags;
}

export async function checkMailDomain(domain: string, resolver: DnsResolver, opts: { dkimSelectors?: string[] } = {}): Promise<MailDomainReport> {
  const d = domain.trim().toLowerCase().replace(/^@/, "");

  const mxRecords = await resolver.mx(d);
  const mx = { hosts: mxRecords.sort((a, b) => a.priority - b.priority).map((m) => m.exchange), issues: [] as string[] };
  if (mx.hosts.length === 0) mx.issues.push("No MX records: replies to quotes have nowhere to arrive.");

  const rootTxt = (await resolver.txt(d)).map((c) => c.join(""));
  const spfRecords = rootTxt.filter((r) => /^v=spf1(\s|$)/i.test(r));
  const spf = { record: spfRecords[0] ?? null, lookups: 0, issues: [] as string[] };
  if (spfRecords.length === 0) {
    spf.issues.push("No SPF record: receiving servers can't tell which servers may send as this domain.");
  } else {
    if (spfRecords.length > 1) spf.issues.push(`${spfRecords.length} SPF records: more than one is invalid (RFC 7208) and breaks SPF entirely.`);
    const terms = spfRecords[0]!.split(/\s+/).slice(1).map((t) => t.replace(/^[+\-~?]/, ""));
    spf.lookups = terms.filter((t) => LOOKUP_MECHANISMS.test(t)).length;
    if (spf.lookups > 10) spf.issues.push(`${spf.lookups} DNS-lookup terms; the limit is 10 and going over fails SPF.`);
    if (terms.some((t) => /^ptr(:|$)/i.test(t))) spf.issues.push("Uses the deprecated ptr mechanism.");
    const all = spfRecords[0]!.split(/\s+/).find((t) => /^[+\-~?]?all$/i.test(t));
    if (!all && !terms.some((t) => /^redirect=/i.test(t))) spf.issues.push("No 'all' at the end: mail from unlisted servers isn't rejected.");
    else if (all && /^\+?all$/i.test(all)) spf.issues.push("Ends in '+all': it authorises every server on the internet to send as this domain.");
    else if (all?.startsWith("?")) spf.issues.push("Ends in '?all' (neutral): no real protection; use '~all' or '-all'.");
  }

  const selectors = opts.dkimSelectors?.length ? opts.dkimSelectors : DEFAULT_SELECTORS;
  const dkim = { checked: selectors, found: [] as string[], issues: [] as string[] };
  for (const sel of selectors) {
    const recs = (await resolver.txt(`${sel}._domainkey.${d}`)).map((c) => c.join(""));
    const key = recs.find((r) => /(^|;)\s*p=/i.test(r));
    if (!key) continue;
    if (/(^|;)\s*p=\s*(;|$)/i.test(key)) dkim.issues.push(`DKIM key at selector "${sel}" is empty (revoked).`);
    else dkim.found.push(sel);
  }
  if (dkim.found.length === 0) {
    dkim.issues.push(`No DKIM key at the selectors tried (${selectors.join(", ")}). Inconclusive, not proof of absence: pass the selector your mail provider uses.`);
  }

  const dmarcRecords = (await resolver.txt(`_dmarc.${d}`)).map((c) => c.join("")).filter((r) => /^v=dmarc1/i.test(r.trim()));
  const dmarc = { record: dmarcRecords[0] ?? null, policy: null as string | null, subdomainPolicy: null as string | null, reports: false, issues: [] as string[] };
  if (!dmarc.record) {
    dmarc.issues.push("No DMARC record: nothing tells receivers to reject mail that pretends to be this domain, and no reports come back.");
  } else {
    const tags = parseDmarc(dmarc.record);
    dmarc.policy = tags.p?.toLowerCase() ?? null;
    dmarc.subdomainPolicy = tags.sp?.toLowerCase() ?? null;
    dmarc.reports = Boolean(tags.rua);
    if (!dmarc.policy || !["none", "quarantine", "reject"].includes(dmarc.policy)) dmarc.issues.push("DMARC record has no valid p= policy.");
    else if (dmarc.policy === "none") dmarc.issues.push("DMARC p=none: monitoring only, it doesn't stop spoofing. Move to quarantine, then reject, once the reports look clean.");
    if (!dmarc.reports) dmarc.issues.push("No rua= address: no reports on who is sending as this domain.");
    if (tags.pct && Number(tags.pct) < 100) dmarc.issues.push(`DMARC applies to ${tags.pct}% of mail only.`);
  }

  const nothingResolved = mxRecords.length === 0 && rootTxt.length === 0 && dmarcRecords.length === 0 && dkim.found.length === 0;
  if (nothingResolved) {
    return {
      domain: d, mx, spf, dkim, dmarc, verdict: "unknown",
      summary: `Every DNS lookup for @${d} came back empty. That usually means this network blocks DNS, not that the domain is bare: re-run with DNS over HTTPS (--doh) or from another network.`,
      gaps: ["No records could be read, so nothing was verified."],
    };
  }
  const spfBroken = !spf.record || spf.issues.some((i) => /more than one|\+all/.test(i));
  const verdict: MailDomainReport["verdict"] =
    spfBroken || !dmarc.record ? "unprotected"
      : dmarc.policy === "none" || !dmarc.policy || spf.issues.length > 0 || dkim.found.length === 0 || mx.hosts.length === 0 ? "at_risk"
        : "protected";
  const summary = verdict === "protected"
    ? `Mail from @${d} is authenticated (SPF, DKIM, DMARC ${dmarc.policy}).`
    : verdict === "at_risk"
      ? `Mail from @${d} is partly protected: ${[...spf.issues, ...dkim.issues.slice(0, 1), ...dmarc.issues, ...mx.issues][0] ?? "see the details"}`
      : `Quotes sent from @${d} can be spoofed and may land in spam: ${!spf.record ? "no SPF" : spfBroken ? "SPF is broken" : ""}${!spf.record || spfBroken ? (dmarc.record ? "" : " and ") : ""}${dmarc.record ? "" : "no DMARC"}.`;
  return {
    domain: d, mx, spf, dkim, dmarc, verdict, summary,
    gaps: [
      "Nested SPF includes aren't expanded, so the lookup count is a minimum.",
      "No inbox-placement test (needs a seed-list service) and no bounce or complaint data (needs the mail provider's reports).",
    ],
  };
}
