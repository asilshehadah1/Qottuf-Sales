// The Entity and Listings Record (merged roster #31; marketing C-06 + C-07). Code only.
// Owners, PMCs and answer engines trust a company whose facts are identical everywhere they appear. This keeps
// one master company record, approved by Asil and bound to the brand rulebook, and compares every public listing
// (website, Google Business Profile, LinkedIn, the company profile, Etimad, the chamber) against it.
// Observations are append-only, so drift over time stays visible.

import { z } from "zod";
import { audit } from "../audit/audit.ts";
import { canApprove, type BusinessRules } from "../config/rules.ts";
import type { Db, Queryable } from "../db/db.ts";
import { compileBrandRules, type BrandRules } from "../gates/brand.ts";
import { asciiDigits } from "../gates/numbers.ts";
import { normaliseArabic } from "../gates/pii.ts";
import { GateError } from "../ledger/repo.ts";

export const EntityFields = z.object({
  legal_name_en: z.string().min(3),
  legal_name_ar: z.string().min(3),
  trading_name_en: z.string().min(3),
  trading_name_ar: z.string().min(3),
  cr_number: z.string().regex(/^\d{10}$/, "a CR number has ten digits"),
  vat_number: z.string().regex(/^3\d{13}3$/, "a Saudi VAT number has 15 digits and starts and ends with 3").optional(),
  phone_main: z.string().min(7),
  email_main: z.string().email(),
  website: z.string().url(),
  address_en: z.string().optional(),
  address_ar: z.string().optional(),
  po_box: z.string().optional(),
  founded_year: z.number().int().min(1900).max(2100).optional(),
});
export type EntityFields = z.infer<typeof EntityFields>;
export type FieldName = keyof EntityFields;

export interface EntityVersion {
  version: number;
  fields: EntityFields;
  sources: Partial<Record<FieldName, string>>;
  approved_by: string;
  approved_at: Date;
}

/** The master record must agree with the one rulebook: a new name changes the rulebook first. */
export function checkAgainstRulebook(fields: EntityFields, brand: BrandRules): string[] {
  const n = brand.naming;
  const problems: string[] = [];
  if (fields.trading_name_en !== n.first_mention) problems.push(`trading_name_en must be "${n.first_mention}" (brand rulebook)`);
  if (fields.legal_name_en !== n.legal_en) problems.push(`legal_name_en must be "${n.legal_en}" (brand rulebook)`);
  if (normaliseArabic(fields.trading_name_ar) !== normaliseArabic(n.arabic)) problems.push(`trading_name_ar must be «${n.arabic}» (brand rulebook)`);
  return problems;
}

export async function approveEntityVersion(
  db: Db, rules: BusinessRules, brand: BrandRules,
  input: { fields: EntityFields; sources?: Partial<Record<FieldName, string>>; note?: string }, actor: string,
): Promise<number> {
  if (!canApprove(rules, "entity", actor)) throw new GateError(`${actor} may not approve the master company record`);
  const fields = EntityFields.parse(input.fields);
  const problems = checkAgainstRulebook(fields, brand);
  if (problems.length) throw new GateError(`master record disagrees with the brand rulebook: ${problems.join("; ")}`);
  return db.tx(async (q) => {
    const version = (await q.query<{ version: number }>(
      "INSERT INTO entity_versions (fields, sources, approved_by, note) VALUES ($1,$2,$3,$4) RETURNING version",
      [JSON.stringify(fields), JSON.stringify(input.sources ?? {}), actor, input.note ?? null],
    )).rows[0]!.version;
    await audit(q, { actor, action: "approve_version", entity: "entity", entityId: String(version), details: { note: input.note ?? null } });
    return Number(version);
  });
}

export async function currentEntity(q: Queryable): Promise<EntityVersion | null> {
  const r = (await q.query("SELECT * FROM entity_versions ORDER BY version DESC LIMIT 1")).rows[0];
  if (!r) return null;
  return {
    version: Number(r.version),
    fields: r.fields as EntityFields,
    sources: (r.sources as EntityVersion["sources"]) ?? {},
    approved_by: r.approved_by as string,
    approved_at: new Date(r.approved_at as string),
  };
}

export const Platform = z.enum(["website", "google_business_profile", "linkedin", "company_profile", "etimad", "chamber", "maroof", "national_address", "other"]);

export async function addListing(q: Queryable, l: { platform: z.infer<typeof Platform>; url?: string; owner: string }, actor: string): Promise<string> {
  const platform = Platform.parse(l.platform);
  const existing = (await q.query<{ id: string }>("SELECT id FROM listings WHERE platform = $1 AND url IS NOT DISTINCT FROM $2", [platform, l.url ?? null])).rows[0];
  if (existing) return existing.id;
  const id = (await q.query<{ id: string }>("INSERT INTO listings (platform, url, owner) VALUES ($1,$2,$3) RETURNING id", [platform, l.url ?? null, l.owner])).rows[0]!.id;
  await audit(q, { actor, action: "add", entity: "listing", entityId: id, details: { platform } });
  return id;
}

