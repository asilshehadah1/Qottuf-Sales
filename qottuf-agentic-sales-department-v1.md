# Qottuf Aljazeera — Agentic Sales Department
### Architecture Specification v1.0 · 18 November 2026
*The sales twin of `qottuf-agentic-marketing-department-v1.md` (repo `qottuf-marketing-ai`). Written to be handed to Claude Code as the source of truth. Built from a read of all six Qottuf repositories and a study of Saudi procurement and the Riyadh market as of November 2026. Every workflow was challenged; the weakness log is §16.*

> **The one-paragraph version.** Qottuf does not first need more leads. It needs a conversion system: a named person who owns revenue, one pipeline for contracting work (none exists today), bid discipline that spends scarce estimating hours only on winnable tenders, zero-defect compliance, speed and follow-through on every elevator enquiry, and a loop that learns from every win and loss, including the prices competitors win at. AI agents are the staff that let a small team operate like a large one. They find, filter, prepare, check, remind and learn. Humans decide, price, call, negotiate and send.

---

## Contents
0. What I Found: the current revenue engine
1. Strategic Premise: how Qottuf actually wins work
2. Market Study: where conversion happens (November 2026)
3. Design Principles
4. The Human Sales Organisation
5. Org Chart
6. Layer 1: Revenue Orchestration
7. Layer 0: Governance
8. Layer 2: The Five Desks
9. The Six Workflows (step by step, each one challenged)
10. Playbooks the Agents Enforce
11. Human Gates and the Delegation Matrix
12. Data Contracts and Integrations
13. Infrastructure, Models, Security and PDPL
14. Metrics and the Learning Loop
15. Build Sequence (revenue-first)
16. Red-Team Log: every weakness found and how it was fixed
17. Where This Design Is Still Most Likely to Fail
18. Decisions Needed from Asil
19. What to Hand Claude Code
- Appendix A: Fix-this-week list (no agents needed)
- Appendix B: Sources

---

## 0. What I Found: the current revenue engine

Read across `qottuf-marketing-ai`, `qottuf-elevator-configurator` (configurators + CRM), `qottuf-estimation`, `qottuf-technical-agent`, `qottuf-project-tracker` and `qottuf-website`, plus the `qottuf-brand` fact base.

### 0.1 Contracting

