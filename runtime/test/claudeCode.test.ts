// The Claude plan path: the board's writers run through Claude Code (claude -p), signed in to the person's own
// Claude account. A stand-in replaces the claude program, so these tests make no model call.
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { modelClient } from "../src/board/main.ts";
import { trustedText } from "../src/gates/pii.ts";
import { ClaudeCodeModelClient, claudeCodeStatus, findClaudeBin, planEnv, type RunCommand, type RunResult } from "../src/model/claudeCode.ts";
import { ModelOutputError, ModelTransientError, ModelUnavailableError } from "../src/model/core.ts";

const Out = z.object({ answer: z.string(), count: z.number().int().max(10) });
const call = { agent: "test_agent", promptVersion: "test/1", system: "You answer in JSON.", schema: Out, effort: "low" as const };
const ok = (structured: unknown, extra: Record<string, unknown> = {}): RunResult => ({
  code: 0, timedOut: false, stderr: "",
  stdout: JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "", structured_output: structured,
    usage: { input_tokens: 3, cache_creation_input_tokens: 2000, cache_read_input_tokens: 40, output_tokens: 90 },
    modelUsage: { "claude-haiku-5-5": { outputTokens: 4 }, "claude-opus-5-5": { outputTokens: 86 } }, ...extra }),
});

/** A stand-in for the claude program that records each run, and what it could see while it ran. */
function fakeClaude(reply: RunResult) {
  const runs: Array<{ bin: string; args: string[]; cwd?: string; stdin?: string; env?: NodeJS.ProcessEnv; system: string; cwdFiles: string[] }> = [];
  const run: RunCommand = async (bin, args, o) => {
    const systemFile = args[args.indexOf("--system-prompt-file") + 1]!;
    runs.push({ bin, args, cwd: o.cwd, stdin: o.stdin, env: o.env, system: readFileSync(systemFile, "utf-8"), cwdFiles: readdirSync(o.cwd!) });
    return reply;
  };
  return { run, runs };
}

