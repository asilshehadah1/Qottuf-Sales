// The model contract every agent uses, with no SDK and no Node dependency, so the same agents run in the server
// runtime (through the Claude API) and in the browser console (through the viewer's Claude plan).

import { z } from "zod";
import { assertRedacted, type RedactedText } from "../gates/pii.ts";

export const DEFAULT_MODEL = "claude-opus-5-5";

export type Effort = "low" | "medium" | "high";

export interface ModelCall<T> {
  agent: string;
  promptVersion: string;
  /** Fixed instructions; no personal data, no per-request values (keeps a prompt cache warm where there is one). */
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
/** The person stopped the run. */
export class ModelCancelledError extends Error {}

export interface ModelClient {
  readonly kind: "anthropic" | "scripted" | "claude_plan";
  call<T>(c: ModelCall<T>): Promise<ModelResult<T>>;
}

const SUPPORTED_FORMATS = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);
const UNSUPPORTED_KEYS = new Set([
  "$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength",
  "pattern", "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties", "default",
]);

/**
 * JSON Schema for a structured reply. Constraints the API doesn't accept (lengths, ranges) are removed here and
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

/** Validate a reply against the agent's schema; a mismatch is a typed error naming the first problems. */
export function parseOutput<T>(schema: z.ZodType<T>, json: unknown, agent: string): T {
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ModelOutputError(`${agent}: the reply did not match its schema: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}

export function parseJsonText(text: string, agent: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ModelOutputError(`${agent}: the reply was not valid JSON`);
  }
}

/**
 * Read one JSON value from a model's reply: the whole reply, else the body of one Markdown fence, else the text
 * from the first { or [ to the last } or ]. Throws ModelOutputError when nothing parses.
 */
export function parseLooseJson(text: string, agent: string): unknown {
  const attempts = [text.trim()];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) attempts.push(fence[1]!.trim());
  const first = text.search(/[{[]/);
  const last = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (first >= 0 && last > first) attempts.push(text.slice(first, last + 1));
  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch {
      /* try the next form */
    }
  }
  throw new ModelOutputError(`${agent}: the reply held no JSON value`);
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
    const output = parseOutput(c.schema, JSON.parse(JSON.stringify(script(c.input, attempt))), c.agent);
    return { output, modelRequested: DEFAULT_MODEL, modelServed: "scripted", fallbackUsed: false, usage: { input: 0, output: 0, cacheRead: 0 }, latencyMs: 0 };
  }
}
