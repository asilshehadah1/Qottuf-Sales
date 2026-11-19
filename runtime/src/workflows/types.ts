// What a workflow needs from wherever it runs (the server dispatcher or the browser console), and what it returns.
import type { BrandRules } from "../gates/brand.ts";
import type { KnownPerson } from "../gates/pii.ts";
import type { Audience, GateReport } from "../gates/runGates.ts";
import type { Tier } from "../ledger/schemas.ts";
import type { ModelClient, ModelResult } from "../model/core.ts";

export interface RunStep {
  step: string;
  agent?: string;
  promptVersion?: string;
  result?: ModelResult<unknown>;
  outcome: "ok" | "failed" | "refused" | "retry" | "blocked";
  details?: Record<string, unknown>;
}

/** Run one agent call; the caller logs it, counts it against a budget, and refuses when no model is available. */
export type CallAgent = <T>(agent: string, promptVersion: string, fn: (model: ModelClient) => Promise<ModelResult<T>>) => Promise<ModelResult<T>>;

export interface WorkflowEnv {
  brand: BrandRules;
  rulesVersion: string;
  /** Known contacts, so their names are replaced with ids before any model call. */
  people: KnownPerson[];
  /** Company numbers that are public and stay in text. */
  publicNumbers: string[];
  callAgent: CallAgent;
  step: (s: RunStep) => Promise<void> | void;
}

export interface WorkflowArtifact {
  artifactType: string;
  title: string;
  audience: Audience;
  content: Record<string, unknown>;
  renderedEn: string | null;
  renderedAr: string | null;
  evidenceTierMax: Tier;
  gateReport: GateReport;
  provenance: Record<string, unknown>;
  opportunityId?: string | null;
  accountId?: string | null;
}

export interface WorkflowResult {
  status: "succeeded" | "needs_human";
  artifact?: WorkflowArtifact;
  note?: string;
}

export interface AccountSummary {
  name_en: string;
  name_ar: string | null;
  type: string;
  sector: string | null;
  priority_rank: number | null;
}

export interface OpportunitySummary {
  id: string;
  title: string;
  stage: string;
  route: string;
  value_min_sar: number | null;
  value_max_sar: number | null;
  next_step: unknown;
  /** Knock-outs that didn't pass, as "CODE status: detail". */
  knockouts: string[];
}

export function sar(n: number): string {
  return `SAR ${n.toLocaleString("en-US")}`;
}
