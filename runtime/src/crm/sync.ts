// The CRM mirror: quotations copied into the Ledger without personal data (migrations/003_board.sql), and the
// elevator pipeline read from it. The CRM stays the master: a sync replaces each mirrored quotation with the
// CRM's current version, and a complete sync drops quotations the CRM no longer lists.

import { audit } from "../audit/audit.ts";
import type { BusinessRules } from "../config/rules.ts";
import type { Db, Queryable } from "../db/db.ts";
import { CRM_STAGES, type CrmClient, type CrmQuote } from "./client.ts";

export async function syncCrm(db: Db, crm: CrmClient, actor: string): Promise<{ quotes: number; removed: number }> {
  const page = await crm.allQuotes();
  const complete = page.quotes.length >= page.total;
  return db.tx(async (q) => {
    for (const quote of page.quotes) {
      await q.query(
        `INSERT INTO crm_quotes (ref, crm_id, status, source, data, created_at, updated_at, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now())
         ON CONFLICT (ref) DO UPDATE SET crm_id = EXCLUDED.crm_id, status = EXCLUDED.status, source = EXCLUDED.source, data = EXCLUDED.data,
           created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, synced_at = now()`,
        [quote.ref, quote.id, quote.status, quote.source, JSON.stringify(quote), quote.created_at, quote.updated_at],
      );
    }
    let removed = 0;
    if (complete) {
      const refs = page.quotes.map((x) => x.ref);
      removed = (await q.query("DELETE FROM crm_quotes WHERE NOT (ref = ANY($1::text[])) RETURNING ref", [refs])).rows.length;
    }
    await q.query("INSERT INTO crm_syncs (actor, quotes, crm_role, note) VALUES ($1,$2,$3,$4)",
      [actor, page.quotes.length, crm.user?.role ?? null, complete ? null : `partial: ${page.quotes.length} of ${page.total}`]);
    await audit(q, { actor, action: "crm_sync", entity: "crm", entityId: "quotes", details: { quotes: page.quotes.length, total: page.total, removed, role: crm.user?.role ?? null } });
    return { quotes: page.quotes.length, removed };
  });
}

export async function mirroredQuotes(q: Queryable): Promise<{ quotes: CrmQuote[]; syncedAt: string | null; role: string | null }> {
  const rows = (await q.query<{ data: CrmQuote }>("SELECT data FROM crm_quotes ORDER BY created_at DESC NULLS LAST, ref")).rows;
  const last = (await q.query<{ at: string; crm_role: string | null }>("SELECT at, crm_role FROM crm_syncs ORDER BY id DESC LIMIT 1")).rows[0];
  return { quotes: rows.map((r) => r.data), syncedAt: last ? new Date(last.at).toISOString() : null, role: last?.crm_role ?? null };
}

export interface CrmQuoteView extends CrmQuote {
  /** Recomputed from the timestamps now, so the flags stay right between syncs. */
  first_contact_late: boolean;
  technical_late: boolean;
  followup_late: boolean;
}

const hoursSince = (iso: string | null, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / 3_600_000 : null);

export function crmView(quotes: CrmQuote[], rules: BusinessRules, now: Date): CrmQuoteView[] {
  return quotes.map((x) => {
    const age = hoursSince(x.created_at, now);
    const tech = hoursSince(x.handoff_at, now);
    const open = x.status !== "won" && x.status !== "lost";
    return {
      ...x,
      first_contact_late: x.status === "new" && age !== null && age > rules.elevator.first_contact_hours,
      technical_late: x.status === "tech_review" && tech !== null && tech > rules.elevator.technical_response_hours,
      followup_late: open && Boolean(x.next_followup_at) && Date.parse(x.next_followup_at!) < now.getTime(),
    };
  });
}

export interface CrmSummary {
  total: number;
  open: number;
  byStage: Record<string, number>;
  firstContactLate: number;
  technicalLate: number;
  followupLate: number;
  bySource: Record<string, number>;
  newLast7Days: number;
  wonLast30Days: { count: number; amount: number };
  quotedOpenMaxSar: number;
}

export function crmSummary(view: CrmQuoteView[], now: Date): CrmSummary {
  const byStage = Object.fromEntries(CRM_STAGES.map((s) => [s, 0])) as Record<string, number>;
  const bySource: Record<string, number> = {};
  let newLast7Days = 0;
  const won = { count: 0, amount: 0 };
  let quotedOpenMaxSar = 0;
  for (const x of view) {
    byStage[x.status] = (byStage[x.status] ?? 0) + 1;
    const src = x.source === "manual" ? `manual${x.channel ? `:${x.channel}` : ""}` : x.source;
    bySource[src] = (bySource[src] ?? 0) + 1;
    if (x.created_at && now.getTime() - Date.parse(x.created_at) <= 7 * 86_400_000) newLast7Days++;
    if (x.status === "won" && x.closed_at && now.getTime() - Date.parse(x.closed_at) <= 30 * 86_400_000) {
      won.count++;
      won.amount += x.won_amount ?? 0;
    }
    if (x.status === "quoted") quotedOpenMaxSar += x.price_max ?? 0;
  }
  return {
    total: view.length,
    open: view.filter((x) => x.status !== "won" && x.status !== "lost").length,
    byStage,
    firstContactLate: view.filter((x) => x.first_contact_late).length,
    technicalLate: view.filter((x) => x.technical_late).length,
    followupLate: view.filter((x) => x.followup_late).length,
    bySource,
    newLast7Days,
    wonLast30Days: won,
    quotedOpenMaxSar,
  };
}
