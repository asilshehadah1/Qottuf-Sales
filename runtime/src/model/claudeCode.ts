// The board's model client for a Claude plan. Each agent call is run by the person's own Claude Code, signed in to
// their own Claude account, so the writing agents count against that plan instead of an API key.
//
// Anthropic's rules allow a person to sign in to the unmodified Claude Code with their own subscription, and they
// don't allow routing other people's work through one person's plan. So this is for the signed-in person's own
// work: the board never sees, stores or forwards the sign-in, and a colleague who uses the board signs in to Claude
// Code on their own computer with their own account (or the board uses an API key).
//
// Each call is one clean, tool-free request in print mode (claude -p):
//   - an empty working folder, so nothing in a project is picked up;
//   - no tools, no MCP servers, no skills or slash commands;
//   - no user or project settings, so no hooks, plugins or CLAUDE.md;
//   - the agent's own system prompt, and a JSON Schema the reply must match;
//   - nothing saved as a Claude Code session.
// Not --bare: bare mode never reads a subscription sign-in. API keys are removed from Claude Code's environment, so
// the plan is what gets used, never an ANTHROPIC_API_KEY left in runtime/.env.

import { spawn } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertRedacted } from "../gates/pii.ts";
import {
  ModelOutputError, ModelRefusalError, ModelTransientError, ModelUnavailableError,
  parseOutput, toApiSchema, type ModelCall, type ModelClient, type ModelResult,
} from "./core.ts";

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}
export type RunCommand = (bin: string, args: string[], o: { cwd?: string; stdin?: string; env?: NodeJS.ProcessEnv; timeoutMs: number }) => Promise<RunResult>;

/** Run a program without a shell, feed it stdin, collect its output; past the time limit, SIGTERM then SIGKILL. */
export const runCommand: RunCommand = (bin, args, o) =>
  new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    };
    const child = spawn(bin, args, { cwd: o.cwd, env: o.env ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, o.timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (d: string) => { stdout += d; });
    child.stderr.setEncoding("utf8").on("data", (d: string) => { stderr += d; });
    child.on("error", (e) => { stderr += e.message; finish(null); });
    child.on("close", (code) => finish(code));
    child.stdin.on("error", () => { /* the program exited before reading its input */ });
    child.stdin.end(o.stdin ?? "");
  });

/** The board's environment minus API credentials, so Claude Code uses the plan's sign-in. */
export function planEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...env };
  delete out.ANTHROPIC_API_KEY;
  delete out.ANTHROPIC_AUTH_TOKEN;
  return out;
}

