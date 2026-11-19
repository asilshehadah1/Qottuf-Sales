// The agents' model client inside the console: every call goes through the artifact runtime's `sample`, which
// runs on the viewer's own Claude plan (no API key, no separate billing). Same contract as the server client:
// redacted input only, the agent's fixed instructions, one JSON reply validated by the agent's Zod schema.
// `sample` has no system prompt and no structured-output mode, so the instructions and the JSON Schema travel
// in the input, and code validates what comes back.

import { assertRedacted } from "../gates/pii.ts";
import {
  ModelCancelledError, ModelOutputError, ModelRefusalError, ModelTransientError, ModelTruncatedError, ModelUnavailableError,
  parseLooseJson, parseOutput, toApiSchema, type Effort, type ModelCall, type ModelClient, type ModelResult,
} from "../model/core.ts";

export type SampleTier = "quick" | "default" | "complex";

export interface SampleCallOptions {
  modelTier?: SampleTier;
  cache?: boolean;
  signal?: AbortSignal;
  onText?: (update: { text: string; delta: string }) => void;
}

export interface SampleCallResult {
  text: string;
  truncated: boolean;
  modelTierApplied?: string;
}

/** The runtime's `sample` function: `await claude.use("sample")`. */
export type SampleFn = (input: string, options?: SampleCallOptions) => Promise<SampleCallResult>;

export interface SampleClientOptions {
  /** Which tier answers each agent. Default: extraction (effort low) on "quick", everything else on "default". */
  tierFor?: (agent: string, effort: Effort) => SampleTier;
  signal?: AbortSignal;
  /** Progress while an agent writes: how many characters so far. */
  onProgress?: (agent: string, chars: number) => void;
  publicNumbers?: string[];
}

const UNAVAILABLE = new Set(["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed", "session_expired"]);

export function buildSamplePrompt(c: Pick<ModelCall<unknown>, "system" | "input" | "schema">): string {
  const schema = JSON.stringify(toApiSchema(c.schema));
  return `${c.system}\n\nReply with only one JSON value that matches this JSON Schema, with no other text before or after it:\n${schema}\n\n<input>\n${c.input}\n</input>`;
}

export class SampleModelClient implements ModelClient {
  readonly kind = "claude_plan" as const;

  constructor(private readonly sample: SampleFn, private readonly opts: SampleClientOptions = {}) {}

  async call<T>(c: ModelCall<T>): Promise<ModelResult<T>> {
    assertRedacted(c.input, { publicNumbers: this.opts.publicNumbers ?? [] });
    const tier = this.opts.tierFor?.(c.agent, c.effort) ?? (c.effort === "low" ? "quick" : "default");
    const started = Date.now();
    const onProgress = this.opts.onProgress;
    let res: SampleCallResult;
    try {
      res = await this.sample(buildSamplePrompt(c), {
        modelTier: tier,
        cache: false, // every run asks afresh; a repeat must not replay an old draft
        ...(this.opts.signal ? { signal: this.opts.signal } : {}),
        ...(onProgress ? { onText: (u: { text: string }) => onProgress(c.agent, u.text.length) } : {}),
      });
    } catch (e) {
      const code = (e as { code?: string }).code ?? "upstream_error";
      const message = `${c.agent}: ${(e as { message?: string }).message ?? code}`;
      if (code === "cancelled") throw new ModelCancelledError(`${c.agent}: stopped`);
      if (code === "refused") throw new ModelRefusalError(null, message);
      if (code === "rate_limited" || code === "upstream_error") throw new ModelTransientError(message);
      if (UNAVAILABLE.has(code)) throw new ModelUnavailableError(message);
      throw new ModelOutputError(message);
    }
    if (res.truncated) throw new ModelTruncatedError(`${c.agent}: the reply was cut short`);
    const output = parseOutput(c.schema, parseLooseJson(res.text, c.agent), c.agent);
    return {
      output,
      modelRequested: `claude-plan:${tier}`,
      modelServed: `claude-plan:${res.modelTierApplied ?? tier}`,
      fallbackUsed: false,
      usage: { input: 0, output: 0, cacheRead: 0 },
      latencyMs: Date.now() - started,
    };
  }
}
