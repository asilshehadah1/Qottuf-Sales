// Approved figures and dates from evidence records, for the claims gate. Pure: shared by server and console.
import type { ApprovedFigure } from "../gates/claims.ts";
import type { Unit } from "../gates/numbers.ts";
import type { EvidenceRecord } from "./schemas.ts";

const UNIT_ALIASES: Record<string, Unit> = {
  sar: "sar", sqm: "sqm", "m2": "sqm", "m²": "sqm", floor: "floor", floors: "floor", bed: "bed", beds: "bed",
  seat: "seat", seats: "seat", elevator: "elevator", elevators: "elevator", lift: "elevator", building: "building",
  buildings: "building", branch: "branch", branches: "branch", guest: "guest", guests: "guest", day: "day", days: "day",
  week: "week", month: "month", year: "year", percent: "percent", project: "project", mashrabiya: "mashrabiya",
};

/** Approved figures and dates the claims gate may match, from evidence the reader is allowed to see. */
export function figuresFromEvidence(records: EvidenceRecord[]): ApprovedFigure[] {
  const out: ApprovedFigure[] = [];
  for (const r of records) {
    for (const f of r.facts) {
      if (f.kind === "statement") continue;
      const unit = f.unit ? UNIT_ALIASES[f.unit.toLowerCase()] ?? null : null;
      out.push({
        value: f.kind === "figure" ? Number(f.value) : null,
        ...(f.kind === "date" ? { date: String(f.value) } : {}),
        unit,
        ...(f.context ? { context: f.context } : {}),
        label: f.label,
        sourceId: `${r.id}#${f.id}`,
        projectRef: r.project_ref,
      });
    }
  }
  return out;
}

/** Today's calendar date in Riyadh (UTC+3, no daylight saving), as YYYY-MM-DD. */
export function riyadhDate(at = new Date()): string {
  return new Date(at.getTime() + 180 * 60_000).toISOString().slice(0, 10);
}