| # | Finding | Evidence |
|---|---|---|
| C1 | **Nobody owns sales.** The 45 positions modelled from the real org chart (GM, Deputy GM, PMO, Construction and MEP Directors, Commercial and Procurement Managers) include no sales, business-development, estimating or tender role. | `qottuf-project-tracker/backend/app/services/positions.py` |
| C2 | **No pipeline for contracting work.** The only CRM is shaped around elevator quotations. Tenders, private invitations and subcontract packages live nowhere. | `qottuf-elevator-configurator/crm/` |
| C3 | **The website cannot capture contracting demand.** Live site (branch `content-update-aug2026`): one page, phone and email only. No enquiry or RFQ form, no WhatsApp, no analytics, no Arabic URL or hreflang, no service, sector or case-study pages, no downloadable profile or prequalification pack. The main "Call the office" button may dial a retired landline (code comment in the live configurator, `elevators/simple/index.html` ~line 2431). Hero buttons point to sections that don't exist. | `qottuf-website` |
| C4 | **Public claims a procurement reviewer can contradict.** "13+ Years" (founded 2014; the brand bans years-of-experience claims), "13 Key Projects" beside "fourteen", "more than two hundred people" (no source), ministry logos including the Ministry of Interior (fact-base rule: PRJ-007's client is never named). A reviewer who compares a tender submission with the website sees two different companies. | live site vs `qottuf-brand/references/facts-and-claims.md` |
| C5 | **Pricing never hears from the market.** The bid price is pure cost-plus. Nothing records a client tender's outcome, the winning price, competitors or loss reasons. "Awards" in the estimation system are awards *to suppliers*. Two divergent code lines exist (`main`, and `claude/estimation-agent-audit-8c7886`, which appears to run the live site); migrations 0004–0011 conflict. Every margin parameter except VAT is empty. | `qottuf-estimation` |
| C6 | **Tender reading is strong but stops before the decision.** The tender-reader produces a sourced deadline calendar, terms and risk sheet, eligibility checks (including classification), BOQ exposure and clarification drafts. It has no bid/no-bid logic, no capability matching and no pricing; pilot outputs (PSU car park) have not been checked by an engineer. | `qottuf-technical-agent/skills/tender-reader/` |
| C7 | **Prequalification evidence is thin.** The public fact base has 12 verified projects but no contract values, completion dates, reference contacts, completion certificates or tender-use permissions. PRJ-001 contradicts itself (named a college, summarised as a female students' club; the tracker holds a "Female Students Club (FC05)" programme). | marketing `fact_base/projects.json` (branch `claude/fill-brand-dna-knowledge-base`), tracker `samples/` |
| C8 | **Delivery proof will come from the tracker**, which records dates, earned value, quality and HSE. It is not live on a real project yet, has no consent-to-reference flag and no service accounts for integration. | tracker `docs/` |

### 0.2 Elevators

| # | Finding | Evidence |
|---|---|---|
| E1 | **A working funnel exists and is Qottuf's strongest sales asset:** configurator → CRM → support verifies → technical office prices → quote → won/lost, with RBAC, MFA, audit log, SLA flags and cycle-time metrics. There is no sales manager; support closes, technical prices. | `qottuf-elevator-configurator/AGENTS.md` |
| E2 | **Slow by design:** first-contact SLA 24 h, technical pricing SLA 48 h. | `crm/src/workflow.js` |
| E3 | **Price coverage gaps:** 19 of 41 sizes have a cost; the rest show "Contact us for pricing". Observation, bed and automobile lifts are unpriced. The stair-lift add-on is priced about ten times too low. | `pricing/HOW-TO-PRICE.md` |
| E4 | **The negotiation floor is public.** The technical configurator, described in code as "the margin range your sales team negotiates within", is linked in the public menu: a 450 kg passenger lift shows 56,500–73,000 SAR before installation and tax, against the public "from 70,000 SAR including installation and two-year warranty". | website, `elevators/technical/index.html` |
| E5 | **Leads can stall silently.** A failed submission sits in the visitor's own browser until they revisit. The page says "Sent to <email>" but sends no email. No privacy notice or consent on any form. | website |
| E6 | **The system can't learn why it loses.** Lost reasons are free text. The `source` field (enduser / dealer / manual) can't attribute a lead to a campaign. Meta lead forms are not connected to the CRM. | `crm/src/routes/dashboard.js`, `marketing/riyadh-two-week-campaign.md` |
| E7 | **Trust proof is missing.** "Fuji Japan" is the differentiator, but several unrelated elevator brands use the Fuji name in Saudi Arabia: FUJIHD (agent: Atlas Elevators, five-year agreement from 2025), Asia Fuji (distributor: Alfaneyah since 2014) and Fujitec (a separate Japanese manufacturer with its own Saudi subsidiary). No repo holds the manufacturer's legal name, Qottuf's agreement, SABER conformity certificates, warranty or maintenance terms. A consultant's first question will be "which Fuji?" | Appendix B |
| E8 | A funded Meta campaign (SAR 2,000, 27 Sep–10 Oct 2026) was planned. Its results are in no repo. | `marketing/riyadh-two-week-campaign.md` |

### 0.3 Cross-cutting

- **Data residency is undecided.** The CRM runs on Vercel + Turso; the tracker demo on US hosting. PDPL transfer safeguards are not documented anywhere.
- **API drift in the marketing spine.** Its agents force a tool call (`tool_choice: {type: "tool"}` in `src/agents/base.ts`) and default to `claude-opus-4-1-20250805` / `claude-sonnet-5`. Forced `tool_choice` returns a 400 on Claude Opus 5.5 and Sonnet 5.5. The sales build uses structured outputs instead; marketing needs the same change before it upgrades models.
- **Duplicate copies and fragile integration history:** OneDrive copies of the elevator folder and website; the CRM once received a new empty database on each of three deploys. Integration must go through APIs, never direct database writes, with contract tests.
- **Reusable assets:** the CRM's capability-based RBAC, MFA and audit pattern; the tracker's numeric grounding check (`grounding.py` rejects any sentence containing a number not in the supplied facts); marketing's governance chain, Zod schemas and D-03 statistics veto; the tender-reader's extraction contract; estimation's Price Book and insights.

### 0.4 The diagnosis, ranked by revenue at stake

1. **No owner of revenue.** Agents cannot fill this. Everything below depends on it.
2. **Contracting demand has nowhere to land** (no form, no RFQ path, no pipeline).
3. **Inconsistent public claims** that a procurement reviewer will notice.
4. **The elevator funnel leaks** at speed (24 h), price coverage (22 of 41 sizes), follow-up, trust proof ("which Fuji"), and price exposure (dealer floor public).
5. **Pricing is blind to the market** (no outcomes, no award prices, no loss reasons).
6. **The tools exist in pieces** (CRM, two estimation lines, tender-reader, tracker, marketing spine) and none of them talk to each other.

---

## 1. Strategic Premise: how Qottuf actually wins work

Qottuf sells two different things into two different buying systems. One generic "sales funnel" would serve neither.

| | Motion A: Contracting (projects) | Motion B: Elevators (product + installation) |
|---|---|---|
| Ticket | High | Mid, per unit; multi-unit for buildings |
| Volume | Low: dozens of opportunities a year | Higher: hundreds of enquiries a year possible |
| Buyer | Committees: owner + consultant/PMC + procurement; or a main contractor buying a package | Homeowner, apartment-block investor, contractor, engineering office, consultant |
| Route to buy | Etimad public tenders (government, including public universities), invited private tenders via consultants, subcontract packages, direct negotiation with repeat clients, direct purchase for small values | Configurator, ads, WhatsApp, referral → two to four quotes → site check → decision; or consultant specification → main contractor procurement |
| What decides | Eligibility and compliance (pass/fail), then price among compliant bidders; track record and relationships at the margin; pre-tender influence decides who is invited and how specifications read | Speed, trust (origin, certificates, after-sales), price clarity, fit to the shaft and construction stage, maintenance confidence |
| Where AI helps most | Finding and filtering, bid/no-bid discipline, compliance completeness, proposal quality, learning from awards | Speed-to-lead, follow-through, call preparation, quote clarity, installed-base revenue |

**Three laws that shape every agent below:**

1. **Most tendered work is decided before the bid is written:** by who is registered and invited, how the specifications read, and whether you are priced to win. The system therefore invests in capture (pre-tender) and selection (bid/no-bid), not only in proposal writing.
2. **Human capacity is the binding constraint, not leads.** Estimating hours, technical-office hours and senior attention are finite. Every no-bid on a low-probability tender frees capacity for a winnable one. Win rate is managed by choosing.
3. **Speed and follow-through convert inbound.** In an audit of 2,241 US companies, firms that tried to contact a web lead within an hour were nearly seven times as likely to qualify it as firms that responded even an hour later (Oldroyd, McElheran and Elkington, HBR 2011). Most lost quotes die in silence, not in competition.

**The conversion engines, in order of return on effort:**

1. **Repeat and expand** at accounts Qottuf already serves (King Saud University and its Endowments, Prince Sultan University, the bank formerly NCB (now SNB), InterHealth, DAMAC). Cheapest win, incumbent advantage, and the new procurement law widens both direct purchase and contract variations (§2.4).
2. **Selective, compliant, well-priced bidding** on tenders and subcontract packages.
3. **Fast, disciplined inbound conversion** for elevators, and for contracting once the website can capture it.
4. **Being specified** (longer horizon): Qottuf on consultants' and main contractors' approved lists; Qottuf's elevators in consultants' specifications.

**Anti-goals:**
- An AI "SDR" sending cold email or WhatsApp at volume. PDPL makes consent the default for marketing messages, Meta can ban the number, and institutional buyers read it as desperation.
- Optimising win rate by chasing easy, thin-margin jobs. The north star is margin won (§14).
- AI-written proposals containing anything that can't be proven. One fabricated credential ends a vendor relationship.
- Building forty agents before one riyal is attributable to the system. The marketing build reached 44 agents with nothing yet reaching the outside world; sales is measured in SAR won, so it is built depth-first (§15).

---

## 2. Market Study: where conversion happens (November 2026)

Sources are in Appendix B. Figures from single or secondary sources are marked; nothing here is a forecast.

### 2.1 Direction of the market

- **Giga-projects reprioritised.** The PIF dropped The Line and Trojena from its 2026–30 strategy in August 2026. Contractor capacity is moving to Expo 2030 Riyadh (main buildings from Q3 2026; convention-centre design-and-build tender drew interest in September 2026) and to handovers at Red Sea, Qiddiya and Diriyah.
- **A buyer's market.** Contractors report more competition per contract and cost pressure on lump-sum work without escalation clauses. Analysts expect fewer, stronger contractors, more joint ventures and higher prequalification thresholds.
- **Awards are still strong.** The Saudi Contractors Authority recorded SAR 111 bn of awards January–July 2026, up almost 60% year on year (reported by AGBI). Government tenders launched on Etimad reached SAR 336.3 bn in 2024 (LCGPA).
- **What this means for a Grade 3, Riyadh, mid-sized contractor:** the opportunity is institutional and commercial work below the giga tier, subcontract packages under Tier-1s that are redeploying to Expo and data centres, and fit-out driven by regional headquarters. The threat is thinner prices and stricter prequalification, where compliance and estimating precision decide.

### 2.2 Demand pockets mapped to Qottuf's proof

| Pocket | 2026 evidence | Qottuf proof that matches | Route to buy |
|---|---|---|---|
| Riyadh office fit-out | 700+ regional HQs licensed; Grade A occupancy 98%; 2.5 m sqm of new Grade A due by 2030, with 2026 completions slipping; occupiers favour ready, fitted space; flex operators growing | PRJ-009 tenant fit-out, 13 floors, about 29,000 sqm; PRJ-006 bank branches | Landlord/developer fit-out tenders via PMCs; tenants direct; flex operators |
| Data centres | Humain 100 MW Riyadh EPC RFP (Oct 2026); Hassan Allam / Sterling & Wilson ~USD 200 m Riyadh data centre (Oct 2026); SDAIA 480 MW Hexagon, SAR 10.1 bn (Jan 2026); Airtrunk 250 MW | PRJ-004 DAMAC data centre external works | Subcontract packages under the EPCs: external works, MEP, admin-area fit-out, elevators |
| Healthcare | NCP PPP programme (147 opportunities from a 500+ pipeline); 200-bed hospital in Riyadh (Almana / New Murabba, Aug 2026) | PRJ-003 InterHealth 100-bed fit-out; PRJ-002 / PRJ-008 KSU medical buildings | PPP consortia and their EPCs; private hospital groups; fit-out packages |
| Education | Repeat KSU and PSU work | PRJ-001, -002, -005, -008, -009, -011 | Etimad (KSU), invited (PSU), direct purchase and variations |
| Expo 2030 Riyadh | Infrastructure awarded (Nesma & Partners, Al Yamama); buildings from Q3 2026 | Turnkey, MEP, fit-out, elevators | Packages from Expo main contractors, mostly 2027+ |
| Elevators: villas and residential | Riyadh housing shifting toward apartments (Arizton); villa demand real but unmeasured | Configurators; PRJ-005 (6 elevators), PRJ-009 elevator completion | Homeowners, villa contractors, engineering offices, apartment investors |
| Elevators: institutional | Consultant-specified; OEMs present (Fujitec, Otis, KONE, Schindler, TK Elevator, Mitsubishi Electric) | PRJ-005 | Specification with consultants; MEP subcontractors; Etimad |

### 2.3 How each buyer actually buys: the conversion map

| Buyer | How they buy | What decides | Where deals are won or lost | Qottuf's lever |
|---|---|---|---|---|
| Government entity (incl. public universities such as KSU) | Etimad tender; direct purchase for small values; frameworks | Eligibility → technical compliance → lowest evaluated price | Registration and eligibility; document completeness; price; being known for small works | Current registrations; zero-defect submissions; price-to-win data; responsiveness at existing accounts |
| Private institution (PSU, private hospitals, banks) | Invited tender via consultant/PMC; negotiation with known suppliers | Consultant recommendation; same-scope track record; price; relationship | Getting on the invite list; the consultant's view; clarity of the offer | Consultant coverage; reference visits to delivered projects; capture plans; account plans |
| Developer, landlord, HQ tenant (fit-out) | Design-and-build or fit-out tender via PMC; time-to-occupy matters | Time certainty, price, references | Proposal speed; schedule credibility | Fast fit-out proposals; PRJ-009 proof; a credible programme |
| Main contractor (subcontract package) | Vendor registration → package RFQ → negotiation | Price, capacity, reliability, payment terms | Being registered; RFQ turnaround; past performance with them | Registration ledger; fast estimating turnaround; reliability record |
| Homeowner (villa elevator) | Ads, search, WhatsApp, referral → 2–4 quotes → site check | Trust, price clarity, look, after-sales, timing | First response; quote clarity; follow-up; origin and service proof | Speed; configurator; comparison sheet; origin proof; disciplined follow-up |
| Contractor or engineering office (elevators) | Specification → quotes from regular suppliers | Specification fit, price, delivery, reliability | Being on their supplier list; being specified at design | Partner programme; specification packs; gated technical configurator |
| Apartment investor (elevators, multi-unit) | Price-driven, several units | Price per unit, delivery, maintenance | Price and speed | Volume pricing from the technical office; fast quotes |

**The most important timing fact in elevator sales:** the shaft, pit and headroom are fixed at the structural design stage. A buyer reached then can be locked in by coordinating the shaft with their engineer; a buyer reached at finishing stage is shopping on price. The Elevator Desk prioritises stage, not only budget (§10.6).

### 2.4 Rules of the game (verify before relying; several are changing now)

| Rule | What it says | Sales implication |
|---|---|---|
| **New Government Tenders and Procurement Law** | Approved August 2026; reported as Royal Decree M/76, published 4 Sep 2026; in force 120 days after publication (about early January 2027); implementing regulations to follow. Direct-purchase ceiling SAR 100k → **SAR 1 m**; contract variations without re-tender **10% → 20%**; entities must settle dues before new commitments; performance guarantees standardised. Whether these apply to works contracts is not yet confirmed. | Being the known, registered, responsive contractor at existing accounts becomes a direct revenue channel for small works; expanding inside live contracts becomes a real lever. Re-verify every tender rule in this spec when the implementing regulations publish. |
| Old GTPL rules still widely cited | Bid guarantee 1–2%, performance bond 5%, 90 working days' validity; bids ≥25% below estimate could be excluded only after review and negotiation. | The bid/no-bid check includes guarantee capacity; the price-to-win analysis flags abnormally low competitors. Re-verify under the new regulations. |
| Etimad transparency | Award notices are published; visibility of the winner, value and other bidders varies by entity and tender. | An award-price dataset is buildable from public data, with stated coverage. |
| Local content (LCGPA) | 10% price preference for national products; Mandatory List expanded from 1 March 2026, targeting ~2,000 products in 2026; local-content rules extended to majority state-owned companies. | Check whether elevators or their components are on the list: imported units may carry a 10% evaluation handicap in government tenders. Unknown today. |
| Contractor classification | Grade sets the maximum project value per government contract; 2025 amendments on splitting large projects. | The exact Grade 3 building ceiling is the first bid/no-bid knock-out. Not in any repo; Phase 0 item. |
| Saudi Contractors Authority / Muqawil | Projects Platform (owners obtain quotations); Contractors Consortium Platform (find JV partners); PIF and Airport Holding contractor prequalification via Muqawil. | Registration and profile completeness are lead channels; JVs open tenders above Grade 3. |
| PDPL | Consent is the default for advertising and direct marketing; legitimate interest is narrow and needs an assessment; transfers abroad need safeguards (SCCs, risk assessment). SDAIA's draft amendments (consultation closed 5 Nov 2026) may add in-country storage and make "emerging technologies" an impact-assessment trigger. Anti-spam rules also govern calls and messages. | No cold bulk outbound. A consent ledger. Pseudonymise personal data before any model call. A DPIA before go-live. |
| WhatsApp Business Platform | Per-message pricing since July 2025; template categories (marketing, utility, authentication); opt-in required; service-message charging changes from 1 Oct 2026 (sources differ). | WhatsApp for customer-initiated conversations and approved utility templates; budget per message; never a marketing blast. |
| Elevator conformity | SASO technical regulation for lifts; SABER product and shipment certificates of conformity; acceptance and periodic inspection are mandatory under SASO-TR (per TÜV SÜD). | SABER certificates belong in the Evidence Vault; periodic inspection and maintenance create a recurring-revenue hook. |
| Anti-bribery | Saudi Anti-Bribery Law as amended (2021 amendments extended reach into the private sector dealing with public authorities and added corporate liability); Nazaha expects controls on gifts, hospitality and facilitation payments. | A non-overridable Integrity Gate (§7). |

### 2.5 Competitive reality (sales lens)

- **Elevators:** global OEMs with Saudi presence compete for consultant-specified work; many importer-integrators sell Asian brands on price. Three different "Fuji" names operate in the market. Qottuf has to prove exactly which manufacturer, its origin and certification, and its after-sales capacity, or a cheaper "Fuji" quote looks equivalent.
- **Contracting:** Riyadh mid-tier contractors compete on price in a buyer's market. Tier-1s (Nesma & Partners, Al Yamama, Hassan Allam and others) take the big packages and buy subcontract scopes.
- **What is not claimed here:** market shares or win rates. The Award Intelligence agent (SA-03) builds the real competitive map from Etimad award data within 90 days of going live.

### 2.6 What could not be verified (decide with data, not folklore)

Qottuf's historical win rates and bid volumes; seasonality (whether awards cluster around the budget cycle, Ramadan or summer is tested from Etimad award dates, not assumed); the Grade 3 ceiling; whether elevators sit on the LCGPA Mandatory List; villa-elevator demand in Riyadh; the company's actual revenue mix (a tracker code comment says RC-frame villas are "the work Qottuf does most", which conflicts with the institutional positioning); the Meta campaign's results; whether the new GTPL's direct-purchase and variation rules cover works contracts.

---

## 3. Design Principles

Principles 1–8 are inherited unchanged from the marketing spec (§1 there): one agent = one job; the author is never the reviewer; no unsourced claims; structured self-challenge; Arabic is a parallel original; human gates are permanent; every agent emits a structured envelope; fail loud. Sales adds eight:

9. **Humans own relationships and numbers.** No agent sends to a live prospect, sets a price, offers a discount, promises a date or signs anything. Agents prepare; humans decide and send. The only exception is the deterministic acknowledgement in §8 Desk C (pre-approved text, no model involved).
10. **Capacity is the scarce resource.** Every agent output is judged by whether it moves human hours toward higher expected value (value × margin × win probability × strategic value), never by volume.
11. **Every open opportunity has an owner, a next step and a date.** A record without all three is invalid, enforced in code like the CRM's `TRANSITIONS` table.
12. **Learn from outcomes, not activity.** The system measures SAR won, margin, win rate by segment, cycle time and reasons. It never celebrates emails sent.
13. **Clean selling.** No inducements, no gifts or hospitality to officials or evaluators, no contact with an evaluating entity outside official channels during a live tender, no use of competitor information without a lawful source. Integrity rejections cannot be overridden by anyone.
14. **Data minimisation.** Agents work on opportunity and account IDs. Names, phone numbers and emails stay in the system of record and are pseudonymised before any model call.
15. **Deterministic wherever possible.** Scoring arithmetic, deadlines, expiry tracking, SLA timers, statistics, deduplication and commercial checks are code, not a model's opinion.
16. **Every agent earns its place.** Each one has a kill metric reviewed eight weeks after launch. An agent that doesn't move its metric is deleted, not tuned forever.
17. **Untrusted input is data, never instructions.** Tender documents, supplier and client emails, WhatsApp messages, portal pages and web articles can carry text written to steer a model. Agents that read them have no tool that acts outside the system (and no agent can send anything at all), their outputs are schema-constrained, and anything in an input that reads like an instruction is flagged to a human instead of followed.

---

## 4. The Human Sales Organisation

Agents can't own revenue, attend a majlis, read a room or be accountable. The design assumes this minimum team; the first column is the gap that blocks everything else.

| Role | Owns | Likely holder today (confirm) | Load |
|---|---|---|---|
| **Head of Business Development** (revenue owner) | Pipeline and targets; bid/no-bid below threshold; key accounts; consultant and main-contractor relationships; approves agent plans | **Nobody.** Candidates: Deputy GM or Commercial Manager with a reduced load, or a hire | Full-time |
| Bid coordinator | Tender calendar, Etimad and portal submissions, Evidence Vault, registrations | Commercial department or document control | Half to full-time |
| Estimator / QS | Pricing in `qottuf-estimation` | Commercial department | Existing |
| Technical reviewer | Tender technical review, method statements, clarifications | MEP or Construction Director; BIM manager | Per bid |
| Elevator sales desk | Calls, verification, quotes sent, closing | CRM `agent` role (support) | Existing (about two people) |
| Elevator technical office | Elevator pricing and technical answers | CRM `technical` role | Existing |
| Principal | Strategy, large bids, pricing above threshold, gates, executive sponsor for top accounts | Asil | Batched: 20 minutes a day, one hour a week |

**Every role has a named backup.** When an SLA lapses, the Pipeline Engine routes the item to the backup; a gate held by Asil falls to a named deputy for values below a second threshold that Asil sets. Leave, Hajj, Ramadan hours and site days are entered in the roster, so SC-01 never promises a callback the roster can't keep.

**Why the Head of BD comes first:** without one, the system becomes an expensive briefing machine that nobody acts on. With one, the agents give that person a research analyst, a bid manager, a proposal writer, a compliance checker and a sales-operations analyst.

---

## 5. Org Chart

```
                        ┌──────────────────────────────┐
                        │      ASIL (Principal)        │
                        │ strategy · big bids · gates  │
                        └──────────────┬───────────────┘
                                       │
                        ┌──────────────▼───────────────┐
                        │  HEAD OF BD (human)          │
                        │  owns pipeline and revenue   │
                        └──────────────┬───────────────┘
                                       │
                        ┌──────────────▼───────────────┐
                        │ S1-01 REVENUE ORCHESTRATOR   │  L1 (from Phase 5)
                        │ weekly battle plan, capacity │
                        └──────────────┬───────────────┘
                                       │
     ┌─────────────────────────────────┼──────────────────────────────────┐
     │                                 │                                  │
┌────▼──────────────┐    ┌─────────────▼──────────────┐    ┌──────────────▼───────┐
│ GOVERNANCE (L0)   │◄───┤ S1-03 DISPATCHER +         ├───►│ S1-02 DEAL DESK      │
│ marketing L0 +    │    │ S1-04 PIPELINE ENGINE      │    │ REVIEWER (QA gate)   │
│ 4 sales gates     │    │ (code, not LLM)            │    │ author ≠ judge       │
└───────────────────┘    └─────────────┬──────────────┘    └──────────────────────┘
                                       │   S1-05 Correspondence Drafter (shared)
     ┌──────────────┬──────────────────┼──────────────────┬───────────────────┐
     │              │                  │                  │                   │
┌────▼────┐   ┌─────▼─────┐     ┌──────▼──────┐    ┌──────▼──────┐     ┌──────▼──────┐
│ DESK A  │   │  DESK B   │     │   DESK C    │    │   DESK D    │     │   DESK E    │  L2
│ INTEL   │   │ BIDS &    │     │  ELEVATOR   │    │ ACCOUNTS    │     │  REVENUE    │
│ find    │   │ CAPTURE   │     │  DESK       │    │ grow        │     │  LEARNING   │
│ 4 agents│   │ win · 8   │     │ convert · 7 │    │ 4 agents    │     │ learn · 5   │
└─────────┘   └───────────┘     └─────────────┘    └─────────────┘     └─────────────┘
```

**Total: 37 components**: 30 that call a model somewhere, 7 that are pure code (S1-03, S1-04, SG-02, SG-04, SC-01, SC-05, SE-03). Phase 1 builds 11 of them, only five of which call a model; Phase 2 adds 10 (§15). The rest wait for evidence that they're needed.

---

## 6. Layer 1: Revenue Orchestration

### S1-01 · Revenue Orchestrator *(Phase 5: it needs data to orchestrate)*
- **Task 1:** Each week, rank open pursuits and accounts by expected value and urgency, and propose how to spend the coming week's human capacity (estimating hours, technical-office hours, BD time).
- **Task 2:** Issue Work Orders to the desks for the approved plan.
- **Never:** prices, decides a bid, contacts anyone, or reads full drafts (summaries only, to avoid the context bloat the marketing spec warned about).
- **Self-challenge:** "Which pursuit am I most likely over-rating, and what evidence would prove it?" No evidence for the plan's key assumption → request an SA or SE task instead of guessing.
- **Until Phase 5** the Head of BD plays this role, using SE-04's weekly brief and the Pipeline Engine's queue.
- **Engine:** `claude-opus-5-5`, effort high. **Kill metric:** share of won value that came from pursuits it ranked in the top quartile.

### S1-02 · Deal Desk Reviewer (QA gate) *(Phase 2)*
- **Task 1:** Score every artifact leaving the sales system (proposal sections, prequalification packs, quote covers, account plans, and message drafts that mention commercial terms or go to a key account) against its Work Order's acceptance criteria and the standard in §10.
- **Task 2:** Return `APPROVED` / `REVISE` (numbered fixes) / `REJECT` (reason). Maximum two revision rounds, then escalate to a human.
- **Never:** rewrites. **Hard rule:** can't approve anything missing a pass from SG-01, SG-02, SG-03 and (if bilingual) L0-02/L0-03.
- **Engine:** `claude-opus-5-5`, effort high, separate prompt and context from every author; cross-family review when a second provider is added. **Kill metric:** defects found by humans after Deal Desk approval (target: falling to zero).

### S1-03 · Dispatcher *(Phase 1, reuse)*
The marketing Dispatcher: queue, retries, dead-letter, budgets, run log. Code, not a model.

### S1-04 · Pipeline Engine *(Phase 1, code)*
- Stage rules and allowed transitions for both motions; mandatory owner, next step and date (principle 11).
- SLA timers and escalation (§9); stale-deal detection; deduplication of people and projects across configurator, Meta forms, WhatsApp and manual entry.
- Deadline calendar (tenders, clarifications, quote validity, certificate expiry) and a **capacity ledger** (hours available per role per week, consumed by each Go decision).
- Forecast arithmetic (§14). No model anywhere in it.

### S1-05 · Correspondence Drafter *(Phase 1, shared service)*
- **Task 1:** Draft every one-to-one message a human will send (follow-ups, meeting requests, thank-yous, clarification cover notes) in the recipient's language, from an intent plus the opportunity record.
- **Task 2:** Self-critique against "would this person forward it, or delete it?" and against the cadence rules (no "just checking in"; every message gives something: a document, an answer, a date, a proof).
- **Never:** sends; states a price, date or term not supplied by SG-02.
- **Engine:** `claude-opus-5-5`, effort medium. **Kill metric:** reply rate on drafted follow-ups vs the rep's own baseline.

---

## 7. Layer 0: Governance

Sales reuses the marketing governance agents as shared services, so there is one standard across both departments: **L0-01 Brand Guardian, L0-02 Arabic Transcreation, L0-03 English Editor, L0-04 Compliance & Consent Gate, L0-05 Fact & Claim Verifier, L0-07 Brand DNA Guardian.** It adds four gates of its own:

### SG-01 · Integrity Gate *(Phase 2; rules in code, the model may only add rejections)*
- Blocks any artifact that offers or implies gifts, hospitality, payments, commissions or "facilitation" to officials, evaluators or client staff; flags any commission to an intermediary for legal review.
- **Tender blackout:** from tender publication to award, messages to anyone at the procuring entity are blocked unless the channel is the official one and the content is a clarification.
- **Provenance:** competitor prices and documents must come from a lawful source (published awards, official debriefs). "Someone sent us their offer" → reject and delete.
- Conflicts of interest declared by humans are enforced.
- **Override:** none. The artifact changes, or it does not go.

### SG-02 · Commercial Guard *(Phase 1; code)*
- Every price, discount, payment term, delivery date, warranty, validity period and inclusion in an outgoing artifact must match an approved record: a CRM `technical_responses` row, an approved estimate in `qottuf-estimation`, or a public configurator price shown with its inclusions.
- Blocks internal costs, margins, dealer ranges and price-to-win analyses from leaving.
- Blocks unapproved commitments ("guaranteed", "within 24 hours", "best price") in both languages.
- Every envelope carries a `commitments[]` list (§12); one unsourced item fails the artifact.

### SG-03 · Evidence Verifier *(Phase 2; extends L0-05)*
- Every claim in a tender, prequalification or proposal artifact resolves to an Evidence Vault record that is approved for that use tier, not expired, and consistent with the public fact base.
- Flags conflicts with Qottuf's public footprint (e.g. the website's "13+ years") so a submission never contradicts what a reviewer can look up.
- Applies the tracker's numeric grounding rule: any sentence containing a number absent from the supplied evidence is rejected.

### SG-04 · PII and Confidentiality Guard *(Phase 1; code)*
- Pseudonymises contacts before any model call (`CNT-0193`, not a name and phone number); re-identifies only inside the system of record.
- Keeps tender documents marked confidential inside approved processors (technical-agent decision D-034 already governs reading).
- Logs every data flow for PDPL records of processing.

---

## 8. Layer 2: The Five Desks

Notation: **Engine** is the model and effort (or "code"); **Kill metric** is reviewed at eight weeks; **Phase** is from §15.

### DESK A: INTELLIGENCE (find the work)

**SA-01 · Tender Scout** · Phase 2
- **Task 1:** Daily, collect new tenders and RFQs from Etimad, Muqawil's Projects Platform, entity portals, invitations received by email, and licensed project databases if subscribed. Use official feeds and permitted access only.
- **Task 2:** Pre-filter in code (activity, region, classification ceiling, value band, days to deadline), then classify scope against the six service lines and match proof (PRJ IDs). Create `identified` opportunities with a one-paragraph summary.
- **Never:** decides to bid. **Engine:** code + `claude-opus-5-5` low (Batch API overnight; if the batch hasn't finished by 05:30, the remainder runs synchronously so the 06:00 digest is never late). **Kill metric:** share of bids that the Scout surfaced first; zero relevant tenders missed in a monthly audit.

**SA-02 · Signal Hunter** · Phase 4
- **Task 1:** Watch for pre-tender signals: regional-HQ licences and office moves, Grade A completions, contract awards disclosed on Tadawul/Argaam (who just won, and needs subcontractors), NCP PPP milestones, university and hospital capital plans, main-contractor awards.
- **Task 2:** Link each signal to an account and propose a capture candidate.
- **Never:** contacts anyone. **Engine:** `claude-opus-5-5` medium; a scheduled Managed Agents deployment is acceptable here because the inputs are public and contain no personal data. **Kill metric:** capture candidates that became qualified opportunities.

**SA-03 · Award and Price Intelligence** · Phase 3
- **Task 1:** Ingest Etimad award results (winner, value, other bidders where shown) and Qottuf's own bid history; build price-to-win benchmarks by scope, sector and entity, and a competitor win map.
- **Task 2:** For each live pursuit, give an internal price-position note with stated coverage ("12 comparable awards, 4 with all bidders shown").
- **Never:** sets a price; leaves the internal tier. Statistical claims pass SE-03. **Engine:** code + `claude-opus-5-5` medium. **Kill metric:** loss price-deltas narrowing on the scopes it covers.

**SA-04 · Account Researcher** · Phase 4
- **Task 1:** Build and refresh a dossier per target account: structure, procurement route, consultants used, capital plans, public news, Qottuf's history with them (PRJ records, CRM).
- **Task 2:** Flag what changed since the last refresh.
- **Never:** profiles private individuals beyond their professional role. **Engine:** `claude-opus-5-5` medium, batch. **Kill metric:** account-plan actions that cite a dossier fact.

### DESK B: BIDS AND CAPTURE (win the work)

**SB-01 · Bid/No-Bid Analyst** · Phase 2
- **Task 1:** Apply the Qottuf Pursuit Scorecard (§10.1: knock-outs and weights in code) to each screened opportunity, using the tender-reader output and Evidence Vault.
- **Task 2:** Write the rationale, the single most likely reason Qottuf would lose, what would change the decision, and the capacity it would consume.
- **Never:** decides (gate S-G1). **Self-challenge:** "If we lose this, what will the reason be, and do we already know it?" **Engine:** code + `claude-opus-5-5` high. **Kill metric:** win rate of Go decisions vs pre-system baseline; no-bid regret (tenders declined that were won by a competitor at a price we could have met).

**SB-02 · Tender Intake Coordinator** · Phase 2 (mostly code around the existing skill)
- **Task 1:** Register documents, run the technical-agent's document-control and tender-reader skills, and pull the sourced summary, risk register, eligibility checks and clarification drafts into the opportunity.
- **Task 2:** Build the bid calendar (site visit, clarification deadline, internal reviews, submission) and the Compliance Matrix skeleton.
- **Rule:** tender-reader outputs are marked *unverified* until the technical reviewer spot-checks the critical fields (dates, guarantees, eligibility, ruling language). **Kill metric:** intake within one business day; zero missed deadlines.

**SB-03 · Capture Planner** · Phase 5
- **Task 1:** For strategic pursuits (scorecard ≥ threshold or value ≥ the capture threshold), maintain a capture plan from first signal to tender: hot buttons in the client's words, win themes (each = benefit + discriminator + proof ID), competitor assessment, access plan, teaming/JV need, pricing-strategy question for estimation.
- **Task 2:** Hand the plan to SB-05 when the tender issues.
- **Never:** suggests an access route that breaks SG-01. **Engine:** `claude-opus-5-5` high. **Kill metric:** win rate of captured vs uncaptured pursuits.

**SB-04 · Compliance Matrix and Submission Checker** · Phase 2
- **Task 1:** Map every requirement (tender-reader `specs_matrix`, instructions to tenderers, forms) to where it's answered, the evidence ID and status.
- **Task 2:** Run the submission checklist (forms, signatures, guarantees, envelopes, Etimad steps). "Ready to submit" is impossible below 100%.
- **Engine:** code + `claude-opus-5-5` low. **Kill metric:** zero disqualifications for documents or form.

**SB-05 · Proposal Writer** · Phase 3
- **Task 1:** Draft the technical proposal narrative (executive summary, understanding of requirements, methodology framing, organisation, programme narrative, quality and HSE approach) from the capture plan, tender-reader output and Evidence Vault, in the tender's ruling language first.
- **Task 2:** Self-critique against the evaluation criteria and the §10.3 standard.
- **Never:** writes a number not in the supplied evidence (grounding rule); invents method or experience. **Engine:** `claude-opus-5-5` medium. **Kill metric:** technical scores where evaluations are weighted; Deal Desk first-pass approval rate.

**SB-06 · Prequalification and Registration Manager** · Phase 2
- **Task 1:** Assemble prequalification packs and vendor registrations from the Evidence Vault to each portal's requirements; maintain a Registration Ledger (status, expiry, owner) for owners, consultants, PMCs and main contractors.
- **Task 2:** Warn 60/30/7 days before any certificate or registration expires.
- **Never:** releases confidential-tier evidence (gate S-G6). **Engine:** code + `claude-opus-5-5` low. **Kill metric:** zero expired-document incidents; registrations completed at target accounts.

**SB-07 · Red Team Evaluator** · Phase 3
- **Task 1:** Score the draft exactly as the tender's evaluation method would, from the evaluator's chair, listing where points are lost.
- **Task 2:** Where evaluation is lowest compliant price, score disqualification risk only: persuasive prose earns nothing in that format, so effort moves to price and compliance.
- **Never:** sees the author's reasoning, only the artifact and the tender. **Engine:** `claude-opus-5-5` high. **Kill metric:** correlation of its scores with actual technical scores.

**SB-08 · Clarification and Negotiation Prep** · Phase 3
- **Task 1:** Turn the tender-reader's clarification drafts into questions worth asking (questions that reduce our risk or reveal competence), and draft answers to the client's post-submission clarifications.
- **Task 2:** Prepare the BAFO/negotiation brief: tradeables (payment terms, phasing, alternates, value-engineering options from estimation), concession plan, and the walk-away that the estimator and Asil set.
- **Never:** negotiates or proposes the walk-away number. **Engine:** `claude-opus-5-5` high. **Kill metric:** margin retained between submission and award.

### DESK C: ELEVATOR DESK (convert inbound, build the installed base)

**SC-01 · Instant Response** · Phase 1 · **code + pre-approved templates, no model**
- Every enquiry (configurator, Meta lead form, WhatsApp, website form, logged call) gets an acknowledgement within 60 seconds, in the customer's language: the reference number, what happens next, and a callback time **computed from the actual staffed roster**, never a promise the desk can't keep.
- With WhatsApp opt-in: an approved utility template plus a WhatsApp Flow for the four qualifying questions. Without it: SMS from a registered sender ID, or email when one was given.
- Any free-text reply goes to SC-02 for classification and to a human for the answer. A model never free-texts a prospect.
- **Kill metric:** share of enquiries acknowledged within 60 s; contact rate.

**SC-02 · Lead Qualifier and Router** · Phase 1
- **Task 1:** Classify each enquiry as **Priority** (real in-scope project, reachable decision-maker, actionable timing, agreed next step possible), **Future** (genuine, later timing) or **Unqualified**, using the campaign plan's definitions; extract role, stage, location and timing; flag structural-stage projects (shaft lock-in window).
- **Task 2:** Deduplicate across channels and route to the named desk owner (backup after the SLA), starting the timer.
- **Engine:** code + `claude-opus-5-5` low. **Kill metric:** median time to first human contact; reclassification rate by reps.

**SC-03 · Call Coach** · Phase 1
- **Task 1:** Before each call, a one-screen brief: configuration summary, what to verify (shaft, pit, headroom, stops, power, timing, decision-maker), likely objections with approved answers (§10.6), the next best question.
- **Task 2:** After the call, turn the rep's own notes or voice memo into CRM fields and a proposed next step for the rep to confirm. The customer is never recorded without consent.
- **Engine:** `claude-opus-5-5` medium. **Kill metric:** verified-to-quoted conversion; data completeness.

**SC-04 · Quote Packager** · Phase 1
- **Task 1:** Turn the technical office's approved response into a bilingual quote cover: inclusions, exclusions, validity, payment milestones and warranty exactly as approved (SG-02), next steps, and the proof attachments that answer this buyer's likely doubt (certificates, references).
- **Task 2:** Attach the customer comparison checklist (installation, warranty length, maintenance period, certification, controller, door type, lead time): it moves the conversation from price to what is included, without naming or disparaging competitors.
- **Engine:** `claude-opus-5-5` medium. **Kill metric:** quoted-to-won rate.

**SC-05 · Follow-up Engine** · Phase 1 · **code cadence + S1-05 drafts**
- Runs the §10.6 cadence on every quote, detects silence, escalates stale quotes, stops on a decision or an opt-out. Every touch is human-sent.
- **Kill metric:** share of quotes reaching a recorded decision; share of losses with "no response".

**SC-06 · Installed Base and Maintenance** · Phase 5 · *conditional on Asil confirming Qottuf sells maintenance*
- Registers every installed unit: handover, warranty end, maintenance contract status, periodic inspection due, modernisation candidates. Triggers renewal and referral asks (human-sent).
- **Engine:** code + `claude-opus-5-5` low. **Kill metric:** maintenance attach rate; renewal rate; referrals.

**SC-07 · Specifier and Partner Programme** · Phase 5
- **Task 1:** Build specification packs for consultants and engineering offices: data sheets, shaft-requirement tables per model, specification text in their format (CSI-style Section 14 21 00 for traction lifts), and BIM objects through the technical agent's Revit capability.
- **Task 2:** Run the partner ledger (engineering offices, villa contractors, MEP subcontractors): who refers, what converts, gated access to the technical configurator.
- **Engine:** `claude-opus-5-5` medium. **Kill metric:** projects where Qottuf is specified; partner-sourced revenue.

### DESK D: ACCOUNTS (grow the work)

**SD-01 · Account Planner** · Phase 4
- **Task 1:** For each key account (top 10–15 by value and potential), maintain a plan: buying-committee map (roles and stance, not gossip), whitespace (six service lines × account), capital and timing signals, relationship health (last meaningful touch, champion, executive sponsor), and a 90-day plan with named human owners.
- **Task 2:** Refresh monthly and on any SA-02 signal.
- **Engine:** `claude-opus-5-5` high. **Kill metric:** expansion opportunities created per key account per quarter.

**SD-02 · Meeting Prep and Debrief** · Phase 4
- **Task 1:** Before every client, consultant or main-contractor meeting: agenda, what changed, open items, proof to bring, the ask.
- **Task 2:** After: decisions, actions, owners and dates into the pipeline (the human confirms).
- **Engine:** `claude-opus-5-5` medium. **Kill metric:** share of meetings with a recorded next step.

**SD-03 · Reference and Proof Manager** · Phase 4
- **Task 1:** At every handover, the moment of maximum goodwill, request the reference letter, completion certificate and permission to cite in tenders; record each as a dated, expiring tender-use approval.
- **Task 2:** Feed consented proof to marketing's B-04 Case Study agent through a marketing Work Order.
- **Engine:** code + `claude-opus-5-5` low. **Kill metric:** delivered projects with usable references.

**SD-04 · Expansion Trigger** · Phase 4
- Creates opportunities from post-award events: defects-period end, variation potential (up to 20% under the new law, once confirmed for works), next phases, adjacent service lines, elevator modernisation at existing clients.
- **Engine:** code + `claude-opus-5-5` medium. **Kill metric:** value won from expansion opportunities.

### DESK E: REVENUE LEARNING (learn)

**SE-01 · Pipeline Analyst** · Phase 2
- Coverage, stage conversion, cycle times, slippage and forecast ranges in code; a short narrative of what changed and why. **Kill metric:** forecast error at 90 days.

**SE-02 · Win/Loss Analyst** · Phase 3
- **Task 1:** Make every closed opportunity carry structured reason codes (§10.7) within two business days; prepare interview scripts for losses and wins above the interview threshold (a human calls).
- **Task 2:** Quarterly synthesis of patterns, only above the sample thresholds SE-03 enforces. **Kill metric:** playbook changes that later improved the metric they targeted.

**SE-03 · Statistical Sanity** · Phase 2 · **code (reuse marketing D-03)**
- Same veto as marketing: below n=30 per group → insufficient data; p ≥ 0.05 → rejected; confounds downgrade. Win rates are reported with Wilson intervals.

**SE-04 · Sales Reporting** · Phase 1 (minimal), Phase 2 (full)
- The weekly one-page brief to Asil and the Head of BD: what changed, what's at risk, which decisions are needed, capacity next week. Monthly board view. **Kill metric:** decisions taken from it.

**SE-05 · Playbook Steward** · Phase 3
- Proposes changes to playbooks, scorecard weights and objection answers from evidence; versioned; never self-edits. The Head of BD approves. **Kill metric:** acceptance rate of its proposals.

---

## 9. The Six Workflows

Notation: `[AGENT]` agent · `<code>` deterministic · `(Human)` person · `{GATE}` human gate. SLAs are proposals for Asil to confirm.

### W1 · Elevator enquiry → order

```
Enquiry ─► <SC-01 ack ≤60 s> ─► [SC-02 qualify + route] ─► (Rep calls) ─► verification ─►
(Technical office prices) ─► [SC-04 quote cover] ─► {S-G4: Rep sends + walks through quote} ─►
<SC-05 cadence> ─► won ─► installation ─► [SD-03 reference] ─► <SC-06 installed base>
                     └─► lost ─► [SE-02 reason codes + optional interview]
```

1. **Land.** Configurator ingest (existing), Meta lead form (webhook into the CRM ingest, replacing manual entry), WhatsApp click-to-chat, the new website enquiry form, or a logged call. Every source carries UTM/campaign identifiers into `spec_json`.
2. **Acknowledge** within 60 s (SC-01), 24/7.
3. **Qualify and route** (SC-02). Timer starts. Priority leads page the owner; the backup is paged at 10 minutes.
4. **First human call:** median ≤ 15 minutes in staffed hours, hard ceiling 60 minutes; out of hours, by 09:30 on the next staffed day. SC-03's brief is ready before the call. Outcome and next step logged (mandatory).
5. **Verify** site and shaft data against the checklist; photos and drawings attached.
6. **Hand off** to the technical office (existing CRM flow): priority ≤ 24 h, standard ≤ 48 h.
7. **Package** (SC-04) within four business hours of `tech_ready`; SG-02 checks every number.
8. **Send and walk through:** the rep calls to walk the customer through the quote. A quote is never just emailed.
9. **Follow up** (SC-05). Revision requests go back to the technical office (`quoted → tech_review`, existing).
10. **Close.** Won: amount and summary (existing), handover to installation, reference request at handover, unit registered for maintenance. Lost: reason codes within two business days.

**Challenged:**

| Failure point | Control |
|---|---|
| The desk can't call within 15 minutes when both people are busy | Backup paging at 10 minutes; ad delivery limited to staffed hours (the campaign plan already proposes this); the SLA is measured and reported, not assumed |
| Auto-acknowledgement promises a callback that doesn't happen | The callback time is computed from the roster; a missed promise escalates to the Head of BD and is reported weekly |
| "Contact us for pricing" sizes stall the configurator | Phase 0: fill the 22 missing costs, or replace the text with "price after a ten-minute call" plus an immediate callback booking |
| The customer compares a cheaper "Fuji" quote | Origin proof pack (Phase 0) + comparison checklist + objection answers (§10.6) |
| Duplicates inflate the pipeline (Meta form + configurator + WhatsApp) | Deduplication in the Pipeline Engine by phone and project |
| The rep doesn't log the call | Next step mandatory to leave the record; voice-memo capture; hygiene score in the weekly brief |

### W2 · Tender pursuit (Etimad, invited or subcontract RFQ)

Stages: `identified → screened → decided (go / no-go / conditional) → preparing → submitted → evaluation → won | lost | cancelled | no_award | withdrawn | no_bid → contracted`

1. **Surface** (SA-01): 06:00 daily digest. Code knock-outs (§10.1) send failures to `screened_out` with the reason; the Head of BD can override.
2. **Intake** (SB-02) within one business day: tender-reader run, bid calendar, eligibility, risk register, Compliance Matrix skeleton.
3. **Score and decide** (SB-01) → `{S-G1}` within two business days. No-bid reasons are recorded: they are learning data too. A Go decision books capacity in the ledger.
4. **Kick off:** a 30-minute human meeting sets owners (estimator, technical reviewer, writer, coordinator) and internal dates: compliance review at D-10, red-team review at D-5, final sign-off at D-2, submission at D-1, never on the last day.
5. **Clarify:** SB-08's questions go out through the official channel at least three business days before the clarification deadline.
6. **Price:** the estimator builds cost in `qottuf-estimation`; SA-03 supplies an internal price-position note; the estimator and Head of BD set margin; `{S-G2}` for Asil above the threshold.
7. **Write and check:** SB-05 drafts → SB-04 matrix → SB-07 red team → S1-02 Deal Desk → SG-01/02/03 → SB-04 checklist at 100% → `{S-G3}` sign-off → the coordinator uploads.
8. **Evaluation:** clarification answers drafted by SB-08 and sent by a human through the official channel; SG-01 enforces the blackout; BAFO brief if invited.
9. **Outcome:** award data captured from Etimad; Qottuf's frozen submitted price vs the winner's; SE-02 reason codes within two business days; request an official debrief where available.
10. **Contracted:** the tracker project is created through its API, linked by opportunity ID.

**Challenged:**

| Failure point | Control |
|---|---|
| The Scout misses a tender (portal change, new entity) | Monthly missed-tender audit against Etimad awards in Qottuf's categories; a manual intake path for invitations |
| The tender-reader misreads a date or guarantee | Critical fields are verified by the coordinator before the calendar is live; dates also checked against Etimad's own listing |
| Bidding everything "just in case" | Capacity ledger: a Go consumes hours; when capacity is exhausted, a new Go needs a named trade-off |
| Pricing to win at a loss | SA-03 informs, never sets; the margin floor is a human decision recorded with its reason |
| The proposal contradicts the website | SG-03 checks against the public footprint; Appendix A fixes the website first |
| Last-day upload failure | Submission at D-1 as a rule; the checklist includes portal readiness at D-3 |

### W3 · Strategic capture (pre-tender)

Trigger: an SA-02 signal or SD-01 account plan identifies a future project (a university building in a capital plan, an HQ tenant needing several floors, a PPP consortium forming).

1. Light qualification: is it real and funded, when, do we fit, can we reach the decision-makers legitimately.
2. SB-03 opens a capture plan with a human owner.
3. **Access:** technical presentations, reference visits to delivered projects, registration with the owner and consultant, early technical input through official channels (shaft sizes, MEP options). Everything passes SG-01.
4. **Shape:** get invited; decide on teaming or a JV (Muqawil Consortium Platform) when the value exceeds Grade 3.
5. When the tender issues, hand over to W2 with win themes ready.

**Challenged:** capture eats senior time on projects that never tender → each capture plan has a review date and a kill rule (no access progress in 60 days → park).

### W4 · Key-account growth

1. SD-01 monthly plan; SD-02 before and after every meeting; Asil is the executive sponsor for the top three accounts.
2. Whitespace actions: introduce service lines the account hasn't bought (e.g. elevators at a university where Qottuf did fit-out), always with proof.
3. Small works: be registered and fast for direct-purchase work (once the new law's coverage of works is confirmed).
4. Every delivered project triggers SD-03 (references) and SD-04 (expansion).

**Challenged:** account plans become documents nobody reads → each plan carries at most three actions with owners and dates, tracked in the pipeline; an account with no completed action in 60 days is flagged in the weekly brief.

### W5 · Partners and subcontract channel

1. **Registration ledger** (SB-06): vendor registration with target main contractors, developers and PMCs, with renewal dates.
2. **Package watch:** when SA-02 sees a main-contractor award, the Head of BD contacts their procurement for MEP, fit-out and elevator packages (human).
3. **Elevator partner programme** (SC-07): engineering offices and villa contractors receive specification packs and gated technical-configurator access; referrals are tracked to revenue.

**Challenged:** registrations go stale and partners go quiet → renewal alerts; partner value reviewed quarterly; partners with no referral in two quarters lose gated pricing access.

### W6 · Learn

- **Weekly:** SE-04 brief (pipeline, SLAs, risks, decisions, capacity).
- **Monthly:** win/loss review with the Head of BD (SE-02 patterns, SA-03 price positions).
- **Quarterly:** scorecard calibration (only with enough decided pursuits, §10.1), playbook updates (SE-05 proposes, the Head of BD approves), input to marketing's quarterly objectives (which sectors, which proof, which objections to answer with content).

**Challenged:** learning from noise → SE-03 veto; qualitative interviews carry the signal when numbers are small.

---

## 10. Playbooks the Agents Enforce

### 10.1 Qottuf Pursuit Scorecard (contracting)

**Knock-outs** (any one → no-bid, unless the alternative route applies):

| Code | Knock-out | Source | Alternative route |
|---|---|---|---|
| K1 | Value above the classification ceiling for this activity | Classification record + tender value | JV through Muqawil; subcontract to a qualified prime |
| K2 | Mandatory registration or prequalification missing and not obtainable in time | Registration Ledger | Register for the next round |
| K3 | Mandatory certificate expired or unavailable by the deadline | Evidence Vault | Renew; next round |
| K4 | Scope outside the six service lines with no partner | Tender-reader scope by trade | Partner or subcontract |
| K5 | Too little time: full bid < 10 working days, small bid < 3 | Bid calendar | Ask for an extension through clarification |
| K6 | Integrity flag | SG-01 | None |
| K7 | Guarantee capacity unavailable (a yes/no entered by the Head of BD; agents never see the figures) | Head of BD | None |

**Scored factors** (0–3 each; a score of 2 or 3 requires cited evidence; **unknown scores 0**, which forces discovery):

| Factor | Weight | 3 looks like |
|---|---|---|
| Fit: same scope and scale delivered (PRJ proof) | 15 | A named, comparable project with references |
| Relationship and access to owner and consultant | 15 | Prior work with them; decision-makers know us |
| Shaping: involved before the tender, invited or specified | 10 | We were consulted or the specification fits us |
| Competitive position | 10 | Few credible competitors; we are the incumbent |
| Price position vs price-to-win data | 15 | Our cost sits below comparable award levels |
| Evaluation-method fit (lowest price vs weighted; local content) | 5 | Weighted evaluation that rewards our proof |
| Margin potential and commercial risk (retention, delay damages, payment terms, advance, price adjustment) | 15 | Healthy margin and balanced terms |
| Strategic value (new sector, reference value, repeat potential) | 10 | Opens a sector or a repeat programme |
| Capacity at that time | 5 | Estimating and delivery capacity both free |

**Thresholds (starting points, not truths):** ≥ 65 Go · 45–64 Conditional (name the fix and a date, then re-score) · < 45 No-bid. Weights and thresholds are versioned configuration. The score is not a win probability: once 30 or more pursuits are decided, SE-01 fits outcomes to score bands and reports observed win rates per band.

**Partial scorecards:** "unknown scores 0" applies to facts a person could find out. When a factor's data source doesn't exist yet (price position before SA-03 is built in Phase 3), that factor is excluded, the total is rescaled over the remaining weights, and the scorecard is marked *partial*, so early bids aren't pushed to no-bid by a missing system rather than a weak opportunity.

### 10.2 Capture plan (one page)

Client hot buttons in their words · Win themes (benefit to them → our discriminator → proof ID) · Competitor assessment (what they will claim, how we pre-empt it factually) · Access plan (who, how, when; SG-01-clean) · Teaming/JV · Pricing-strategy question for the estimator · Risks and mitigations · Review date and kill rule.

### 10.3 Proposal standard (what the Deal Desk checks)

1. **Compliant first:** 100% matrix coverage, in the client's structure, headings and order.
2. **Effort follows the evaluation method:** lowest-compliant-price tenders get compliance and price effort; weighted tenders get persuasion effort.
3. **Executive summary in their terms:** their objective → our approach → proof → why us. No adjectives.
4. **Every claim has a proof ID;** numbers only from the Vault.
5. **Show we read their documents:** cite their constraints, the clarifications we raised, the risks we found.
6. **Arabic is native and numbers match across languages** (the tender-reader flags bilingual number conflicts).
7. **Banned:** superlatives, "guaranteed", unapproved commitments (SG-02), anything a competitor could also say unchanged (the brand's competitor test).

### 10.4 Negotiation and BAFO

Know the alternative (other pursuits in the capacity ledger); the walk-away is set by the estimator and Asil before any meeting; tradeables are listed in advance (payment terms, phasing, alternates, value-engineering options, validity, scope trims); never concede without getting something; concede in decreasing steps; tie every price move to a change in scope or terms; authority limits per §11.

### 10.5 Account plan and buying committee

For each account map the roles: **economic buyer** (approves budget), **technical evaluators** (consultant, MEP engineer, facilities), **procurement** (rules and process), **users** (the department that lives with the result), **champion** (internal advocate), **blockers**. For each: stance, last meaningful touch, what they need from Qottuf. Multi-thread every account: never rely on one contact. A meaningful touch gives something (a project update, a technical answer, an invitation, relevant proof); "checking in" is not a touch.

### 10.6 Elevator desk talk track

**Discovery (seven questions):** building type and stage (design, structure, finishing, existing) · stops and use (persons, load) · shaft status (exists? dimensions, pit, headroom) · who decides and who else is involved (engineer, contractor) · when it must be installed · what matters most (price, look, brand, speed, maintenance) · other quotes received (benchmark only).

**Stage rule:** at design or structure stage, the priority is to lock shaft dimensions now: send the shaft-requirement sheet and offer to coordinate with their engineer.

**Objection library** (approved answers only; evidence-linked; maintained by SE-05):

| Objection | Answer shape | Evidence needed (status) |
|---|---|---|
| "Another quote is cheaper" | Compare inclusions line by line with the comparison checklist; never disparage a competitor | Inclusions template (ready once terms are confirmed) |
| "Which Fuji? Is it really Japanese?" | Manufacturer's legal name, origin documents, SABER certificate, installed references | **Pending:** Phase 0 |
| "Spare parts and maintenance?" | Maintenance terms, response time, parts availability | **Pending:** maintenance offer decision |
| "How long until installation?" | Only approved lead times from the technical response | Technical office |
| "Will it fit my existing house?" | Site check first; no promise before verification | Verification checklist |

**Follow-up cadence after a quote:** D0 walk-through call · D+2 questions answered · D+5 relevant proof · D+10 decision check, offer a meeting or site visit · D+20 validity reminder · at expiry: archive or re-quote. Stop on a decision or an opt-out. Every touch is human-sent.

### 10.7 Outcome and loss-reason taxonomy (structured; one primary + any secondary)

`PRICE` (with delta %) · `TECH_NONCOMPLIANT` · `DOCS_INCOMPLETE` · `INELIGIBLE` (classification, registration, local content) · `NOT_SUBMITTED` · `INCUMBENT_RELATIONSHIP` · `SPEC_LOCKED` (competitor brand or specification) · `SCOPE_MISMATCH` · `CANCELLED_DEFERRED` · `NO_DECISION_GHOSTED` · `CHOSE_CHEAPER_BRAND` · `TRUST_ORIGIN_DOUBT` · `TIMING_NOT_READY` · `OUR_CAPACITY` (we declined) · `OTHER` (free text required). The CRM's free-text `lost_reason` gets an enumerated companion column (append-only migration).

---

## 11. Human Gates and the Delegation Matrix

| Gate | Trigger | Approver |
|---|---|---|
| **S-G1 Bid decision** | Go / no-go / conditional | Head of BD below the bid threshold; Asil above it or when strategic |
| **S-G2 Price and terms** | Any price, discount, payment term or validity sent to a client | Elevators: technical office below the elevator threshold, Asil above; contracting: estimator + Head of BD below the bid threshold, Asil above |
| **S-G3 Submission** | Tender package release | Head of BD + authorised signatory, checklist at 100% |
| **S-G4 Live communication** | Any message to a named prospect or client | The human sender; only SC-01's pre-approved acknowledgements are automatic |
| **S-G5 Evidence Vault write** | New certificate, reference, permission or project record | Bid coordinator, document attached; Asil for anything that changes a public claim |
| **S-G6 Confidential release** | Financial statements, bank letters, guarantee facilities to any third party | Asil, per release |
| **S-G7 Integrity** | Any SG-01 rejection | **No override** |
| Marketing G2, re-used | Naming a client in a new context such as a tender | Asil once per client, recorded as a dated tender-use approval that SG-03 checks, instead of per tender |

**Thresholds for Asil to set:** elevator quote value (X), contracting bid value (Y), capture investment (Z).

**Against gate fatigue** (the marketing spec's second failure mode): S-G1 decisions are batched into a 15-minute daily bid board; approvals sit in one queue; templates are approved once; tender-use approvals are per client, not per tender; the weekly brief lists only decisions, not activity.

---

## 12. Data Contracts and Integrations

### 12.1 The system of record

**Recommendation:** one **Sales Ledger** (Postgres, alongside the marketing spine) is the master for accounts, contacts, opportunities (both motions), evidence, registrations and outcomes. The elevator CRM stays the elevator desk's working tool in Phase 1 (no disruption to what works) and syncs to the Ledger through its API. Every other system links by ID. The future Qottuf app reads the Ledger's API and becomes the single human interface later.

Options considered: extending the elevator CRM to carry contracting (its schema and serverless limits are elevator-shaped); an off-the-shelf CRM (data residency, Arabic quality and agent integration vary; migration cost). Decision for Asil (§18).

### 12.2 Core objects

**Opportunity**

```json
{
  "opportunity_id": "OPP-2026-0087",
  "motion": "contracting | elevator",
  "account_id": "ACC-0012",
  "title": "KSU — fit-out of ...",
  "route": "etimad_public | invited_private | subcontract | direct_negotiated | direct_purchase | framework | inbound_elevator",
  "service_lines": ["fit_out", "mep"],
  "sector": "education",
  "stage": "screened",
  "owner": "human:head_of_bd",
  "next_step": { "action": "Decide go/no-go", "owner": "human:head_of_bd", "due_at": "2026-11-20T12:00:00+03:00" },
  "value_band": { "min_sar": null, "max_sar": null, "source": "tender | estimate | client | unknown", "confidence": "low" },
  "dates": { "published_at": "", "clarification_deadline": "", "site_visit_at": "", "submission_deadline": "", "decision_expected_at": "" },
  "eligibility": { "classification_ok": null, "registrations_ok": null, "certificates_ok": null, "local_content_notes": "" },
  "scorecard_id": "SCR-0087-1",
  "bid_decision": { "decision": "go | no_go | conditional", "decided_by": "", "decided_at": "", "reason": "" },
  "submission": { "submitted_at": "", "revision": "A", "submitted_value_ex_vat_sar": null, "frozen": true },
  "outcome": { "result": "", "primary_reason": "", "secondary_reasons": [], "winner": "", "winning_value_ex_vat_sar": null, "price_delta_pct": null, "source": "etimad_award | client_debrief | other" },
  "links": { "tender_ref": "", "technical_agent_project_id": "", "estimation_project_id": "", "crm_quote_id": "", "tracker_project_code": "" }
}
```

**Other objects** (fields abridged; full schemas are Phase 0 work):

| Object | Key fields |
|---|---|
| Account | id, names AR/EN, type (government, semi-government, private, main contractor, consultant/PMC, developer, partner), parent, procurement routes, consultants used, relationship health, executive sponsor, Qottuf history (PRJ ids, CRM refs) |
| Contact | id (pseudonym for agents), role in the buying committee, consent status and basis, preferred channel and language, opt-out, last meaningful touch. Personal data lives only here. |
| Signal | source, URL or reference, captured_at, matched account/opportunity, relevance, expires_at |
| Evidence record | id, type (certificate, completion letter, reference letter, permission, CV, method statement, classification, CR, Zakat/GOSI/Chamber/Saudisation certificate, SABER certificate, manufacturer authorisation, financial statement), **tier** (public, tender, confidential, internal), issuer, issued_at, **expires_at**, file hash, permitted uses, linked PRJ |
| Registration | portal/organisation, status, reference, renewal date, owner |
| Pursuit scorecard | version, knock-outs, factor scores with evidence ids, total, rationale, "what would change it", capacity hours |
| Outcome | the `outcome` block above + interview notes + lessons + playbook-change ids |

**Evidence tiers:** *public* (the marketing fact base) · *tender* (completion letters, references, permissions, certificates, CVs: released into submissions) · *confidential* (financial statements, bank letters, guarantee facilities: released only through S-G6) · *internal* (costs, margins, price-to-win, competitor notes, scorecards: never leave).

### 12.3 Work Orders and envelopes

Sales reuses the marketing `WorkOrder` and `OutputEnvelope` Zod schemas, so a governance service can serve both departments. Sales extensions:
- `opportunity_id` and `account_id` on Work Orders; `pii_policy: "pseudonymised"` (anything else is rejected); `evidence_tier_max`.
- `commitments[]` on envelopes: every price, date and term with its approved source id (SG-02 input).
- `evidence_refs[]` on envelopes: every Vault id used (SG-03 input).

### 12.4 Integration map

| System | Into the Ledger | Out of the Ledger | Needed first |
|---|---|---|---|
| Elevator CRM (`qottuf-crm`) | Quote status changes (webhook), technical responses, won amounts | Account/contact master ids; AI briefs and suggested next steps posted as labelled activity notes (a human confirms) | The CRM has no service-account authentication today (staff sessions and ingest keys only): add a scoped service key bound to a new `ai_service` role holding only `quotes.read`, `files.read`, `notifications.read` and `activity.write` for AI-labelled notes. Never `quotes.write`, `quotes.close`, `quotes.followup` or `technical.write` (capabilities fail closed) |
| Website | Contracting enquiry form; UTM capture | — | The form itself (Appendix A) |
| Meta Lead Ads | Leads via webhook | — | The current ingest **rejects any lead without an email** (first name, last name, valid email and phone are required), while the campaign plan deliberately doesn't ask for email: add a Meta-source ingest route that requires name and phone only and records `meta` as a channel. Plus Meta app review, a token, and consent wording on the form |
| `qottuf-technical-agent` | `tender_summary.json`, risk register, clarification drafts | Bid decision and owner | Add `opportunity_id`, route, closing date, value band, decision and owner to `project.json` |
| `qottuf-estimation` | Estimate summary (`tender_total_ex_vat`, margin, `defensible`); frozen at submission | Go decision creates the estimation project | **Consolidate the two code lines first;** client, consultant, tender number and deadlines stay in the Ledger, linked by id |
| `qottuf-project-tracker` | Handover milestones, delivery proof (only with a consent flag), contract value to finance roles only | Create the project at contract (API) | Service accounts (tracker finding PRD-14) |
| Marketing spine | Commercial replies (A-07), engagement inquiries (B-07) → opportunities | Proof requests to B-04; win/loss themes and objections to the CMO's quarterly objectives | Shared governance services |

**Boundary with marketing:** marketing owns one-to-many communication (content, campaigns, ads, newsletters). Sales owns one-to-one communication with named accounts and live opportunities. Marketing's D-04 tender watch is superseded by SA-01; marketing consumes its summary for campaign timing. Marketing's A-01 list segmentation reads contacts and consent from the Ledger.

---

## 13. Infrastructure, Models, Security and PDPL

**Stack:** the marketing spine's (Node/TypeScript, Postgres + pgvector, Redis/BullMQ, Docker Compose, Langfuse). One platform, two departments, shared governance services.

**Models** (Claude API; verify against the live model list at build time):

| Work | Model | Effort | Notes |
|---|---|---|---|
| Classification, extraction, routing (SA-01, SC-02, SB-04, SB-06, call-note structuring) | `claude-opus-5-5` | low | Test `claude-haiku-5-5` only if measured volume justifies it and quality holds on an eval |
| Drafting (S1-05, SC-03, SC-04, SB-05, SD-02, SE-04) | `claude-opus-5-5` | medium | |
| Judgment (S1-01, S1-02, SB-01, SB-03, SB-07, SB-08, SD-01) | `claude-opus-5-5` | high | Cross-family review for S1-02 once a second provider is approved |
| Overnight research (SA-01, SA-02, SA-04) | `claude-opus-5-5` via the Batch API | low–medium | Half price; no personal data in these jobs |

**API rules for the build:** structured outputs (`output_config.format`) validated by Zod, never forced `tool_choice` (it returns a 400 on Claude Opus 5.5); adaptive thinking with effort set explicitly; server-side refusal fallbacks enabled; prompt caching on stable prefixes (system prompt, playbooks, fact-base index) with volatile data last; per-agent API keys with monthly caps and per-order token budgets (marketing §9).

**Cost reality:** at Phase 1–2 volumes (assumed: about 300 elevator enquiries and 30 screened tenders a month), the model bill is small: an order-of-magnitude estimate is tens to low hundreds of US dollars a month, including thinking tokens, to be measured in Langfuse from week one. The real cost is human attention, which is why §11 batches every gate.

**Evaluation and testing (no agent ships without it):**
- **A golden set per agent, built in Phase 0 from Qottuf's own history:** at least 100 past CRM enquiries labelled Priority / Future / Unqualified by the desk (SC-02); at least 20 past tenders with the decision actually taken and the outcome, reconstructed for the baseline (SB-01); rubric-graded drafts scored by the Head of BD (S1-05, SC-03, SC-04); adversarial sets in Arabic and English for SG-01 (inducement phrasing), SG-02 (disguised commitments: "يمكننا التسليم خلال أسبوعين", "best price") and SG-04 (personal data leaking into prompts).
- **Prompt-injection cases** drawn from real input types: a tender PDF, a supplier email and a WhatsApp message each carrying a planted instruction; the pass condition is that the agent flags it and does nothing else.
- **Regression on every change** of prompt, model, rule or schema, in CI; a change that lowers any golden-set score does not ship.
- **Online quality signals** reviewed weekly: how much reps edit drafts before sending, how often reps reclassify SC-02's labels, how often the Head of BD overrides SB-01, and the Deal Desk's rejection reasons. A rising trend is treated as a regression.

**Hosting and PDPL:**
- Decide in Phase 0 whether the Ledger is hosted in-Kingdom (the tracker's owner action OA02 asks the same question). The CRM and tracker currently run on non-Saudi infrastructure.
- Pseudonymise before every model call (SG-04); keep personal data in the Ledger and CRM.
- Run a data-protection impact assessment before go-live, and put transfer safeguards (standard contractual clauses and the transfer risk assessment) in place with each provider. Take counsel's view on the SDAIA draft amendments when they are finalised.
- A privacy notice, consent wording and a WhatsApp opt-in on every form (Appendix A).
- Tender documents follow technical-agent decision D-034; nothing goes to a new outside service without Asil's approval.

**Security:** capability-based RBAC (the CRM's pattern), MFA for admins, audit log of every gate decision, secrets in a vault, no direct database writes across systems, contract tests on every integration, and a database fingerprint check after deploys (the CRM's lesson).

---

## 14. Metrics and the Learning Loop

**North star: gross margin won per quarter, by motion.** Until the estimation system records margin reliably, report contract value won plus the estimated margin at submission.

| Area | Metric | Definition |
|---|---|---|
| Contracting | Qualified pursuits | Opportunities passing knock-outs per month |
| | Bid selectivity | No-bids ÷ screened, with reasons |
| | Submission compliance | Disqualifications for documents or form (target 0) |
| | Win rate | Won ÷ decided, by count and by value, per route and sector, with Wilson intervals |
| | Price delta on losses | (our price − winning price) ÷ winning price, median by scope |
| | Time to decision | Intake to S-G1, business days |
| | Repeat share | Value won from existing accounts ÷ total |
| | Pipeline coverage | Weighted open value ÷ target for the period |
| Elevators | Speed-to-lead | Median and p90 minutes to first human contact, staffed hours |
| | Funnel conversion | contacted → verified → quoted → won, per source and campaign |
| | Technical turnaround | `handoff_at` → `tech_ready_at`, hours |
| | Quote-to-decision | Share of quotes reaching a recorded decision; days to decision |
| | Loss mix | Share by reason code |
| | Maintenance attach | Units with a maintenance contract ÷ units installed (if offered) |
| | Cost per verified enquiry | Paid spend ÷ verified enquiries from that cohort (report spend and zero, never a misleading ratio) |
| Hygiene | Record completeness | Open opportunities with owner, next step and date |
| | Expiry incidents | Expired documents discovered after they were needed (target 0) |

**Baseline before agents:** export the CRM history (elevators), and reconstruct the last 12–24 months of tenders, bids and outcomes from files and memory (contracting). Every Phase 1–2 exit criterion is measured against it.

**Statistical honesty:** at these volumes most week-to-week movement is noise. SE-03 vetoes claims below its thresholds; qualitative win/loss interviews carry the signal until the numbers are big enough.

---

## 15. Build Sequence (revenue-first)

Each phase must produce measured revenue effect before the next starts. Durations are planning assumptions.

**Phase 0 · Foundations (two to three weeks, mostly human; nothing works without it)**
- Name the Head of BD; set thresholds X/Y/Z; decide the system of record and hosting.
- Ledger schemas; stage definitions; the loss taxonomy; the scorecard configuration.
- **Evidence Vault v1** (what is already in hand; requests to clients for missing letters start now and continue for months): classification certificate and its exact ceiling, CR, Zakat, GOSI, Chamber and Saudisation certificates with expiry dates; completion letters and reference permissions per project; reconcile PRJ-001; elevator manufacturer evidence (legal name, agreement, SABER certificates, warranty, maintenance terms).
- **Golden sets for agent evaluation** (§13), built from the same baseline work.
- Baselines (§14). Registrations audit (Etimad, Muqawil, target main contractors and developers).
- Website and funnel fixes from Appendix A; PDPL basics (privacy notice, consent, DPIA, provider safeguards).
- Decide which estimation code line survives.

**Phase 1 · Elevator desk (four to six weeks)** · S1-03, S1-04, S1-05, SG-02, SG-04, SC-01, SC-02, SC-03, SC-04, SC-05, SE-04 (minimal)
- **Exit:** median first contact ≤ 15 minutes in staffed hours for four consecutive weeks; 100% of quotes with a next step and date; quote-to-decision measured; zero unapproved prices sent.

**Phase 2 · Bid engine (six to eight weeks)** · SA-01, SB-01, SB-02, SB-04, SB-06, S1-02, SG-01, SG-03, SE-01, SE-03, SE-04 (full)
- **Exit:** every in-scope tender screened within one business day; every decision within two with a scorecard; zero disqualifications for documents; zero expired-document incidents.

**Phase 3 · Win more of what we bid** · SB-05, SB-07, SB-08, SA-03, SE-02, SE-05
- **Exit:** red-team scoring on every bid above the threshold; price delta captured on at least 80% of losses; first quarterly win/loss review held.

**Phase 4 · Grow accounts** · SD-01, SD-02, SD-03, SD-04, SA-02, SA-04
- **Exit:** plans for the top ten accounts; at least one expansion opportunity per key account per quarter; references requested at every handover.

**Phase 5 · Capture, channel, orchestration** · SB-03, SC-06, SC-07, S1-01
- **Exit:** set by Asil from Phase 1–4 evidence.

**Phase 6 · Prune and connect:** delete agents that failed their kill metrics; connect the Qottuf app to the Ledger API.

---

## 16. Red-Team Log: every weakness found and how it was fixed

### 16.1 Self-challenge during design (draft → v1.0)

| # | Weakness in the first draft | Severity | Fix in this spec |
|---|---|---|---|
| R1 | Assumed a sales team exists. None does (tracker org chart; CRM "no sales manager"). | Critical | §4 human organisation; Head of BD is a Phase 0 blocker; the Orchestrator waits until Phase 5 |
| R2 | Started with an outbound prospecting agent | Critical | Removed. PDPL consent default, anti-spam rules, WhatsApp bans and buyer perception. Replaced by capture, registration, partner and account programmes |
| R3 | Led with lead generation; the leaks are downstream | High | Phase 1 fixes speed, follow-up, price coverage and capture; Appendix A fixes the website first |
| R4 | One department-lead agent per desk (×5), routing work an LLM didn't need to route | Medium | Removed; deterministic routing in S1-03/S1-04 |
| R5 | A conversational AI answering prospects on WhatsApp | High | SC-01 is templates + WhatsApp Flow; a model never free-texts a prospect |
| R6 | The proposal writer could state numbers it can't prove | Critical | Numeric grounding rule, SG-03, SB-07, Deal Desk, S-G3 |
| R7 | Asil approves everything → gate fatigue | High | Delegation matrix, daily bid board, per-client tender-use approvals |
| R8 | Two CRMs would duplicate accounts | High | Sales Ledger is the master for accounts and contacts; the CRM syncs |
| R9 | The scorecard presented as a win probability | Medium | Score ≠ probability; calibrated bands only after 30 decided pursuits |
| R10 | Price-to-win treated as complete | Medium | Coverage stated on every note; Etimad visibility varies; never auto-prices |
| R11 | Proposals could contradict the website | High | SG-03 footprint check; website claims corrected in Phase 0 |
| R12 | "Fuji Japan" claimed without documents | High | Phase 0 evidence; objection answer marked pending until then |
| R13 | Dealer price ranges public | High | Gate or remove the technical configurator from the public menu (Appendix A) |
| R14 | Personal data sent to model providers abroad | High | SG-04 pseudonymisation; DPIA; transfer safeguards; hosting decision |
| R15 | API drift (forced `tool_choice` returns 400 on Claude Opus 5.5) | Medium | Structured outputs; models pinned in configuration; contract tests |
| R16 | Procurement and data rules changing (new GTPL regulations ~Jan 2027; PDPL amendments) | Medium | Rules as versioned configuration with effective dates; quarterly regulatory review |
| R17 | Relationship selling drifting into integrity risk | Critical | SG-01 with no override |
| R18 | Optimising win rate instead of margin | High | North star = margin won; scorecard weights margin and strategic value; bid selectivity tracked |
| R19 | Agents nobody uses (the marketing lesson) | High | Kill metrics; exit criteria; Phase 1 is 11 components, only five of which call a model |
| R20 | Plans that ignore human capacity | High | Capacity ledger; a Go books hours |
| R21 | Tender-reader outputs trusted before an engineer checks them | High | Critical fields verified before the calendar goes live |
| R22 | Guarantee capacity is a real constraint, but internal finances are off-limits to agents | Medium | Human-entered yes/no (K7); figures never enter an agent's context |
| R23 | Integrations writing into other systems' databases | Medium | APIs only; contract tests; fingerprint checks |
| R24 | SLAs that promise more than two people can deliver | Medium | Roster-based callback times; ads limited to staffed hours; SLAs measured, not assumed |

### 16.2 Independent red-team review
*Pending: two independent reviewers (a systems and agentic-design reviewer, and a buyer-side and Saudi-market reviewer) read this draft cold. Their findings and the fixes are logged here.*

---

## 17. Where This Design Is Still Most Likely to Fail

1. **The Head of BD never materialises,** or is part-time and absorbed by operations. Probability: highest. The system's value collapses to reports.
2. **Data entry decays.** Agents are only as good as the pipeline records. Mitigated by mandatory next steps, voice capture and weekly hygiene scores; not eliminated.
3. **The Evidence Vault stays empty,** the sales twin of the marketing spec's fact-base rot. No agent can populate it; only people with the documents can.
4. **Qottuf's costs may be structurally above market.** No sales system fixes that. This one will show it within two quarters through the price-delta data, which is a feature.
5. **Rules shift under the playbooks** (procurement regulations, PDPL, WhatsApp policy). Versioned rules and a quarterly review reduce the lag.
6. **Over-automation erodes relationships.** In this market, trust is built face to face. Every customer-facing word stays human-sent for exactly this reason.

---

## 18. Decisions Needed from Asil

| # | Decision | Recommendation |
|---|---|---|
| 1 | Who is the Head of BD? | Name one person this month; the role is full-time |
| 2 | Thresholds X (elevator quote), Y (contracting bid), Z (capture) | Set from the last year's typical deal sizes |
| 3 | System of record | Sales Ledger as master; CRM stays the elevator desk's tool and syncs |
| 4 | Hosting and PDPL posture | In-Kingdom hosting for the Ledger if feasible; DPIA either way |
| 5 | Which estimation code line survives | Decide before Phase 2; the bid engine integrates with one |
| 6 | Elevators: which Fuji entity, the agreement and certificates; maintenance offered or not; the 22 missing prices; gating the dealer configurator | Provide documents; offer maintenance if capacity exists (it builds the installed-base engine); gate the dealer page now |
| 7 | The real revenue mix (villas vs institutional vs elevators) | Needed to weight the desks; if villa construction is material, add a private-client motion |
| 8 | Paid project data (MEED Projects, BNC, Ventures Onsite) | Start with Etimad + Muqawil; buy one database only if the missed-tender audit shows gaps |
| 9 | Bid capacity | How many full bids a month can estimating carry today? |
| 10 | Results of the September–October 2026 Meta campaign | Needed for the elevator baseline |
| 11 | Tender-use permission per named client | One approval per client, recorded with an expiry |
| 12 | Classification facts | The exact Grade 3 ceiling and expiry; SCA membership; Etimad and Muqawil registration status |

---

## 19. What to Hand Claude Code

Start with this order, not "build the system":

> Build Phase 1 of `qottuf-agentic-sales-department-v1.md` in the `Qottuf-Sales` repo.
> Scope: Sales Ledger schemas for Account, Contact, Opportunity, Evidence, Registration and Outcome (Zod at every boundary); S1-04 Pipeline Engine (stages, mandatory next step, SLA timers, deduplication, capacity ledger); SG-02 Commercial Guard and SG-04 PII Guard as code; SC-01 Instant Response with templates only; SC-02, SC-03, SC-04, S1-05 as Messages-API agents returning structured outputs (`output_config.format`, never forced `tool_choice`) on `claude-opus-5-5` with explicit effort; SC-05 cadence engine; a minimal SE-04 weekly brief.
> Reuse the marketing spine's Dispatcher, WorkOrder and OutputEnvelope schemas, and its governance services by API.
> Integrate with the elevator CRM through its API only, using a new read-and-suggest service role; never write to its database.
> Deliverable: `docker compose up`; a configurator submission produces an acknowledgement within 60 s, a qualified and routed record, a call brief, and after the technical response, a quote cover that SG-02 has checked, with the full audit trail.
> No sending integrations beyond acknowledgement templates. No model ever free-texts a prospect.

Then one phase at a time, each against its exit criteria.

---

## Appendix A: Fix-this-week list (no agents needed)

| # | Fix | Why it matters |
|---|---|---|
| A1 | Call +966 11 217 7750. If the line is retired, replace every "Call the office" button | It may be the single largest leak on the site |
| A2 | Add a contracting enquiry form (scope, sector, location, stage, timing, attachments) with consent wording and a WhatsApp opt-in, posting to the CRM ingest or Ledger | Contracting demand has nowhere to land today |
| A3 | Remove or gate the technical (dealer) configurator from the public menu | It publishes the negotiation floor |
| A4 | Fix the confirmation copy ("Sent to <email>" with no email sent; "your estimation team") or send a real confirmation | Broken promises at the first touch |
| A5 | Show a WhatsApp and phone fallback when a submission fails, instead of only queuing it in the visitor's browser | Failed leads are invisible today |
| A6 | Align public claims with the fact base: years, project counts, headcount, ministry logos (the Ministry of Interior rule) | Reviewers compare the website with submissions |
| A7 | Fill the 22 missing elevator costs or replace "Contact us" with a callback booking; correct the stair-lift price | Dead ends and a pricing error |
| A8 | Add a privacy notice, consent wording and WhatsApp opt-in to every form | PDPL |
| A9 | Add privacy-respecting analytics and persist UTM parameters into the CRM | Attribution is impossible today |
| A10 | Connect Meta lead forms to the CRM ingest (manual daily entry until then) | Leads left in Ads Manager go cold |
| A11 | Add an enumerated loss-reason column next to the free text | The system can't learn why it loses |
| A12 | Fix the hero's dead links and the default 404 page | Small, visible quality signals |

---

## Appendix B: Sources

**Qottuf repositories (read 18 November 2026):** `qottuf-marketing-ai` (spec, README, `src/`, branch `claude/fill-brand-dna-knowledge-base`), `qottuf-elevator-configurator` (`AGENTS.md`, `crm/`, `pricing/`, `marketing/`), `qottuf-estimation` (`main`, `claude/estimation-agent-audit-8c7886`, `wip/2026-10-30`), `qottuf-technical-agent` (`coord/`, `skills/tender-reader/`), `qottuf-project-tracker` (`docs/`, `backend/app/`), `qottuf-website` (`main`, `content-update-aug2026`, `nextjs-2026-09`); `qottuf-brand` skill (`facts-and-claims.md`, `open-items.md`).

**Market and regulation:**
- [Saudi giga-project slowdown frees contractors for Expo (AGBI, Oct 2026)](https://www.agbi.com/giga-projects/2026/10/saudi-giga-project-slowdown-frees-contractors-for-expo/)
- [Saudi construction hiring slows following giga-project rejig (AGBI, Aug 2026)](https://www.agbi.com/analysis/construction/2026/08/saudi-construction-hiring-slows-following-giga-project-rejig/)
- [Saudi projects market on course to roughly match last year's (Enterprise, Oct 2026)](https://enterpriseam.com/ksa/2026/10/28/saudi-arabias-projects-market-is-on-course-to-roughly-match-last-years-even-as-most-of-the-industry-says-conditions-have-gotten-worse/)
- [SAR 336.3B tenders launched via Etimad in 2024 (Argaam)](https://www.argaam.com/en/article/articledetail/id/1827106)
- [Ministry of Health: tenders and procurement (award visibility on Etimad)](https://www.moh.gov.sa/en/ministry/about/pages/tenders-and-procurement.aspx)
- [Saudi Arabia's new Government Tenders and Procurement Law (Clyde & Co, Oct 2026)](https://www.clydeco.com/en/insights/2026/10/saudi-arabia-new-government-tenders-procurement)
- [Government Tenders and Procurement Law, older regulations (MoF)](https://mof.gov.sa/Knowledgecenter/newGovTendandProcLow/Pages/sec03.aspx) and [summary (World Construction Network)](https://www.worldconstructionnetwork.com/newsletters/saudi-arabia-government-tenders-procurement-law)
- [Local content in Saudi public procurement (Clyde & Co, Sep 2026)](https://www.clydeco.com/en/insights/2026/09/local-content-in-saudi) and [Regulations on Preference for Local Content (MoF)](https://mof.gov.sa/en/docslibrary/RegulationsInstructions/Documents/Regulations%20on%20Preference%20for%20Local%20Content%20and%20Local%20SMEs%20and%20Companies%20Listed%20on%20the%20Capital%20Market%20in%20Business%20and%20Procurement%20Transactions2.pdf)
- [KSA contractor classification rules (Lexis, Sep 2025)](https://www.lexis.ae/2025/09/11/ksa-updates-contractor-classification-rules-with-new-project-division-criteria/) and [Implementing Regulation of the Contractor Classification Law](https://qanoniah.com/en/File/xBrpPJdgR5ow60KnAj06lEV31-Implementing-Regulation-of-the-Contractor-Classification-Law-1443)
- [PIF contractor programme (Muqawil)](https://pif.gov.sa/en/private-sector-hub/private-sector-programs/contractor-program) and [Contractors Consortium Platform](https://vote.muqawil.org/en/consortium)
- [SDAIA draft amendments to the PDPL Implementing Regulations (Clyde & Co, Oct 2026)](https://www.clydeco.com/en/insights/2026/10/sdaia-publishes-draft-amendments-to-the-pdpl) and [data transfer regulations and SCCs (Baker McKenzie)](https://insightplus.bakermckenzie.com/bm/data-technology/saudi-arabia-updates-data-transfer-regulations-and-introduces-the-first-set-of-standard-contractual-clauses)
- [Marketing consent in Saudi Arabia (Al Tamimi)](https://turtl.tamimi.com/story/law-update-issue-367-saudi-arabia-and-competition/page/11)
- [WhatsApp Business Platform pricing (Meta)](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Anti-Bribery Law amendments (Al Tamimi)](https://www.tamimi.com/law-update-articles/combatting-corruption-and-enhancing-integrity-in-the-kingdom-of-saudi-arabia-new-amendments-to-the-anti-bribery-law/)
- [Riyadh office market turns selective (Enterprise, Nov 2026)](https://enterpriseam.com/ksa/2026/11/12/riyadhs-office-market-turns-selective-as-rents-peak-and-supply-recedes/) and [Savills Riyadh market notes](https://www.savills.co.uk/insight-and-opinion/savills-news/394460/riyadh-real-estate-maintains-momentum-as-residential-activity-rebounds-and-grade-a-office-demand-remains-strong)
- [Hassan Allam / Sterling & Wilson JV wins Humain data centre (MEED)](https://www.meed.com/hassan-allamsterling-wilson-jv-wins-200m-humain-data-centre); [Humain tenders 100MW Riyadh AI data centre (MEED)](https://guest.meed.com/humain-tenders-100mw-riyadh-ai-data-centre/); [Data centres dominate January awards (Enterprise)](https://enterpriseam.com/ksa/2026/02/23/data-centers-dominate-project-awards-in-january/)
- [Expo 2030 Riyadh construction gathers pace (MEED)](https://guest.meed.com/expo-2030-riyadh-construction-gathers-pace/); [work on main buildings set to start in Q3 2026 (Zawya)](https://www.zawya.com/projects/construction/work-on-main-buildings-in-expo-2030-riyadh-set-to-start-in-q3-2026-report-nicybtie)
- [NCP seeks firms for university hospital PPP (MEED)](https://guest.meed.com/ncp-seeks-firms-for-umm-al-qura-university-hospital-ppp/); [New Murabba and Almana 200-bed hospital](https://www.saudigulfprojects.com/2026/08/new-murabba-signs-sar-1-billion-investment-partnership-with-almana-medical-group-for-200-bed-hospital-in-riyadh/)
- [Saudi Arabia elevator and escalator market (Arizton)](https://www.arizton.com/market-reports/saudi-arabia-elevator-and-escalator-market)
- [Atlas Elevators signs exclusive contract with FUJIHD (Argaam)](https://www.argaam.com/en/article/articledetail/id/1782143); [Asia Fuji Elevator (Project Suppliers)](https://projectsuppliers.net/en/node/10599); [Fujitec global profile](https://fujitecamerica.com/wp-content/uploads/2025/02/Fujitec_Global_profile_e.pdf)
- [SASO/SABER product certification (TÜV SÜD)](https://www.tuvsud.com/en-ae/services/product-certification/saso-saber-product-certification-in-saudi-arabia); [Lift City Expo Riyadh: mandatory inspections (TÜV SÜD)](https://www.tuvsud.com/en-ae/events/lift-city-expo-riyadh-2024)
- [Ventures Onsite KSA project database](https://venturesonsite.com/lp/construction-project-database-ksa); [BNC Network](https://bncnetwork.net/Access-GCC-Construction-Projects-News-Analytic-Reports-and-Forecasts)
- [The Short Life of Online Sales Leads (Oldroyd, McElheran, Elkington, HBR, March 2011)](https://hbr.org/2011/03/the-short-life-of-online-sales-leads)
