// The merged department's agent roster (business-development spec §5): 38 components at full build, from the sales
// and marketing designs, merged. The board shows all of them; "live" ones run here, "planned" ones say when they
// come. Pure data, shared by the server and the tests.

export type RosterGroup = "spine" | "projects" | "elevators" | "proof";
export type Origin = "sales" | "marketing" | "both";

export interface RosterAgent {
  no: number;
  name: string;
  group: RosterGroup;
  /** Which roles from the two original designs it merges (S… sales, L/A/B/C/D… marketing). */
  merges: string;
  origin: Origin;
  engine: "code" | "model" | "code + model";
  /** 1 = by G0 (31 January 2027), 2 = by G1 (end of Q2 2027), 3 = when volume proves the need. */
  phase: 1 | 2 | 3;
  status: "live" | "planned";
  does: string;
  /** Who decides on what it produces. */
  gate?: string;
  note?: string;
  /** How the board runs it: a work order of this type, or a view where it works. */
  runs?: { artifactTypes?: string[]; view?: string };
}

export const GROUPS: Record<RosterGroup, { name: string; does: string }> = {
  spine: { name: "Spine", does: "Shared by every motion: dispatch, pipeline, gates, verification, reporting" },
  projects: { name: "Win: Projects", does: "Main contracts of SAR 20–100 m, from signal to signature" },
  elevators: { name: "Win: Elevators and maintenance", does: "Lift enquiries, quotes, follow-up and the installed base" },
  proof: { name: "Proof & Demand", does: "Case studies, the website, LinkedIn, elevator content and the public footprint" },
};

const PULLED_FORWARD = "Pulled forward from phase 2 on 19 November 2026 at Asil's request. Drafts only: everything lands in Approvals.";

