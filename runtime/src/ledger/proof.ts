// Proof: which past projects are documented well enough to count.
// The 17 December proof test (business-development spec §8) asks for Qottuf's own documents (contract value,
// dates, completion certificate) for three projects. The G0 reference file also needs referee consent.

import type { BusinessRules } from "../config/rules.ts";
import type { DocumentedReference } from "../pipeline/scorecard.ts";
import type { EvidenceRecord } from "./schemas.ts";

export interface ProjectProof {
  projectRef: string;
  contractValueSar: number | null;
  startDate: string | null;
  completionDate: string | null;
  hasContract: boolean;
  hasCompletionCertificate: boolean;
  hasRefereeConsent: boolean;
  /** Meets the proof test: the required documents and facts are all on approved, unexpired records. */
  documented: boolean;
  /** Also has referee consent: usable in the G0 reference file and prequalification packs. */
  referenceReady: boolean;
  missing: string[];
}

function fact(records: EvidenceRecord[], name: string): string | number | null {
  for (const r of records) {
    const f = r.facts.find((x) => x.name === name);
    if (f) return f.value;
  }
  return null;
}

export function projectProof(records: EvidenceRecord[], rules: BusinessRules): ProjectProof[] {
  const byProject = new Map<string, EvidenceRecord[]>();
  for (const r of records) {
    if (!r.project_ref || r.status !== "approved") continue;
    byProject.set(r.project_ref, [...(byProject.get(r.project_ref) ?? []), r]);
  }
  const out: ProjectProof[] = [];
  for (const [projectRef, recs] of [...byProject.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const types = new Set(recs.map((r) => r.type));
    const value = fact(recs, "contract_value");
    const start = fact(recs, "start_date");
    const completion = fact(recs, "completion_date");
    const missing: string[] = [];
    for (const t of rules.proof_test.required_types) if (!types.has(t as EvidenceRecord["type"])) missing.push(t.replace(/_/g, " "));
    const facts: Record<string, unknown> = { contract_value: value, start_date: start, completion_date: completion };
    for (const f of rules.proof_test.required_facts) if (facts[f] === null || facts[f] === undefined) missing.push(f.replace(/_/g, " "));
    const documented = missing.length === 0;
    const hasRefereeConsent = types.has("referee_consent");
    out.push({
      projectRef,
      contractValueSar: value === null ? null : Number(value),
      startDate: start === null ? null : String(start),
      completionDate: completion === null ? null : String(completion),
      hasContract: types.has("contract"),
      hasCompletionCertificate: types.has("completion_certificate"),
      hasRefereeConsent,
      documented,
      referenceReady: documented && hasRefereeConsent,
      missing: hasRefereeConsent ? missing : [...missing, "referee consent (for the reference file)"],
    });
  }
  return out;
}

export function documentedReferences(proofs: ProjectProof[]): DocumentedReference[] {
  return proofs
    .filter((p) => p.documented && p.contractValueSar !== null && p.completionDate)
    .map((p) => ({
      projectRef: p.projectRef,
      contractValueSar: p.contractValueSar!,
      completionDate: p.completionDate!,
      hasCompletionCertificate: p.hasCompletionCertificate,
    }));
}
