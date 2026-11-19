// The Installed Base and Maintenance Registry (merged roster #27; sales spec SC-06, workflow W6). Code only.
// Every lift Qottuf installed or maintains, with the dates that create a reason to call: warranty end, maintenance
// contract end, the annual inspection and the annual registration (SASO lift regulation 14/3 and 12/8), plus the
// certificate of origin the technical file needs (12/4). Owners are contacted only with their recorded agreement.
// Renewals become opportunities in the pipeline, so they get an owner, a next step and a date like any other sale.

import { z } from "zod";
import { audit } from "../audit/audit.ts";
import { canApprove, type BusinessRules } from "../config/rules.ts";
import { dateText, type Db, type Queryable } from "../db/db.ts";
import { GateError, riyadhDate } from "../ledger/repo.ts";
import { createOpportunity, getOpportunity, type EngineDeps } from "../pipeline/engine.ts";
import { addYears, dueItems, MaintenanceContract, type Unit } from "./due.ts";

export * from "./due.ts";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const UnitInput = z.object({
  site: z.string().min(3),
  owner_account_id: z.string().optional(),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  origin_document: z.string().optional(),
  handed_over_at: isoDate.optional(),
  warranty_ends_at: isoDate.optional(),
  next_inspection_due: isoDate.optional(),
  next_registration_due: isoDate.optional(),
  crm_quote_id: z.string().optional(),
  source: z.enum(["installed", "maintained", "takeover"]).default("installed"),
  owner_consent_at: isoDate.optional(),
  installed_from_opportunity: z.string().optional(),
  modernisation_candidate: z.boolean().default(false),
});
export type UnitInput = z.input<typeof UnitInput>;

function rowToUnit(r: Record<string, unknown>): Unit {
  return {
    id: r.id as string,
    site: r.site as string,
    owner_account_id: (r.owner_account_id as string | null) ?? null,
    model: (r.model as string | null) ?? null,
    manufacturer: (r.manufacturer as string | null) ?? null,
    origin_document: (r.origin_document as string | null) ?? null,
    handed_over_at: dateText(r.handed_over_at),
    warranty_ends_at: dateText(r.warranty_ends_at),
    maintenance_contract: (r.maintenance_contract as MaintenanceContract | null) ?? null,
    next_inspection_due: dateText(r.next_inspection_due),
    next_registration_due: dateText(r.next_registration_due),
    status: r.status as Unit["status"],
    source: r.source as Unit["source"],
    owner_consent_at: dateText(r.owner_consent_at),
    maintenance_offer: r.maintenance_offer as Unit["maintenance_offer"],
    installed_from_opportunity: (r.installed_from_opportunity as string | null) ?? null,
    modernisation_candidate: Boolean(r.modernisation_candidate),
  };
}

function allowed(rules: BusinessRules, actor: string): void {
  if (!canApprove(rules, "installed_base", actor)) throw new GateError(`${actor} may not change the installed-base registry`);
}

async function unitEvent(q: Queryable, unitId: string, actor: string, event: string, details: Record<string, unknown> = {}): Promise<void> {
  await q.query("INSERT INTO installed_unit_events (unit_id, actor, event, details) VALUES ($1,$2,$3,$4)", [unitId, actor, event, JSON.stringify(details)]);
  await audit(q, { actor, action: `unit_${event}`, entity: "installed_unit", entityId: unitId, details });
}

export async function getUnit(q: Queryable, id: string): Promise<Unit> {
  const r = (await q.query("SELECT * FROM installed_units WHERE id = $1", [id])).rows[0];
  if (!r) throw new GateError(`no installed unit ${id}`);
  return rowToUnit(r);
}

export async function listUnits(q: Queryable): Promise<Unit[]> {
  return (await q.query("SELECT * FROM installed_units ORDER BY id")).rows.map(rowToUnit);
}