export async function recordObservation(q: Queryable, listingId: string, observed: Partial<Record<FieldName, string | number>>, observedBy: string): Promise<void> {
  await q.query("INSERT INTO listing_observations (listing_id, observed, observed_by) VALUES ($1,$2,$3)", [listingId, JSON.stringify(observed), observedBy]);
}

// ------------------------------------------------------------------ comparison

/** A Saudi number in any written form ("+966 11 217 7750", "011-217-7750", «٠١١٢١٧٧٧٥٠») reduced to its national digits. */
export function phoneKey(s: string): string {
  let d = asciiDigits(s).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("966")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

export function urlKey(s: string): string {
  return s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

function textKey(s: string): string {
  return normaliseArabic(asciiDigits(s)).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const KEYS: Record<FieldName, (s: string) => string> = {
  legal_name_en: textKey, legal_name_ar: textKey, trading_name_en: textKey, trading_name_ar: textKey,
  cr_number: (s) => asciiDigits(s).replace(/\D/g, ""), vat_number: (s) => asciiDigits(s).replace(/\D/g, ""),
  phone_main: phoneKey, email_main: (s) => s.trim().toLowerCase(), website: urlKey,
  address_en: textKey, address_ar: textKey, po_box: (s) => asciiDigits(s).replace(/\D/g, ""), founded_year: (s) => asciiDigits(s).replace(/\D/g, ""),
};

export interface ListingFinding {
  field: FieldName | "name";
  status: "match" | "mismatch" | "forbidden_name";
  severity: "fail" | "signal" | "ok";
  expected?: string;
  observed: string;
  why: string;
}

/** Compare what a listing shows with the master record. Addresses only signal: their formats legitimately vary. */
export function compareToEntity(entity: EntityFields, observed: Partial<Record<FieldName, string | number>>, brand?: BrandRules): ListingFinding[] {
  const out: ListingFinding[] = [];
  for (const [field, raw] of Object.entries(observed) as Array<[FieldName, string | number]>) {
    if (raw === undefined || raw === null || !(field in KEYS)) continue;
    const seen = String(raw);
    const expected = entity[field];
    if (expected === undefined) continue;
    const key = KEYS[field];
    const same = key(seen) === key(String(expected));
    const soft = field === "address_en" || field === "address_ar";
    out.push({
      field, observed: seen, expected: String(expected),
      status: same ? "match" : "mismatch",
      severity: same ? "ok" : soft ? "signal" : "fail",
      why: same ? "Matches the master record." : soft ? "Address differs from the master record: check it isn't an old address." : `Differs from the master record (${String(expected)}).`,
    });
  }
  if (brand) {
    const c = compileBrandRules(brand);
    for (const [field, raw] of Object.entries(observed)) {
      if (!/name/.test(field) || typeof raw !== "string") continue;
      for (const { variant, re } of c.forbidden) {
        re.lastIndex = 0;
        if (re.test(raw)) out.push({ field: "name", status: "forbidden_name", severity: "fail", observed: raw, why: `Uses the retired spelling "${variant}".` });
        re.lastIndex = 0;
      }
    }
  }
  return out;
}

export interface ListingReport {
  id: string;
  platform: string;
  url: string | null;
  owner: string;
  lastObservedAt: Date | null;
  stale: boolean;
  findings: ListingFinding[];
}

export async function listingsReport(q: Queryable, brand: BrandRules | undefined, now: Date, recheckDays: number): Promise<ListingReport[]> {
  const entity = await currentEntity(q);
  const rows = (await q.query<{ id: string; platform: string; url: string | null; owner: string; observed: Record<string, string> | null; observed_at: string | null }>(
    `SELECT l.id, l.platform, l.url, l.owner, o.observed, o.observed_at FROM listings l
     LEFT JOIN LATERAL (SELECT observed, observed_at FROM listing_observations WHERE listing_id = l.id ORDER BY id DESC LIMIT 1) o ON true
     ORDER BY l.id`,
  )).rows;
  return rows.map((r) => {
    const last = r.observed_at ? new Date(r.observed_at) : null;
    return {
      id: r.id, platform: r.platform, url: r.url, owner: r.owner, lastObservedAt: last,
      stale: !last || (now.getTime() - last.getTime()) / 86_400_000 > recheckDays,
      findings: entity && r.observed ? compareToEntity(entity.fields, r.observed as Partial<Record<FieldName, string>>, brand) : [],
    };
  });
}