describe("the Claude plan client (Claude Code)", () => {
  it("makes one clean, tool-free call with a JSON Schema, and reads the validated reply", async () => {
    const { run, runs } = fakeClaude(ok({ answer: "Riyadh", count: 2 }));
    const m = new ClaudeCodeModelClient({ bin: "/opt/claude", run, env: { PATH: "/usr/bin", HOME: "/home/x", ANTHROPIC_API_KEY: "sk-ant-should-not-pass", ANTHROPIC_AUTH_TOKEN: "t" } });
    expect(m.kind).toBe("claude_plan");
    const r = await m.call({ ...call, input: trustedText("Capital of Saudi Arabia?"), maxTokens: 24_000 });
    expect(r.output).toEqual({ answer: "Riyadh", count: 2 });
    expect(r.modelServed).toBe("claude-opus-5-5"); // the model that wrote the reply, not a helper
    expect(r.usage).toEqual({ input: 2003, output: 90, cacheRead: 40 });

    const [x] = runs;
    expect(x!.bin).toBe("/opt/claude");
    expect(x!.stdin).toBe("Capital of Saudi Arabia?");
    expect(x!.system).toBe("You answer in JSON.");
    expect(x!.cwdFiles).toEqual([]); // an empty working folder: nothing for Claude Code to pick up
    const flag = (name: string) => x!.args[x!.args.indexOf(name) + 1];
    expect(x!.args[0]).toBe("-p");
    expect(flag("--output-format")).toBe("json");
    expect(flag("--tools")).toBe("");
    expect(flag("--disallowedTools")).toBe("mcp__*");
    expect(flag("--setting-sources")).toBe("local");
    expect(flag("--effort")).toBe("low");
    expect(x!.args).toEqual(expect.arrayContaining(["--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]));
    expect(x!.args).not.toContain("--bare"); // bare mode never reads a subscription sign-in
    expect(x!.args).not.toContain("--model"); // unset: the plan's default model
    expect(JSON.parse(flag("--json-schema")!)).toMatchObject({ type: "object", required: ["answer", "count"], additionalProperties: false });
    // The plan's sign-in is the one used: API credentials never reach Claude Code.
    expect(x!.env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(x!.env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
    expect(x!.env!.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe("24000");
    expect(existsSync(path.dirname(x!.cwd!))).toBe(false); // the temporary folder is gone afterwards
  });

  it("passes a chosen model, and refuses text that still holds personal data before running anything", async () => {
    const { run, runs } = fakeClaude(ok({ answer: "x", count: 1 }));
    const m = new ClaudeCodeModelClient({ bin: "/opt/claude", run, model: "opus", env: {} });
    await m.call({ ...call, input: trustedText("q") });
    expect(runs[0]!.args.slice(runs[0]!.args.indexOf("--model"), runs[0]!.args.indexOf("--model") + 2)).toEqual(["--model", "opus"]);
    await expect(m.call({ ...call, input: "Call 0551234567" as never })).rejects.toThrow(/personal data/);
    expect(runs).toHaveLength(1);
  });

  it("turns Claude Code's failures into the board's typed errors, in plain words", async () => {
    const err = (result: string, subtype = "success"): RunResult => ({ code: 1, timedOut: false, stderr: "", stdout: JSON.stringify({ type: "result", subtype, is_error: true, result }) });
    const cases: Array<[RunResult, unknown, RegExp]> = [
      [err("Invalid API key · Please run /login"), ModelUnavailableError, /claude auth login/],
      [err("Claude AI usage limit reached|1763000000"), ModelTransientError, /limit/],
      [{ code: 1, timedOut: false, stdout: JSON.stringify({ subtype: "error_max_structured_output_retries", is_error: true }), stderr: "" }, ModelOutputError, /schema/],
      [ok(undefined), ModelOutputError, /no structured reply/],
      [ok({ answer: "x", count: 99 }), ModelOutputError, /did not match its schema/],
      [{ code: 1, timedOut: false, stdout: "", stderr: "error: unknown option '--json-schema'" }, ModelUnavailableError, /claude update/],
      [{ code: null, timedOut: true, stdout: "", stderr: "" }, ModelTransientError, /stopped/],
    ];
    for (const [reply, type, message] of cases) {
      const m = new ClaudeCodeModelClient({ bin: "/opt/claude", run: fakeClaude(reply).run, env: {} });
      const failure = m.call({ ...call, input: trustedText("q") });
      await expect(failure).rejects.toThrow(type as never);
      await expect(failure).rejects.toThrow(message);
    }
  });
});

describe("finding Claude Code and its sign-in", () => {
  const status = (authMethod: string | null, loggedIn = true): RunCommand => async (_bin, args) =>
    args[0] === "--version" ? { code: 0, stdout: "2.1.330 (Claude Code)\n", stderr: "", timedOut: false }
      : { code: loggedIn ? 0 : 1, stdout: JSON.stringify({ loggedIn, authMethod }), stderr: "", timedOut: false };

  it("tells a Claude account apart from an API key, and says what to do", async () => {
    expect(await claudeCodeStatus("/opt/claude", {}, status("claude.ai"))).toMatchObject({ version: "2.1.330", onPlan: true, problem: null });
    expect(await claudeCodeStatus("/opt/claude", {}, status("oauth_token"))).toMatchObject({ onPlan: true, problem: null });
    expect((await claudeCodeStatus("/opt/claude", {}, status("api_key"))).problem).toMatch(/API key, which is billed per use.*claude auth login/);
    expect((await claudeCodeStatus("/opt/claude", {}, status("none", false))).problem).toMatch(/isn't signed in.*claude auth login/);
    const broken: RunCommand = async () => ({ code: null, stdout: "", stderr: "spawn /opt/claude ENOENT", timedOut: false });
    expect((await claudeCodeStatus("/opt/claude", {}, broken)).problem).toMatch(/didn't start/);
    expect(planEnv({ ANTHROPIC_API_KEY: "k", HOME: "/h" })).toEqual({ HOME: "/h" });
  });

  it("finds the program where the installers put it, and switches the writers on only for a Claude account", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "qottuf-home-"));
    expect(findClaudeBin({ HOME: home, PATH: "" })).toBeNull();
    const bin = path.join(home, ".local", "bin", "claude");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(path.dirname(bin), { recursive: true });
    writeFileSync(bin, "#!/bin/sh\n");
    chmodSync(bin, 0o755);
    expect(findClaudeBin({ HOME: home, PATH: "" })).toBe(bin);

    const env = { HOME: home, PATH: "", QOTTUF_MODEL_CALLS: "claude-plan" };
    const on = await modelClient(env, [], status("claude.ai"));
    expect(on.model?.kind).toBe("claude_plan");
    expect(on.note).toMatch(/your Claude plan, through Claude Code 2\.1\.330/);
    const apiKey = await modelClient(env, [], status("api_key"));
    expect(apiKey.model).toBeNull();
    expect(apiKey.note).toMatch(/API key/);
    const missing = await modelClient({ HOME: mkdtempSync(path.join(os.tmpdir(), "qottuf-home-")), PATH: "", QOTTUF_MODEL_CALLS: "claude-plan" }, []);
    expect(missing.model).toBeNull();
    expect(missing.note).toMatch(/isn't on this computer.*install\.sh/);
    expect((await modelClient({ QOTTUF_MODEL_CALLS: "" }, [])).note).toMatch(/QOTTUF_MODEL_CALLS=claude-plan/);
  });
});
