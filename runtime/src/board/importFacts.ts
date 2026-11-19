// Import the brand fact base into the Ledger: the projects as public evidence, the clients the company already names
// as naming approvals, the lifts the capability record says Qottuf supplied and installed, and a proposed master
// company record with its open questions. The facts are read at run time from the qottuf-brand skill on this
// machine (references/facts-and-claims.md and assets/brand-rules.json): nothing from them is kept in git.
// Asil approved these facts in the fact base; the import is Asil's action from the board, and it runs once.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { audit } from "../audit/audit.ts";
import type { BusinessRules } from "../config/rules.ts";
import type { Db } from "../db/db.ts";
import type { BrandRules } from "../gates/brand.ts";
import { findNumericMentions, unitOfWord } from "../gates/numbers.ts";
import { registerUnit } from "../installedBase/registry.ts";
import { approveEvidence, fileEvidence } from "../ledger/repo.ts";
import type { EvidenceFact, EvidenceInput } from "../ledger/schemas.ts";

export const FACT_BASE_ISSUER = "Qottuf brand fact base";

export interface ParsedProject {
  ref: string;
  en: string;
  ar: string | null;
  client: string | null;
  named: boolean;
  privateClient: boolean;
  scope: string;
  detail: string;
  constraint: string | null;
}

export interface ParsedFactBase {
  projects: ParsedProject[];
  company: Record<string, { en: string; ar: string }>;
  credentialsLine: string | null;
  /** From the capability record: projects whose lifts Qottuf supplied, installed and commissioned, with the count. */
  liftsSupplied: Array<{ ref: string; count: number }>;
  openItems: Array<{ item: string; rule: string }>;
}

const clean = (s: string) => s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
const cells = (line: string) => line.split("|").slice(1, -1).map((c) => c.trim());

