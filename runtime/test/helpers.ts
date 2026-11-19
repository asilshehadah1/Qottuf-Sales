import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBrandRules, type BrandRules } from "../src/gates/brand.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function fixtureRules(): Promise<BrandRules> {
  return loadBrandRules(path.join(here, "fixtures", "brand-rules.fixture.json"));
}

/** The real rulebook, when the qottuf-brand skill is installed on this machine (QOTTUF_BRAND_RULES or the default path). */
export function realRulesPath(): string | null {
  const candidates = [
    process.env.QOTTUF_BRAND_RULES,
    "/root/.claude/skills/synced/74ec83fd-3864-4662-9cec-2badc84a4927_96fab72d-0fe5-4af2-bdac-85f48a1e99ca/qottuf-brand/assets/brand-rules.json",
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => existsSync(p)) ?? null;
}