export const ROSTER: RosterAgent[] = [
  // ---------------------------------------------------------------- Spine (12)
  { no: 1, name: "Dispatcher", group: "spine", merges: "S1-03; replaces marketing L1-03", origin: "both", engine: "code", phase: 1, status: "live",
    does: "Runs every agent's work order: per-type pipelines, retries with backoff, a dead-letter state, token budgets and a run log.",
    runs: { view: "agents" } },
  { no: 2, name: "Pipeline Engine", group: "spine", merges: "S1-04", origin: "sales", engine: "code", phase: 1, status: "live",
    does: "Stages for both motions, an owner, next step and date on every opportunity, knock-out screening, the 48-hour bid timer and SLA alerts.",
    gate: "Bid decisions: Asil (S-G1)", runs: { view: "pipeline" } },
  { no: 3, name: "One-to-one Drafter", group: "spine", merges: "S1-05", origin: "sales", engine: "model", phase: 2, status: "planned",
    does: "Drafts a message to one named contact, only on a channel the contact agreed to." },
  { no: 4, name: "Quality Gate", group: "spine", merges: "L1-02 + S1-02 + SB-07", origin: "both", engine: "model", phase: 2, status: "planned",
    does: "One judge with a rubric per artifact type, including the evaluator's chair for bids." },
  { no: 5, name: "Brand Gate", group: "spine", merges: "L0-01 + L0-07 + red-flag scanner port", origin: "marketing", engine: "code + model", phase: 1, status: "live",
    does: "Checks every client-facing word against the brand rulebook: the name, banned words, ranking claims, register and generic-AI patterns.",
    note: "The code part is live on every draft and in Check text. The model part is planned.", runs: { view: "check" } },
  { no: 6, name: "Bilingual Editor", group: "spine", merges: "L0-02 + L0-03", origin: "marketing", engine: "model", phase: 1, status: "live",
    does: "Writes the other language as a parallel original, carrying every figure across, in the right Arabic register.",
    gate: "Asil approves", runs: { artifactTypes: ["bilingual_edit"] } },
  { no: 7, name: "Fact and Evidence Verifier", group: "spine", merges: "L0-05 + SG-03", origin: "both", engine: "code + model", phase: 1, status: "live",
    does: "A second model pass lists every claim in a finished text; code checks each one against approved evidence, in context and by project.",
    note: "Runs inside every writer, and in Check text." },
  { no: 8, name: "Consent, PII and Compliance", group: "spine", merges: "L0-04 + SG-04", origin: "both", engine: "code", phase: 1, status: "live",
    does: "Removes personal data before any model call, keeps the consent log and enforces the four evidence tiers.",
    note: "Runs on every model call." },
  { no: 9, name: "Integrity Gate", group: "spine", merges: "SG-01", origin: "sales", engine: "code + model", phase: 2, status: "planned",
    does: "The hospitality register with its caps, and integrity flags to the compliance reviewer. An upheld flag blocks a bid." },
  { no: 10, name: "Commercial Guard", group: "spine", merges: "SG-02", origin: "sales", engine: "code + model", phase: 3, status: "planned",
    does: "Checks prices, terms and commitments in proposals against what was approved." },
  { no: 11, name: "Statistics", group: "spine", merges: "D-03 / SE-03 (ported code)", origin: "both", engine: "code", phase: 2, status: "planned",
    does: "Significance tests before anyone reads a campaign or win-rate change as real." },
  { no: 12, name: "Reporting and Board Pack", group: "spine", merges: "SE-04 + D-07 + D-02", origin: "both", engine: "code + model", phase: 1, status: "live",
    does: "The weekly board pack: decisions, proof, pipeline, alerts, expiring evidence, the installed base and the public footprint.",
    note: "The code part is live. Model commentary is planned.", runs: { artifactTypes: ["board_pack"] } },

  // ---------------------------------------------------------------- Win: Projects (9)
  { no: 13, name: "Opportunity Scout", group: "projects", merges: "SA-01 + SA-02 + D-04", origin: "both", engine: "code + model", phase: 2, status: "planned",
    does: "Finds tenders, prequalification notices and early signals in the SAR 20–100 m band." },
  { no: 14, name: "Pursuit Analyst", group: "projects", merges: "SB-01 + SB-03", origin: "sales", engine: "code + model", phase: 2, status: "planned",
    does: "Builds the scorecard and the capture plan for each pursuit.",
    note: "The scorecard itself is live in the Pipeline Engine." },
  { no: 15, name: "Tender Intake and Compliance", group: "projects", merges: "SB-02 + SB-04", origin: "sales", engine: "code + model", phase: 2, status: "planned",
    does: "Reads the tender documents on a server and lists every requirement, certificate and deadline." },
  { no: 16, name: "Proposal Writer", group: "projects", merges: "SB-05", origin: "sales", engine: "model", phase: 3, status: "planned",
    does: "Drafts technical proposals to the tender's weighted evaluation." },
  { no: 17, name: "Negotiation Prep", group: "projects", merges: "SB-08", origin: "sales", engine: "model", phase: 3, status: "planned",
    does: "Prepares the negotiation: positions, concessions and walk-away terms." },
  { no: 18, name: "Account Planner", group: "projects", merges: "SD-01 + SA-04 + SD-04", origin: "sales", engine: "model", phase: 2, status: "planned",
    does: "Plans each of the 20 priority organisations: who decides, what they need, the next move." },
  { no: 19, name: "Meeting Prep and Debrief", group: "projects", merges: "SD-02", origin: "sales", engine: "model", phase: 1, status: "live",
    does: "A one-page brief before Asil's meeting; afterwards, Asil's notes turned into decisions, commitments to check and next steps.",
    gate: "For Asil", runs: { artifactTypes: ["meeting_brief", "meeting_debrief"] } },
  { no: 20, name: "Prequalification and Evidence Manager", group: "projects", merges: "SB-06 + SD-03 + L0-06", origin: "both", engine: "code + model", phase: 1, status: "live",
    does: "Checks prequalification packs, tracks registrations and certificate expiry at 60, 30 and 7 days, and asks for references at handover.",
    gate: "Evidence approval: Asil and the bid coordinator (S-G5)", note: "The code part is live.", runs: { view: "proof" } },
  { no: 21, name: "Market and Outcome Analyst", group: "projects", merges: "SA-03 + SE-02 + D-05", origin: "both", engine: "code + model", phase: 3, status: "planned",
    does: "Award data, the competitor map and the win/loss review." },

  // ---------------------------------------------------------------- Win: Elevators and maintenance (6)
  { no: 22, name: "Acknowledgement", group: "elevators", merges: "SC-01", origin: "sales", engine: "code", phase: 2, status: "planned",
    does: "Acknowledges an enquiry on the page and in customer-started chats; a one-time code before any SMS or email.",
    note: "After the 30-day read of the first campaign." },
  { no: 23, name: "Call Notes and Qualifier", group: "elevators", merges: "SC-02", origin: "sales", engine: "model", phase: 2, status: "planned",
    does: "Turns the desk's call notes into a qualified enquiry." },
  { no: 24, name: "Call Brief", group: "elevators", merges: "SC-03", origin: "sales", engine: "code", phase: 2, status: "planned",
    does: "A brief for the desk before each call back." },
  { no: 25, name: "Quote Builder", group: "elevators", merges: "SC-04", origin: "sales", engine: "code", phase: 2, status: "planned",
    does: "Budget and detailed quotes from the approved price book." },
  { no: 26, name: "Follow-up Engine", group: "elevators", merges: "SC-05", origin: "sales", engine: "code", phase: 2, status: "planned",
    does: "Follow-up dates and reminders on every open quote.",
    note: "Until it's built, the board shows the CRM's own follow-up and SLA flags." },
  { no: 27, name: "Installed Base and Maintenance Registry", group: "elevators", merges: "SC-06", origin: "sales", engine: "code", phase: 1, status: "live",
    does: "Every lift installed or maintained, with the owner's agreement, warranty and contract ends, inspections and registrations; renewals become opportunities.",
    runs: { view: "lifts", artifactTypes: ["maintenance_renewals"] } },

  // ---------------------------------------------------------------- Proof & Demand (11)
  { no: 28, name: "Case-Study and Reference Writer", group: "proof", merges: "B-04", origin: "marketing", engine: "model", phase: 1, status: "live",
    does: "A short English and Arabic case study from approved evidence only; every figure is checked.",
    gate: "Asil approves", runs: { artifactTypes: ["case_study"] } },
  { no: 29, name: "Web Page Writer", group: "proof", merges: "C-03 + C-04", origin: "marketing", engine: "model", phase: 2, status: "live",
    does: "Rewrites a page of the live website that failed the site check, in both languages, with its title and description.",
    gate: "Asil approves", note: `${PULLED_FORWARD} The spec waits for the website decision on 10 December for new pages; fixing the live copy doesn't.`,
    runs: { artifactTypes: ["web_page"] } },
  { no: 30, name: "Executive Voice and company LinkedIn", group: "proof", merges: "B-01 + B-06", origin: "marketing", engine: "model", phase: 2, status: "live",
    does: "LinkedIn posts for the company page and for Asil's own account, each in its own voice, from approved evidence.",
    gate: "Asil approves", note: PULLED_FORWARD, runs: { artifactTypes: ["linkedin_post"] } },
  { no: 31, name: "Entity and Listings Record", group: "proof", merges: "C-06 + C-07", origin: "marketing", engine: "code", phase: 1, status: "live",
    does: "One master company record, approved by Asil, and every public listing compared with it field by field.",
    gate: "Asil approves the record", runs: { view: "website" } },
  { no: 32, name: "Site Checker", group: "proof", merges: "C-05 + C-02 (ported code)", origin: "marketing", engine: "code", phase: 1, status: "live",
    does: "Checks the live website against the G0 bar: nothing false, working contacts, both languages, an enquiry form with consent wording.",
    runs: { artifactTypes: ["site_check"], view: "website" } },
  { no: 33, name: "AI-Visibility Check", group: "proof", merges: "C-08", origin: "marketing", engine: "model", phase: 1, status: "planned",
    does: "A quarterly check of how AI answer engines describe Qottuf. Not a Tier 1 measure.",
    note: "One baseline run is due in phase 1; not run yet." },
  { no: 34, name: "Elevator Ad and Content Drafter", group: "proof", merges: "B-02 + B-03", origin: "marketing", engine: "model", phase: 2, status: "live",
    does: "Elevator posts, ads and reel scripts for consumers, in the elevator register; reels use real footage only.",
    gate: "Asil approves", note: PULLED_FORWARD, runs: { artifactTypes: ["elevator_ad"] } },
  { no: 35, name: "Campaign Data Intake", group: "proof", merges: "D-01", origin: "marketing", engine: "code", phase: 2, status: "planned",
    does: "Pulls campaign and enquiry numbers into one place for the board." },
  { no: 36, name: "Visual Brief", group: "proof", merges: "B-05", origin: "marketing", engine: "code + model", phase: 2, status: "planned",
    does: "Briefs for visuals from real photography and configurator footage only; the no-fake-imagery rule in code." },
  { no: 37, name: "Publishing Staging", group: "proof", merges: "B-08", origin: "marketing", engine: "code", phase: 2, status: "planned",
    does: "Formats approved material for each channel and checks the English–Arabic pairing before anyone posts it by hand." },
  { no: 38, name: "DNS and Deliverability Check", group: "proof", merges: "A-05 (ported code)", origin: "marketing", engine: "code", phase: 1, status: "live",
    does: "Checks that quotes sent from the company's email domain can't be spoofed and won't land in spam.",
    runs: { artifactTypes: ["mail_domain_check"], view: "website" } },
];

/** Phase 1 by the spec: #1, 2, 5, 6, 7, 8, 12, 19, 20, 27, 28, 31, 32, 38, plus one baseline run of #33. */
export const PHASE_1 = [1, 2, 5, 6, 7, 8, 12, 19, 20, 27, 28, 31, 32, 38];

export function rosterSummary(roster: RosterAgent[] = ROSTER) {
  const by = (pred: (a: RosterAgent) => boolean) => roster.filter(pred).length;
  return {
    total: roster.length,
    live: by((a) => a.status === "live"),
    planned: by((a) => a.status === "planned"),
    sales: by((a) => a.origin === "sales"),
    marketing: by((a) => a.origin === "marketing"),
    both: by((a) => a.origin === "both"),
    groups: (Object.keys(GROUPS) as RosterGroup[]).map((g) => ({
      group: g, ...GROUPS[g], total: by((a) => a.group === g), live: by((a) => a.group === g && a.status === "live"),
    })),
  };
}

/** The roster agent that produces a given artifact type. */
export function agentForArtifact(type: string): RosterAgent | undefined {
  return ROSTER.find((a) => a.runs?.artifactTypes?.includes(type));
}
