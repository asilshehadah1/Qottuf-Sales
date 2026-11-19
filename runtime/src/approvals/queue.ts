// One approval queue (business-development spec §4). Every artifact an agent produces lands here, immutable and
// hashed; nothing leaves the system any other way. Phase 1 has no send function at all: an approved artifact is
// ready for Asil to use by hand. Approval is refused when:
//   - the approver isn't authorised for artifacts (the rules file says Asil);
//   - client or public material failed its gates;
//   - it is addressed to a person with no recorded consent for that channel;
//   - it rests on internal evidence, or on confidential evidence without Asil's release.

import { createHash } from "node:crypto";
import { audit, canonicalJson } from "../audit/audit.ts";
import { canApprove, type BusinessRules } from "../config/rules.ts";
import type { Queryable } from "../db/db.ts";
import type { Audience, GateReport } from "../gates/runGates.ts";
import { consentStatus, GateError } from "../ledger/repo.ts";
import type { Tier } from "../ledger/schemas.ts";

export interface ArtifactSubmission {
  workOrderId?: string;
  artifactType: string;
  title: string;
  audience: Audience;
  opportunityId?: string | null;
  accountId?: string | null;
  recipientContact?: string | null;
  recipientChannel?: "whatsapp" | "email" | "sms" | "phone" | "linkedin";
  content: unknown;
  renderedEn?: string | null;
  renderedAr?: string | null;
  evidenceTierMax: Tier;
  gateReport: GateReport | { passed: boolean; note: string };
  provenance: Record<string, unknown>;
}

export async function submitArtifact(q: Queryable, a: ArtifactSubmission, actor: string): Promise<string> {
  const hash = createHash("sha256")
    .update(canonicalJson({ content: a.content, en: a.renderedEn ?? null, ar: a.renderedAr ?? null }))
    .digest("hex");
  const id = (
    await q.query<{ id: string }>(
      `INSERT INTO artifacts (work_order_id, artifact_type, title, audience, opportunity_id, account_id, recipient_contact,
                              content, rendered_en, rendered_ar, content_hash, evidence_tier_max, gate_report, provenance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [a.workOrderId ?? null, a.artifactType, a.title, a.audience, a.opportunityId ?? null, a.accountId ?? null,
        a.recipientContact ?? null, JSON.stringify({ ...((a.content as object) ?? {}), ...(a.recipientChannel ? { recipient_channel: a.recipientChannel } : {}) }),
        a.renderedEn ?? null, a.renderedAr ?? null, hash, a.evidenceTierMax, JSON.stringify(a.gateReport), JSON.stringify(a.provenance)],
    )
  ).rows[0]!.id;
  await q.query("INSERT INTO approvals (artifact_id) VALUES ($1)", [id]);
  await audit(q, { actor, action: "submit", entity: "artifact", entityId: id, details: { type: a.artifactType, audience: a.audience, hash } });
  return id;
}

export interface QueueItem {
  artifact_id: string;
  artifact_type: string;
  title: string;
  audience: Audience;
  status: string;
  passed: boolean;
  requested_at: Date;
  rendered_en: string | null;
  rendered_ar: string | null;
  gate_report: GateReport;
}

export async function listQueue(q: Queryable, status: "pending" | "approved" | "rejected" | "all" = "pending"): Promise<QueueItem[]> {
  const rows = (
    await q.query(
      `SELECT a.id AS artifact_id, a.artifact_type, a.title, a.audience, p.status, p.requested_at, a.rendered_en, a.rendered_ar, a.gate_report
       FROM approvals p JOIN artifacts a ON a.id = p.artifact_id
       WHERE $1 = 'all' OR p.status = $1 ORDER BY p.requested_at, a.id`,
      [status],
    )
  ).rows;
  return rows.map((r) => ({
    artifact_id: r.artifact_id as string,
    artifact_type: r.artifact_type as string,
    title: r.title as string,
    audience: r.audience as Audience,
    status: r.status as string,
    passed: Boolean((r.gate_report as GateReport).passed),
    requested_at: new Date(r.requested_at as string),
    rendered_en: (r.rendered_en as string | null) ?? null,
    rendered_ar: (r.rendered_ar as string | null) ?? null,
    gate_report: r.gate_report as GateReport,
  }));
}

export async function decide(
  q: Queryable,
  artifactId: string,
  d: { actor: string; decision: "approved" | "rejected"; reason?: string; rules: BusinessRules },
): Promise<void> {
  if (!canApprove(d.rules, "artifact", d.actor)) throw new GateError(`${d.actor} may not approve artifacts`);
  const a = (
    await q.query<{ audience: Audience; gate_report: GateReport; recipient_contact: string | null; content: { recipient_channel?: string }; evidence_tier_max: Tier; provenance: { confidential_release_ids?: number[] } }>(
      "SELECT audience, gate_report, recipient_contact, content, evidence_tier_max, provenance FROM artifacts WHERE id = $1",
      [artifactId],
    )
  ).rows[0];
  if (!a) throw new GateError(`no artifact ${artifactId}`);
  if (d.decision === "rejected") {
    if (!d.reason?.trim()) throw new GateError("a rejection needs a reason, so the agent and the board can learn from it");
  } else {
    const external = a.audience === "client" || a.audience === "public";
    if (external && !a.gate_report.passed) {
      throw new GateError(`${artifactId} failed its gates; client material can't be approved until it passes. Reject it with a reason, or re-run it.`);
    }
    if (external && a.evidence_tier_max === "internal") {
      throw new GateError(`${artifactId} rests on internal evidence (costs, margins, payer bands); it can never leave.`);
    }
    if (external && a.evidence_tier_max === "confidential" && !(a.provenance.confidential_release_ids?.length)) {
      throw new GateError(`${artifactId} uses confidential evidence without Asil's release (S-G6).`);
    }
    if (a.recipient_contact) {
      const channel = a.content.recipient_channel ?? "email";
      const c = await consentStatus(q, a.recipient_contact, channel, "one_to_one");
      if (!c.granted) throw new GateError(`no recorded consent to contact ${a.recipient_contact} by ${channel}`);
    }
  }
  const res = await q.query(
    "UPDATE approvals SET status = $2, decided_by = $3, decided_at = now(), reason = $4 WHERE artifact_id = $1 AND status = 'pending' RETURNING artifact_id",
    [artifactId, d.decision, d.actor, d.reason ?? null],
  );
  if (res.rows.length === 0) throw new GateError(`${artifactId} was already decided`);
  await audit(q, { actor: d.actor, action: d.decision, entity: "artifact", entityId: artifactId, details: d.reason ? { reason: d.reason } : {} });
}
