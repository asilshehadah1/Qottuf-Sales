// The master company record's shape and the field-by-field comparison of a listing with it. Pure: shared by the
// server's Entity and Listings Record and by the browser console.

import { z } from "zod";
import { compileBrandRules, type BrandRules } from "../gates/brand.ts";
import { asciiDigits } from "../gates/numbers.ts";
import { normaliseArabic } from "../gates/pii.ts";

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

/** The master record must agree with the one rulebook: a new name changes the rulebook first. */
export function checkAgainstRulebook(fields: EntityFields, brand: BrandRules): string[] {
  const n = brand.naming;
  const problems: string[] = [];
  if (fields.trading_name_en !== n.first_mention) problems.push(`trading_name_en must be "${n.first_mention}" (brand rulebook)`);
  if (fields.legal_name_en !== n.legal_en) problems.push(`legal_name_en must be "${n.legal_en}" (brand rulebook)`);
  if (normaliseArabic(fields.trading_name_ar) !== normaliseArabic(n.arabic)) problems.push(`trading_name_ar must be «${n.arabic}» (brand rulebook)`);
  return problems;
}

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
export function compareToEntity(entity: Partial<EntityFields>, observed: Partial<Record<FieldName, string | number>>, brand?: BrandRules): ListingFinding[] {
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
