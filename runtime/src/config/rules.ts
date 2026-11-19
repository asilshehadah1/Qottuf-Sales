import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BusinessRulesSchema, type BusinessRules } from "./schema.ts";

export { BusinessRulesSchema, canApprove, type BusinessRules } from "./schema.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_RULES_PATH = path.resolve(here, "../../config/business-rules.json");

export async function loadBusinessRules(file = DEFAULT_RULES_PATH): Promise<BusinessRules> {
  const raw = await readFile(file, { encoding: "utf-8" });
  const parsed = BusinessRulesSchema.parse(JSON.parse(raw));
  if (parsed.contracting.band_sar.min >= parsed.contracting.band_sar.max) {
    throw new Error("business rules: band minimum must be below the maximum");
  }
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 12);
  return { ...parsed, rulesVersion: `${parsed.version}#${hash}` };
}
