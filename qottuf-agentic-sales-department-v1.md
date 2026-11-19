# Qottuf Aljazeera — Agentic Sales Department
### Architecture Specification v1.1 · 18 November 2026
*The sales twin of `qottuf-agentic-marketing-department-v1.md` (repo `qottuf-marketing-ai`). Written to be handed to Claude Code as the source of truth. Built from a read of all six Qottuf repositories and a study of Saudi procurement and the Riyadh market as of November 2026. v1.0 was attacked three times: by its author, by an independent systems and agent-design reviewer, and by an independent buyer-side reviewer working from the Saudi market. 54 weaknesses and 9 factual errors were found; every one is fixed below and logged in §16.*

> **Update, 19 November 2026 (read this first).** Asil's answers of 18 November changed the mandate, and the executive meeting with marketing that night merged both departments into one (`meetings/2026-11-19-cso-cmo-executive-meeting.md`). **Where this spec differs from `qottuf-business-development-department-v1.md`, that document wins.** In short:
> - **Contracting** is main-contractor work of SAR 20–100 m only: no villas, no small works, no minor-works frameworks, no direct-purchase channel, no subcontract packages.
> - **Asil is Head of BD and the only seller.** The GM takes no meetings.
> - **Elevator maintenance** already exists.
> - **Certifications** are held and used as evidence, never as talking points.
> - **No campaign has launched,** so the elevator desk is sized from the first 30 days of real data.
> - **Phase 1 is Proof and Pipeline.**
> - **Asil's answers of 19 November:** no new hires (Asil covers the bilingual role; Claude Code builds and Asil approves every change); classification is Asil's to manage; villa lifts are in scope ("no villas" applies to contracting only).
>
> The agent cards, workflows, gates, data contracts and red-team log below remain the detailed design reference for the merged roster. Tier 1 is in `qottuf-tier1-2028-roadmap.md`; every weakness is in `qottuf-weakness-register.md`.

> **The one-paragraph version.** Qottuf doesn't first need more leads. It needs a conversion system and the people to run it. That means a named owner of revenue and an executive who sells. It means coverage of the consultants, PMCs and main contractors who decide private work: 8 of Qottuf's 12 verified projects were for private or semi-private clients. It needs one pipeline for contracting work, bid discipline and zero-defect compliance; same-day elevator quotes and 48-hour site surveys; a licensed after-sales offer that turns every installed lift into years of maintenance revenue; and a loop that learns from every outcome. AI agents are the staff that let a small team operate like a large one: they find, filter, prepare, check, remind and learn. Humans decide, price, call, visit, negotiate and send.

---

## Contents
0. What I Found: the current revenue engine
1. Strategic Premise: how Qottuf actually wins work
2. Market Study: where conversion happens (November 2026)
3. Design Principles
4. The Human Sales Organisation
5. Org Chart
6. Layer 1: Coordination
7. Layer 0: Governance
8. Layer 2: The Five Desks
9. The Seven Workflows (step by step, each one challenged)
10. Playbooks the Agents Enforce
11. Human Gates and the Delegation Matrix
12. Data Contracts and Integrations
13. Platform, Models, Security, Operations and PDPL
14. Metrics, Targets and Incentives
15. Build Sequence
16. Red-Team Log: every weakness found and how it was fixed
17. Where This Design Is Still Most Likely to Fail
18. Decisions Needed from Asil
19. What to Hand Claude Code
- Appendix A: Fix-this-week list (no agents needed)
- Appendix B: Sources

---

## 0. What I Found: the current revenue engine

Read across `qottuf-marketing-ai`, `qottuf-elevator-configurator` (configurators + CRM), `qottuf-estimation`, `qottuf-technical-agent`, `qottuf-project-tracker` and `qottuf-website`, plus the `qottuf-brand` fact base. Every code claim below was checked against the source.

### 0.1 Contracting

