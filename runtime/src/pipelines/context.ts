import type { BusinessRules } from "../config/rules.ts";
import type { Db } from "../db/db.ts";
import type { DnsResolver } from "../deliverability/mailDomain.ts";
import type { BrandRules } from "../gates/brand.ts";
import type { ModelClient, ModelResult } from "../model/client.ts";

export interface RunStep {
  step: string;
  agent?: string;
  promptVersion?: string;
  result?: ModelResult<unknown>;
  outcome: "ok" | "failed" | "refused" | "retry" | "blocked";
  details?: Record<string, unknown>;
}

export interface PipelineContext {
  db: Db;
  rules: BusinessRules;
  brand: BrandRules;
  model: ModelClient | null;
  now: () => Date;
  workOrderId: string;
  /** Company contact numbers that are public and stay in text (from the rulebook). */
  publicNumbers: string[];
  step: (s: RunStep) => Promise<void>;
  /** Call an agent: logs the run, counts tokens against the work order's budget, refuses when the model is off. */
  callModel: <T>(agent: string, promptVersion: string, fn: (model: ModelClient) => Promise<ModelResult<T>>) => Promise<ModelResult<T>>;
  /** Network access for the code-only checks, when the deployment allows it. */
  fetchFn?: typeof fetch;
  dns?: DnsResolver;
}

export interface PipelineOutcome {
  status: "succeeded" | "needs_human";
  artifactId?: string;
  note?: string;
}

export type Pipeline = (ctx: PipelineContext, input: unknown) => Promise<PipelineOutcome>;

export function sar(n: number): string {
  return `SAR ${n.toLocaleString("en-US")}`;
}
