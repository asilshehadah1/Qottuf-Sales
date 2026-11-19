import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./db.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, "../../migrations");

/** Apply every migration that hasn't run yet, in filename order. Migrations are append-only: never edit one that has run. */
export async function migrate(db: Db): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const done = new Set(
    (await db.query<{ version: string }>("SELECT version FROM schema_migrations")).rows.map((r) => r.version),
  );
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), { encoding: "utf-8" });
    await db.exec(`BEGIN;\n${sql}\nINSERT INTO schema_migrations(version) VALUES ('${file.replace(/'/g, "''")}');\nCOMMIT;`);
    applied.push(file);
  }
  return applied;
}