| # | Finding | Evidence |
|---|---|---|
| C1 | **Nobody's job is to win work.** The 45 positions modelled from the real org chart include a Quantity Surveyor and a Document Controller (who can estimate and run submissions) alongside the GM, Deputy GM, PMO, Construction and MEP Directors, and Commercial and Procurement Managers. None of them is a sales, business-development or bid role. | `qottuf-project-tracker/backend/app/services/positions.py` |
| C2 | **Most proven work came through relationships, not public tenders.** 8 of the 12 verified projects were for private or semi-private clients (PSU twice, KSU Endowments, InterHealth, DAMAC, NCB, two private clients); 3 were for KSU itself; PRJ-007's client is unconfirmed. | `qottuf-brand` `facts-and-claims.md` |
| C3 | **No pipeline for contracting work.** The only CRM is shaped around elevator quotations. Tenders, invitations and subcontract packages live nowhere. | `qottuf-elevator-configurator/crm/` |
| C4 | **The website can't capture contracting demand.** Live site (branch `content-update-aug2026`): one page, phone and email only. No enquiry or RFQ form, no WhatsApp, no analytics, no Arabic URL or hreflang, no service, sector or case-study pages, no downloadable profile or prequalification pack. The main "Call the office" button may dial a retired landline (code comment, `elevators/simple/index.html` ~line 2431). Hero buttons point to sections that don't exist. | `qottuf-website` |
| C5 | **Public claims a procurement reviewer can contradict:** "13+ Years" (founded 2014; the brand bans years-of-experience claims), "13 Key Projects" beside "fourteen", "more than two hundred people" (no source), ministry logos including the Ministry of Interior (fact-base rule: PRJ-007's client is never named). | live site vs `facts-and-claims.md` |
| C6 | **Pricing never hears from the market.** The bid price is pure cost-plus. Nothing records a client tender's outcome, the winning price, other bidders or loss reasons ("awards" in the estimation system are awards *to suppliers*). There is no approved or frozen estimate: the summary is recomputed live. Two divergent code lines exist (`main`, and `claude/estimation-agent-audit-8c7886`, which appears to run the live site); migrations 0004–0011 conflict. Every margin parameter except VAT is empty. | `qottuf-estimation` |
| C7 | **Tender reading is strong but stops early.** The tender-reader extracts a sourced deadline calendar, terms and risk sheet, the eligibility requirements as printed (it doesn't check Qottuf against them), BOQ exposure and clarification drafts. It is an interactive skill run on a laptop with shell access; its outputs are git-ignored files; its schema is provisional (T-006 open); pilot outputs (PSU car park) haven't been checked by an engineer. | `qottuf-technical-agent` |
| C8 | **Prequalification evidence is thin.** On `main`, the marketing fact base is empty; the 12 verified records live on branch `claude/fill-brand-dna-knowledge-base`, with no contract values, completion dates, reference contacts, completion certificates or tender-use permissions. PRJ-001 contradicts itself (named a college, summarised as a female students' club; the tracker holds a "Female Students Club (FC05)" programme). | marketing `fact_base/` |
| C9 | **Accounts may be dormant.** The NCB work predates the bank's 2021 merger into SNB; InterHealth and DAMAC may have been one-off jobs; KSU is several separate buyers (projects, operations and maintenance, the Medical City, the Endowments). | fact base; buyer-side review |
| C10 | **Delivery proof will come from the tracker** (dates, earned value, quality, HSE). It isn't live on a real project, has no consent-to-reference flag, and has no service accounts or integration API yet. | tracker `docs/` |

### 0.2 Elevators

| # | Finding | Evidence |
|---|---|---|
| E1 | **A working funnel exists and is Qottuf's strongest sales asset:** configurator → CRM → support verifies → technical office prices → quote → won/lost, with RBAC, MFA, audit log, SLA flags and cycle-time metrics. There is no sales manager; support closes, technical prices. | `AGENTS.md` |
| E2 | **The slow step is the quote:** first-contact SLA 24 h, technical pricing SLA 48 h, no field survey role. Villa owners compare quotes sent the same day on WhatsApp. | `crm/src/workflow.js` |
| E3 | **Price coverage gaps:** 19 of 41 sizes have a cost; the rest show "Contact us for pricing". Observation, bed and automobile lifts are unpriced. The stair-lift add-on is priced about ten times too low. | `pricing/HOW-TO-PRICE.md` |
| E4 | **The negotiation floor is public and channel prices conflict.** The technical configurator ("the margin range your sales team negotiates within") is in the public menu: a 450 kg passenger lift shows 56,500–73,000 SAR before installation and tax, overlapping the public "from 70,000 SAR including installation and two-year warranty". Partners get no incentive except configurator access. | website |
| E5 | **Leads can stall silently.** A failed submission sits in the visitor's browser until they revisit. The page says "Sent to <email>" but sends no email. No privacy notice or consent on any form. | website |
| E6 | **The system can't learn why it loses.** Lost reasons are free text; the `source` field can't attribute a lead to a campaign; Meta lead forms aren't connected (and the ingest rejects any lead without an email). | `crm/src/routes/dashboard.js`, `AGENTS.md` §3 |
| E7 | **Origin and trust proof are missing.** At least four unrelated "Fuji" lines sell in Saudi Arabia: Mayar Holding's Fuji Saudi Arabia (made in Jeddah by its subsidiary GEEC), FUJIHD (exclusive agent Atlas Elevators, 2025–2030, including parts), Asia Fuji (distributor Alfaneyah) and Fujitec (a separate Japanese manufacturer with its own Saudi subsidiary). No repo holds the manufacturer's legal name, Qottuf's authorisation, the certificate of origin, SABER certificates, warranty or parts commitments, yet the public material says "Fuji Japan". | Appendix B |
| E8 | **No after-sales offer.** SASO's lift regulation requires the owner of an in-scope lift to keep it under a maintenance contract as long as it is in service, with a licensed maintenance company, inspected yearly and re-registered yearly (§2.4). Qottuf has no documented maintenance licence or offer, so every buyer's day-one obligation goes to a competitor. | SASO TR, Arts. 8/2, 12/8, 14/3, 15/2 |
| E9 | **No approved record of what was offered.** `technical_responses` is one row per quote that every save overwrites, holding a price range, lead time, validity and free text; no warranty, payment terms or inclusions. `markQuoted` records only the channel used. | `crm/src/db.js`, `crm/src/routes/technical.js` |
| E10 | A funded Meta campaign (SAR 2,000, 27 Sep–10 Oct 2026) was planned. Its results are in no repo. | `marketing/riyadh-two-week-campaign.md` |

### 0.3 Cross-cutting

- **The marketing platform can't carry sales as it stands.** Its default frontier model, `claude-opus-4-1-20250805`, was retired on 5 August 2026, so frontier-tier agents fail with the default configuration today. It forces tool calls (a 400 on Claude Opus 5.5 and Sonnet 5.5), pins an SDK (`^0.32.1`) that predates structured outputs, authenticates no route (including the compliance override, whose `overridden_by` is free text), and publishes Postgres (default credentials) and Redis ports. Its Dispatcher hard-wires marketing stages and a 40k-token budget; its Work Order requires a `campaign_id`; its envelope carries only `{en, ar}` text; Langfuse is in the spec but not in the code. → Sales gets its own runtime (§13.1).
- **The CRM emits no events** (`broadcast()` is a no-op); notifications reach only an open browser tab; the ingest accepts requests with no Origin header (the public key and a per-IP limit are the only controls).
- **Data residency is undecided** (CRM on Vercel + Turso; tracker demo on US hosting); PDPL transfer safeguards are documented nowhere.
- **Fragile integration history:** OneDrive duplicates of the elevator folder and website; the CRM lost its data twice (a hosting trial ended; then a new empty database on each of three deploys). Integrations go through APIs only, never into another system's database.
- **Reusable assets:** the CRM's capability-based RBAC, MFA and audit pattern; marketing's governance design and its D-03 statistics veto; the tender-reader's extraction contract; estimation's Price Book and insights; the tracker's numeric grounding idea (a starting point only: tested on Saudi copy it both misses and over-rejects; see §7).

### 0.4 The diagnosis, ranked by revenue at stake

1. **No owner of revenue, and the principal isn't deployed as a seller.**
2. **No coverage of the people who decide private work** (consultants, PMCs, Tier-1 contractors, interior design studios), where most of Qottuf's proven work came from.
3. **Contracting demand has nowhere to land** (no form, no pipeline).
4. **Public claims a reviewer can contradict**, including an origin claim ("Japan") with no certificate in any repo.
5. **The elevator funnel is slow at the quote, has no field survey, no after-sales offer, and conflicting channel prices.**
6. **Pricing is blind to the market**, and nothing freezes what was offered.
7. **The tools exist in pieces,** and the platform meant for reuse is neither current nor secure.

---

## 1. Strategic Premise: how Qottuf actually wins work

Qottuf sells two different things into two different buying systems. One generic "sales funnel" would serve neither.

| | Motion A: Contracting (projects) | Motion B: Elevators (product, installation, after-sales) |
|---|---|---|
| Ticket | High | Mid per unit; multi-unit for buildings; recurring maintenance |
| Volume | Low: dozens of opportunities a year | Higher: hundreds of enquiries a year possible |
| Buyer | Owner + consultant/PMC + procurement; or a main contractor buying a package | Villa owner, apartment investor, contractor, engineering office, consultant |
| Route to buy | Invitations via consultants and PMCs; negotiation with repeat clients and frameworks; subcontract packages; Etimad public tenders; direct purchase for small values | WhatsApp, ads, configurator, referral, the contractor's or engineer's recommendation → 2–4 quotes → site survey → decision |
| What decides | Who is invited (trust, track record, registration); then compliance (pass/fail); then price among the compliant | Who reaches the buyer at shaft-design stage; speed of a credible quote; trust (origin, certificates, after-sales); price clarity |

**Three laws that shape every agent below:**

1. **Most work is decided before anyone writes a bid:** by who is registered and invited, how specifications read, and who the decision-makers already trust. The system therefore invests in coverage and capture before proposal writing.
2. **Human capacity is the binding constraint, not leads.** Estimating hours, technical-office hours and senior attention are finite. Win rate is managed by choosing what to pursue.
3. **Speed and follow-through convert inbound, and for elevators the slow step is the quote, not the first call.** In an audit of 2,241 US companies, firms that tried to contact a web lead within an hour were nearly seven times as likely to qualify it as firms that responded even an hour later (Oldroyd, McElheran and Elkington, HBR 2011). A same-day budget quote and a 48-hour site survey matter more than a 15-minute callback alone.

**The conversion engines, ranked by return on effort:**

1. **Repeat, expand and frameworks at existing accounts** (GM-led), once the account audit shows which are live. One framework or term agreement per sector (bank branch works, university minor works or maintenance, a hospital group's fit-out) replaces dozens of separate bids and keeps Qottuf on site every week.
2. **Coverage of the people who decide private work:** consultants, PMCs, Tier-1 main contractors (priced *while they bid*, not after they win), interior design studios. Invitations follow trust, and trust is built in person.
3. **Win the elevator at shaft-design stage:** a field engineer covering engineering offices, villa contractors and repeat apartment developers; a free shaft check within 48 hours of receiving a drawing; same-day budget quotes.
4. **Become a licensed lift maintainer:** maintenance is a legal obligation for in-scope lifts, so it is recurring revenue, an annual reason to call, the first call when the building needs modernisation or fit-out, and the after-sales proof that beats a cheaper quote.
5. **Selective, compliant bidding on public tenders,** with Etimad as a cheap filter, not the centre of the plan.
6. **Being specified:** Qottuf on consultants' and main contractors' approved lists; Qottuf's elevators in specifications.

**Anti-goals:**
- An AI "SDR" sending cold email or WhatsApp at volume (PDPL makes consent the default for marketing messages; Meta can ban the number; institutional buyers read it as desperation).
- Treating Etimad volume as the strategy: lowest-price public bidding is where a Grade 3 firm earns least.
- Optimising win rate or margin while ignoring cash: slow payers kill mid-tier contractors (§14).
- AI-written proposals containing anything that can't be proven.
- Building forty agents before one riyal is attributable to the system.

---

## 2. Market Study: where conversion happens (November 2026)

Sources are in Appendix B. Figures from single or secondary sources are marked; nothing here is a forecast.

### 2.1 Direction of the market

- **Giga-projects reprioritised.** The PIF dropped The Line and Trojena from its 2026–30 strategy in August 2026. Contractor capacity is moving to Expo 2030 Riyadh (main buildings from Q3 2026; convention-centre design-and-build tender drew interest in September 2026) and to handovers at Red Sea, Qiddiya and Diriyah.
- **A buyer's market.** Contractors report more competition per contract and cost pressure on lump-sum work without escalation clauses. Analysts expect fewer, stronger contractors, more joint ventures and higher prequalification thresholds.
- **Awards are still strong.** The Saudi Contractors Authority recorded SAR 111 bn of awards January–July 2026, up almost 60% year on year (reported by AGBI). Government tenders launched on Etimad reached SAR 336.3 bn in 2024 (LCGPA).
- **For a Grade 3, Riyadh, mid-sized contractor:** the opportunity is institutional and commercial work below the giga tier, packages under Tier-1s redeploying to Expo and data centres, fit-out driven by regional headquarters, completion of stalled projects, and lift maintenance. The threat is thinner prices and stricter prequalification.

### 2.2 Demand pockets mapped to Qottuf's proof

| Pocket | 2026 evidence | Qottuf proof | Route to buy, and what to pitch |
|---|---|---|---|
| Riyadh office fit-out | 700+ regional HQs licensed; Grade A occupancy 98%; 2.5 m sqm of new Grade A due by 2030, with 2026 completions slipping; occupiers favour ready, fitted space; flex operators growing | PRJ-009 tenant fit-out, 13 floors, about 29,000 sqm; PRJ-006 bank branches | PMCs and interior design studios choose the builders; landlord/developer tenders; tenants direct; flex operators |
| Data centres | Humain 100 MW Riyadh EPC RFP (Oct 2026); Hassan Allam / Sterling & Wilson ~USD 200 m Riyadh data centre (Oct 2026); SDAIA 480 MW Hexagon, SAR 10.1 bn (Jan 2026); Airtrunk 250 MW | PRJ-004 DAMAC data centre **external works** | Packages under the EPCs. Pitch only what the proof supports: external and civil works, fencing, admin-area fit-out. A hyperscale EPC will ask for critical-power references Qottuf doesn't have |
| Healthcare | NCP PPP programme (147 opportunities from a 500+ pipeline); 200-bed hospital in Riyadh (Almana / New Murabba, Aug 2026) | PRJ-003 InterHealth 100-bed fit-out; PRJ-002, PRJ-008 at KSU | PPP consortia and their EPCs; private hospital groups; fit-out frameworks |
| Education | Repeat KSU and PSU work | PRJ-001, -002, -005, -008, -009, -011 | KSU is several buyers (projects, operations and maintenance, the Medical City, the Endowments); PSU is private. Campus works happen in summer, decided in Q1 |
| Completion of stalled projects (استكمال) | Common in a buyer's market where contractors fail | PRJ-002 (completion works), PRJ-009 (lift works left outstanding by others) | Owners and consultants of stalled projects; Etimad completion tenders. Credibility beats price |
| Expo 2030 Riyadh | Infrastructure awarded (Nesma & Partners, Al Yamama); buildings from Q3 2026 | Turnkey, MEP, fit-out, elevators | Price packages for the Tier-1s while they bid; mostly 2027+ |
| Smart accessibility | University disability centres; accessibility tied to lifts | No delivered project; no Freedom Scientific authorisation letter on file | Bundle with lifts once the authorisation letter is in hand; never claim a delivered project |
| Elevators: villas and residential | Riyadh housing shifting toward apartments (Arizton); villa demand real but unmeasured | Configurators; PRJ-005 (6 elevators) | Engineering offices and villa contractors at shaft-design stage; owners; apartment investors |
| Elevators: maintenance | Mandatory for in-scope lifts (SASO) | PRJ-005's six lifts, PRJ-009's lifts | Every lift Qottuf installs; lifts orphaned by importers who left the market |

### 2.3 How each buyer actually buys: the conversion map

| Buyer | How they buy | What decides | Where deals are won or lost | Qottuf's lever |
|---|---|---|---|---|
| Government entity (incl. KSU) | Etimad tender; direct purchase up to SAR 1 m under the new law (SMEs have priority); frameworks | Eligibility → compliance → lowest evaluated price | Registration; document completeness; price; being known for small works | Current registrations; SME certificate if eligible; zero-defect submissions; price-to-win data |
| Private institution (PSU, hospitals, banks) | Invitation via consultant/PMC; negotiation with known suppliers; frameworks | Consultant's recommendation; same-scope record; price; relationship | The invite list; the consultant's view; "match the lowest bid" meetings | Consultant coverage; reference visits; executive relationships; priced value-engineering alternatives |
| Developer, landlord, HQ tenant (fit-out) | Design-and-build or fit-out tender via PMC or design studio | Time certainty, price, references | Being on the PMC's or studio's list; programme credibility | Design-studio and PMC partner programme; PRJ-009 proof |
| Main contractor (package) | Collects package prices **while bidding**; registered subcontractors; negotiation after award | Price, capacity, reliability, payment terms, ISO/HSE prequalification | Pricing the winning bid; registration; past performance | Quote packages to every likely bidder; prequalification documents ready |
| Villa owner (elevator) | WhatsApp, referral, contractor's recommendation → 2–4 quotes → site survey | Trust, price clarity, look, after-sales, timing | Same-day quote; who measures the shaft; follow-up; origin and service proof | Same-day budget quote; 48 h survey; comparison sheet; maintenance offer; reference sites |
| Contractor or engineering office (elevator) | Specification at design stage → quotes from regular suppliers | Spec fit, trade terms, reliability | Being their supplier at design stage | Field engineer; free shaft check; trade terms in writing |
| Apartment investor (multi-unit lifts) | Price-driven, several units | Price per unit, delivery, maintenance | Price and speed | Developer pricing; framework prices; maintenance bundle |

**The most important timing fact in elevator sales:** the shaft, pit and headroom are fixed at structural design stage. Whoever is present then (usually through the engineer or contractor) locks in the sale; a buyer reached at finishing stage is shopping on price.

### 2.4 Rules of the game (verify before relying; several are changing now)

| Rule | What it says | Sales implication |
|---|---|---|
| **New Government Tenders and Procurement Law** | Royal Decree M/76 (27/02/1448H), approved August 2026; in force 120 days after publication in the Official Gazette (about 2 January 2027 if published on 4 September 2026, as reported). Direct-purchase ceiling SAR 100k → **SAR 1 m** (Art. 32), with priority for local SMEs; variations without re-tender 10% → 20%; entities must settle dues before new commitments; performance guarantees standardised; grievance deposit 0.5% of bid value (SAR 15,000 against prequalification decisions), refundable if upheld, with three working days to escalate (Arts. 84–86). Implementing regulations to follow. Whether the variation rule covers works is unconfirmed. | Small works at existing accounts become a direct channel; expanding inside live contracts becomes a lever; the grievance route is a real tool. Re-verify every rule here when the regulations publish |
| **SME status (Monsha'at)** | Medium enterprise: up to 249 full-time staff and SAR 200 m revenue (confirm). 2019 Preference Regulations: 10% price preference for local SMEs except supply and high-value contracts; the Monsha'at certificate exempts the initial guarantee. The new law keeps SME priority (Art. 9), direct-purchase priority (Art. 32) and the bid-security exemption (Art. 42; an exempt SME whose security would have been forfeited pays 2% of its bid value). | If Qottuf is eligible, the certificate is worth more than any agent in this spec for government work. The website claims "more than two hundred people", close to the cap: check headcount now |
| Old GTPL rules still widely cited | Bid guarantee 1–2%, performance bond 5%, 90 working days' validity; bids ≥25% below estimate could be excluded only after review and negotiation | Re-verify under the new regulations |
| Etimad transparency | Award notices published; visibility of winner, value and other bidders varies by entity | An award-price dataset is buildable, with stated coverage |
| Local content (LCGPA) | 10% price preference for national products; Mandatory List expanded from 1 March 2026; **office furniture has been on the Mandatory List since 2022** (chairs and office desks among the first 13 products) | Imported "European" furniture can't go into government fit-outs: find a Saudi manufacturer partner. Check whether lifts or components are listed |
| Contractor classification | Grade sets the maximum value per government contract; 2025 amendments on splitting large projects | The exact Grade 3 ceiling is the first knock-out; not in any repo |
| Saudi Contractors Authority / Muqawil | Projects Platform; Contractors Consortium Platform (JV partners); PIF and Airport Holding prequalification | Registration and profile completeness are lead channels; JVs open work above Grade 3 |
| **SASO lift regulation** (read in full) | Scope: electrical lifts "prepared for public use in buildings and facilities" (whether private villa lifts are covered is to be confirmed). The owner keeps the lift under a maintenance contract "as long as it is in service" (8/2) with a maintenance company licensed by the competent authority (15/2); inspection at least once a year (14/3); registration renewed yearly after inspection (12/8); every lift's technical file includes a **certificate of origin** (12/4) | Maintenance is mandatory demand for apartment, commercial and institutional lifts. The certificate of origin already exists in each compliant lift's file: retrieve it before making any origin claim |
| PDPL | Consent is the default for advertising and direct marketing; legitimate interest is narrow and needs an assessment; transfers abroad need safeguards; SDAIA draft amendments (consultation closed 5 Nov 2026) may add in-country storage and an impact-assessment trigger for emerging technologies; anti-spam rules govern calls and messages | No cold bulk outbound; an append-only consent log; redaction before model calls; a DPIA per agent |
| WhatsApp Business Platform | Per-message pricing since July 2025; template categories; opt-in required; service-message charging changes from 1 Oct 2026 (sources differ) | Customer-initiated chats and approved utility templates only; a company number, never personal phones |
| Anti-bribery | Saudi Anti-Bribery Law as amended (2021 amendments reach the private sector dealing with public authorities and add corporate liability); Nazaha expects controls on gifts, hospitality and facilitation payments | A hospitality register and a non-overridable integrity core (§7) |
| Calendar | Government fiscal year = calendar year (budget approved in early December); Ramadan about 8 Feb–9 Mar 2027 (confirm against Umm al-Qura) | A sales calendar in the Pipeline Engine (§10.10) |

### 2.5 Competitive reality (sales lens)

- **Elevators:** global OEMs with Saudi presence (Fujitec, Otis, KONE, Schindler, TK Elevator, Mitsubishi Electric) compete for specified work; importer-integrators sell Asian-made lifts on price; at least four "Fuji" lines operate. Which one Qottuf supplies changes the story completely: if the lifts are Mayar's Saudi-made Fuji, "Japan" is wrong but there is a local-content advantage; if they are FUJIHD, a competitor (Atlas) controls the exclusive agency and parts until 2030; if they are made in China under a licence, "Japan" misstates origin (commercial-fraud exposure). The documents decide what Qottuf may say.
- **Contracting:** Riyadh mid-tier contractors compete on price in a buyer's market; Tier-1s take the big packages and buy subcontract scopes.
- **Not claimed here:** market shares or win rates. SA-03 builds the real competitive map from Etimad award data within 90 days of going live.

### 2.6 What could not be verified (decide with data, not folklore)

Qottuf's historical win rates, bid volumes and revenue mix (a tracker code comment says RC-frame villas are "the work Qottuf does most", which conflicts with the institutional positioning); headcount (SME eligibility); the Grade 3 ceiling; whether lifts are on the LCGPA list; whether private villa lifts fall under SASO's maintenance rule; villa-elevator demand; the Meta campaign's results; whether the new law's variation rule covers works.

---

## 3. Design Principles

Principles 1–8 are inherited from the marketing spec (§1 there): one agent = one job; the author is never the reviewer; no unsourced claims; structured self-challenge; Arabic is a parallel original; human gates are permanent; every agent emits a structured envelope; fail loud. Sales adds twelve:

9. **Humans own relationships and numbers.** No agent sends to a live prospect, sets a price, offers a discount, promises a date or signs anything. The only automatic customer-facing text is pre-approved, fixed acknowledgement shown on the page or sent inside a chat the customer started (§8 SC-01).
10. **Capacity is the scarce resource.** Every output is judged by whether it moves human hours toward higher expected value, never by volume.
11. **Every open opportunity has an owner, a next step and a date,** enforced in the status rules of whichever system staff work in.
12. **Learn from outcomes, not activity.** Measured in collectable margin won, win rate by segment, cycle time and reasons.
13. **Clean selling, proportionately.** A deterministic integrity core that nobody can override (no inducements to officials or evaluators, no contact with an evaluation committee during a live tender, no competitor information without a lawful source); a hospitality register for lawful customs; model-raised flags go to a named human reviewer.
14. **Data minimisation that is measured, not assumed.** Redaction of personal data before model calls with measured recall; an append-only consent log checked per recipient; a retention schedule.
15. **Deterministic wherever possible.** Scoring, deadlines, expiry, SLAs, statistics, deduplication, templates and commercial checks are code.
16. **Every agent earns its place with leading measures.** Golden-set accuracy, human minutes saved and edit rates at eight weeks; outcomes at twelve months. An agent that doesn't earn its place is deleted.
17. **Untrusted input is separated by architecture, not by instructions.** Agents that read untrusted text (tenders, emails, WhatsApp, web pages) output only typed fields and have no tools. Agents that hold internal data never see raw untrusted text and have no web tools. Outputs render as plain text.
18. **What is sent is what is checked.** Customer messages leave only through company channels that re-run the commercial and consent checks on the final text and log it.
19. **Cash and after-sales are part of the sale.** A deal that won't be paid, or a lift with no maintenance plan, is not a good sale.
20. **Rules are versioned and dated.** Procurement and data rules apply by the tender's publication date; every decision records the rule, prompt and model version that made it.

---

## 4. The Human Sales Organisation

Agents can't own revenue, sit in a majlis, read a room or be accountable. This is the minimum team; the first two rows are the gaps that block everything else.

| Role | Owns | Likely holder today (confirm) | Load |
|---|---|---|---|
| **Executive seller** | 6–8 executive meetings a month with account decision-makers, consultant principals and Tier-1 managing directors; negotiations matched by seniority; executive sponsor for the top three accounts; frameworks | Asil or the GM | 20–30% of their time |
| **Head of Business Development** | Pipeline and targets; bid/no-bid below threshold; key accounts; the coverage programme; approves agent plans | **Nobody.** Hire for an existing Riyadh network of consultants and PMCs (a Saudi national also strengthens the Nitaqat band), or appoint the Deputy GM or Commercial Manager with a reduced load | Full-time |
| Bid coordinator | Tender calendar, document purchase, Etimad and portal submissions, Evidence Vault, registrations | Document Controller | Half to full-time |
| Estimator | Pricing in `qottuf-estimation` | Quantity Surveyor | Existing |
| Technical reviewer | Tender technical review, method statements, clarifications, site visits | MEP or Construction Director | Per bid |
| Elevator sales desk | Calls, same-day budget quotes, closing; evening shift to 22:00 and Saturdays | CRM `agent` role (about two people today) | Add a shift |
| Elevator field engineer | Site surveys within 48 h; coverage of engineering offices, villa contractors and developers | **New role** | Full-time |
| Elevator technical office | Detailed pricing and technical answers | CRM `technical` role | Existing |
| Maintenance supervisor | Maintenance contracts and service, if Qottuf is licensed | New or existing technicians | Per installed base |
| Compliance reviewer | Clears or upholds model-raised integrity flags; keeps the hospitality register | Commercial Manager or counsel | A few hours a week |
| System owner | Runs the sales platform: on-call, restore drills, releases, evals | **New, named and budgeted** (part-time engineer or contractor) | Part-time |
| Finance contact | Payer bands, collections data, financing cost | Finance | A few hours a month |

**Every role has a named backup.** When an SLA lapses, work routes to the backup; a gate held by Asil falls to a named deputy below a second threshold that Asil sets. Leave, Hajj, Ramadan hours and site days are in the roster, so no acknowledgement promises a callback the roster can't keep.

**The coverage programme (human, starts in Phase 0, needs no agents):** a list of 30–40 consultants, PMCs, Tier-1 contractors, interior design studios and engineering offices, each with a named Qottuf owner, a visit cadence and a next meeting date; reference visits to delivered projects hosted by a senior engineer; technical seminars engineers can count toward professional development where the Saudi Council of Engineers accepts them; references requested at every handover. Agents support it from Phase 1 (SD-02 meeting prep and debrief).

---

## 5. Org Chart

```
                    ┌──────────────────────────────────────┐
                    │ ASIL / GM: principal + executive     │
                    │ seller (6–8 executive meetings/month)│
                    └──────────────────┬───────────────────┘
                                       │
                    ┌──────────────────▼───────────────────┐
                    │ HEAD OF BD (human): owns pipeline,   │
                    │ coverage programme, weekly plan      │
                    └──────────────────┬───────────────────┘
                                       │
     ┌─────────────────────────────────┼──────────────────────────────────┐
     │                                 │                                  │
┌────▼──────────────┐    ┌─────────────▼──────────────┐    ┌──────────────▼───────┐
│ GOVERNANCE (L0)   │◄───┤ S1-03 DISPATCHER +         ├───►│ S1-02 DEAL DESK      │
│ 4 sales gates +   │    │ S1-04 PIPELINE ENGINE      │    │ REVIEWER (QA gate)   │
│ brand rules       │    │ (code, not LLM)            │    │ author ≠ judge       │
└───────────────────┘    └─────────────┬──────────────┘    └──────────────────────┘
                                       │   S1-05 Correspondence Drafter (shared)
     ┌──────────────┬──────────────────┼──────────────────┬───────────────────┐
     │              │                  │                  │                   │
┌────▼────┐   ┌─────▼─────┐     ┌──────▼──────┐    ┌──────▼──────┐     ┌──────▼──────┐
│ DESK A  │   │  DESK B   │     │   DESK C    │    │   DESK D    │     │   DESK E    │  L2
│ INTEL   │   │ BIDS &    │     │  ELEVATOR   │    │ ACCOUNTS    │     │  REVENUE    │
│ find · 4│   │ CAPTURE   │     │ DESK · 7    │    │ grow · 4    │     │ LEARNING · 3│
│         │   │ win · 8   │     │ convert +   │    │             │     │ learn       │
│         │   │           │     │ after-sales │    │             │     │             │
└─────────┘   └───────────┘     └─────────────┘    └─────────────┘     └─────────────┘
```

**Total: 34 components.** 24 call a model somewhere; 10 are pure code (S1-03, S1-04, SG-04, SC-01, SC-03, SC-04, SC-05, SC-06, SD-03, SE-03). Phase 1 builds 13, only five of which call a model (§15). The red team removed the Revenue Orchestrator (ranking by expected value and capacity is arithmetic: it is now a section of SE-04's code-built weekly plan) and merged three learning agents into two.

---

## 6. Layer 1: Coordination

### S1-02 · Deal Desk Reviewer (QA gate) *(Phase 2)*
- **Task 1:** Score every artifact leaving the sales system that carries persuasion or risk (proposal sections for weighted evaluations, prequalification packs, account plans, and message drafts that mention commercial terms or go to a key account) against its Work Order's acceptance criteria and §10.
- **Task 2:** Return `APPROVED` / `REVISE` (numbered fixes) / `REJECT` (reason). Maximum two revision rounds, then a human.
- **Never:** rewrites. **Hard rule:** nothing passes without SG-01, SG-02 and SG-03 passes.
- **Not used for:** lowest-compliant-price tenders, which get compliance and price checks only (§9 W2).
- **Engine:** `claude-opus-5-5`, effort high, separate context from every author. **Proof it works:** weekly planted defects it must catch (§13.5); human-found defects after approval trending to zero.

### S1-03 · Dispatcher *(Phase 1, code)*
The sales runtime's own queue: per-artifact-type pipelines (not marketing's fixed stage list), retries, dead-letter, per-order token budgets sized to the artifact (tender work needs far more than 40k tokens), run log with provenance.

### S1-04 · Pipeline Engine *(Phase 1, code)*
- Stage rules and allowed transitions for both motions; owner, next step and date required (principle 11).
- SLA timers, escalation to backups, and paging through a named channel (push or SMS to staff phones; CRM notifications only reach an open tab).
- Deduplication *suggestions* across configurator, Meta, WhatsApp and manual entry (a human confirms every merge).
- The calendar (tenders, clarifications, quote validity, certificate expiry, the sales calendar of §10.10) and a **capacity ledger** (hours per role per week, booked by each Go decision).
- Forecast and expected-value arithmetic for the weekly plan. No model anywhere in it.

### S1-05 · Correspondence Drafter *(Phase 1, shared)*
- **Task 1:** Draft every one-to-one message a human will send, in the recipient's language (Saudi Arabic for most elevator buyers, written natively), from an intent plus typed opportunity fields.
- **Task 2:** Self-critique against "would this person forward it, or delete it?" and the cadence rules (every message gives something: a document, an answer, a date, a proof).
- **Never:** sends; states a price, date or term not supplied as an approved value (SG-02 re-checks the final text at send).
- **Engine:** `claude-opus-5-5`, effort medium. **Leading measure:** how much reps edit drafts before sending.

---

## 7. Layer 0: Governance

### 7.1 Why the governance design changed

v1.0 let the gates check lists the author declared (`commitments[]`, `evidence_refs[]`), and borrowed the tracker's number check. The systems red team showed both fail: anything the author leaves off a list passes; "14-storey", "5-year warranty", "24/7", "fourteen projects" and Arabic duals such as "أسبوعين" carry no digit the check recognises, while a correct "SAR 1,250,000" was rejected, and one bad number deleted a whole Arabic paragraph. The fix is the pattern marketing's L0-05 already uses: **independent extraction, then code.**

1. The artifact is rendered to its final text in both languages.
2. A separate extractor (its own context, effort low) lists every number, unit, duration, price, percentage, date, warranty, payment term, inclusion and factual claim, each with its exact text span.
3. Code normalises: Arabic-Indic and Persian digits; `,` and `٬` separators; decimal-comma ambiguity flagged, not guessed; ranges; hyphenated compounds; number words in English and Arabic including duals and plurals; "24/7"; `%` and `٪`.
4. Code checks every item against the approved record (a versioned technical response, a frozen estimate snapshot, a Vault record, the public fact base).
5. The author's declared lists are compared with the extraction; any difference fails the artifact.
6. Arabic is split into sentences on Arabic punctuation, so one bad number removes one sentence in either language.
7. Every case above is in the golden sets (§13.4).

### 7.2 The four sales gates

**SG-01 · Integrity Gate** *(Phase 2)*
- **Deterministic core, no override:** offers or implications of gifts, hospitality or payments to public officials or to anyone evaluating a live tender; contact with an evaluation committee about a live tender outside the official channel; competitor prices or documents without a lawful source (published awards, official debriefs); undisclosed referral payments.
- **Proportionate scope:** the blackout covers the evaluation committee and the tender's subject during the live tender. Project-delivery communication with the same entity continues through logged channels. Lawful customs (Eid and Ramadan greetings, iftar invitations to private-sector contacts, lunch at a reference-site visit, technical seminars) are allowed and logged in the hospitality register within value caps; the cap is zero for officials and live-tender evaluators.
- **Model-raised flags** go to the named compliance reviewer, who clears or upholds them with a logged reason.
- **Tested against ordinary contract text** so it doesn't fire on "payment milestones" or "testing and commissioning". Rule changes need two people and a log entry.

**SG-02 · Commercial Guard** *(Phase 1; extraction + code)*
- Every commercial item found by extraction must match an approved, versioned record: a technical-response version (elevators), an estimate snapshot frozen at S-G2 (contracting), or a public configurator price with its inclusions. Each artifact cites the version and hash; a revision voids open covers built on the old version.
- Blocks costs, margins, trade ranges, payer bands and price-to-win analyses from leaving.
- Blocks unapproved commitments in both languages.
- **Runs twice:** on the draft, and again on the final text at send time in the company inbox.

**SG-03 · Evidence Verifier** *(Phase 2; extraction + code)*
- Every claim in a tender, prequalification or proposal artifact resolves to an Evidence Vault record approved for that tier, unexpired, and consistent with the public fact base.
- Flags conflicts with Qottuf's public footprint so a submission never contradicts what a reviewer can look up.

**SG-04 · PII and Confidentiality Guard** *(Phase 1; code)*
- Redacts personal data (names, phone numbers, emails, national ID and iqama numbers, addresses, plot numbers) from free text before any model call, with recall measured on golden sets; typed fields carry pseudonymous IDs.
- Checks the append-only consent log for each recipient at send time.
- Checks each tender's confidentiality clause at intake before its documents reach any model provider (technical-agent decision D-034 is Qottuf's internal permission, not the client's).
- Logs data flows for the records of processing.

### 7.3 Brand and language checks

Until the marketing platform is upgraded and secured (§13.1), sales embeds the brand rules locally: the `brand_book.yaml` rules and the `qottuf-brand` skill's checks (banned words, names, digits, first person, the competitor test). Arabic follows the brand rule: written natively, never machine-translated, reviewed by Asil before first use as a template.

---

## 8. Layer 2: The Five Desks

Notation: **Engine** is the model and effort (or "code"); **Leading measure** is reviewed at eight weeks, outcomes at twelve months; **Phase** is from §15.

### DESK A: INTELLIGENCE (find the work)

**SA-01 · Tender Scout** · Phase 2
- **Task 1:** Daily, collect new tenders and RFQs from Etimad, Muqawil's Projects Platform, entity portals, invitations by email, and licensed databases if subscribed, through official access only.
- **Task 2:** Screen in code (activity, region, classification ceiling, value band, days to deadline) and classify scope against the six service lines, proof (PRJ IDs) and the completion-project filter (استكمال). Screening runs synchronously, so the 06:00 digest never waits on a batch.
- **Never:** decides to bid. **Engine:** code + `claude-opus-5-5` low. **Leading measure:** zero relevant tenders missed in the monthly audit against Etimad awards.

**SA-02 · Signal Hunter** · Phase 4
- **Task 1:** Watch public sources for pre-tender signals: regional-HQ licences and office moves, Grade A completions, contract awards disclosed on Tadawul/Argaam (who just won and needs packages), NCP PPP milestones, university and hospital capital plans, stalled projects.
- **Task 2:** Emit typed signals (organisation, event type, date, source URL). Matching to Qottuf's accounts happens in code inside the Ledger.
- **Never:** receives internal data (its sessions see only public sources and a public keyword list). **Engine:** `claude-opus-5-5` medium; a scheduled Managed Agents deployment is acceptable because no internal or personal data enters it. **Leading measure:** signals that became qualified opportunities.

**SA-03 · Award and Price Intelligence** · Phase 3
- **Task 1:** Ingest Etimad award results (winner, value, other bidders where shown) and Qottuf's frozen bid history into price-to-win benchmarks by scope, sector and entity, and a competitor win map.
- **Task 2:** A price-position note per live pursuit, with stated coverage ("12 comparable awards, 4 with all bidders shown").
- **Never:** sets a price; leaves the internal tier. Statistical claims pass SE-03. **Engine:** code + `claude-opus-5-5` medium.

**SA-04 · Account Researcher** · Phase 4
- Dossiers per target account (structure and buying units, procurement routes, consultants used, capital plans, public news, Qottuf's history), refreshed monthly, from public sources only. **Engine:** `claude-opus-5-5` medium, batch.

### DESK B: BIDS AND CAPTURE (win the work)

**SB-01 · Bid/No-Bid Analyst** · Phase 2
- **Task 1:** Apply the Pursuit Scorecard (§10.1, formula and knock-outs in code) using the tender summary and the Vault.
- **Task 2:** Write the rationale, the single most likely reason Qottuf would lose, what would change the decision, and the capacity it would book.
- **Never:** decides (S-G1). **Engine:** code + `claude-opus-5-5` high. **Leading measure:** agreement with the Head of BD's decisions on the backtest set; override rate.

**SB-02 · Tender Intake Coordinator** · Phase 2, **with preconditions**
- **Preconditions:** a versioned `tender_summary` contract with a validator (technical-agent T-006); the tender-reader running on a sandboxed server (not an interactive laptop session with shell access); capacity sized from the hours the PSU pilot actually took.
- **Task 1:** Purchase decision for the tender booklet, then document registration, tender-reader run, and the validated summary, risk register and clarification drafts into the opportunity. Full reads only for screened-in tenders.
- **Task 2:** Bid calendar and Compliance Matrix skeleton. Critical fields (dates, guarantees, eligibility, ruling language) are verified by the bid coordinator against the portal before the calendar goes live; tender-reader clarification drafts are untrusted until a human reviews them.

**SB-03 · Capture Planner** · Phase 5 (humans run capture from Phase 0)
- Maintains capture plans for strategic pursuits and framework targets: hot buttons in the client's words, win themes (benefit + discriminator + proof ID), competitor assessment, access plan (SG-01-clean), teaming/JV, pricing-strategy question for the estimator, review date and kill rule. **Engine:** `claude-opus-5-5` high.

**SB-04 · Compliance Matrix and Submission Checker** · Phase 2
- **Task 1:** Map every *mandatory submission requirement in the tender instructions* (forms, guarantees, certificates, envelope structure, signatures) to its answer and evidence; "ready to submit" is impossible below 100% of these.
- **Task 2:** Route technical conflicts from the specifications to clarification, qualification or priced assumption, instead of blocking.
- **Engine:** code + `claude-opus-5-5` low. **Leading measure:** zero disqualifications for documents or form.

**SB-05 · Proposal Writer** · Phase 3, weighted evaluations only
- Drafts the technical proposal (executive summary, understanding, methodology framing, organisation, programme narrative, quality and HSE approach) in the ruling language first, from the capture plan, tender summary and Vault. Self-critiques against the evaluation criteria. **Never:** writes a number not in the approved evidence. **Engine:** `claude-opus-5-5` medium.

**SB-06 · Prequalification and Registration Manager** · Phase 2
- **Task 1:** Assemble prequalification packs and vendor registrations from the Vault, including what Tier-1s ask for (ISO 9001/14001/45001 certificates if held, HSE statistics, insurance, key-staff CVs with Saudi Council of Engineers registration), the SME certificate, the local-content certificate and the Nitaqat band; keep the Registration Ledger.
- **Task 2:** Warn 60/30/7 days before any certificate or registration expires. **Never:** releases confidential-tier evidence (S-G6). **Engine:** code + `claude-opus-5-5` low.

**SB-07 · Red Team Evaluator** · Phase 3, weighted evaluations only
- Scores the draft as the tender's evaluation method would, from the evaluator's chair; sees only the artifact and the tender. **Engine:** `claude-opus-5-5` high. **Leading measure:** correlation with actual technical scores.

**SB-08 · Clarification and Negotiation Prep** · Phase 3
- **Task 1:** Turn clarification drafts into questions worth asking; draft answers to the client's clarifications; prepare the qualifications-and-exclusions list; flag when the grievance window (§2.4) is worth using.
- **Task 2:** The negotiation brief (§10.4): tradeables, concession plan, value-engineering alternatives, payment-term trades. **Never:** negotiates or proposes the walk-away. **Engine:** `claude-opus-5-5` high.

### DESK C: ELEVATOR DESK (convert inbound, sell after-sales)

**SC-01 · Acknowledgement** · Phase 1 · **code, no model**
- **On the page:** the configurator's completion screen shows the reference, what happens next and a callback window computed from the staffed roster.
- **In chats the customer started** (WhatsApp click-to-chat): a fixed, pre-approved reply inside the service window.
- **SMS or email only after the number or address is verified by a one-time code.** No message is ever sent to an unverified number someone typed into a form.
- Protected by a bot check on forms, a global send cap per hour and day, and a kill switch. Browser ingest requires an allowed Origin; server sources (Meta webhooks) are signature-verified. Lead text reaches no model before SG-04 redaction.

**SC-02 · Call Notes and Qualifier** · Phase 1
- **Every lead is called fast, unranked.** After the call, SC-02 turns the rep's notes or voice memo into CRM fields and a classification (**Priority** / **Future** / **Unqualified**, using the campaign plan's definitions), plus a proposed next step and date the rep confirms. Structural-stage projects are flagged for the field engineer.
- **Engine:** `claude-opus-5-5` low. **Leading measure:** rep reclassification rate; data completeness.

**SC-03 · Call Brief** · Phase 1 · **code template**
- An instant one-screen brief from the structured configuration: summary, what to verify (shaft, pit, headroom, stops, power, timing, decision-maker), the nine discovery questions, and the approved objection answers keyed to the configuration (§10.6).

**SC-04 · Quote Builder** · Phase 1 · **code template + SG-02**
- **Budget quote, same day:** from the technical office's approved price book for standard configurations, labelled "budget quote, subject to site survey", with inclusions, exclusions and validity.
- **Detailed quote:** from the versioned technical response, with warranty, payment milestones, maintenance offer and the customer comparison checklist (installation, warranty length, maintenance period, certification, controller, door type, lead time), which moves the conversation from price to what is included without naming a competitor.

**SC-05 · Follow-up Engine** · Phase 1 · **code + S1-05 drafts**
- Cadences by stage (§10.6): day-based for buyers ready to buy; milestone-based (shaft complete, roof slab, finishing start) for structure-stage buyers who buy 3–9 months later; quotes re-issued at expiry, never silently archived. Every touch is human-sent from the company inbox.

**SC-06 · Installed Base and Maintenance** · Phase 1 (conditional on the maintenance licence) · **code + S1-05 drafts**
- Registers every lift Qottuf installed or maintains (starting with PRJ-005's six and PRJ-009's lifts, with the clients' agreement): handover, warranty end, maintenance contract, annual inspection and registration renewal dates, modernisation candidates. Triggers renewal, inspection-booking and referral conversations, human-sent.

**SC-07 · Specifier and Partner Programme** · Phase 2
- **Task 1:** Arabic shaft-requirement sheets, data sheets, specification text in consultants' formats (CSI-style Section 14 21 00), and CAD/BIM details (through the technical agent's Revit capability); tracks the free 48-hour shaft-check service.
- **Task 2:** The partner ledger (engineering offices, villa contractors, developers, interior design studios): written, disclosed trade terms and referral contracts, who refers, what converts. **Engine:** `claude-opus-5-5` medium.

### DESK D: ACCOUNTS (grow the work)

**SD-01 · Account Planner** · Phase 2 (account audit), Phase 4 (full)
- **Phase 2:** supports the account audit: last job, whether the contact is still in role, relationship owner, payment band, buying units (KSU mapped as separate buyers).
- **Phase 4:** per key account, the buying-committee map, whitespace (six service lines × account, plus maintenance), capital and timing signals, relationship health, and a 90-day plan with at most three actions, each with an owner and date. **Engine:** `claude-opus-5-5` high.

**SD-02 · Meeting Prep and Debrief** · Phase 1
- Before every client, consultant, studio or Tier-1 meeting (including the executive seller's): agenda, what changed, open items, proof to bring, the ask. After: decisions, actions, owners and dates into the pipeline (the human confirms). **Engine:** `claude-opus-5-5` medium.

**SD-03 · Reference and Proof Manager** · Phase 2 · **code + S1-05 drafts**
- At every handover: request the reference letter, completion certificate and permission to cite; record each as a dated tender-use approval; maintain the reference-site list (host villas, institutional lifts) with permissions; feed consented proof to marketing's B-04 through a marketing Work Order.

**SD-04 · Expansion Trigger** · Phase 4
- Opportunities from post-award events: defects-period end, variations (up to 20% under the new law once confirmed for works), next phases, adjacent service lines, maintenance and modernisation. **Engine:** code + `claude-opus-5-5` medium.

### DESK E: REVENUE LEARNING (learn)

**SE-02 · Win/Loss Analyst** · Phase 3
- **Task 1:** Structured reason codes on every closed opportunity within two business days; interview scripts for losses and wins above the threshold (a human calls).
- **Task 2:** Quarterly synthesis and proposed playbook changes (objection answers, scorecard weights, talk tracks) from qualitative evidence, labelled as such; never self-edits; the Head of BD approves. **Engine:** `claude-opus-5-5` high.

**SE-03 · Statistical Sanity** · Phase 2 · **code (port of marketing D-03)**
- Below n=30 per group → insufficient data; p ≥ 0.05 → rejected; confounds downgrade; win rates with Wilson intervals.

**SE-04 · Sales Reporting and Weekly Plan** · Phase 1 (minimal), Phase 2 (full)
- Code-built: pipeline coverage, conversion, cycle times, SLA performance, hygiene, expected-value ranking against the capacity ledger, decisions needed. A short model-written narrative of what changed. **Leading measure:** decisions taken from it.

---

## 9. The Seven Workflows

Notation: `[AGENT]` agent · `<code>` deterministic · `(Human)` person · `{GATE}` human gate. SLAs are proposals for Asil to confirm.

### W1 · Elevator enquiry → order

```
Enquiry ─► <SC-01 on-page / in-chat ack> ─► (Rep calls, unranked, with <SC-03 brief>) ─►
[SC-02 notes → classify] ─► <SC-04 same-day budget quote> {S-G4 rep sends} ─►
(Field engineer survey ≤48 h) ─► (Technical office: versioned response) ─►
<SC-04 detailed quote + SG-02> {S-G4 rep walks through it} ─► <SC-05 cadence> ─►
won ─► installation ─► <SC-06 maintenance + inspection dates> ─► <SD-03 reference>
 └─► lost ─► [SE-02 reason codes]
```

1. **Land:** configurator, Meta lead form (a new ingest route that needs name and phone only), WhatsApp to the company number, the new website form, or a logged call. Every source carries campaign identifiers.
2. **Acknowledge** on the page or in the customer's own chat (SC-01).
3. **Call:** median ≤ 15 minutes in staffed hours (to 22:00, Saturdays included), ceiling 60 minutes, next morning 09:30 otherwise; measured from telephony and inbox records, not a rep's click.
4. **Classify after the call** (SC-02); next step and date mandatory in the CRM's own status rules.
5. **Same-day budget quote** from the price book (SC-04), sent from the company inbox.
6. **Site survey within 48 hours** by the field engineer; shaft, pit, headroom, power and photos captured.
7. **Detailed quote:** the technical office saves a new versioned response (priority ≤ 24 h, standard ≤ 48 h); SC-04 builds the cover; the rep walks the customer through it by phone. A quote is never just sent.
8. **Follow-up** by stage (SC-05); revisions go back to the technical office as a new version, which voids the old cover.
9. **Close.** Won: amount and summary, installation, maintenance contract and inspection dates registered (SC-06), reference requested. Lost: reason codes within two business days.

**Challenged:**

| Failure point | Control |
|---|---|
| Someone floods the form to make Qottuf message strangers | Messages only on the page, in customer-started chats, or after a one-time code; bot check; send caps; kill switch |
| Rep uses personal WhatsApp and takes the customer data | A shared company WhatsApp Business inbox (a number separate from estimation's supplier RFQs); personal WhatsApp banned for customer conversations; voice notes, photos and location pins captured |
| Buyers enquire in the evening and at weekends | A shift to 22:00 and on Saturdays, instead of cutting ad delivery to office hours |
| The quote is slow, so the customer buys from whoever measured the shaft | Same-day budget quote; 48 h survey; detailed quote SLA |
| A cheaper "Fuji" quote looks equivalent | Origin documents (Phase 0); comparison checklist; maintenance offer; reference sites |
| Duplicates inflate the pipeline | Dedup suggestions; a human confirms merges |
| A structure-stage buyer is archived when the quote expires | Milestone cadence; quote re-issued |

### W2 · Tender pursuit (Etimad, invited or package RFQ)

Stages: `identified → screened → decided (go / no-go / conditional) → preparing → submitted (revisions) → evaluation → won | lost | cancelled | no_award | withdrawn | no_bid → contracted`

1. **Surface** (SA-01): 06:00 digest; knock-outs in code; a missing tender value means "verify", not "fail".
2. **Read** (SB-02): buy the booklet if screened in; tender-reader on the server; critical fields verified against the portal.
3. **Decide** (SB-01) → `{S-G1}` within two business days of the documents. No-bid reasons recorded. A Go books capacity.
4. **Choose the track by evaluation method:**
   - **Lowest compliant price:** compliance (SB-04) and price only. No proposal writer, no red team, no Deal Desk on prose.
   - **Weighted technical and financial:** the full path (SB-05 → SB-07 → S1-02).
5. **Kick off** (30 minutes, human): owners and internal dates (compliance review D-10, red team D-5 for weighted, sign-off D-2, submission D-1, never the last day).
6. **Clarify** (SB-08) through the official channel at least three business days before the deadline.
7. **Price:** the estimator builds cost; SA-03's note informs; financing cost and the payer band are in the margin decision; the estimate is frozen and snapshotted (`defensible` required) at `{S-G2}`.
8. **Check and submit:** SG-01/02/03 → SB-04 at 100% of mandatory requirements → `{S-G3}` → the bid coordinator uploads.
9. **Evaluation:** clarifications sent by a human through the official channel; BAFO brief if invited; grievance route considered within its window if a decision looks wrong.
10. **Outcome:** award data from Etimad; frozen price vs the winner's; reason codes within two business days; request a debrief.
11. **Contracted:** the tracker project is created through its API once it has service accounts.

**Challenged:**

| Failure point | Control |
|---|---|
| The Scout misses a tender | Monthly audit against Etimad awards; manual intake for invitations |
| The tender-reader misreads a date or guarantee | Coordinator verifies critical fields against the portal |
| Bidding everything | Capacity ledger; a new Go beyond capacity needs a named trade-off |
| Pricing to win at a loss, or for a slow payer | SA-03 informs only; payer band and financing cost in the margin decision; the floor is a human decision with a reason |
| Seven reviewers on a lowest-price tender | Track by evaluation method |
| A good tender wrecked by spec conflicts | 100% rule only for mandatory submission requirements; conflicts become clarifications or qualifications |
| Last-day upload failure | D-1 rule; portal readiness checked at D-3 |

### W3 · Capture and frameworks (pre-tender)

Trigger: a signal, an account plan, or an executive meeting reveals a future project or a framework opportunity (a university building in a capital plan, a bank's branch programme, a hospital group's fit-out pipeline, a PPP consortium forming).

1. Light qualification: real and funded, when, our fit, legitimate access.
2. A capture plan with a human owner (SB-03 from Phase 5; a one-page template before then).
3. **Access:** executive meetings, reference visits, technical seminars, registration with the owner and consultant, early technical input through official channels. Everything SG-01-clean.
4. **Shape:** get invited; propose a framework or term agreement where the client buys repeatedly; decide on a JV when the value exceeds Grade 3.
5. When a tender issues, hand over to W2 with win themes ready.

**Challenged:** capture eats senior time on projects that never tender → review date and kill rule (no access progress in 60 days → park).

### W4 · Key-account growth

1. **Account audit first** (Phase 0–2): which accounts are live, who the contacts are now, who owns each relationship, payment record, buying units.
2. Executive seller sponsors the top three; SD-02 before and after every meeting; plans carry at most three actions with owners and dates.
3. Whitespace with proof: introduce service lines and maintenance the account hasn't bought.
4. Small works through direct purchase (SME priority, if eligible) and variations on live contracts.
5. Every handover triggers references (SD-03) and expansion (SD-04).

**Challenged:** plans nobody reads → three actions only; an account with no completed action in 60 days is flagged weekly.

### W5 · Specifiers, partners and subcontract packages

1. **Shaft-design stage:** the field engineer visits engineering offices, villa contractors and repeat developers with shaft sheets and CAD/BIM details; offers a free shaft check within 48 hours of a drawing; signs written, disclosed trade terms.
2. **Design-led fit-out:** a partner programme for interior design studios and PMCs who choose fit-out builders.
3. **Tier-1 packages:** quote MEP, fit-out and elevator packages to every likely bidder on live Tier-1 bids (Expo, data centres, hospitals) *before* award, with prequalification documents ready.
4. **Registrations:** owners, PMCs, Tier-1s (SB-06), with renewals.

**Challenged:** partners go quiet → quarterly partner review; partners with no referral in two quarters lose trade terms; every referral payment is under a written, disclosed contract.

### W6 · After-sales: maintenance and the installed base

1. **Phase 0 decision:** obtain the maintenance licence and publish maintenance tiers (e.g. one or two free years including inspection handling with every new lift; extended warranty for buyers who sign a maintenance contract).
2. Offer maintenance to every lift Qottuf has installed, with the owners' agreement (SC-06 registry).
3. Annual inspection and registration renewal are booked by Qottuf for the owner: a yearly reason to visit.
4. Modernisation and the next fit-out or MEP job are raised at each visit (SD-04).

**Challenged:** maintenance is operations, not sales → the maintenance supervisor owns delivery; sales owns the contract and renewal; service-level promises are made only to what the team can deliver.

### W7 · Learn

- **Weekly:** SE-04 report and plan (pipeline, SLAs, hygiene, expected-value ranking, decisions, capacity).
- **Monthly:** win/loss and price-position review with the Head of BD.
- **Quarterly:** scorecard calibration once enough pursuits are decided; playbook changes proposed by SE-02 and approved by the Head of BD; input to marketing's quarterly objectives (sectors, proof, objections to answer with content).
- **Twelve months:** outcome review of every agent.

**Challenged:** learning from noise → SE-03 veto; qualitative interviews carry the signal while numbers are small.

---

## 10. Playbooks the Agents Enforce

### 10.1 Qottuf Pursuit Scorecard (contracting)

**Knock-outs** (any one → no-bid, unless the alternative route applies):

| Code | Knock-out | Source | Alternative route |
|---|---|---|---|
| K1 | Value above the classification ceiling. **If the value isn't published:** estimate from BOQ quantities or comparable awards; if still unknown, status "verify", not "fail" | Classification record + tender | JV through Muqawil; subcontract to a qualified prime |
| K2 | Mandatory registration or prequalification missing and not obtainable in time | Registration Ledger | Register for the next round |
| K3 | Mandatory certificate expired or unavailable by the deadline | Evidence Vault | Renew; next round |
| K4 | Scope outside the six service lines with no partner | Tender summary | Partner or subcontract |
| K5 | Too little time: full bid < 10 working days, small bid < 3 | Bid calendar | Ask for an extension |
| K6 | Integrity flag upheld | SG-01 | None |
| K7 | Guarantee capacity unavailable (a yes/no from the Head of BD; agents never see the figures). Not applicable where the SME certificate exempts the bid bond | Head of BD | None |
| K8 | Payer band "do not extend" (from finance) for this client or its payment structure | Finance | Only with secured payment terms |

**Scored factors** (each scored 0–3; a 2 or 3 requires cited evidence; a knowable fact that nobody has found scores 0):

| Factor | Weight | 3 looks like |
|---|---|---|
| Fit: same scope and scale delivered | 15 | A named, comparable project with references |
| Relationship and access | 15 | Prior work with them; decision-makers know us |
| Shaping: involved before the tender | 10 | We were consulted, or the specification fits us |
| Competitive position | 10 | Few credible competitors; we are the incumbent |
| Price position vs price-to-win data | 10 | Our cost sits below comparable award levels |
| Evaluation-method fit | 5 | Weighted evaluation that rewards our proof |
| Margin and commercial risk (retention, delay damages, advance, price adjustment) | 10 | Healthy margin and balanced terms |
| Payer reliability (finance band; pay-when-paid exposure) | 10 | A reliable payer on direct terms |
| Strategic value (new sector, reference value, repeat potential) | 10 | Opens a sector or a framework |
| Capacity at that time | 5 | Estimating and delivery both free |

**Formula:** `score = 100 × Σ(wᵢ × sᵢ ÷ 3) ÷ Σwᵢ`, summed over *scorable* factors. A factor whose data source doesn't exist yet (price position before SA-03 in Phase 3) is excluded and the scorecard is marked *partial*.

**Thresholds:** start at ≥ 65 Go, 45–64 Conditional (name the fix and a date), < 45 No-bid, then **backtest on the Phase 0 baseline of past tenders** and adjust until the scorecard reproduces the decisions that, with hindsight, were right. Weights and thresholds are versioned configuration; changes need two people and a log entry. The score is not a probability: once 30+ pursuits are decided, SE-04 reports observed win rates per score band.

### 10.2 Capture plan (one page)

Client hot buttons in their words · Win themes (benefit → our discriminator → proof ID) · Competitor assessment (what they will claim; how we pre-empt it factually) · Access plan (who, how, when; SG-01-clean) · Framework potential · Teaming/JV · Pricing-strategy question · Risks · Review date and kill rule.

### 10.3 Proposal standard (what the Deal Desk checks, weighted evaluations)

1. **Compliant first:** the client's structure, headings and order; 100% of mandatory requirements.
2. **Executive summary in their terms:** their objective → our approach → proof → why us. No adjectives.
3. **Every claim has a proof ID;** numbers only from approved evidence.
4. **Show we read their documents:** their constraints, our clarifications, the risks we found.
5. **Value engineering as a weapon:** a compliant base bid plus priced alternatives where the tender allows them.
6. **A deliberate qualifications and exclusions list,** written by the technical reviewer, not discovered after award.
7. **Key staff:** CVs with Saudi Council of Engineers registration; senior engineers attend site visits.
8. **Arabic is native and numbers match across languages.**
9. **Banned:** superlatives, "guaranteed", unapproved commitments, anything a competitor could say unchanged.

### 10.4 Negotiation, BAFO and "match the lowest bid"

The walk-away is set by the estimator and Asil before any meeting. Tradeables are listed in advance: payment terms (price for a higher advance payment or faster interim certificates), phasing, alternates, value-engineering options, validity, scope trims. Never match a lower bid without changing scope or terms. Concede in decreasing steps. Whoever negotiates can close within the delegation matrix; seniority is matched (the executive seller attends where the client's decision-maker does). Authority limits per §11.

### 10.5 Account plan and buying committee

Map the roles: **economic buyer**, **technical evaluators** (consultant, MEP engineer, facilities), **procurement**, **users**, **champion**, **blockers**. For each: stance, last meaningful touch, what they need. Multi-thread every account. A meaningful touch gives something (an update, a technical answer, an invitation, relevant proof); "checking in" is not a touch. KSU is mapped as separate buyers.

### 10.6 Elevator desk talk track (scripts written natively in Saudi Arabic)

**Discovery (nine questions):** building stage (design, structure, finishing, existing) · own use, rental or investment · stops and use (persons, load) · shaft status (exists? dimensions, pit, headroom) · who decides and who else is involved (engineer, contractor; does the contractor already have a lift supplier?) · anyone elderly or with reduced mobility (rescue device, accessibility options) · the deadline that matters (move-in, a family occasion, Ramadan) · what matters most (price, look, brand, speed, maintenance) · other quotes received.

**Stage rule:** at design or structure stage, lock the shaft now: shaft sheet plus a free check of their drawing within 48 hours.

**Objection library** (approved answers, evidence-linked; maintained through SE-02):

| Objection | Answer shape | Evidence (status) |
|---|---|---|
| "Another quote is cheaper" | Compare inclusions line by line with the comparison checklist; never disparage a competitor | Inclusions template |
| "Which Fuji? Is it really Japanese?" | The manufacturer's legal name, certificate of origin, authorisation naming Qottuf, SABER certificates, installed references; claim exactly what the papers prove | **Pending: Phase 0** |
| "You're a contractor: who services it?" | Licensed maintenance offer and tiers; response times the team can meet | **Pending: maintenance decision** |
| "My contractor already has a lift supplier" | Free shaft check; trade terms for the contractor in writing | Trade terms |
| "Can I pay in instalments?" | Payment plan tied to construction milestones, if approved | Pricing architecture (§10.7) |
| "Can I see one installed?" | Reference sites (host villas, institutional lifts) with permission; demo cabin | SD-03 list |
| "How long until installation?" | Only approved lead times | Technical response |
| "Will it fit my existing house?" | Site survey first; no promise before it | Survey checklist |

**Follow-up cadence:** ready-to-buy buyers: D0 walk-through call · D+2 questions · D+5 relevant proof · D+10 decision check, offer a visit · D+20 validity reminder, re-issue at expiry. Structure-stage buyers: keyed to construction milestones (shaft complete, roof slab, finishing start). Stop on a decision or an opt-out. Every touch is human-sent from the company inbox.

### 10.7 Elevator pricing architecture (set by the technical office and Asil; SG-02 enforces)

- **Three channels, checked like-for-like:** retail (installed, warranty, maintenance offer), trade (engineering offices and villa contractors: a trade price plus a written, disclosed referral fee), developer/volume (framework prices for multi-unit buildings). Trade never undercuts retail for the same inclusions without a stated reason.
- **Two tiers:** value and premium (the pricing data already carries standard and luxury tiers).
- **Payment:** instalments tied to construction milestones (deposit, shaft ready, installation, handover); a price lock for a deposit while the building is under construction.
- **The trade price range is never public** (Appendix A).

### 10.8 Outcome and loss-reason taxonomy (one primary + any secondary)

`PRICE` (with delta %) · `TECH_NONCOMPLIANT` · `DOCS_INCOMPLETE` · `INELIGIBLE` · `NOT_SUBMITTED` · `INCUMBENT_RELATIONSHIP` · `SPEC_LOCKED` · `SCOPE_MISMATCH` · `CANCELLED_DEFERRED` · `NO_DECISION_GHOSTED` · `CHOSE_CHEAPER_BRAND` · `TRUST_ORIGIN_DOUBT` · `NO_AFTER_SALES` · `TIMING_NOT_READY` · `PAYMENT_TERMS` · `OUR_CAPACITY` · `OTHER` (free text required). The CRM's free-text `lost_reason` gets an enumerated companion column (append-only migration).

### 10.9 Executive selling

Six to eight executive meetings a month, planned by the Head of BD and prepared by SD-02: top-account decision-makers, consultant and PMC principals, Tier-1 managing directors, framework targets. Reference visits hosted by a senior engineer. Negotiations matched by seniority. The executive seller doesn't approve from a distance; they sell.

### 10.10 Sales calendar (held in the Pipeline Engine)

- **Fiscal year = calendar year;** budgets are approved in early December, so capital visibility comes early in the year.
- **The new procurement law** takes effect around 2 January 2027; re-verify this spec's rules when the implementing regulations publish.
- **Ramadan** (about 8 Feb–9 Mar 2027; confirm against Umm al-Qura): Ramadan working hours, evening meeting slots, cadences paused over Eid, no internal deadlines planned in Eid weeks without checking the entity's holidays.
- **Summer campus works:** universities decide summer 2027 work around February to April. A human-led push in Q1, before the bid engine exists.
- **Year-end:** ask existing accounts about remaining small works this fiscal year (a cheap test, not an assumption).
- **July–August:** decisions slow; plan follow-ups accordingly.

---

## 11. Human Gates and the Delegation Matrix

| Gate | Trigger | Approver |
|---|---|---|
| **S-G1 Bid decision** | Go / no-go / conditional | Head of BD below the bid threshold; Asil above it or when strategic |
| **S-G2 Price and terms** | Any price, discount, payment term or validity offered | Elevators: technical office (budget quotes from the approved price book need no further approval); Asil above the elevator threshold. Contracting: estimator + Head of BD below the bid threshold, Asil above; the estimate is frozen at this gate |
| **S-G3 Submission** | Tender package release | Head of BD + authorised signatory; mandatory requirements at 100% |
| **S-G4 Live communication** | Any message to a named prospect or client | The human sender, through the company inbox (SG-02 and the consent check re-run on the final text) |
| **S-G5 Evidence Vault write** | New certificate, reference, permission or project record | Bid coordinator with the document attached; Asil for anything that changes a public claim |
| **S-G6 Confidential release** | Financial statements, bank letters, guarantee facilities | Asil, per release |
| **S-G7 Integrity** | SG-01 | Deterministic core: no override. Model-raised flags: the compliance reviewer, logged |
| Marketing G2, re-used | Naming a client in a new context such as a tender | Asil once per client, recorded as a dated tender-use approval that SG-03 checks |

**Thresholds for Asil to set:** elevator quote value (X), contracting bid value (Y), capture investment (Z), deputy threshold (D).

**Against gate fatigue:** S-G1 decisions batched into a 15-minute daily bid board; approvals in one queue; templates approved once; tender-use approvals per client; the weekly report lists decisions, not activity.

---

## 12. Data Contracts and Integrations

### 12.1 Systems of record, by phase

- **Phase 1:** the elevator CRM stays the master for elevator records, because that's where staff work. The Sales Ledger polls it (the CRM emits no events) and holds what the CRM can't: the consent log, the installed-base registry, the calendar and capacity ledger.
- **Phase 2 onward:** the Ledger is the master for contracting opportunities, accounts, contacts, evidence, registrations and outcomes. Elevator records stay in the CRM until Asil decides whether the future Qottuf app replaces its interface; the Ledger then becomes the single master behind the app.
- Every system links by ID; integrations use APIs only.

### 12.2 Core objects

**Opportunity** (abridged; full schemas are Phase 0 work)

```json
{
  "opportunity_id": "OPP-2026-0087",
  "version": 7,
  "motion": "contracting | elevator",
  "parties": [
    { "role": "buyer | end_client | consultant | pmc | main_contractor | jv_partner", "account_id": "ACC-0012", "share_pct": null }
  ],
  "title": "",
  "route": "invited_private | etimad_public | package_rfq | direct_negotiated | direct_purchase | framework | inbound_elevator",
  "service_lines": ["fit_out", "mep"],
  "sector": "education",
  "stage": "screened",
  "owner": "human:head_of_bd",
  "next_step": { "action": "", "owner": "", "due_at": "" },
  "value_band": { "min_sar": null, "max_sar": null, "source": "tender | estimate | client | unknown", "confidence": "low" },
  "lots": [],
  "dates": { "published_at": "", "booklet_purchased_at": "", "clarification_deadline": "", "site_visit_at": "", "submission_deadline": "", "decision_expected_at": "" },
  "rules_version": "gtpl-2019 | gtpl-2026",
  "eligibility": { "classification": "ok | verify | fail", "registrations": "", "certificates": "", "sme_certificate": "", "local_content": "" },
  "decisions": [
    { "decision": "go | no_go | conditional", "scorecard_version": "", "score": null, "partial": false, "decided_by": "", "decided_at": "", "reason": "", "provenance": { "rule_version": "", "prompt_version": "", "model_served": "" } }
  ],
  "submissions": [
    { "revision": "A", "submitted_at": "", "value_ex_vat_sar": null, "vat_basis": "", "estimate_snapshot_hash": "", "frozen": true }
  ],
  "bidders": [ { "name": "", "price_ex_vat_sar": null, "source": "etimad_award | debrief" } ],
  "outcome": { "result": "", "primary_reason": "", "secondary_reasons": [], "winner": "", "winning_value_ex_vat_sar": null, "price_delta_pct": null },
  "payer_band": "internal: A | B | C | do_not_extend",
  "history": [ { "at": "", "actor": "", "event": "", "from": "", "to": "" } ],
  "links": { "tender_ref": "", "technical_agent_project_id": "", "estimation_project_id": "", "crm_quote_id": "", "tracker_project_code": "" }
}
```

**Other objects:**

| Object | Key fields |
|---|---|
| Account | id, names AR/EN, type, parent, buying units, procurement routes, consultants used, relationship owner, executive sponsor, last job, payer band (internal), Qottuf history |
| Contact | id (pseudonym for agents), account links with role history, buying-committee role, preferred channel and language, opt-out. Personal data lives only here |
| Consent event | append-only: contact, channel, scope, wording version, source, timestamp, withdrawn_at |
| Signal | source URL, captured_at, organisation, event type, matched account (in code), expires_at |
| Evidence record | id, type, **tier** (public, tender, confidential, internal), issuer, issued_at, **expires_at**, file hash, permitted uses, linked PRJ, read log |
| Registration | organisation/portal, status, reference, renewal date, owner |
| Installed unit | site, owner account, model, manufacturer, origin document, handover, warranty end, maintenance contract, inspection and registration due dates |
| Technical response version (CRM change) | quote, version, price, inclusions, exclusions, warranty, payment milestones, lead time, validity, maintenance offer, author, hash; append-only |
| Conflict-of-interest declaration | person, entity, nature, declared_at |
| Roster and delegation | person, role, hours, leave, backup, delegated authority and limits |
| Hospitality register | date, recipient type, entity, value, purpose, approver |

**Evidence tiers, enforced in the database:** *public* (the marketing fact base) · *tender* (completion letters, references, permissions, certificates, CVs) · *confidential* (financial statements, bank letters, guarantee facilities; released only through S-G6) · *internal* (costs, margins, payer bands, price-to-win, competitor notes, scorecards; never leave). Row-level security enforces the tiers; every read of confidential and internal rows is logged; bid prices are visible only to the roles that need them.

### 12.3 Work Orders and envelopes

Sales copies the marketing `WorkOrder` and `OutputEnvelope` schemas into its own runtime and extends them (they are not shared code until the marketing platform is upgraded): `opportunity_id` replaces `campaign_id`; a **typed payload** per artifact type (scorecard, quote cover, brief, proposal section), not only `{en, ar}` text; `pii_policy: "redacted"` (anything else is rejected); `evidence_tier_max`; provenance (prompt version, model served).

### 12.4 Integration map

| System | Into the Ledger | Out of the Ledger | Needed first |
|---|---|---|---|
| Elevator CRM | Polled: quotes, statuses, technical-response versions, won amounts | AI briefs and suggestions as labelled notes (a human confirms) | **CRM changes:** a scoped service key bound to a new `ai_service` role with `quotes.read`, `files.read` and a new narrow `ai_note` capability (notes only: no call outcomes, no follow-up dates; the existing `activity.write` can log call outcomes, so it is not granted); append-only, versioned technical responses with structured terms; next step required in the status rules; an enumerated loss reason; a Meta ingest route needing name and phone only |
| Company WhatsApp Business inbox and email | Final sent text, timestamps (first-contact measurement) | Drafts for humans to send | A shared inbox on a number separate from estimation's supplier RFQs; send-time checks |
| Website | Contracting enquiry form; campaign identifiers | — | The form (Appendix A) |
| Meta Lead Ads | Leads via signature-verified webhook | — | Meta app review, token, consent wording |
| `qottuf-technical-agent` | Validated `tender_summary`, risk register, clarification drafts | Bid decision and owner | Versioned contract + validator (T-006); server sandbox; sales fields in `project.json` |
| `qottuf-estimation` | Estimate snapshot at S-G2 (`tender_total_ex_vat`, margin, `defensible`) | A Go creates the estimation project | **Consolidate the two code lines;** add a financing-cost line; client, consultant and tender data stay in the Ledger |
| `qottuf-project-tracker` | Handover milestones; delivery proof only with a consent flag; contract value to finance roles only | Create the project at contract | An integration API with service accounts |
| Marketing | Commercial replies (A-07, B-07) → opportunities | Proof requests to B-04; win/loss themes and objections to the CMO | Marketing's model migration and API security first (§0.3) |

**Boundary with marketing:** marketing owns one-to-many communication; sales owns one-to-one communication with named accounts and live opportunities. SA-01 supersedes marketing's D-04 tender watch. Marketing's A-01 reads contacts and the consent log from the Ledger, never a caller-supplied consent flag.

---

## 13. Platform, Models, Security, Operations and PDPL

### 13.1 A separate sales runtime

Reusing the marketing spine as it stands would mean rewriting it: its Dispatcher, schemas, SDK and default model all need changing, and it has no security boundary (§0.3). Sales therefore gets its **own runtime**: Node/TypeScript, its own Postgres database (pgvector where retrieval is needed), Redis/BullMQ, Docker Compose with no database ports published, every API authenticated (sessions with MFA for people; scoped keys for services). It copies marketing's contracts and principles, and calls marketing's governance services only after marketing has migrated models and secured its API. A security review happens before go-live.

### 13.2 Models

| Work | Model | Effort |
|---|---|---|
| Extraction and classification (SG-02/03 extractors, SC-02, SA-01, SB-04, SB-06) | `claude-opus-5-5` | low (test `claude-haiku-5-5` only where measured volume justifies it and the golden set holds) |
| Drafting (S1-05, SD-02, SB-05, SC-07, SE-04 narrative) | `claude-opus-5-5` | medium |
| Judgment (S1-02, SB-01, SB-03, SB-07, SB-08, SD-01, SE-02) | `claude-opus-5-5` | high |
| Public-data research (SA-02, SA-04) | `claude-opus-5-5`, Batch API or a scheduled Managed Agents deployment | low–medium |

**API rules:** structured outputs (`output_config.format`) validated by Zod, never forced `tool_choice`; adaptive thinking with effort set explicitly; server-side refusal fallbacks enabled, with the model that actually served each call logged (a fallback can change it); prompt caching on stable prefixes; per-agent keys with monthly caps and per-order budgets; Managed Agents only for public-data jobs (it isn't eligible for zero data retention).

**Cost reality:** at Phase 1–2 volumes (assumed: about 300 elevator enquiries and 30 screened tenders a month), the model bill is an order of magnitude of tens to low hundreds of US dollars a month, including thinking tokens. The real cost is people (§4).

### 13.3 Untrusted input (principle 17 in practice)

- **Readers** (SA-01, SA-02, SB-02's tender-reader, SG-02/03 extractors, SC-02): see untrusted text, have no tools, output typed fields only (enums, numbers, dates, short quoted spans).
- **Thinkers and writers** (SB-01, SB-05, S1-05, SD-01, S1-02): see internal data and typed fields only, never raw untrusted text, and have no web tools.
- **Outputs render as plain text** (no links or markup executed anywhere they are displayed).
- **The tender-reader** moves from an interactive laptop session with shell access to a sandboxed server job with only its parsers; its clarification drafts stay untrusted until a human reviews them.
- **Test:** planted instructions in a tender PDF, a supplier email and a WhatsApp message must not reach any client-facing draft. Flagging alone is not a pass.

### 13.4 Evaluation and testing (no agent ships without it)

- **Golden sets from Qottuf's own history (Phase 0):** 100+ past CRM enquiries with outcomes (SC-02); 20+ past tenders with the decision taken and the outcome (SB-01, and the scorecard backtest); rubric-graded drafts scored by the Head of BD (S1-05, SD-02); adversarial Arabic and English sets for SG-01 (inducements, and ordinary contract text that must pass), SG-02 (disguised commitments: "يمكننا التسليم خلال أسبوعين", "fourteen", "24/7", "14-storey", correct large numbers that must pass) and SG-04 (personal data in free text).
- **Regression in CI** on every change of prompt, model, rule or schema; a drop in any golden-set score blocks the release.
- **Online signals reviewed weekly:** rep edit distance on drafts, reclassification rates, Head of BD overrides, Deal Desk rejection reasons. A rising trend is a regression.

### 13.5 Operations

- **A named system owner,** budgeted before Phase 1, with on-call cover in staffed hours.
- **Service levels:** ingest availability, acknowledgement latency, synthetic-lead pass rate.
- **A synthetic lead every hour,** end to end (ingest → acknowledgement → routing → page), with an alarm on failure.
- **Monthly restore drills** (the CRM has lost its data twice) and a database fingerprint check after every deploy.
- **Self-hosted tracing** (e.g. self-hosted Langfuse) with the served model, tokens and latency per call.
- **Gate canaries:** planted defects each week that every gate must catch.

### 13.6 PDPL

- A **DPIA per agent** (what personal data each one sees, and why).
- **Redaction with measured recall** before every model call (SG-04).
- An **append-only consent log** checked per recipient at send time.
- A **retention schedule** (e.g. unqualified leads deleted after 12 months; customer records for the warranty and maintenance period; tender documents per the client's terms) and an **erasure process**.
- A **transfer assessment** per provider (standard contractual clauses and the risk assessment), including the API's inference-geography options; counsel's view on SDAIA's amendments when final; a hosting decision for the Ledger (in-Kingdom if feasible).
- Each tender's confidentiality clause is checked at intake (SG-04).

---

## 14. Metrics, Targets and Incentives

**North star: collectable margin won per quarter, by motion** = margin won, weighted by the client's payer band (a management weighting set by finance, e.g. A 1.0, B 0.9, C 0.75). Until estimation records margin reliably, use contract value won plus the estimated margin at submission.

**Guard metrics:** margin erosion (margin at submission vs at contract); days to collect by client; maintenance attach rate.

**Leading indicators (move in weeks, so phases can be judged on them):**

| Area | Indicator |
|---|---|
| Coverage | Meetings with decision-makers per month (executive and BD); invitations to tender received; approved-vendor listings and registrations; specifications won (elevators named in a consultant's or engineer's specification) |
| Contracting | Tenders screened within one business day; decisions within two; disqualifications for documents (target 0); expired-document incidents (target 0); bid selectivity with reasons |
| Elevators | Median and p90 minutes to first contact (from telephony and inbox records); budget quotes sent the same day; surveys within 48 h; quotes reaching a recorded decision; maintenance contracts signed |
| Hygiene | Open opportunities with owner, next step and date |

**Outcome metrics (judged at 6 and 12 months, with Wilson intervals):** win rate by count and value per route and sector; price delta on losses; repeat share; pipeline coverage vs target; elevator funnel conversion per source and campaign; cost per verified enquiry (report spend and zero, never a misleading ratio).

**Targets:** Asil sets 2027 targets by motion (contracting value and margin; elevator units, value and maintenance contracts). Without them, pipeline coverage can't be computed.

**Incentives:** commission for the elevator desk and field engineer on units won and maintenance contracts signed; the Head of BD's bonus paid on margin *collected*, not booked.

**Baseline before agents (Phase 0):** export the CRM history; reconstruct 12–24 months of tenders, invitations, bids and outcomes; record current meeting, invitation and registration counts.

---

## 15. Build Sequence

Phases are judged on leading indicators (§14) at their exit and on outcomes at 6 and 12 months. Every component also has **preconditions** (owner, data, golden set, integration) that must be met before it is built; they are listed in its Phase 0 checklist. Durations are planning assumptions.

**Phase 0 · Foundations (three to four weeks; mostly human; starts revenue work immediately)**
- **People:** name the Head of BD; the executive seller's calendar (6–8 meetings a month); the elevator evening and Saturday shift; the field engineer; the system owner; the compliance reviewer; backups.
- **Revenue work that needs no agents:** the account audit; the coverage list (30–40 names, owners, cadence); references at every handover; the Q1 summer-works push; the year-end small-works test; framework targets per sector.
- **Decisions:** thresholds; targets and incentives; systems of record; hosting; which estimation code line survives; the maintenance licence and tiers; the elevator pricing architecture; the budget price book; SME certificate application if eligible.
- **Evidence Vault v1** (what is in hand; client requests continue for months): classification certificate and its ceiling; CR, Zakat, GOSI, Chamber, Saudisation and SME certificates with expiry; ISO certificates, HSE statistics and insurance if held; completion letters and permissions; PRJ-001 reconciled; elevator manufacturer evidence (legal name, certificate of origin, authorisation naming Qottuf, SABER certificates, written parts commitment, warranty); the Freedom Scientific authorisation letter if one exists.
- **Baselines and golden sets** (§13.4, §14). **Appendix A fixes.** **PDPL basics** (privacy notice, consent wording and log, DPIA, provider safeguards).
- **Exit:** all of the above recorded as done, decided or explicitly deferred with a reason.

**Phase 1 · Elevator desk and after-sales (four to six weeks)** · S1-03, S1-04, S1-05, SG-02, SG-04, SC-01, SC-02, SC-03, SC-04, SC-05, SC-06 (if licensed), SD-02, SE-04 (minimal), plus the CRM changes in §12.4
- **Exit (four consecutive weeks):** median first contact ≤ 15 minutes in staffed hours; same-day budget quotes for every standard configuration; surveys within 48 hours; every quote with a next step and date; zero unapproved prices sent (measured on final sent text); maintenance offered on every new sale; synthetic lead passing hourly.

**Phase 2 · Bid filter, specifiers and accounts (six to eight weeks)** · SA-01, SB-01, SB-02 (with preconditions), SB-04, SB-06, S1-02, SG-01, SG-03, SE-03, SE-04 (full), SC-07, SD-01 (audit support), SD-03
- **Exit:** every in-scope tender screened within one business day; decisions within two with a scorecard; zero document disqualifications; zero expired-document incidents; the partner ledger live with written trade terms.

**Phase 3 · Win more of what we bid** · SB-05, SB-07, SB-08, SA-03, SE-02
- **Exit:** red-team scoring on every weighted bid; price delta captured on at least 80% of losses; first quarterly win/loss review held.

**Phase 4 · Grow accounts** · SD-01 (full), SD-04, SA-02, SA-04
- **Exit:** plans for the top ten accounts; at least one expansion opportunity per key account per quarter.

**Phase 5 · Capture support** · SB-03
- **Exit:** set by Asil from evidence.

**Phase 6 · Prune and connect:** delete agents that failed their twelve-month review; connect the Qottuf app to the Ledger API.

---

## 16. Red-Team Log: every weakness found and how it was fixed

Three rounds: the author's own challenge of the first draft (R), an independent systems and agent-design review (X), and an independent buyer-side review from the Saudi market (M), followed by factual corrections (F). Every code and regulatory claim in the X and M rounds was checked against the source before being accepted.

### 16.1 Round 1: self-challenge (first draft → v1.0)

"Held?" records whether the fix survived the independent rounds.

| # | Weakness | Fix in v1.0 | Held? |
|---|---|---|---|
| R1 | Assumed a sales team exists | §4 human organisation; Head of BD as a blocker | Strengthened by M5 (executive seller) |
| R2 | Started with an outbound prospecting agent | Removed; capture, registration, partner and account programmes instead | Yes |
| R3 | Led with lead generation; the leaks are downstream | Phase 1 fixes speed and follow-up | Partly: M7 moved the focus to the quote and survey |
| R4 | One department-lead agent per desk | Deterministic routing | Extended by X15 (Orchestrator removed too) |
| R5 | A conversational AI answering prospects | Templates only | Replaced by X1 (no sending to unverified numbers) |
| R6 | The proposal writer could state unprovable numbers | Grounding rule, SG-03, red team, gates | **No:** X2 showed the checks fail both ways; rebuilt as independent extraction |
| R7 | Asil approves everything | Delegation matrix, daily bid board | Yes |
| R8 | Two CRMs would duplicate accounts | Ledger as master | Revised by X5: the CRM is master for elevators in Phase 1 |
| R9 | Scorecard presented as a probability | Score ≠ probability | Yes; formula added (X10) |
| R10 | Price-to-win treated as complete | Coverage stated on every note | Yes |
| R11 | Proposals could contradict the website | SG-03 footprint check | Yes |
| R12 | "Fuji Japan" without documents | Phase 0 evidence; answer pending | **No:** M1, the claim stays public meanwhile; now held back until the certificate of origin is in hand |
| R13 | Dealer price ranges public | Gate the technical configurator | Partly: M10 added a full channel-pricing architecture |
| R14 | Personal data to providers abroad | Pseudonymisation, DPIA | Partly: X12, ID swaps don't redact free text; now measured redaction, consent log, retention |
| R15 | API drift (forced `tool_choice`) | Structured outputs | Extended by X9 and F2 (the marketing default model is already retired) |
| R16 | Rules changing | Versioned rules | Yes; selected by publication date (X13) |
| R17 | Integrity risk | SG-01 with no override | **Over-corrected:** M9; now a deterministic core plus a hospitality register and a human reviewer |
| R18 | Optimising win rate over margin | North star margin won | Partly: M8 added cash, targets and incentives |
| R19 | Agents nobody uses | Kill metrics, exit criteria | Partly: X11, unmeasurable at these volumes; now leading measures plus a 12-month review |
| R20 | Plans ignore capacity | Capacity ledger | Yes |
| R21 | Tender-reader trusted too early | Critical fields verified | Extended by X8 (server, contract, sizing) |
| R22 | Guarantee capacity vs off-limits finances | Human yes/no (K7) | Yes; SME exemption added (M4) |
| R23 | Integrations writing into other databases | APIs only | Yes |
| R24 | SLAs beyond two people | Roster-based promises; ads in staffed hours | **No:** M7, cutting ads cuts demand; now an evening and Saturday shift |

### 16.2 Round 2: independent systems and agent-design review

| # | Sev | Weakness | Fix | Where |
|---|---|---|---|---|
| X1 | Critical | SC-01 would message any number typed into a public form (public key, no Origin required, per-IP limit only), and lead text flowed into prompts: spam, PDPL exposure, WhatsApp quality rating, SMS-pumping bills | Acknowledge on the page or in customer-started chats; SMS/email only after a one-time code; bot check, send caps, kill switch; Origin required for browsers, signatures for servers; redaction before prompts | §8 SC-01, W1 |
| X2 | Critical | Gates checked the author's own lists; the number check missed "14-storey", "5-year", "24/7", number words and Arabic duals, and rejected a correct "SAR 1,250,000" | Independent extraction from the final text, normalisation in both languages, code checks against versioned records, cross-check with declared lists, Arabic sentence splitting, golden cases | §7.1 |
| X3 | Critical | The platform to be reused has no authentication, a free-text override identity, and published database ports with default credentials | Separate sales runtime; authenticated APIs; no published ports; tiers enforced by row-level security with read logs; security review | §13.1, §12.2 |
| X4 | High | SG-02 had nothing fixed to check against: technical responses overwrite in place; estimates recompute live | Append-only, versioned technical responses with structured terms; estimate snapshot frozen at S-G2; artifacts cite version and hash | §7.2, §12.2, §12.4 |
| X5 | High | Two masters in Phase 1; the CRM emits no events; `activity.write` can log call outcomes | CRM is master for elevators in Phase 1; Ledger polls; narrow `ai_note` capability; next step in the CRM's status rules; dedup suggestions only | §12.1, §12.4 |
| X6 | High | Gates never saw what was actually sent; personal WhatsApp; first contact recorded by the rep's click; no paging channel | Company inbox with send-time checks and logging; personal WhatsApp banned; telephony and inbox timestamps; named paging channel | Principle 18, W1, S1-04 |
| X7 | High | Injection defence relied on model behaviour; the tender-reader runs with shell access on a laptop; SA-02 mixed web tools with account data on a non-ZDR service | Readers vs thinkers separation; no web tools for agents with internal data; plain-text rendering; sandboxed tender-reader; public-only SA-02; tests that planted text never reaches a client draft | §13.3 |
| X8 | High | SB-02 depended on a laptop skill with a provisional schema; one-day intake at 30 tenders a month wasn't feasible | Versioned contract and validator, server sandbox, sizing from the pilot's hours, synchronous screening, full reads only for screened-in tenders | §8 SB-02 |
| X9 | High | Reusing the marketing spine was really a rewrite (hard-wired stages, 40k budget, `campaign_id`, text-only envelope, old SDK, empty fact base on `main`) | Separate runtime copying the contracts; typed payloads; marketing services only after its upgrade | §12.3, §13.1 |
| X10 | High | No stated formula; cold tenders couldn't reach Go; K1 undefined without a value; no booklet purchase; 100% rule impossible on real tenders; integrity rules would fire on "commissioning" | Formula over scorable factors; backtest; K1 "verify"; booklet step; 100% only for mandatory submission requirements; SG-01 tested on contract text; two-person rule changes | §10.1, §8 SB-04, §7.2 |
| X11 | High | Kill metrics and phase gates unmeasurable at these volumes; Phase 0 had no exit | Leading measures at eight weeks; outcomes at 6 and 12 months; component preconditions; Phase 0 exit checklist | Principle 16, §14, §15 |
| X12 | Medium | PDPL claims exceeded the design: free text, editable consent, no retention, D-034 isn't client consent | Measured redaction; append-only consent log; retention and erasure; transfer assessment; confidentiality clause check per tender | §13.6, SG-04 |
| X13 | Medium | Data model gaps: versions, history, revisions, bidders, VAT, lots, JVs, buyer vs end client, contact links, COI, roster, provenance | Added to the schemas; rules chosen by publication date | §12.2 |
| X14 | Medium | Nobody runs the system; no on-call, SLOs, restore drills, tracing, gate testing; WhatsApp number shared with estimation | Named system owner; SLOs; hourly synthetic lead; restore drills; self-hosted tracing with served model; gate canaries; separate number | §13.5, §4 |
| X15 | Medium | Ceremony: pre-call ranking slowed leads; template work done by models; Orchestrator was arithmetic; overlapping learning agents; seven reviewers on lowest-price tenders | Call everyone, classify after; SC-03/SC-04 as code; Orchestrator removed; SE-01 into SE-04, SE-05 into SE-02; evaluation-method tracks | §5, §8, W2 |

### 16.3 Round 3: independent buyer-side review (Saudi market)

| # | Sev | Weakness | Fix | Where |
|---|---|---|---|---|
| M1 | Critical | "Fuji Japan" stays public while proof is pending; at least four Fuji lines sell in KSA; SASO puts a certificate of origin in every lift's technical file | Hold "Japan" in public material until the certificate of origin is in the Vault; then claim exactly what the documents prove; Phase 0 evidence list | Appendix A, §2.5, §15 |
| M2 | Critical | Build order followed the agents, not the revenue: an Etimad engine first, while most proven work came via consultants and relationships | Coverage programme, account audit and references start in Phase 0 with no agents; Etimad is a filter | §1, §4, §15 |
| M3 | Critical | After-sales optional and late, though maintenance is mandatory for in-scope lifts | Maintenance licence and tiers in Phase 0; SC-06 in Phase 1; W6; installed lifts offered maintenance | W6, §8 SC-06 |
| M4 | High | No SME or local-content strategy; office furniture is on the Mandatory List | SME certificate (priority, direct purchase, bid-bond exemption, 10% preference under the 2019 rules), local-content certificate and Nitaqat band in the Vault and scorecard; a Saudi furniture partner | §2.4, §10.1, SB-06 |
| M5 | High | The principal used as an approver, not as the senior seller; no Head of BD profile | Executive seller with 6–8 meetings a month; seniority-matched negotiation; SD-02 in Phase 1; a Head of BD hired for a consultant network | §4, §10.9 |
| M6 | High | Subcontract channel only after award; Tier-1 prequalification documents missing | Price packages while Tier-1s bid; ISO, HSE and insurance documents in Phase 0 | W5, SB-06 |
| M7 | High | Sped up the wrong step; no field survey; ads cut to office hours; personal WhatsApp | Same-day budget quote, 48 h survey, field engineer, company inbox, evening and Saturday shift | W1, §4 |
| M8 | High | No targets or incentives; the north star ignored cash; exits measured activity | Collectable margin won; guard metrics; K8 payer knock-out; financing-cost line; targets; incentives on margin collected; leading indicators | §14, §10.1 |
| M9 | High | The integrity gate over-corrected, silencing live accounts and lawful customs | Blackout scoped to the evaluation committee and tender subject; hospitality register with caps; model flags to a human reviewer | §7.2, §11 |
| M10 | High | Trade and retail prices conflict; no partner incentive; one price tier | Retail/trade/developer channels, two tiers, milestone instalments, price lock, disclosed referral contracts | §10.7 |
| M11 | High | No sales calendar; award dates measure outcomes, not decisions | Calendar rules in the Pipeline Engine; Q1 summer-works push; year-end test | §10.10 |
| M12 | Medium | Accounts assumed live; KSU treated as one buyer; data-centre pitch beyond the proof | Account audit; KSU buying units; data centres pitched only for external works, civil and admin fit-out | §2.2, W4 |
| M13 | Medium | Generic, English-first talk track; quotes archived at expiry | Saudi-Arabic scripts; nine discovery questions; more objections; milestone cadence; reference sites | §10.6 |
| M14 | Medium | Thin proposal and negotiation craft | Priced VE alternatives; qualifications list; SCE-registered CVs; senior engineers at site visits; trading price for payment terms; grievance window | §10.3, §10.4 |
| M15 | Medium | Missing motions: design-led fit-out, smart accessibility, completion contracts | Design-studio and PMC partner programme; accessibility bundled with lifts once authorised; completion-project filter | §2.2, W5, SA-01 |

### 16.4 Factual corrections

| # | v1.0 said | Correct | Fixed in |
|---|---|---|---|
| F1 | No estimating or tender role in the org chart | The chart includes a Quantity Surveyor and a Document Controller; no sales, BD or bid role | C1, §4 |
| F2 | Marketing needs to migrate "before it upgrades models" | Its default `claude-opus-4-1-20250805` was retired on 5 Aug 2026: frontier agents fail today | §0.3 |
| F3 | Langfuse is in the marketing stack | It is in the marketing spec, not the code | §0.3, §13.5 |
| F4 | The CRM sends status webhooks | It emits no events; the Ledger polls | §12.1 |
| F5 | SG-02 checks `technical_responses` rows and approved estimates | Neither exists in a checkable form; both added as versioned records | §7.2, §12 |
| F6 | The tender-reader runs eligibility checks | It extracts requirements as printed; it doesn't check Qottuf against them | C7 |
| F7 | The 12 projects are in the fact base | On `main` the fact base is empty; the records are on a branch | C8 |
| F8 | Principle 17 held for all agents | False for the tender-reader as run today; now an architectural rule | Principle 17, §13.3 |
| F9 | "Tracker finding PRD-14" means no service accounts | PRD-14 concerns connectors; the tracker simply has no integration API or service accounts yet | C10, §12.4 |

---

## 17. Where This Design Is Still Most Likely to Fail

1. **The people don't materialise:** no Head of BD, no field engineer, or an executive seller whose calendar is eaten by operations. Probability: highest. Agents can't sell.
2. **The maintenance licence or origin documents can't be obtained.** Then the elevator story must be rebuilt around what is true, and the plan says so in Phase 0 rather than discovering it in front of a consultant.
3. **Data entry decays.** Mitigated by company inboxes, telephony timestamps, voice capture and weekly hygiene scores; not eliminated.
4. **The Evidence Vault stays empty**, the sales twin of the marketing fact-base risk. Only people with the documents can fill it.
5. **Qottuf's costs may be structurally above market.** No sales system fixes that; this one will show it within two quarters through price-delta data.
6. **Rules shift under the playbooks** (the procurement regulations due around January 2027, PDPL amendments, WhatsApp policy). Versioned rules and a quarterly review reduce the lag.
7. **Over-automation erodes relationships.** Every customer-facing word stays human-sent, and the executive seller meets people in person.

---

## 18. Decisions Needed from Asil

| # | Decision | Recommendation |
|---|---|---|
| 1 | Who is the Head of BD? | Name one person this month; full-time; hired for a consultant network if external |
| 2 | Who is the executive seller, and is the calendar protected? | Asil or the GM; 6–8 executive meetings a month, planned weekly |
| 3 | Elevator origin claim | Hold "Japan" in public material until the certificate of origin, authorisation, SABER certificates and parts commitment are in the Vault |
| 4 | Maintenance | Obtain the licence and publish tiers; offer it to every installed lift |
| 5 | Elevator field engineer, evening/Saturday shift, company WhatsApp inbox | Yes to all three |
| 6 | Elevator pricing architecture and the budget price book | Retail/trade/developer channels and two tiers; the technical office approves a price book for same-day budget quotes |
| 7 | SME certificate | Check headcount and revenue against the Monsha'at definition now; apply if eligible |
| 8 | Targets and incentives for 2027 | Set by motion; commission for the elevator desk; BD bonus on margin collected |
| 9 | Thresholds X, Y, Z and the deputy threshold D | Set from last year's typical deal sizes |
| 10 | Systems of record and hosting | CRM master for elevators in Phase 1; Ledger for contracting from Phase 2; in-Kingdom hosting if feasible |
| 11 | Which estimation code line survives | Decide before Phase 2 |
| 12 | The real revenue mix (villas vs institutional vs elevators) | Needed to weight the desks; if villa construction is material, add a private-client motion |
| 13 | Frameworks to pursue | One per sector: bank branch works, university minor works or maintenance, a hospital group's fit-out |
| 14 | Paid project data | Start with Etimad and Muqawil; buy a database only if the missed-tender audit shows gaps |
| 15 | Results of the September–October 2026 Meta campaign | Needed for the elevator baseline |
| 16 | Tender-use permission per named client; classification facts | One approval per client with an expiry; the exact Grade 3 ceiling and expiry; SCA, Etimad and Muqawil status |

---

## 19. What to Hand Claude Code

Start with this order, not "build the system":

> Build Phase 1 of `qottuf-agentic-sales-department-v1.md` in the `Qottuf-Sales` repo, as a **separate sales runtime** (§13.1): its own Postgres with no published ports, Redis/BullMQ, every API authenticated.
> Scope: schemas for Account, Contact, Consent event, Opportunity (elevator subset), Installed unit and Technical response version (Zod at every boundary, versioned, with history and provenance); S1-03 Dispatcher with per-artifact pipelines; S1-04 Pipeline Engine (stages, required next step, SLAs, paging, calendar, capacity ledger, dedup suggestions); SG-02 (independent extraction + code checks, run on drafts and at send) and SG-04 (measured redaction, consent check); SC-01 (on-page and in-chat acknowledgement, one-time-code verification before any SMS or email, bot check, caps, kill switch); SC-03 and SC-04 as code templates; SC-05 cadences; SC-06 registry; S1-05, SC-02 and SD-02 as Messages-API agents on `claude-opus-5-5` with structured outputs (`output_config.format`, never forced `tool_choice`) and explicit effort; SE-04 minimal report.
> CRM changes, in the CRM repo, append-only migrations: `ai_service` role with a scoped key and the narrow `ai_note` capability; versioned technical responses with structured terms; next step required in the status rules; enumerated loss reason; Meta ingest route (name and phone). The sales runtime polls the CRM; it never writes to the CRM's database.
> Before any agent ships: its golden set and CI regression (§13.4), the injection tests (§13.3), the hourly synthetic lead (§13.5).
> Deliverable: `docker compose up`; a configurator submission produces an on-page acknowledgement, a routed record with a paged owner, an instant call brief, a same-day budget quote that SG-02 passed on the final text, and a full audit trail.
> No model ever free-texts a prospect. Nothing is sent to a number that hasn't been verified or didn't start the chat.

Then one phase at a time, each against its exit criteria.

---

## Appendix A: Fix-this-week list (no agents needed)

| # | Fix | Why it matters |
|---|---|---|
| A1 | Call +966 11 217 7750. If the line is retired, replace every "Call the office" button | It may be the single largest leak on the site |
| A2 | Hold the word "Japan" in public elevator material until the certificate of origin is in hand | SASO requires the certificate in every lift's file; a wrong origin claim is a legal and credibility risk |
| A3 | Remove or gate the technical (dealer) configurator from the public menu | It publishes the negotiation floor |
| A4 | Add a contracting enquiry form (scope, sector, location, stage, timing, attachments) with consent wording, posting to the CRM ingest or Ledger | Contracting demand has nowhere to land |
| A5 | Set up a shared company WhatsApp Business inbox on a dedicated number; stop customer conversations on personal phones | Data, continuity and checks on what is sent |
| A6 | Let the elevator desk send same-day budget quotes from an approved price book for standard configurations | The quote is the slow step |
| A7 | Fix the confirmation copy ("Sent to <email>" with no email sent; "your estimation team"), and show WhatsApp and phone fallbacks when a submission fails | Broken promises and invisible failed leads |
| A8 | Align public claims with the fact base: years, project counts, headcount, ministry logos | Reviewers compare the website with submissions |
| A9 | Fill the 22 missing elevator costs or replace "Contact us" with a callback booking; correct the stair-lift price | Dead ends and a pricing error |
| A10 | Add a privacy notice, consent wording and WhatsApp opt-in to every form; start the consent log | PDPL |
| A11 | Add privacy-respecting analytics and persist campaign identifiers into the CRM | Attribution is impossible today |
| A12 | Ask the owners of lifts Qottuf installed (starting with PSU's six) whether they have a maintenance contract | The fastest after-sales revenue |
| A13 | Fix the hero's dead links and the default 404 page | Small, visible quality signals |

---

## Appendix B: Sources

**Qottuf repositories (read 18 November 2026):** `qottuf-marketing-ai` (spec, README, `src/`, `docker-compose.yml`, `package.json`, branch `claude/fill-brand-dna-knowledge-base`), `qottuf-elevator-configurator` (`AGENTS.md`, `crm/src/`, `pricing/`, `marketing/`), `qottuf-estimation` (`main`, `claude/estimation-agent-audit-8c7886`, `wip/2026-10-30`), `qottuf-technical-agent` (`coord/`, `skills/tender-reader/`), `qottuf-project-tracker` (`docs/`, `backend/app/`), `qottuf-website` (`main`, `content-update-aug2026`, `nextjs-2026-09`); the `qottuf-brand` skill (`facts-and-claims.md`, `open-items.md`).

**Regulation:**
- [SASO technical regulation: Electrical Lifts Used in Buildings and Facilities](https://saso.gov.sa/en/Laws-And-Regulations/Technical_regulations/Documents/TR%20-%20Electrical%20Lifts%20Used%20in%20Buildings%20and%20Facilities%20-%20Version%201%20%20Amendment%201.pdf) (Arts. 2, 8, 12, 14, 15 read in full)
- [Saudi Arabia's new Government Tenders and Procurement Law (Clyde & Co, Oct 2026)](https://www.clydeco.com/en/insights/2026/10/saudi-arabia-new-government-tenders-procurement) and [key features of the new GTPL (CMS)](https://cms.law/en/sau/legal-updates/a-new-chapter-in-saudi-government-procurement-key-features-of-the-new-government-tenders-and-procurement-law)
- [Government Tenders and Procurement Law, older regulations (MoF)](https://mof.gov.sa/Knowledgecenter/newGovTendandProcLow/Pages/sec03.aspx) and [summary (World Construction Network)](https://www.worldconstructionnetwork.com/newsletters/saudi-arabia-government-tenders-procurement-law)
- [Regulations on Preference for Local Content and Local SMEs (MoF)](https://mof.gov.sa/en/docslibrary/RegulationsInstructions/Documents/Regulations%20on%20Preference%20for%20Local%20Content%20and%20Local%20SMEs%20and%20Companies%20Listed%20on%20the%20Capital%20Market%20in%20Business%20and%20Procurement%20Transactions2.pdf); [Monsha'at enterprise size certificates (Amlak)](https://amlak.net.sa/en/53019/); [Monsha'at SME definition](https://monshaat.gov.sa/en/SMEs-definition)
- [Local content in Saudi public procurement (Clyde & Co, Sep 2026)](https://www.clydeco.com/en/insights/2026/09/local-content-in-saudi); [first Mandatory List for furniture (Aleqt, 2022)](https://www.aleqt.com/2022/04/19/article_2300391.html)
- [KSA contractor classification rules (Lexis, Sep 2025)](https://www.lexis.ae/2025/09/11/ksa-updates-contractor-classification-rules-with-new-project-division-criteria/); [Implementing Regulation of the Contractor Classification Law](https://qanoniah.com/en/File/xBrpPJdgR5ow60KnAj06lEV31-Implementing-Regulation-of-the-Contractor-Classification-Law-1443)
- [PIF contractor programme (Muqawil)](https://pif.gov.sa/en/private-sector-hub/private-sector-programs/contractor-program); [Contractors Consortium Platform](https://vote.muqawil.org/en/consortium)
- [SDAIA draft amendments to the PDPL Implementing Regulations (Clyde & Co, Oct 2026)](https://www.clydeco.com/en/insights/2026/10/sdaia-publishes-draft-amendments-to-the-pdpl); [data transfer regulations and SCCs (Baker McKenzie)](https://insightplus.bakermckenzie.com/bm/data-technology/saudi-arabia-updates-data-transfer-regulations-and-introduces-the-first-set-of-standard-contractual-clauses); [marketing consent (Al Tamimi)](https://turtl.tamimi.com/story/law-update-issue-367-saudi-arabia-and-competition/page/11)
- [WhatsApp Business Platform pricing (Meta)](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Anti-Bribery Law amendments (Al Tamimi)](https://www.tamimi.com/law-update-articles/combatting-corruption-and-enhancing-integrity-in-the-kingdom-of-saudi-arabia-new-amendments-to-the-anti-bribery-law/)
- [Saudi Arabia budget report 2026 (KPMG)](https://kpmg.com/sa/en/insights/sector-insights/saudi-arabia-budget-report-2026.html); [KSA switches to the Gregorian calendar (Arab News)](https://www.arabnews.pk/node/993061/saudi-arabia)

**Market:**
- [Saudi giga-project slowdown frees contractors for Expo (AGBI, Oct 2026)](https://www.agbi.com/giga-projects/2026/10/saudi-giga-project-slowdown-frees-contractors-for-expo/); [construction hiring slows after giga-project rejig (AGBI, Aug 2026)](https://www.agbi.com/analysis/construction/2026/08/saudi-construction-hiring-slows-following-giga-project-rejig/); [projects market roughly matching last year (Enterprise, Oct 2026)](https://enterpriseam.com/ksa/2026/10/28/saudi-arabias-projects-market-is-on-course-to-roughly-match-last-years-even-as-most-of-the-industry-says-conditions-have-gotten-worse/)
- [SAR 336.3B tenders launched via Etimad in 2024 (Argaam)](https://www.argaam.com/en/article/articledetail/id/1827106); [Ministry of Health: award visibility on Etimad](https://www.moh.gov.sa/en/ministry/about/pages/tenders-and-procurement.aspx)
- [Riyadh office market turns selective (Enterprise, Nov 2026)](https://enterpriseam.com/ksa/2026/11/12/riyadhs-office-market-turns-selective-as-rents-peak-and-supply-recedes/); [Savills Riyadh notes](https://www.savills.co.uk/insight-and-opinion/savills-news/394460/riyadh-real-estate-maintains-momentum-as-residential-activity-rebounds-and-grade-a-office-demand-remains-strong)
- [Hassan Allam / Sterling & Wilson JV wins Humain data centre (MEED)](https://www.meed.com/hassan-allamsterling-wilson-jv-wins-200m-humain-data-centre); [Humain tenders 100MW Riyadh AI data centre (MEED)](https://guest.meed.com/humain-tenders-100mw-riyadh-ai-data-centre/); [data centres dominate January awards (Enterprise)](https://enterpriseam.com/ksa/2026/02/23/data-centers-dominate-project-awards-in-january/)
- [Expo 2030 Riyadh construction gathers pace (MEED)](https://guest.meed.com/expo-2030-riyadh-construction-gathers-pace/); [main buildings from Q3 2026 (Zawya)](https://www.zawya.com/projects/construction/work-on-main-buildings-in-expo-2030-riyadh-set-to-start-in-q3-2026-report-nicybtie)
- [NCP university hospital PPP (MEED)](https://guest.meed.com/ncp-seeks-firms-for-umm-al-qura-university-hospital-ppp/); [New Murabba and Almana 200-bed hospital](https://www.saudigulfprojects.com/2026/08/new-murabba-signs-sar-1-billion-investment-partnership-with-almana-medical-group-for-200-bed-hospital-in-riyadh/)
- [Saudi elevator and escalator market (Arizton)](https://www.arizton.com/market-reports/saudi-arabia-elevator-and-escalator-market)
- Fuji lines in KSA: [Atlas Elevators' exclusive FUJIHD agency (Argaam)](https://www.argaam.com/en/article/articledetail/id/1782143); [Mayar's subsidiary GEEC and its Saudi factory (Argaam)](https://www.argaam.com/en/article/articledetail/id/1765000); [Asia Fuji (Project Suppliers)](https://projectsuppliers.net/en/node/10599); [Fujitec global profile](https://fujitecamerica.com/wp-content/uploads/2025/02/Fujitec_Global_profile_e.pdf)
- [SASO/SABER product certification (TÜV SÜD)](https://www.tuvsud.com/en-ae/services/product-certification/saso-saber-product-certification-in-saudi-arabia)
- [Ventures Onsite KSA project database](https://venturesonsite.com/lp/construction-project-database-ksa); [BNC Network](https://bncnetwork.net/Access-GCC-Construction-Projects-News-Analytic-Reports-and-Forecasts)
- [The Short Life of Online Sales Leads (Oldroyd, McElheran, Elkington, HBR, March 2011)](https://hbr.org/2011/03/the-short-life-of-online-sales-leads)
