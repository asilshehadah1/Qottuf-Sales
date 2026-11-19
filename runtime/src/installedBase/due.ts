// Due dates for lifts in the installed base: pure, shared by the server registry and the browser console.
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const MaintenanceContract = z.object({
  contract_ref: z.string().min(2),
  tier: z.string().min(2),
  starts_at: isoDate,
  ends_at: isoDate,
});
export type MaintenanceContract = z.infer<typeof MaintenanceContract>;

export interface Unit {
  id: string;
  site: string;
  owner_account_id: string | null;
  model: string | null;
  manufacturer: string | null;
  origin_document: string | null;
  handed_over_at: string | null;
  warranty_ends_at: string | null;
  maintenance_contract: MaintenanceContract | null;
  next_inspection_due: string | null;
  next_registration_due: string | null;
  status: "active" | "decommissioned";
  source: "installed" | "maintained" | "takeover";
  owner_consent_at: string | null;
  maintenance_offer: "not_offered" | "offered" | "accepted" | "declined";
  installed_from_opportunity: string | null;
  modernisation_candidate: boolean;
}

export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y + years, m - 1, d));
  if (target.getUTCMonth() !== m - 1) target.setUTCDate(0); // 29 February in a non-leap year becomes 28 February
  return target.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export interface DueItem {
  unitId: string;
  site: string;
  kind: "contract_end" | "warranty_end" | "inspection" | "registration";
  due: string;
  days: number;
  overdue: boolean;
  /** The owner agreed to be contacted; without it the item is tracked but nobody calls. */
  contactable: boolean;
}

/** Everything due within `horizonDays` of today, or already overdue, for active units. */
export function dueItems(units: Unit[], today: string, horizonDays: number): DueItem[] {
  const out: DueItem[] = [];
  for (const u of units.filter((x) => x.status === "active")) {
    const push = (kind: DueItem["kind"], due: string | null) => {
      if (!due) return;
      const days = daysBetween(today, due);
      if (days <= horizonDays) out.push({ unitId: u.id, site: u.site, kind, due, days, overdue: days < 0, contactable: Boolean(u.owner_consent_at) });
    };
    if (u.maintenance_contract) push("contract_end", u.maintenance_contract.ends_at);
    else push("warranty_end", u.warranty_ends_at); // the warranty ending with no contract is the moment to offer one
    push("inspection", u.next_inspection_due);
    push("registration", u.next_registration_due);
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

