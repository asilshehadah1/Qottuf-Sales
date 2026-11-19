// The elevator CRM, read-only (business-development spec §4: "The elevator CRM stays the desk's tool and syncs to it").
// The CRM (repo qottuf-elevator-configurator, crm/; https://qottuf-crm.vercel.app) is the system of record for every
// customer. It has no service keys for reading, so the board signs in as a person: email, password and, if the
// account has two-factor sign-in, the six-digit code. The board keeps only the session cookie, in memory; it never
// stores the password, never writes to the CRM, and copies each quotation through an allowlist that leaves out the
// customer's name, phone, email, company, notes, configurator choices and the request metadata.

export const CRM_STAGES = ["new", "contacted", "verified", "tech_review", "tech_ready", "quoted", "won", "lost"] as const;

export interface CrmQuote {
  id: number;
  ref: string;
  status: string;
  source: string;
  priority: string;
  /** For leads entered by hand: whatsapp, phone, email, walkin, referral or other. */
  channel: string | null;
  city: string | null;
  project_type: string | null;
  product: string | null;
  design: string | null;
  persons: number | null;
  rated_load_kg: number | null;
  stops: number | null;
  machine: string | null;
  door_type: string | null;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  assigned_name: string | null;
  tech_status: string | null;
  lost_reason: string | null;
  won_amount: number | null;
  created_at: string | null;
  updated_at: string | null;
  first_contact_at: string | null;
  verified_at: string | null;
  handoff_at: string | null;
  tech_ready_at: string | null;
  quoted_at: string | null;
  closed_at: string | null;
  next_followup_at: string | null;
  age_hours: number | null;
  technical_hours: number | null;
  /** Still new after the 24-hour first-contact promise. */
  sla_breached: boolean;
  /** With the technical office past its 48 hours. */
  technical_overdue: boolean;
  followup_overdue: boolean;
}

export type CrmErrorCode = "not_signed_in" | "bad_credentials" | "mfa_required" | "mfa_invalid" | "rate_limited" | "forbidden" | "unreachable" | "bad_reply";

export class CrmError extends Error {
  constructor(readonly code: CrmErrorCode, message: string) {
    super(message);
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
/** CRM timestamps are SQLite UTC text ("2026-11-19 08:30:00"); return ISO 8601. */
const time = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s) ? `${s.replace(" ", "T")}Z` : s;
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
};

/** Copy a CRM quotation through an allowlist: pipeline facts only, no personal data. Never spread the row. */
export function stripQuote(row: Record<string, unknown>): CrmQuote {
  const meta = row.clientMeta && typeof row.clientMeta === "object" ? (row.clientMeta as Record<string, unknown>) : {};
  return {
    id: num(row.id) ?? 0,
    ref: str(row.ref) ?? "",
    status: str(row.status) ?? "new",
    source: str(row.source) ?? "enduser",
    priority: str(row.priority) ?? "normal",
    channel: str(meta.channel),
    city: str(row.city),
    project_type: str(row.project_type),
    product: str(row.product),
    design: str(row.display_name),
    persons: num(row.persons),
    rated_load_kg: num(row.rated_load_kg),
    stops: num(row.stops),
    machine: str(row.machine),
    door_type: str(row.door_type),
    price_min: num(row.price_min),
    price_max: num(row.price_max),
    currency: str(row.currency) ?? "SAR",
    assigned_name: str(row.assigned_name),
    tech_status: str(row.tech_status),
    lost_reason: str(row.lost_reason),
    won_amount: num(row.won_amount),
    created_at: time(row.created_at),
    updated_at: time(row.updated_at),
    first_contact_at: time(row.first_contact_at),
    verified_at: time(row.verified_at),
    handoff_at: time(row.handoff_at),
    tech_ready_at: time(row.tech_ready_at),
    quoted_at: time(row.quoted_at),
    closed_at: time(row.closed_at),
    next_followup_at: time(row.next_followup_at),
    age_hours: num(row.ageHours),
    technical_hours: num(row.technicalHours),
    sla_breached: Boolean(num(row.slaBreached)),
    technical_overdue: Boolean(num(row.technicalOverdue)),
    followup_overdue: Boolean(num(row.followupOverdue)),
  };
}

export interface CrmUser {
  name: string;
  role: string;
}

export interface CrmPage {
  quotes: CrmQuote[];
  total: number;
  counts: Record<string, number>;
}

const SESSION_COOKIE = "qottuf_crm_sid";

export class CrmClient {
  private cookie: string | null = null;
  private expiresAt = 0;
  user: CrmUser | null = null;

