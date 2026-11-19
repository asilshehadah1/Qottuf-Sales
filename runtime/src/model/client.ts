// The model boundary. Every agent calls Claude through here, and nowhere else.
// API rules (spec §13.2): structured outputs validated by Zod, never forced tool_choice; adaptive thinking with
// effort set explicitly; server-side refusal fallbacks, logging the model that actually served the call;
// prompt caching on the fixed system prompt. Only redacted text crosses: the client re-scans and refuses
// anything that still holds personal data.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { assertRedacted, type RedactedText } from "../gates/pii.ts";

export const DEFAULT_MODEL = "claude-opus-5-5";

export type Effort = "low" | "medium" | "high";

export interface ModelCall<T> {
  agent: string;
  promptVersion: string;
  /** Fixed instructions; no personal data, no per-request values (keeps the prompt cache warm). */
  system: string;
  input: RedactedText;
  schema: z.ZodType<T>;
  effort: Effort;
  maxTokens?: number;
}

export interface ModelResult<T> {
  output: T;
  modelRequested: string;
  modelServed: string;
  fallbackUsed: boolean;
  usage: { input: number; output: number; cacheRead: number };
  latencyMs: number;
}

export class ModelUnavailableError extends Error {}
export class ModelRefusalError extends Error {
  constructor(readonly category: string | null, message: string) {
    super(message);
  }
}
export class ModelTruncatedError extends Error {}
export class ModelOutputError extends Error {}
/** Worth retrying later: rate limits, overload, network. */
export class ModelTransientError extends Error {}

export interface ModelClient {
  readonly kind: "anthropic" | "scripted";
  call<T>(c: ModelCall<T>): Promise<ModelResult<T>>;
}

const SUPPORTED_FORMATS = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);
const UNSUPPORTED_KEYS = new Set([
  "$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength",
  "pattern", "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties", "default",
]);

/**
 * JSON Schema for output_config.format. Constraints the API doesn't accept (lengths, ranges) are removed here and
 * still enforced by the Zod schema when the reply is parsed, which is what the SDK helpers do.
 */
export function toApiSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { io: "output" }) as Record<string, unknown>;
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (UNSUPPORTED_KEYS.has(k)) continue;
      if (k === "format" && typeof v === "string" && !SUPPORTED_FORMATS.has(v)) continue;
      out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, clean(pv)])) : clean(v);
    }
    if (out.type === "object" || out.properties) out.additionalProperties = false;
    return out;
  };
  return clean(raw) as Record<string, unknown>;
}

function parseOutput<T>(schema: z.ZodType<T>, text: string, agent: string): T {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ModelOutputError(`${agent}: the reply was not valid JSON`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ModelOutputError(`${agent}: the reply did not match its schema: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}

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
      output: parseOutput(c.schema, text, c.agent),
      modelRequested: this.model,
      modelServed: response.model,
      fallbackUsed,
      usage: { input: usage.input_tokens, output: usage.output_tokens, cacheRead: usage.cache_read_input_tokens ?? 0 },
      latencyMs: Date.now() - started,
    };
  }
}

/** Deterministic stand-in for tests and the demo: the same contract, scripted outputs, no network. */
export class ScriptedModelClient implements ModelClient {
  readonly kind = "scripted" as const;
  readonly calls: Array<{ agent: string; input: string; effort: Effort }> = [];

  constructor(private readonly scripts: Record<string, (input: string, attempt: number) => unknown>) {}

  async call<T>(c: ModelCall<T>): Promise<ModelResult<T>> {
    assertRedacted(c.input);
    const script = this.scripts[c.agent];
    if (!script) throw new ModelUnavailableError(`no scripted output for agent ${c.agent}`);
    const attempt = this.calls.filter((x) => x.agent === c.agent).length + 1;
    this.calls.push({ agent: c.agent, input: c.input, effort: c.effort });
    const output = parseOutput(c.schema, JSON.stringify(script(c.input, attempt)), c.agent);
    return { output, modelRequested: DEFAULT_MODEL, modelServed: "scripted", fallbackUsed: false, usage: { input: 0, output: 0, cacheRead: 0 }, latencyMs: 0 };
  }
}
