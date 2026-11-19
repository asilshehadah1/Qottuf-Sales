// The audit log: append-only (the database refuses edits and deletes) and hash-chained, so a gap or an
// altered row is detectable by recomputing the chain (verifyAuditChain).

import { createHash } from "node:crypto";
import type { Queryable } from "../db/db.ts";

const GENESIS = "0".repeat(64);

/** JSON with object keys sorted at every level: Postgres jsonb reorders keys, so hashes must not depend on order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

function rowHash(prev: string, at: string, actor: string, action: string, entity: string, entityId: string, details: unknown): string {
  return createHash("sha256")
    .update(canonicalJson([prev, at, actor, action, entity, entityId, details]))
    .digest("hex");
}

export async function audit(
  q: Queryable,
  entry: { actor: string; action: string; entity: string; entityId: string; details?: Record<string, unknown> },
): Promise<void> {
  // Serialise writers so the chain has one head (a no-op in the single-connection embedded database).
  await q.query("SELECT pg_advisory_xact_lock(4242)");
  const prev = (await q.query<{ hash: string }>("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1")).rows[0]?.hash ?? GENESIS;
  const at = new Date().toISOString();
  const details = entry.details ?? {};
  const hash = rowHash(prev, at, entry.actor, entry.action, entry.entity, entry.entityId, details);
  await q.query(
    `INSERT INTO audit_log (at, actor, action, entity, entity_id, details, prev_hash, hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [at, entry.actor, entry.action, entry.entity, entry.entityId, JSON.stringify(details), prev, hash],
  );
}

/** Recompute the whole chain. Returns the id of the first row that doesn't verify, or null if all do. */
export async function verifyAuditChain(q: Queryable): Promise<number | null> {
  const rows = (
    await q.query<{ id: string; at: Date | string; actor: string; action: string; entity: string; entity_id: string; details: unknown; prev_hash: string; hash: string }>(
      "SELECT * FROM audit_log ORDER BY id",
    )
  ).rows;
  let prev = GENESIS;
  for (const r of rows) {
    const at = r.at instanceof Date ? r.at.toISOString() : new Date(r.at).toISOString();
    const expected = rowHash(prev, at, r.actor, r.action, r.entity, r.entity_id, r.details);
    if (r.prev_hash !== prev || r.hash !== expected) return Number(r.id);
    prev = r.hash;
  }
  return null;
}
