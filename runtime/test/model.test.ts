import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { redact, trustedText } from "../src/gates/pii.ts";
import {
  AnthropicModelClient, ModelOutputError, ModelRefusalError, ModelTruncatedError, ModelUnavailableError, toApiSchema,
} from "../src/model/client.ts";

const Out = z.object({ answer: z.string().min(2), count: z.number().int().max(10), note: z.string().nullable() });

function fakeApi(reply: Record<string, unknown>) {
  const seen: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers as unknown as Record<string, string>).forEach((v, k) => (headers[k] = v));
    seen.push({ url: String(url), headers, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({
      id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", stop_sequence: null, stop_details: null,
      usage: { input_tokens: 120, output_tokens: 40, cache_read_input_tokens: 0 }, ...reply,
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = new Anthropic({ apiKey: "test-key", fetch: fetch as never, maxRetries: 0 });
  return { client, seen };
}

const call = { agent: "test_agent", promptVersion: "test/1", system: "You answer.", schema: Out, effort: "low" as const };

describe("structured-output schema", () => {
  it("drops constraints the API doesn't accept and closes every object", () => {
    const s = toApiSchema(Out) as { properties: Record<string, Record<string, unknown>>; additionalProperties: boolean };
    expect(s.additionalProperties).toBe(false);
    expect(s.properties.answer).not.toHaveProperty("minLength");
    expect(s.properties.count).not.toHaveProperty("maximum");
    expect(JSON.stringify(s)).not.toContain("$schema");
  });
});

describe("the model client", () => {
  it("stays off until enabled", () => {
    expect(() => new AnthropicModelClient({ enabled: false })).toThrow(ModelUnavailableError);
  });

  it("sends the agreed request: Opus 5.5, explicit effort, JSON schema, fallbacks, cached system prompt", async () => {
    const { client, seen } = fakeApi({ content: [{ type: "text", text: JSON.stringify({ answer: "ok", count: 3, note: null }) }], stop_reason: "end_turn" });
    const m = new AnthropicModelClient({ enabled: true, client });
    const r = await m.call({ ...call, input: trustedText("Question with no personal data.") });
    expect(r.output).toEqual({ answer: "ok", count: 3, note: null });
    expect(r.modelServed).toBe("claude-opus-5-5");
    const req = seen[0]!;
    expect(req.url).toContain("/v1/messages");
    expect(req.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(req.body).toMatchObject({
      model: "claude-opus-5-5",
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema" } },
      system: [{ type: "text", text: "You answer.", cache_control: { type: "ephemeral" } }],
    });
    expect(req.body).not.toHaveProperty("tool_choice");
    expect(req.body).not.toHaveProperty("thinking");
  });

  it("refuses to send text that still holds personal data", async () => {
    const { client, seen } = fakeApi({ content: [], stop_reason: "end_turn" });
    const m = new AnthropicModelClient({ enabled: true, client });
    await expect(m.call({ ...call, input: "Call 0551234567" as never })).rejects.toThrow(/personal data/);
    expect(seen).toHaveLength(0);
    const safe = redact("Call 0551234567");
    expect(safe.text).toBe("Call [PHONE-1]");
  });

  it("surfaces refusals, truncation and schema mismatches as typed errors", async () => {
    const refused = new AnthropicModelClient({ enabled: true, client: fakeApi({ content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "x" } }).client });
    await expect(refused.call({ ...call, input: trustedText("q") })).rejects.toThrow(ModelRefusalError);
    const cut = new AnthropicModelClient({ enabled: true, client: fakeApi({ content: [{ type: "text", text: "{\"answ" }], stop_reason: "max_tokens" }).client });
    await expect(cut.call({ ...call, input: trustedText("q") })).rejects.toThrow(ModelTruncatedError);
    const wrong = new AnthropicModelClient({ enabled: true, client: fakeApi({ content: [{ type: "text", text: JSON.stringify({ answer: "ok", count: 99, note: null }) }], stop_reason: "end_turn" }).client });
    await expect(wrong.call({ ...call, input: trustedText("q") })).rejects.toThrow(ModelOutputError);
  });
});