export async function registerUnit(db: Db, rules: BusinessRules, input: UnitInput, actor: string): Promise<string> {
  allowed(rules, actor);
  const u = UnitInput.parse(input);
  if (u.installed_from_opportunity) {
    const opp = await getOpportunity(db, u.installed_from_opportunity);
    if (opp.motion !== "elevator" || opp.stage !== "won") {
      throw new GateError(`${opp.id} is not a won elevator sale, so it can't be the source of an installed unit`);
    }
  }
  return db.tx(async (q) => {
    const id = (
      await q.query<{ id: string }>(
        `INSERT INTO installed_units (site, owner_account_id, model, manufacturer, origin_document, handed_over_at, warranty_ends_at,
                                      next_inspection_due, next_registration_due, crm_quote_id, source, owner_consent_at,
                                      installed_from_opportunity, modernisation_candidate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [u.site, u.owner_account_id ?? null, u.model ?? null, u.manufacturer ?? null, u.origin_document ?? null, u.handed_over_at ?? null,
          u.warranty_ends_at ?? null, u.next_inspection_due ?? null, u.next_registration_due ?? null, u.crm_quote_id ?? null, u.source,
          u.owner_consent_at ?? null, u.installed_from_opportunity ?? null, u.modernisation_candidate],
      )
    ).rows[0]!.id;
    await unitEvent(q, id, actor, "registered", { source: u.source });
    return id;
  });
}

async function update(db: Db, rules: BusinessRules, unitId: string, actor: string, event: string, set: string, params: unknown[], details: Record<string, unknown>): Promise<void> {
  allowed(rules, actor);
  await db.tx(async (q) => {
    const res = await q.query(`UPDATE installed_units SET ${set}, updated_at = now() WHERE id = $1 RETURNING id`, [unitId, ...params]);
    if (res.rows.length === 0) throw new GateError(`no installed unit ${unitId}`);
    await unitEvent(q, unitId, actor, event, details);
  });
}

export async function recordOwnerConsent(db: Db, rules: BusinessRules, unitId: string, on: string, actor: string): Promise<void> {
  isoDate.parse(on);
  await update(db, rules, unitId, actor, "owner_consent", "owner_consent_at = $2", [on], { on });
}

export async function recordMaintenanceOffer(db: Db, rules: BusinessRules, unitId: string, outcome: "offered" | "accepted" | "declined", actor: string): Promise<void> {
  await update(db, rules, unitId, actor, "maintenance_offer", "maintenance_offer = $2", [outcome], { outcome });
}

export async function setMaintenanceContract(db: Db, rules: BusinessRules, unitId: string, contract: MaintenanceContract, actor: string): Promise<void> {
  const c = MaintenanceContract.parse(contract);
  if (c.ends_at <= c.starts_at) throw new GateError("a maintenance contract must end after it starts");
  await update(db, rules, unitId, actor, "maintenance_contract", "maintenance_contract = $2, maintenance_offer = 'accepted'", [JSON.stringify(c)], c);
}

/** The annual inspection was done: the next one is due a year later. */
export async function recordInspection(db: Db, rules: BusinessRules, unitId: string, doneOn: string, actor: string): Promise<void> {
  isoDate.parse(doneOn);
  await update(db, rules, unitId, actor, "inspection", "next_inspection_due = $2", [addYears(doneOn, 1)], { done_on: doneOn });
}

/** The annual registration was renewed: the next renewal is due a year later. */
export async function recordRegistration(db: Db, rules: BusinessRules, unitId: string, doneOn: string, actor: string): Promise<void> {
  isoDate.parse(doneOn);
  await update(db, rules, unitId, actor, "registration", "next_registration_due = $2", [addYears(doneOn, 1)], { done_on: doneOn });
}

export interface RegistryGap {
  kind: "won_without_unit" | "no_maintenance_offer" | "no_origin_document" | "no_owner_consent" | "no_inspection_date";
  ref: string;
  detail: string;
}

export async function registryGaps(q: Queryable): Promise<RegistryGap[]> {
  const out: RegistryGap[] = [];
  const unregistered = (await q.query<{ id: string; title: string }>(
    `SELECT o.id, o.title FROM opportunities o
     WHERE o.motion = 'elevator' AND o.stage = 'won' AND o.route = 'inbound_elevator'
       AND NOT EXISTS (SELECT 1 FROM installed_units u WHERE u.installed_from_opportunity = o.id)
     ORDER BY o.id`,
  )).rows;
  for (const o of unregistered) out.push({ kind: "won_without_unit", ref: o.id, detail: `${o.title}: sold but not in the registry, so nobody will offer maintenance or book its inspection.` });
  for (const u of (await listUnits(q)).filter((x) => x.status === "active")) {
    if (u.source === "installed" && u.maintenance_offer === "not_offered") {
      out.push({ kind: "no_maintenance_offer", ref: u.id, detail: `${u.site}: maintenance not yet offered (Phase 1 target: offered on every new sale).` });
    }
    if (u.source === "installed" && !u.origin_document) {
      out.push({ kind: "no_origin_document", ref: u.id, detail: `${u.site}: no certificate of origin in the technical file.` });
    }
    if (!u.owner_consent_at) out.push({ kind: "no_owner_consent", ref: u.id, detail: `${u.site}: the owner hasn't agreed to be contacted, so renewals can't be offered.` });
    if (!u.next_inspection_due) out.push({ kind: "no_inspection_date", ref: u.id, detail: `${u.site}: no annual inspection date recorded.` });
  }
  return out;
}

/**
 * Turn upcoming contract ends (or warranty ends with no contract) into pipeline opportunities, for owners who agreed
 * to be contacted. Idempotent: a unit never has two open opportunities.
 */
export async function generateRenewals(deps: EngineDeps): Promise<string[]> {
  const at = deps.now ? deps.now() : new Date();
  const today = riyadhDate(at);
  const window = deps.rules.maintenance.renewal_window_days;
  const created: string[] = [];
  const units = await listUnits(deps.db);
  for (const item of dueItems(units, today, window)) {
    if (!item.contactable || (item.kind !== "contract_end" && item.kind !== "warranty_end")) continue;
    const open = (await deps.db.query(
      "SELECT 1 FROM opportunities WHERE installed_unit_id = $1 AND stage NOT IN ('won','lost','no_bid','withdrawn','cancelled')",
      [item.unitId],
    )).rows.length > 0;
    if (open) continue;
    const unit = units.find((u) => u.id === item.unitId)!;
    const renewal = item.kind === "contract_end";
    const id = await createOpportunity(deps, {
      motion: "elevator",
      title: `${renewal ? "Maintenance renewal" : "Maintenance offer at warranty end"}: ${unit.site} (${unit.id})`,
      ...(unit.owner_account_id ? { account_id: unit.owner_account_id } : {}),
      route: "maintenance_renewal",
      qottuf_role: "supplier_installer",
      stage: "new",
      owner: "desk_lead",
      installed_unit_id: unit.id,
      dates: { [renewal ? "contract_ends" : "warranty_ends"]: item.due },
      next_step: {
        action: renewal ? `Renewal offer before the contract ends on ${item.due}` : `Maintenance offer before the warranty ends on ${item.due}`,
        owner: "desk_lead",
        due_at: new Date(at.getTime() + 2 * 86_400_000).toISOString(),
      },
    }, "agent:installed_base");
    created.push(id);
  }
  return created;
}
