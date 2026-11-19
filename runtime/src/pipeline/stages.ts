// Stage rules for both motions (spec §6 S1-04; business-development spec §3).
// Contracting follows the projects motion; elevators mirror the CRM's pipeline, which stays the master in Phase 1.

export const CONTRACTING_STAGES = [
  "signal", "capture", "prequalification", "invitation", "screened", "go", "submitted", "negotiation",
  "won", "lost", "no_bid", "withdrawn", "cancelled",
] as const;
export const ELEVATOR_STAGES = ["new", "contacted", "verified", "tech_review", "tech_ready", "quoted", "won", "lost"] as const;

export type ContractingStage = (typeof CONTRACTING_STAGES)[number];
export type ElevatorStage = (typeof ELEVATOR_STAGES)[number];
export type Stage = ContractingStage | ElevatorStage;
export type Motion = "contracting" | "elevator";

const CONTRACTING: Record<ContractingStage, ContractingStage[]> = {
  signal: ["capture", "prequalification", "invitation", "withdrawn"],
  capture: ["prequalification", "invitation", "withdrawn"],
  prequalification: ["invitation", "withdrawn"],
  invitation: ["screened", "no_bid", "withdrawn"],
  screened: ["go", "no_bid"],
  go: ["submitted", "withdrawn"],
  submitted: ["negotiation", "won", "lost", "cancelled"],
  negotiation: ["won", "lost", "cancelled"],
  won: [], lost: [], no_bid: [], withdrawn: [], cancelled: [],
};

const ELEVATOR: Record<ElevatorStage, ElevatorStage[]> = {
  new: ["contacted", "lost"],
  contacted: ["verified", "lost"],
  verified: ["tech_review", "quoted", "lost"], // a budget quote from the approved price book can go straight out
  tech_review: ["tech_ready", "lost"],
  tech_ready: ["quoted", "lost"],
  quoted: ["won", "lost", "tech_review"], // a revision goes back to the technical office
  won: [], lost: [],
};

export const TERMINAL = new Set<string>(["won", "lost", "no_bid", "withdrawn", "cancelled"]);

export function initialStages(motion: Motion): string[] {
  return motion === "contracting" ? ["signal", "capture", "prequalification", "invitation"] : ["new"];
}

export function isStage(motion: Motion, stage: string): stage is Stage {
  return (motion === "contracting" ? (CONTRACTING_STAGES as readonly string[]) : (ELEVATOR_STAGES as readonly string[])).includes(stage);
}

export function allowedNext(motion: Motion, from: string): string[] {
  const table = (motion === "contracting" ? CONTRACTING : ELEVATOR) as Record<string, string[]>;
  return table[from] ?? [];
}

export function isOpen(stage: string): boolean {
  return !TERMINAL.has(stage);
}

/** Loss reasons are an enumerated taxonomy (spec §10.8), never free text. */
export const LOSS_REASONS = [
  "price", "technical_score", "relationship", "compliance_disqualification", "programme", "scope_change",
  "client_cancelled", "lost_to_incumbent", "payment_terms", "no_decision", "other",
] as const;
export type LossReason = (typeof LOSS_REASONS)[number];