  constructor(readonly baseUrl: string, private readonly fetchFn: typeof fetch = fetch, private readonly clock: () => number = Date.now) {}

  get signedIn(): boolean {
    return this.cookie !== null && this.clock() < this.expiresAt;
  }

  /** A link to a quotation in the CRM's own app. */
  quoteUrl(id: number): string {
    return `${this.baseUrl.replace(/\/$/, "")}/#/quote/${id}`;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(new URL(path, this.baseUrl), { ...init, redirect: "manual", signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      throw new CrmError("unreachable", `The CRM at ${this.baseUrl} didn't answer: ${(e as Error).message}`);
    }
  }

  async signIn(email: string, password: string, code?: string): Promise<CrmUser> {
    const res = await this.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email, password, ...(code ? { code } : {}) }),
    });
    const body = (await res.json().catch(() => null)) as { user?: { name?: string; role?: string }; error?: string; details?: { code?: string } } | null;
    if (res.status === 401) {
      const c = body?.details?.code;
      if (c === "mfa_required") throw new CrmError("mfa_required", "This account has two-factor sign-in: enter the six-digit code from the authenticator app.");
      if (c === "mfa_invalid" || c === "mfa_replay") throw new CrmError("mfa_invalid", "That code didn't work. Wait for a new one and try again.");
      throw new CrmError("bad_credentials", "Incorrect email or password.");
    }
    if (res.status === 429) throw new CrmError("rate_limited", "Too many sign-in attempts. The CRM asks you to wait a few minutes.");
    if (!res.ok) throw new CrmError("bad_reply", `The CRM answered ${res.status} to the sign-in.`);
    const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie") ?? ""];
    const session = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    const value = session?.split(";")[0]!.slice(SESSION_COOKIE.length + 1);
    if (!session || !value) throw new CrmError("bad_reply", "The CRM signed in but sent no session cookie.");
    const maxAge = Number(/max-age=(\d+)/i.exec(session)?.[1] ?? 12 * 3600);
    this.cookie = `${SESSION_COOKIE}=${value}`;
    this.expiresAt = this.clock() + maxAge * 1000;
    this.user = { name: body?.user?.name ?? "", role: body?.user?.role ?? "" };
    return this.user;
  }

  async signOut(): Promise<void> {
    if (this.cookie) {
      try { await this.request("/api/auth/logout", { method: "POST", headers: { cookie: this.cookie, "content-type": "application/json" }, body: "{}" }); } catch { /* the session expires on its own */ }
    }
    this.cookie = null;
    this.user = null;
    this.expiresAt = 0;
  }

  private async get(path: string): Promise<unknown> {
    if (!this.signedIn) throw new CrmError("not_signed_in", "Sign in to the CRM first.");
    const res = await this.request(path, { headers: { cookie: this.cookie!, accept: "application/json" } });
    if (res.status === 401) {
      this.cookie = null;
      this.user = null;
      throw new CrmError("not_signed_in", "The CRM session ended. Sign in again.");
    }
    if (res.status === 403) throw new CrmError("forbidden", "This CRM account can't read that. Use a support or coordinator account.");
    if (!res.ok) throw new CrmError("bad_reply", `The CRM answered ${res.status} for ${path}.`);
    try {
      return await res.json();
    } catch {
      throw new CrmError("bad_reply", `The CRM's reply to ${path} wasn't JSON.`);
    }
  }

  async listQuotes(o: { limit?: number; offset?: number; sort?: string } = {}): Promise<CrmPage> {
    const q = new URLSearchParams({ limit: String(o.limit ?? 200), offset: String(o.offset ?? 0), sort: o.sort ?? "created_desc" });
    const body = (await this.get(`/api/quotes?${q}`)) as { quotes?: unknown[]; total?: unknown; counts?: unknown };
    if (!Array.isArray(body?.quotes)) throw new CrmError("bad_reply", "The CRM's quotation list had an unexpected shape.");
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries((body.counts as Record<string, unknown>) ?? {})) counts[k] = num(v) ?? 0;
    return { quotes: body.quotes.map((r) => stripQuote(r as Record<string, unknown>)), total: num(body.total) ?? body.quotes.length, counts };
  }

  /** Every quotation this account may see, page by page, up to `max`. */
  async allQuotes(max = 5000): Promise<CrmPage> {
    const first = await this.listQuotes({ limit: 200, offset: 0 });
    const quotes = [...first.quotes];
    while (quotes.length < Math.min(first.total, max)) {
      const page = await this.listQuotes({ limit: 200, offset: quotes.length });
      if (page.quotes.length === 0) break;
      quotes.push(...page.quotes);
    }
    return { quotes, total: first.total, counts: first.counts };
  }
}
