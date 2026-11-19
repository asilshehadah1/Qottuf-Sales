// The Ledger: accounts, contacts, consent and the evidence store. Every write is audited.
// Evidence reads go through the database's row-level security with an explicit tier ceiling; reads of
// confidential and internal rows are logged (spec §12.2).

import { audit } from "../audit/audit.ts";
import { canApprove, type BusinessRules } from "../config/rules.ts";
import { dateText, type Db, type Queryable } from "../db/db.ts";
import type { KnownPerson } from "../gates/pii.ts";
export { figuresFromEvidence, riyadhDate } from "./figures.ts";
import { riyadhDate } from "./figures.ts";
import {
  AccountInput, ConsentInput, ContactInput, EvidenceInput, TIER_RANK,
  type EvidenceFact, type EvidenceRecord, type Tier,
} from "./schemas.ts";

export class GateError extends Error {}

export async function createAccount(q: Queryable, input: AccountInput, actor: string): Promise<string> {
  const a = AccountInput.parse(input);
  const id = (
    await q.query<{ id: string }>(
      `INSERT INTO accounts (name_en, name_ar, type, parent_id, sector, relationship_owner, executive_sponsor, priority_rank)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [a.name_en, a.name_ar ?? null, a.type, a.parent_id ?? null, a.sector ?? null, a.relationship_owner, a.executive_sponsor ?? null, a.priority_rank ?? null],
    )
  ).rows[0]!.id;
  await audit(q, { actor, action: "create", entity: "account", entityId: id });
  return id;
}

export async function createContact(q: Queryable, input: ContactInput, actor: string): Promise<string> {
  const c = ContactInput.parse(input);
  const id = (
    await q.query<{ id: string }>(
      `INSERT INTO contacts (account_id, full_name_en, full_name_ar, role_title, committee_role, preferred_channel, preferred_language, phone, email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [c.account_id, c.full_name_en ?? null, c.full_name_ar ?? null, c.role_title ?? null, c.committee_role ?? null,
        c.preferred_channel ?? null, c.preferred_language ?? null, c.phone ?? null, c.email ?? null],
    )
  ).rows[0]!.id;
  // The audit log never holds personal data: only the id.
  await audit(q, { actor, action: "create", entity: "contact", entityId: id });
  return id;
}

export async function recordConsent(q: Queryable, input: ConsentInput): Promise<void> {
  const c = ConsentInput.parse(input);
  await q.query(
    `INSERT INTO consent_events (contact_id, channel, scope, action, wording_version, source, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [c.contact_id, c.channel, c.scope, c.action, c.wording_version, c.source, c.recorded_by],
  );
  await audit(q, { actor: c.recorded_by, action: `consent_${c.action}`, entity: "contact", entityId: c.contact_id, details: { channel: c.channel, scope: c.scope } });
}

/** The latest consent event for this contact, channel and scope decides. No event means no consent. */
export async function consentStatus(
  q: Queryable, contactId: string, channel: string, scope: string,
): Promise<{ granted: boolean; wording_version: string | null }> {
  const row = (
    await q.query<{ action: string; wording_version: string }>(
      `SELECT action, wording_version FROM consent_events
       WHERE contact_id = $1 AND channel = $2 AND scope = $3 ORDER BY recorded_at DESC, id DESC LIMIT 1`,
      [contactId, channel, scope],
    )
  ).rows[0];
  return { granted: row?.action === "grant", wording_version: row?.wording_version ?? null };
}

/** Names of every known contact, for redaction before model calls. */
export async function knownPeople(q: Queryable): Promise<KnownPerson[]> {
  const rows = (await q.query<{ id: string; full_name_en: string | null; full_name_ar: string | null }>(
    "SELECT id, full_name_en, full_name_ar FROM contacts",
  )).rows;
  return rows.map((r) => ({ contactId: r.id, names: [r.full_name_en, r.full_name_ar].filter((n): n is string => Boolean(n)) }));
}

// ------------------------------------------------------------------ evidence

export async function fileEvidence(q: Queryable, input: EvidenceInput): Promise<string> {
  const e = EvidenceInput.parse(input);
  const id = (
    await q.query<{ id: string }>(
      `INSERT INTO evidence_records (type, tier, project_ref, title, issuer, issued_at, expires_at, file_name, file_hash, permitted_uses, facts, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [e.type, e.tier, e.project_ref ?? null, e.title, e.issuer ?? null, e.issued_at ?? null, e.expires_at ?? null,
        e.file_name ?? null, e.file_hash ?? null, e.permitted_uses, JSON.stringify(e.facts), e.created_by],
    )
  ).rows[0]!.id;
  await audit(q, { actor: e.created_by, action: "file", entity: "evidence", entityId: id, details: { type: e.type, tier: e.tier } });
  return id;
}

/** Gate S-G5: an evidence record becomes usable only when an authorised person approves it. */
export async function approveEvidence(q: Queryable, id: string, actor: string, rules: BusinessRules): Promise<void> {
  if (!canApprove(rules, "S-G5", actor)) throw new GateError(`${actor} may not approve evidence (S-G5)`);
  const res = await q.query("UPDATE evidence_records SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1 AND status = 'draft' RETURNING id", [id, actor]);
  if (res.rows.length === 0) throw new GateError(`evidence ${id} is not a draft`);
  await audit(q, { actor, action: "approve", entity: "evidence", entityId: id });
}

export async function withdrawEvidence(q: Queryable, id: string, actor: string, reason: string): Promise<void> {
  await q.query("UPDATE evidence_records SET status = 'withdrawn' WHERE id = $1 AND status <> 'withdrawn'", [id]);
  await audit(q, { actor, action: "withdraw", entity: "evidence", entityId: id, details: { reason } });
}

/** Gate S-G6: Asil releases one confidential record for one purpose, for a limited time. */
export async function releaseConfidential(
  q: Queryable, evidenceId: string, purpose: string, actor: string, rules: BusinessRules, days = 14,
): Promise<void> {
  if (!canApprove(rules, "S-G6", actor)) throw new GateError(`${actor} may not release confidential evidence (S-G6)`);
  await q.query(
    `INSERT INTO confidential_releases (evidence_id, purpose, released_by, expires_at) VALUES ($1,$2,$3, now() + make_interval(days => $4))`,
    [evidenceId, purpose, actor, days],
  );
  await audit(q, { actor, action: "release_confidential", entity: "evidence", entityId: evidenceId, details: { purpose, days } });
}

export interface EvidenceReadOptions {
  maxTier: Tier;
  readBy: string;
  purpose: string;
  /** Riyadh date (YYYY-MM-DD) used for "unexpired"; defaults to today. */
  on?: string;
  onlyUsable?: boolean;
  projectRef?: string;
}

function rowToEvidence(r: Record<string, unknown>): EvidenceRecord {
  const d = dateText;
  return {
    id: r.id as string,
    type: r.type as EvidenceRecord["type"],
    tier: r.tier as Tier,
    project_ref: (r.project_ref as string | null) ?? null,
    title: r.title as string,
    issuer: (r.issuer as string | null) ?? null,
    issued_at: d(r.issued_at),
    expires_at: d(r.expires_at),
    permitted_uses: (r.permitted_uses as string[]) ?? [],
    facts: (r.facts as EvidenceFact[]) ?? [],
    status: r.status as EvidenceRecord["status"],
  };
}

/**
 * Read evidence as the application role, with the tier ceiling enforced by the database.
 * Confidential rows are returned only if Asil released them (S-G6) for a purpose that is still open.
 */
export async function readEvidence(db: Db, o: EvidenceReadOptions): Promise<EvidenceRecord[]> {
  const on = o.on ?? riyadhDate();
  return db.tx(async (q) => {
    await q.query("SET LOCAL ROLE qottuf_app");
    await q.query("SELECT set_config('qottuf.max_tier_rank', $1, true)", [String(TIER_RANK[o.maxTier])]);
    const rows = (
      await q.query(
        `SELECT e.* FROM evidence_records e
         WHERE ($1::boolean IS NOT TRUE OR (e.status = 'approved' AND (e.expires_at IS NULL OR e.expires_at >= $2::date)))
           AND ($3::text IS NULL OR e.project_ref = $3)
           AND (e.tier <> 'confidential' OR EXISTS (
                 SELECT 1 FROM confidential_releases r WHERE r.evidence_id = e.id AND r.expires_at > now()))
         ORDER BY e.id`,
        [o.onlyUsable ?? true, on, o.projectRef ?? null],
      )
    ).rows.map(rowToEvidence);
    for (const r of rows) {
      if (r.tier === "confidential" || r.tier === "internal") {
        await q.query(
          "INSERT INTO evidence_read_log (evidence_id, tier, read_by, purpose) VALUES ($1,$2,$3,$4)",
          [r.id, r.tier, o.readBy, o.purpose],
        );
      }
    }
    return rows;
  });
}
