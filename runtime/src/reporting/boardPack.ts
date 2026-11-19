// The weekly BD board pack (roster #12; code only in Phase 1). One 90-minute board a week is Asil's whole meeting
// budget for the department, so the pack lists decisions first, then proof, pipeline, alerts and evidence expiry.
// The weekly report lists decisions, not activity (sales spec §11, against gate fatigue).

import type { BusinessRules } from "../config/rules.ts";
import type { Db } from "../db/db.ts";
import { listQueue } from "../approvals/queue.ts";
import { projectProof } from "../ledger/proof.ts";
import { readEvidence, riyadhDate } from "../ledger/repo.ts";
import { listOpportunities, pipelineAlerts } from "../pipeline/engine.ts";
import { isOpen } from "../pipeline/stages.ts";

const m = (n: number) => `${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 })} m`;

export async function buildBoardPack(deps: { db: Db; rules: BusinessRules; now?: () => Date }): Promise<string> {
  const at = deps.now ? deps.now() : new Date();
  const today = riyadhDate(at);
  const opps = await listOpportunities(deps.db);
  const alerts = await pipelineAlerts({ db: deps.db, rules: deps.rules, now: () => at });
  const queue = await listQueue(deps.db, "pending");
  const evidence = await readEvidence(deps.db, { maxTier: "tender", readBy: "report:board_pack", purpose: "weekly board pack", on: today });
  const proofs = projectProof(evidence, deps.rules);
  const documented = proofs.filter((p) => p.documented);
  const out: string[] = [`# Business Development board pack, ${today}`];

  // 1. Decisions
  const pending = opps.filter((o) => o.stage === "screened" && o.scorecard && !o.scorecard.decision);
  const d: string[] = ["## 1. Decisions for Asil"];
  if (pending.length === 0) d.push("- No bid decisions waiting.");
  for (const o of pending) {
    const s = o.scorecard!;
    const due = new Date(s.decision_due);
    const hours = Math.round((due.getTime() - at.getTime()) / 3_600_000);
    const value = o.value_min_sar !== null ? `SAR ${m(o.value_min_sar)}–${m(o.value_max_sar ?? o.value_min_sar)}` : "value unknown";
    const issues = s.knockouts.filter((k) => k.status !== "pass").map((k) => `${k.code} ${k.status.toUpperCase()}: ${k.detail}`);
    const advice = s.overall === "fail" ? "Recommendation: no-bid, unless you override with a reason."
      : s.overall === "verify" ? "Recommendation: resolve the VERIFY items, then decide."
      : "Knock-outs clear: decide on the scorecard.";
    d.push(`- **Bid decision: ${o.title}** (${o.id}, ${value}). Knock-outs: ${s.overall.toUpperCase()}. ${hours >= 0 ? `Due in ${hours} h.` : `OVERDUE by ${-hours} h.`} ${advice}`);
    for (const i of issues) d.push(`  - ${i}`);
  }
  const blocked = queue.filter((q) => !q.passed && (q.audience === "client" || q.audience === "public"));
  d.push(`- Approval queue: ${queue.length} waiting${blocked.length ? `, ${blocked.length} blocked by the gates (reject with a reason or re-run)` : ""}.`);
  for (const q of queue) d.push(`  - ${q.artifact_id} ${q.artifact_type}: ${q.title}${q.passed ? "" : " (BLOCKED)"}`);
  out.push(d.join("\n"));

  // 2. Proof
  const p = deps.rules.proof_test;
  const pr: string[] = [`## 2. Proof: ${documented.length} of ${p.projects_required} projects documented (test due ${p.due})`];
  pr.push(`- Documented means contract value, start and completion dates, contract and completion certificate, all approved. Reference-ready (with referee consent): ${proofs.filter((x) => x.referenceReady).length}.`);
  for (const x of proofs) pr.push(`- ${x.projectRef}: ${x.documented ? "documented" : "NOT documented"}${x.missing.length ? `; missing ${x.missing.join(", ")}` : ""}`);
  if (proofs.length === 0) pr.push("- No project evidence on file yet.");
  out.push(pr.join("\n"));

  // 3. Pipeline
  const pl: string[] = ["## 3. Pipeline"];
  const open = opps.filter((o) => isOpen(o.stage));
  for (const motion of ["contracting", "elevator"] as const) {
    const mine = open.filter((o) => o.motion === motion);
    const byStage = new Map<string, typeof mine>();
    for (const o of mine) byStage.set(o.stage, [...(byStage.get(o.stage) ?? []), o]);
    pl.push(`- **${motion === "contracting" ? "Contracting (SAR 20–100 m main contracts)" : "Elevators and maintenance"}:** ${mine.length} open`);
    for (const [stage, list] of byStage) {
      const lo = list.reduce((n, o) => n + (o.value_min_sar ?? 0), 0);
      const hi = list.reduce((n, o) => n + (o.value_max_sar ?? o.value_min_sar ?? 0), 0);
      pl.push(`  - ${stage}: ${list.length}${motion === "contracting" && hi ? ` (SAR ${m(lo)}–${m(hi)})` : ""}`);
    }
  }
  out.push(pl.join("\n"));

  // 4. Alerts
  const al: string[] = [`## 4. Alerts (${alerts.length})`];
  for (const a of alerts) al.push(`- ${a.kind.replace(/_/g, " ")}: ${a.title} (${a.opportunityId}), ${a.owner}. ${a.detail}`);
  if (alerts.length === 0) al.push("- None.");
  out.push(al.join("\n"));

  // 5. Evidence expiry
  const horizon = Math.max(...deps.rules.evidence.expiry_alert_days);
  const expiring = evidence
    .filter((e) => e.expires_at && (Date.parse(e.expires_at) - Date.parse(today)) / 86_400_000 <= horizon)
    .sort((a, b) => a.expires_at!.localeCompare(b.expires_at!));
  const ex: string[] = [`## 5. Evidence expiring within ${horizon} days`];
  for (const e of expiring) ex.push(`- ${e.title} (${e.id}): ${e.expires_at}, ${Math.round((Date.parse(e.expires_at!) - Date.parse(today)) / 86_400_000)} days`);
  if (expiring.length === 0) ex.push("- None.");
  out.push(ex.join("\n"));

  // 6. Agent work
  const wo = (await deps.db.query<{ status: string; n: number }>("SELECT status, count(*)::int AS n FROM work_orders GROUP BY status ORDER BY status")).rows;
  out.push(["## 6. Agent work", ...wo.map((w) => `- ${w.status}: ${w.n}`), wo.length ? "" : "- No work orders yet."].join("\n").trim());

  return out.join("\n\n");
}
