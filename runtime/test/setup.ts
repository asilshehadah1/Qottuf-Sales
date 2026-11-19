import { loadBusinessRules, type BusinessRules } from "../src/config/rules.ts";
import { openEmbeddedDb, type Db } from "../src/db/db.ts";
import { migrate } from "../src/db/migrate.ts";
import { approveEvidence, fileEvidence } from "../src/ledger/repo.ts";
import type { EvidenceInput } from "../src/ledger/schemas.ts";

export interface TestEnv {
  db: Db;
  rules: BusinessRules;
  clock: { at: Date };
  now: () => Date;
}

export async function testEnv(start = "2026-11-22T09:00:00+03:00"): Promise<TestEnv> {
  const db = await openEmbeddedDb();
  await migrate(db);
  const rules = await loadBusinessRules();
  // Tests act as Asil approving: the rules file itself still says PENDING until Asil signs it.
  const clock = { at: new Date(start) };
  return { db, rules, clock, now: () => clock.at };
}

export function inHours(env: TestEnv, h: number): string {
  return new Date(env.clock.at.getTime() + h * 3_600_000).toISOString();
}

export async function approvedEvidence(env: TestEnv, input: Omit<EvidenceInput, "created_by">): Promise<string> {
  const id = await fileEvidence(env.db, { ...input, created_by: "bid_coordinator" } as EvidenceInput);
  await approveEvidence(env.db, id, "asil", env.rules);
  return id;
}

/** A fictional past project with the documents the proof test asks for. */
export async function documentedProject(env: TestEnv, ref: string, valueSar: number, completion: string, withConsent = true): Promise<void> {
  await approvedEvidence(env, {
    type: "contract", tier: "tender", project_ref: ref, title: `Contract ${ref}`,
    facts: [
      { id: "value", kind: "figure", name: "contract_value", value: valueSar, unit: "sar", label: `Contract value ${ref}` },
      { id: "start", kind: "date", name: "start_date", value: "2018-01", label: `Start ${ref}` },
    ],
  });
  await approvedEvidence(env, {
    type: "completion_certificate", tier: "tender", project_ref: ref, title: `Completion certificate ${ref}`,
    facts: [{ id: "done", kind: "date", name: "completion_date", value: completion, label: `Completion ${ref}` }],
  });
  if (withConsent) {
    await approvedEvidence(env, { type: "referee_consent", tier: "tender", project_ref: ref, title: `Referee consent ${ref}` });
  }
}
