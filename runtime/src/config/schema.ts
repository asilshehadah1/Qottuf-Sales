// The business rules' shape and the approver check, with no file access: shared by the server and the console.
import { z } from "zod";

export const BusinessRulesSchema = z.object({
  version: z.string(),
  approved_by: z.string(),
  contracting: z.object({
    band_sar: z.object({ min: z.number().positive(), max: z.number().positive() }),
    required_role: z.string(),
    excluded_sectors: z.array(z.string()),
    service_lines: z.array(z.string()),
    bid_decision_hours: z.number().positive(),
    min_working_days_to_bid: z.number().int().positive(),
  }),
  scorecard: z.object({
    version: z.string(),
    factors: z.array(z.object({ id: z.string(), label: z.string(), weight: z.number().positive() })),
    thresholds: z.object({ go: z.number(), conditional: z.number() }),
  }),
  elevator: z.object({
    first_contact_hours: z.number().positive(),
    technical_response_hours: z.number().positive(),
    survey_hours: z.number().positive(),
  }),
  approvers: z.record(z.string(), z.array(z.string())),
  maintenance: z.object({
    renewal_window_days: z.number().int().positive(),
    inspection_booking_days: z.number().int().positive(),
    listing_recheck_days: z.number().int().positive(),
  }),
  work_week: z.object({
    timezone_offset_minutes: z.number().int(),
    weekend_days: z.array(z.number().int().min(0).max(6)),
    holidays: z.array(z.string()),
  }),
  evidence: z.object({ expiry_alert_days: z.array(z.number().int().positive()) }),
  proof_test: z.object({
    due: z.string(),
    projects_required: z.number().int().positive(),
    required_types: z.array(z.string()),
    required_facts: z.array(z.string()),
  }),
});

export type BusinessRules = z.infer<typeof BusinessRulesSchema> & {
  /** "<version>#<first 12 hex of sha256>": recorded on every decision (spec principle 20). */
  rulesVersion: string;
};

export function canApprove(rules: BusinessRules, gate: string, actor: string): boolean {
  return (rules.approvers[gate] ?? []).includes(actor);
}
