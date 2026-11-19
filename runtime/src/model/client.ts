// The server's model client: the Claude API through the Anthropic SDK. The contract, errors and the scripted
// client live in core.ts (no SDK), so the browser console can share the agents.
// API rules (spec §13.2): structured outputs validated by Zod, never forced tool_choice; adaptive thinking with
// effort set explicitly; server-side refusal fallbacks, logging the model that actually served the call;
// prompt caching on the fixed system prompt. Only redacted text crosses: the client re-scans and refuses
// anything that still holds personal data.

import Anthropic from "@anthropic-ai/sdk";
import { assertRedacted } from "../gates/pii.ts";
import {
  DEFAULT_MODEL, ModelRefusalError, ModelTransientError, ModelTruncatedError, ModelUnavailableError,
  parseJsonText, parseOutput, toApiSchema, type ModelCall, type ModelClient, type ModelResult,
} from "./core.ts";

export * from "./core.ts";

export interface AnthropicClientOptions {
  /** Model calls stay off until Asil decides hosting and data residency (decision #7, due 17 December). */
  enabled: boolean;
  model?: string;
  publicNumbers?: string[];
  client?: Anthropic;
}

export class AnthropicModelClient implements ModelClient {
  readonly kind = "anthropic" as const;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly publicNumbers: string[];

  constructor(o: AnthropicClientOptions) {
    if (!o.enabled) {
      throw new ModelUnavailableError(
        "Model calls are switched off. They stay off until Asil decides hosting and data residency; then set QOTTUF_MODEL_CALLS=enabled.",
      );
    }
    this.client = o.client ?? new Anthropic(); // credentials come from the environment, never from code
    this.model = o.model ?? DEFAULT_MODEL;
    this.publicNumbers = o.publicNumbers ?? [];
  }

  async call<T>(c: ModelCall<T>): Promise<ModelResult<T>> {
    assertRedacted(c.input, { publicNumbers: this.publicNumbers });
    const started = Date.now();
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: c.maxTokens ?? 16_000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: c.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: c.input }],
        output_config: { effort: c.effort, format: { type: "json_schema", schema: toApiSchema(c.schema) } },
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
        throw new ModelTransientError(`${c.agent}: ${(err as Error).message}`);
      }
      throw err;
    }
    if (response.stop_reason === "refusal") {
      throw new ModelRefusalError(response.stop_details?.category ?? null, `${c.agent}: the model declined (${response.stop_details?.category ?? "no category"}); a human takes this one`);
    }
    if (response.stop_reason === "max_tokens") {
      throw new ModelTruncatedError(`${c.agent}: the reply hit max_tokens and is incomplete`);
    }
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const usage = response.usage as unknown as {
      input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; iterations?: Array<{ type: string }> | null;
    };
    const fallbackUsed = (usage.iterations ?? []).some((i) => i.type === "fallback_message")
      || response.content.some((b) => (b as { type: string }).type === "fallback");
    return {
      output: parseOutput(c.schema, parseJsonText(text, c.agent), c.agent),
      modelRequested: this.model,
      modelServed: response.model,
      fallbackUsed,
      usage: { input: usage.input_tokens, output: usage.output_tokens, cacheRead: usage.cache_read_input_tokens ?? 0 },
      latencyMs: Date.now() - started,
    };
  }
}