const isProgram = (p: string): boolean => {
  try {
    accessSync(p, constants.X_OK);
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Where Claude Code is: QOTTUF_CLAUDE_BIN, then the PATH, then where its installers put it. */
export function findClaudeBin(env: NodeJS.ProcessEnv): string | null {
  const home = env.HOME || os.homedir();
  const candidates = [
    env.QOTTUF_CLAUDE_BIN,
    ...(env.PATH ?? "").split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, "claude")),
    path.join(home, ".local", "bin", "claude"),
    path.join(home, ".claude", "local", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];
  for (const c of candidates) if (c && isProgram(c)) return c;
  return null;
}

/** Sign-ins that use a Claude plan: `claude auth login` with a Claude account, or a token from `claude setup-token`. */
const PLAN_SIGN_INS = new Set(["claude.ai", "oauth_token"]);

export interface ClaudeCodeStatus {
  bin: string;
  version: string | null;
  loggedIn: boolean;
  authMethod: string | null;
  onPlan: boolean;
  /** What stops the writers from running on the plan, in plain words; null when nothing does. */
  problem: string | null;
}

const firstLine = (s: string): string => s.trim().split("\n")[0]?.slice(0, 240) ?? "";

/** Claude Code's version and sign-in, without a model call. */
export async function claudeCodeStatus(bin: string, env: NodeJS.ProcessEnv, run: RunCommand = runCommand): Promise<ClaudeCodeStatus> {
  const e = planEnv(env);
  const v = await run(bin, ["--version"], { env: e, timeoutMs: 30_000 });
  const version = /(\d+\.\d+\.\d+)/.exec(v.stdout)?.[1] ?? null;
  if (v.code !== 0 || !version) {
    return { bin, version, loggedIn: false, authMethod: null, onPlan: false,
      problem: `Claude Code at ${bin} didn't start (${firstLine(v.stderr || v.stdout) || `exit code ${v.code}`}).` };
  }
  const s = await run(bin, ["auth", "status"], { env: e, timeoutMs: 30_000 });
  let parsed: { loggedIn?: boolean; authMethod?: string } = {};
  try {
    parsed = JSON.parse(s.stdout) as typeof parsed;
  } catch {
    /* an older Claude Code: fall back to the exit code */
  }
  const loggedIn = parsed.loggedIn ?? s.code === 0;
  const authMethod = parsed.authMethod ?? null;
  const onPlan = loggedIn && (authMethod === null || PLAN_SIGN_INS.has(authMethod));
  const problem = !loggedIn
    ? "Claude Code isn't signed in. In Terminal, run: claude auth login (sign in with your Claude account), then restart the board."
    : !onPlan
      ? `Claude Code is signed in with ${authMethod === "api_key" || authMethod === "api_key_helper" ? "an API key, which is billed per use" : "a cloud provider's account"}, not your Claude account. In Terminal, run: claude auth logout, then claude auth login, then restart the board.`
      : null;
  return { bin, version, loggedIn, authMethod, onPlan, problem };
}

interface PrintResult {
  subtype?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  modelUsage?: Record<string, { outputTokens?: number }>;
}

export interface ClaudeCodeOptions {
  bin: string;
  /** A Claude Code model alias or name, such as "opus"; unset, Claude Code uses its default for the plan. */
  model?: string;
  publicNumbers?: string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  run?: RunCommand;
}

export class ClaudeCodeModelClient implements ModelClient {
  readonly kind = "claude_plan" as const;
  private readonly bin: string;
  private readonly model: string | undefined;
  private readonly publicNumbers: string[];
  private readonly env: NodeJS.ProcessEnv;
  private readonly timeoutMs: number;
  private readonly run: RunCommand;

  constructor(o: ClaudeCodeOptions) {
    this.bin = o.bin;
    this.model = o.model;
    this.publicNumbers = o.publicNumbers ?? [];
    this.env = o.env ?? process.env;
    this.timeoutMs = o.timeoutMs ?? 8 * 60_000;
    this.run = o.run ?? runCommand;
  }

  async call<T>(c: ModelCall<T>): Promise<ModelResult<T>> {
    assertRedacted(c.input, { publicNumbers: this.publicNumbers });
    const started = Date.now();
    const dir = await mkdtemp(path.join(os.tmpdir(), "qottuf-claude-"));
    try {
      const work = path.join(dir, "work"); // empty: nothing for Claude Code to pick up
      await mkdir(work);
      const systemFile = path.join(dir, "system.txt");
      await writeFile(systemFile, c.system, "utf-8");
      const args = [
        "-p", "--output-format", "json",
        "--json-schema", JSON.stringify(toApiSchema(c.schema)),
        "--system-prompt-file", systemFile,
        "--tools", "", "--disallowedTools", "mcp__*", "--strict-mcp-config",
        "--setting-sources", "local", "--disable-slash-commands", "--no-session-persistence",
        "--effort", c.effort,
        ...(this.model ? ["--model", this.model] : []),
      ];
      const env = planEnv(this.env);
      if (c.maxTokens) env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(c.maxTokens);
      const r = await this.run(this.bin, args, { cwd: work, stdin: c.input, env, timeoutMs: this.timeoutMs });
      return this.read(c, r, started);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private read<T>(c: ModelCall<T>, r: RunResult, started: number): ModelResult<T> {
    if (r.timedOut) {
      throw new ModelTransientError(`${c.agent}: Claude Code was still working after ${Math.round(this.timeoutMs / 60_000)} minutes and was stopped`);
    }
    let out: PrintResult;
    try {
      out = JSON.parse(r.stdout) as PrintResult;
    } catch {
      throw new ModelUnavailableError(
        `${c.agent}: Claude Code didn't answer as expected (${firstLine(r.stderr || r.stdout) || `exit code ${r.code}`}). If it's out of date, run in Terminal: claude update`,
      );
    }
    if (out.is_error || (out.subtype !== undefined && out.subtype !== "success")) {
      const said = firstLine(String(out.result ?? out.subtype ?? "an error"));
      if (out.subtype === "error_max_structured_output_retries") throw new ModelOutputError(`${c.agent}: the reply didn't match its schema after several tries`);
      if (/usage limit|rate limit|limit reached|overloaded|\b429\b|\b529\b|try again/i.test(said)) {
        throw new ModelTransientError(`${c.agent}: the Claude plan's limit or capacity: ${said}`);
      }
      if (/log ?in|logged in|sign ?in|auth|credential|api key|\b401\b|\b403\b/i.test(said)) {
        throw new ModelUnavailableError(`${c.agent}: Claude Code isn't signed in (${said}). In Terminal, run: claude auth login`);
      }
      if (/refus|declin/i.test(said)) throw new ModelRefusalError(null, `${c.agent}: the model declined; a human takes this one`);
      throw new ModelUnavailableError(`${c.agent}: Claude Code reported an error: ${said}`);
    }
    if (out.structured_output === undefined || out.structured_output === null) {
      throw new ModelOutputError(`${c.agent}: Claude Code returned no structured reply`);
    }
    const served = Object.entries(out.modelUsage ?? {}).sort((a, b) => (b[1]?.outputTokens ?? 0) - (a[1]?.outputTokens ?? 0))[0]?.[0];
    const u = out.usage ?? {};
    return {
      output: parseOutput(c.schema, out.structured_output, c.agent),
      modelRequested: this.model ?? "claude-code-default",
      modelServed: served ?? "claude-code",
      fallbackUsed: false,
      usage: { input: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0 },
      latencyMs: Date.now() - started,
    };
  }
}
