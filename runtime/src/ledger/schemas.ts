// Zod schemas at every boundary (spec §19). Database rows are validated on the way in;
// agent outputs are validated on the way out of the model client.

import { z } from "zod";

export const Tier = z.enum(["public", "tender", "confidential", "internal"]);
export type Tier = z.infer<typeof Tier>;
export const TIER_RANK: Record<Tier, number> = { public: 0, tender: 1, confidential: 2, internal: 3 };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const AccountInput = z.object({
  name_en: z.string().min(2),
  name_ar: z.string().optional(),
  type: z.enum(["owner", "developer", "pmc", "consultant", "main_contractor", "university", "hospital_group", "bank", "corporate", "government", "other"]),
  parent_id: z.string().optional(),
  sector: z.string().optional(),
  relationship_owner: z.string(),
  executive_sponsor: z.string().optional(),
  priority_rank: z.number().int().min(1).max(20).optional(),
});
export type AccountInput = z.infer<typeof AccountInput>;

export const ContactInput = z.object({
  account_id: z.string(),
  full_name_en: z.string().optional(),
  full_name_ar: z.string().optional(),
  role_title: z.string().optional(),
  committee_role: z.enum(["decision_maker", "evaluator", "influencer", "user", "gatekeeper", "sponsor"]).optional(),
  preferred_channel: z.enum(["whatsapp", "email", "phone", "meeting", "linkedin"]).optional(),
  preferred_language: z.enum(["ar", "en"]).optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
});
export type ContactInput = z.infer<typeof ContactInput>;

export const ConsentChannel = z.enum(["whatsapp", "email", "sms", "phone", "linkedin"]);
export const ConsentScope = z.enum(["one_to_one", "marketing", "reference_request"]);
export const ConsentInput = z.object({
  contact_id: z.string(),
  channel: ConsentChannel,
  scope: ConsentScope,
  action: z.enum(["grant", "withdraw"]),
  wording_version: z.string(),
  source: z.string(),
  recorded_by: z.string(),
});
export type ConsentInput = z.infer<typeof ConsentInput>;

export const EvidenceFact = z.object({
  id: z.string(),
  kind: z.enum(["figure", "date", "statement"]),
  /** contract_value, start_date, completion_date, floors, beds, ... (the proof test looks for named facts) */
  name: z.string(),
  value: z.union([z.number(), z.string()]),
  unit: z.string().optional(),
  context: z.string().optional(),
  label: z.string(),
});
export type EvidenceFact = z.infer<typeof EvidenceFact>;

export const EvidenceType = z.enum([
  "contract", "completion_certificate", "referee_consent", "reference_letter", "certificate", "financial_statement",
  "bank_letter", "case_facts", "company_record", "client_naming_approval", "cost_record",
]);

export const EvidenceInput = z.object({
  type: EvidenceType,
  tier: Tier,
  project_ref: z.string().regex(/^PRJ-\d+$/).optional(),
  title: z.string().min(3),
  issuer: z.string().optional(),
  issued_at: isoDate.optional(),
  expires_at: isoDate.optional(),
  file_name: z.string().optional(),
  file_hash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  permitted_uses: z.array(z.string()).default([]),
  facts: z.array(EvidenceFact).default([]),
  created_by: z.string(),
});
export type EvidenceInput = z.input<typeof EvidenceInput>;

export interface EvidenceRecord {
  id: string;
  type: z.infer<typeof EvidenceType>;
  tier: Tier;
  project_ref: string | null;
  title: string;
  issuer: string | null;
  issued_at: string | null;
  expires_at: string | null;
  permitted_uses: string[];
  facts: EvidenceFact[];
  status: "draft" | "approved" | "withdrawn";
}

export const NextStep = z.object({
  action: z.string().min(3),
  owner: z.string().min(2),
  due_at: z.string().datetime({ offset: true }),
});
export type NextStep = z.infer<typeof NextStep>;
