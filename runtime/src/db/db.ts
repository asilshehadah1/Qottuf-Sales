// One small database interface with two adapters:
// - PGlite (Postgres compiled to WebAssembly, in-process): tests and the zero-setup demo.
// - node-postgres: the real deployment, against the runtime's own Postgres (no published ports).
// Both run the same SQL, so the schema, constraints, triggers and row-level security are tested for real.

import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

export type Row = Record<string, unknown>;

export interface Queryable {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
  /** Run a multi-statement script with no parameters (migrations). */
  exec(sql: string): Promise<void>;
  /** Run fn inside one transaction; rolls back if fn throws. */
  tx<R>(fn: (q: Queryable) => Promise<R>): Promise<R>;
  close(): Promise<void>;
}

class PgliteDb implements Db {
  constructor(private readonly pg: PGlite) {}

  async query<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    const res = await this.pg.query<T>(sql, params);
    return { rows: res.rows };
  }

  async exec(sql: string): Promise<void> {
    await this.pg.exec(sql);
  }

  async tx<R>(fn: (q: Queryable) => Promise<R>): Promise<R> {
    return this.pg.transaction(async (t) =>
      fn({
        query: async <T extends Row = Row>(sql: string, params: unknown[] = []) => {
          const res = await t.query<T>(sql, params);
          return { rows: res.rows };
        },
      }),
    );
  }

  async close(): Promise<void> {
    await this.pg.close();
  }
}

class NodePgDb implements Db {
  constructor(private readonly pool: pg.Pool) {}

  async query<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    const res = await this.pool.query(sql, params);
    return { rows: res.rows as T[] };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async tx<R>(fn: (q: Queryable) => Promise<R>): Promise<R> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn({
        query: async <T extends Row = Row>(sql: string, params: unknown[] = []) => {
          const res = await client.query(sql, params);
          return { rows: res.rows as T[] };
        },
      });
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Calendar dates (Postgres type 1082) stay as "YYYY-MM-DD" strings. Turning them into JavaScript dates at local
 * midnight shifts them by a day on any machine east of UTC, Riyadh included: an expiry of 12 December would read
 * as 11 December. Timestamps (timestamptz) are still parsed into dates; they carry their offset.
 */
const DATE_OID = 1082;
const keepDateText = (value: string) => value;

/** An in-process database. With no path it lives in memory and disappears on exit. */
export async function openEmbeddedDb(dataDir?: string): Promise<Db> {
  const instance = new PGlite({ ...(dataDir ? { dataDir } : {}), parsers: { [DATE_OID]: keepDateText } });
  await instance.waitReady;
  return new PgliteDb(instance);
}

/** The deployed database. The connection string comes from the environment, never from code. */
export function openPostgres(connectionString: string): Db {
  pg.types.setTypeParser(DATE_OID, keepDateText);
  const pool = new pg.Pool({ connectionString, max: 10 });
  return new NodePgDb(pool);
}

/** A calendar date from a row, as "YYYY-MM-DD" (accepts the text form, or a date object at UTC midnight). */
export function dateText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** numeric and bigint columns arrive as strings; convert explicitly and fail loud on garbage. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`Expected a number from the database, got ${String(value)}`);
  return n;
}
