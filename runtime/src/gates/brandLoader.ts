// Reading the rulebook from disk (server and CLI only). The browser console fetches the same file instead.
import { readFile } from "node:fs/promises";
import { BrandRulesSchema, type BrandRules } from "./brand.ts";

export async function loadBrandRules(path: string): Promise<BrandRules> {
  const raw = JSON.parse(await readFile(path, { encoding: "utf-8" }));
  return BrandRulesSchema.parse(raw);
}
