// The Entity and Listings Record (merged roster #31; marketing C-06 + C-07). Code only.
// Owners, PMCs and answer engines trust a company whose facts are identical everywhere they appear. This keeps
// one master company record, approved by Asil and bound to the brand rulebook, and compares every public listing
// (website, Google Business Profile, LinkedIn, the company profile, Etimad, the chamber) against it.
// Observations are append-only, so drift over time stays visible.

import { z } from "zod";
import { audit } from "../audit/audit.ts";
import { canApprove, type BusinessRules } from "../config/rules.ts";
import type { Db, Queryable } from "../db/db.ts";
import type { BrandRules } from "../gates/brand.ts";
import { GateError } from "../ledger/repo.ts";
import { checkAgainstRulebook, compareToEntity, EntityFields, type FieldName, type ListingFinding } from "./compare.ts";

export * from "./compare.ts";

export interface EntityVersion {
  version: number;
  fields: EntityFields;
  sources: Partial<Record<FieldName, string>>;
  approved_by: string;
  approved_at: Date;
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
