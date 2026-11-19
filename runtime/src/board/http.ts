// The board's HTTP layer: a small router, JSON replies, static files and a server-sent-events hub. No framework.
// The board is for one person on one computer, so the server listens on 127.0.0.1 only, and every request is checked:
//   - the Host header must name this machine, so a web page can't reach the board through DNS rebinding;
//   - a request that changes anything must be JSON from the board's own origin, so another site open in the same
//     browser can't approve a draft or start a paid agent run (cross-site request forgery);
//   - replies are never cached and never allowed in a frame, and pages carry a strict content security policy.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly details?: unknown) {
    super(message);
  }
}

export type Params = Record<string, string>;
export type Handler = (ctx: { req: IncomingMessage; res: ServerResponse; params: Params; url: URL; body: () => Promise<unknown> }) => Promise<unknown>;

interface Route { method: string; pattern: RegExp; keys: string[]; handler: Handler }

export class Router {
  private readonly routes: Route[] = [];
  add(method: string, path: string, handler: Handler): this {
    const keys: string[] = [];
    const pattern = new RegExp(`^${path.replace(/:([a-zA-Z_]+)/g, (_m, k: string) => { keys.push(k); return "([^/]+)"; })}$`);
    this.routes.push({ method, pattern, keys, handler });
    return this;
  }
  get(p: string, h: Handler) { return this.add("GET", p, h); }
  post(p: string, h: Handler) { return this.add("POST", p, h); }
  match(method: string, pathname: string): { handler: Handler; params: Params } | "method" | null {
    let wrongMethod = false;
    for (const r of this.routes) {
      const m = r.pattern.exec(pathname);
      if (!m) continue;
      if (r.method !== method) { wrongMethod = true; continue; }
      return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)])) };
    }
    return wrongMethod ? "method" : null;
  }
}

export function allowedHosts(port: number): Set<string> {
  return new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
}

/** Refuses requests that didn't come from the board itself. Returns an error message, or null when the request is fine. */
export function checkRequest(req: IncomingMessage, port: number): string | null {
  const hosts = allowedHosts(port);
  if (!req.headers.host || !hosts.has(req.headers.host.toLowerCase())) return "This board answers only on this computer, at localhost.";
  if (req.method === "GET" || req.method === "HEAD") return null;
  const origin = req.headers.origin;
  if (origin && ![...hosts].some((h) => origin.toLowerCase() === `http://${h}`)) return "Changes are accepted only from the board's own page.";
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return "Changes are accepted only from the board's own page.";
  if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return "Changes must be sent as JSON.";
  return null;
}

const SECURITY_HEADERS: Record<string, string> = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "cross-origin-resource-policy": "same-origin",
};

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

export async function readJson(req: IncomingMessage, limit = 1_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, "That request is too large.");
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    throw new HttpError(400, "That request wasn't valid JSON.");
  }
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json; charset=utf-8",
};

/** Serve a file from `root`; refuses anything that resolves outside it. */
export async function serveStatic(res: ServerResponse, root: string, pathname: string): Promise<boolean> {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.resolve(root, rel);
  if (!file.startsWith(path.resolve(root) + path.sep)) return false;
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return false;
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "content-length": info.size,
    ...(file.endsWith(".html") ? { "content-security-policy": CSP } : {}),
  });
  createReadStream(file).pipe(res);
  return true;
}

/** Server-sent events: the page learns that something changed and fetches what it shows. */
export class EventHub {
  private readonly clients = new Set<ServerResponse>();
  open(res: ServerResponse): void {
    res.writeHead(200, { ...SECURITY_HEADERS, "content-type": "text/event-stream", connection: "keep-alive" });
    res.write("retry: 3000\n\n");
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }
  emit(topics: string[]): void {
    const line = `event: change\ndata: ${JSON.stringify(topics)}\n\n`;
    for (const c of this.clients) c.write(line);
  }
  ping(): void {
    for (const c of this.clients) c.write(": ping\n\n");
  }
  get size(): number {
    return this.clients.size;
  }
}