/** Parse the markdown tables of facts-and-claims.md and the conflicts table of open-items.md. */
export function parseFactBase(facts: string, openItems: string): ParsedFactBase {
  const lines = facts.split("\n");
  const section = (title: RegExp) => {
    const start = lines.findIndex((l) => title.test(l));
    if (start < 0) return [] as string[];
    const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
    return lines.slice(start + 1, end < 0 ? undefined : end);
  };

  const constraints = new Map<string, string>();
  for (const l of section(/^## 2b\./)) {
    const c = cells(l);
    if (c.length >= 2 && /^PRJ-\d+$/.test(c[0]!)) constraints.set(c[0]!, clean(c[1]!));
  }

  const projects: ParsedProject[] = [];
  for (const l of section(/^## 2\. Projects/)) {
    const c = cells(l);
    if (c.length < 5 || !/^PRJ-\d+$/.test(c[0]!)) continue;
    const [en, ar] = c[1]!.split(" · ").map(clean);
    const rawClient = clean(c[2]!);
    const named = /\(named\)/i.test(rawClient) && !/private/i.test(rawClient);
    const privateClient = /^private/i.test(rawClient);
    const unconfirmed = /never name|unconfirmed/i.test(rawClient);
    const constraint = constraints.get(c[0]!) ?? null;
    projects.push({
      ref: c[0]!, en: en!, ar: ar ?? null,
      client: named ? rawClient.replace(/\s*\(named\)\s*/i, "").trim() : null,
      named, privateClient: privateClient || unconfirmed,
      scope: clean(c[3]!),
      detail: clean(c[4]!),
      constraint: constraint ? constraint.charAt(0).toUpperCase() + constraint.slice(1) : null,
    });
  }

  const company: Record<string, { en: string; ar: string }> = {};
  for (const l of section(/^## 1\. Company record/)) {
    const c = cells(l);
    if (c.length >= 3 && c[0] && !/^-+$/.test(c[0]) && c[0] !== "Field") company[c[0].toLowerCase()] = { en: clean(c[1]!), ar: clean(c[2]!) };
  }
  const credentials = /Approved credentials line[^"]*"([^"]+)"/s.exec(facts.replace(/\n/g, " "));

  const liftsSupplied: Array<{ ref: string; count: number }> = [];
  for (const m of facts.matchAll(/(PRJ-\d+) \((\d+) elevators supplied, installed, commissioned\)/g)) {
    if (!liftsSupplied.some((x) => x.ref === m[1])) liftsSupplied.push({ ref: m[1]!, count: Number(m[2]) });
  }

  const items: Array<{ item: string; rule: string }> = [];
  for (const l of openItems.split("\n")) {
    const c = cells(l);
    if (c.length >= 2 && c[0] !== "Item" && !/^-+$/.test(c[0]!)) items.push({ item: clean(c[0]!), rule: clean(c[1]!) });
  }

  return { projects, company, credentialsLine: credentials ? clean(credentials[1]!) : null, liftsSupplied, openItems: items };
}

function descriptor(p: ParsedProject): string {
  if (!p.client) return p.privateClient ? (/never|unconfirmed/i.test(p.detail) || p.ref === "PRJ-007" ? "a confidential client" : "a private client") : "a client";
  if (/endowment/i.test(p.client)) return "a university endowment in Riyadh";
  if (/universit/i.test(p.client)) return "a university in Riyadh";
  if (/bank/i.test(p.client)) return "a national bank";
  if (/health|hospital/i.test(p.client) || /hospital/i.test(p.en)) return "a hospital operator";
  if (/data cent/i.test(p.en)) return "a data-centre developer";
  return "a private-sector client";
}

function location(p: ParsedProject): string {
  if (/khobar/i.test(p.en)) return "Riyadh and Khobar";
  const place = /,\s*([A-Z][\w-]+(?:\s[\w-]+)?)$/.exec(p.en)?.[1];
  return place && !/riyadh/i.test(place) ? `${place}, Riyadh` : "Riyadh";
}

/** Figures from the rulebook's verified figures for one project, with units read from their own labels. */
export function projectFigures(ref: string, brand: BrandRules): EvidenceFact[] {
  const out: EvidenceFact[] = [];
  const used = new Map<string, number>();
  for (const f of brand.verified_figures.filter((x) => x.id === ref)) {
    const value = Number(String(f.value).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(value)) continue;
    const mention = findNumericMentions(f.label).find((m) => m.value === value) ?? findNumericMentions(f.label)[0];
    const unit = mention?.unit ?? unitOfWord((f.context ?? "").split("|")[0] ?? "") ?? null;
    const key = unit ?? "figure";
    const n = (used.get(key) ?? 0) + 1;
    used.set(key, n);
    out.push({
      id: n === 1 ? key : `${key}${n}`, kind: "figure", name: unit ? `${unit}_count` : "figure", value,
      ...(unit ? { unit } : {}), ...(f.context ? { context: f.context } : {}),
      label: f.label.replace(/^~\s*/, "about ").replace(/\s~(\d)/g, " about $1"),
    });
  }
  return out;
}

export interface ImportResult {
  evidence: number;
  lifts: number;
  proposal: boolean;
  skipped: string[];
}

/** Locate the qottuf-brand skill: QOTTUF_BRAND_DIR, or the usual places Claude keeps skills. */
export async function findBrandDir(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const { existsSync, readdirSync } = await import("node:fs");
  const home = env.HOME ?? env.USERPROFILE ?? "";
  const candidates = [env.QOTTUF_BRAND_DIR, path.join(home, ".claude", "skills", "qottuf-brand")].filter((p): p is string => Boolean(p));
  const synced = path.join(home, ".claude", "skills", "synced");
  if (existsSync(synced)) for (const d of readdirSync(synced)) candidates.push(path.join(synced, d, "qottuf-brand"));
  return candidates.find((p) => existsSync(path.join(p, "references", "facts-and-claims.md")) && existsSync(path.join(p, "assets", "brand-rules.json"))) ?? null;
}

export async function importBrandFacts(db: Db, rules: BusinessRules, brand: BrandRules, brandDir: string, actor: string): Promise<ImportResult> {
  const facts = await readFile(path.join(brandDir, "references", "facts-and-claims.md"), { encoding: "utf-8" });
  const open = await readFile(path.join(brandDir, "references", "open-items.md"), { encoding: "utf-8" }).catch(() => "");
  const parsed = parseFactBase(facts, open);
  const result: ImportResult = { evidence: 0, lifts: 0, proposal: false, skipped: [] };

  const already = (await db.query("SELECT 1 FROM evidence_records WHERE issuer = $1 LIMIT 1", [FACT_BASE_ISSUER])).rows.length > 0;
  if (already) result.skipped.push("evidence: the fact base was imported before");
  else {
    const file = async (input: Omit<EvidenceInput, "created_by">) => {
      const id = await fileEvidence(db, { ...input, issuer: FACT_BASE_ISSUER, created_by: actor } as EvidenceInput);
      await approveEvidence(db, id, actor, rules);
      result.evidence++;
      return id;
    };
    for (const p of parsed.projects) {
      const st = (id: string, name: string, value: string, label?: string): EvidenceFact => ({ id, kind: "statement", name, value, label: label ?? value });
      await file({
        type: "case_facts", tier: "public", project_ref: p.ref, title: `${p.en}: project facts`,
        facts: [
          st("title", "project_title", p.en),
          ...(p.ar ? [st("title_ar", "project_title_ar", p.ar, `Arabic project name: ${p.ar}`)] : []),
          st("location", "location", location(p)),
          st("scope", "scope", p.scope),
          st("detail", "scope_detail", p.detail),
          ...(p.constraint ? [st("constraint", "constraint", p.constraint)] : []),
          st("descriptor", "client_descriptor", descriptor(p), `Client, unnamed: ${descriptor(p)}`),
          ...(p.client ? [st("client", "client_name", p.client, `Client: ${p.client}`)] : []),
          ...projectFigures(p.ref, brand).map((f) => ({ ...f, label: f.label.includes(p.en) ? f.label : `${f.label}, ${p.en}` })),
        ],
      });
      if (p.named && p.client) {
        await file({ type: "client_naming_approval", tier: "public", project_ref: p.ref, title: `${p.client} may be named on public channels`, permitted_uses: ["name_client:public"] });
      }
    }
    const cr = parsed.company["cr"]?.en;
    const founded = parsed.company["founded"]?.en;
    if (cr || founded || parsed.credentialsLine) {
      await file({
        type: "company_record", tier: "public", title: "Company record: CR, founding year and credentials line",
        facts: [
          ...(cr ? [{ id: "cr", kind: "statement" as const, name: "cr_number", value: cr, label: `CR ${cr}` }] : []),
          ...(founded && /^\d{4}$/.test(founded) ? [{ id: "founded", kind: "figure" as const, name: "founded_year", value: Number(founded), label: `Established ${founded}` }] : []),
          ...(parsed.credentialsLine ? [{ id: "credentials", kind: "statement" as const, name: "credentials_line", value: parsed.credentialsLine, label: "Approved credentials line (use verbatim)" }] : []),
        ],
      });
    }
  }

  const liftsThere = (await db.query("SELECT 1 FROM installed_units WHERE project_ref IS NOT NULL LIMIT 1")).rows.length > 0;
  if (liftsThere) result.skipped.push("lifts: already in the registry");
  else {
    for (const l of parsed.liftsSupplied) {
      const p = parsed.projects.find((x) => x.ref === l.ref);
      for (let i = 1; i <= l.count; i++) {
        await registerUnit(db, rules, {
          site: `${p?.en ?? l.ref}${p?.client ? `, ${p.client}` : ""}: lift ${i} of ${l.count}`, source: "installed", unverified: true, project_ref: l.ref,
        }, actor);
        result.lifts++;
      }
    }
  }

  const hasRecord = (await db.query("SELECT 1 FROM entity_proposals UNION ALL SELECT 1 FROM entity_versions LIMIT 1")).rows.length > 0;
  if (hasRecord) result.skipped.push("company record: one is already proposed or approved");
  else {
    const c = parsed.company;
    const phone = c["phone"]?.en;
    const address = c["address"]?.en;
    const fields: Record<string, unknown> = {
      ...(c["legal (formal documents)"]?.en ? { legal_name_en: c["legal (formal documents)"].en } : {}),
      ...(c["name, first mention"] ? { trading_name_en: c["name, first mention"].en, trading_name_ar: c["name, first mention"].ar } : {}),
      ...(c["cr"]?.en ? { cr_number: c["cr"].en } : {}),
      ...(phone ? { phone_main: phone } : {}),
      ...(address ? { address_en: address } : {}),
      ...(address && /P\.?O\.? Box (\d+)/i.test(address) ? { po_box: /P\.?O\.? Box (\d+)/i.exec(address)![1] } : {}),
      ...(c["founded"]?.en && /^\d{4}$/.test(c["founded"].en) ? { founded_year: Number(c["founded"].en) } : {}),
    };
    const questions = [
      ...parsed.openItems.filter((o) => /legal name|domain/i.test(o.item)).map((o) => `${o.item}. Working rule until decided: ${o.rule}`),
      ...(phone ? [`Main phone: the website's elevator page says the office landline was retired. Is ${phone} still answered?`] : []),
      "Main email and website: not in the fact base. Which address and domain are the company's?",
      "VAT number: not on file. Add it from the VAT registration certificate.",
    ];
    await db.query("INSERT INTO entity_proposals (fields, questions, proposed_by) VALUES ($1,$2,$3)", [JSON.stringify(fields), JSON.stringify(questions), actor]);
    await audit(db, { actor, action: "propose", entity: "entity", entityId: "proposal", details: { source: FACT_BASE_ISSUER, questions: questions.length } });
    result.proposal = true;
  }
  return result;
}
