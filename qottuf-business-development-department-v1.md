# Qottuf Aljazeera — Business Development Department
### Sales and Marketing, merged · Operating Specification v1.1 · 19 November 2026

*Agreed by the Chief Sales Officer and the Chief Marketing Officer in the executive meeting of 18–19 November 2026 (minutes: `meetings/2026-11-19-cso-cmo-executive-meeting.md`). Built on Asil's binding answers of 18 November, and updated with Asil's answers of 19 November (no new hires; Asil covers the bilingual role; classification is Asil's; villa lifts in scope). Where this document differs from `qottuf-agentic-sales-department-v1.md` (v1.1) or `qottuf-agentic-marketing-department-v1.md` (v1.0), this document wins. Tier 1 is in `qottuf-tier1-2028-roadmap.md`; every weakness and its fix is in `qottuf-weakness-register.md`.*

> **In one paragraph.** One department, Business Development, led by Asil. It does two jobs: get Qottuf invited to, and win, the SAR 20–100 m main contracts it can deliver; and grow elevators and maintenance. It claims nothing it can't prove. Two lanes share one pipeline, one scoreboard and one approval queue: **Win** (pipeline, bids, accounts, elevator desk) and **Proof & Demand** (evidence, prequalification pack, website, brand, campaigns). One runtime, one record, one evidence store, one brand gate. The two previous designs had 78 components; this one has 38 at full build, and 14 in the first 90 days. The first 90 days are about proof and pipeline, not agents.

---

## 0. What changed, in one page

| Before (two specs) | Now (one department) | Why |
|---|---|---|
| Sales targeted small works, minor-works frameworks, direct purchase and subcontract packages | **Main contracts of SAR 20–100 m only.** No villas, no small projects, no packages | Asil's mandate (18 Nov) |
| A separate Head of BD; "Asil or the GM" as executive seller | **Asil is Head of BD and the only seller.** The GM takes no meetings | Asil's answer |
| Maintenance treated as missing | **Maintenance exists:** an elevator revenue line and an access route into the buildings whose owners let SAR 20–100 m contracts | Asil's answer |
| Certificates used as proof in messaging | **Certificates are evidence, not messaging:** in every prequalification pack and tender, never a talking point | Asil's answer |
| Elevator desk sized on an assumed 300 enquiries a month | **Desk sized from 30 days of real campaign data;** campaign launches only after a readiness gate | No campaign has launched |
| Phase 1 = elevator desk agents | **Phase 1 = Proof and Pipeline:** reference file, prequalification pack, contracting pipeline | One SAR 20 m contract ≈ the revenue of 285 lifts at the public entry price |
| Two runtimes, two rulebooks, two governance layers | **One runtime** (sales design), **one rulebook** (the brand skill's `brand-rules.json`), **one governance layer** | The marketing runtime can't run safely as it stands |
| 44 + 34 components | **38 at full build, 14 in 90 days** | Volume doesn't justify more |
| "Fuji Japan" as the differentiator | **"Japan" and "partnership" off every public surface** until the certificate of origin, the manufacturer's legal name and an authorisation naming Qottuf are in hand | Three claims, three documents |
| A bilingual coordinator to be hired | **No new hires.** Asil covers the bilingual role; every role is filled by Asil or existing staff; the AI drafts and prepares, Asil edits and approves | Asil's answer (19 Nov) |
| Classification on Business Development's action list | **Classification is Asil's to manage,** outside this department's plan | Asil's answer (19 Nov) |
| Villa lifts to be confirmed | **Villa lifts are in scope.** "No villas" applies to contracting only, and contracting is big projects only | Asil's answer (19 Nov) |
| Access to be requested | **Asil gives the team access** to the website, configurator hosting and social and ad accounts | Asil's answer (19 Nov) |

---

## 1. Mandate and scope

**Mission:** get Qottuf invited to, and win, the SAR 20–100 m main contracts it can deliver; grow elevators and maintenance; claim nothing we can't prove.

| In scope | Out of scope |
|---|---|
| Main contracts of SAR 20–100 m in Riyadh, institutional and corporate buildings and fit-outs (education, healthcare, corporate HQ, offices, commercial), and completion of stalled projects in band | Villa construction; any project under SAR 20 m; subcontract packages |
| Elevators: villa, residential, commercial and institutional lifts (confirmed by Asil: "no villas" applies to contracting only) | Projects above SAR 100 m (the band is Asil's to change) |
| Elevator maintenance: renewals, inspections, modernisation, takeovers | Data-centre packages; smart accessibility until an authorisation letter and a first delivered project exist |

---

## 2. Structure and people

```
                         ASIL · Head of Business Development
              sells, decides bids, approves (weekly board + 48-hour bid path)
                                     │
            ┌────────────────────────┴────────────────────────┐
     WIN lane (CSO)                                  PROOF & DEMAND lane (CMO)
     pipeline · bids · accounts ·                    evidence · prequalification pack ·
     elevator desk · maintenance sales               website · brand · campaigns
            │                                                 │
            └──────────────── one runtime · one Ledger · one evidence store ────────┘
                              one brand gate · one approval queue · one scoreboard
```

| Role | Owns | Holder | Status |
|---|---|---|---|
**No new hires (Asil, 19 November).** Every role below is held by Asil or by existing staff, and the AI does the preparation.

| Role | Owns | Holder | Status |
|---|---|---|---|
| Head of Business Development | Selling, bid decisions, prices, submissions sign-off, the weekly board | Asil | In place |
| Bilingual coordinator | Native Arabic writing and review, website content, approval of photography | **Asil** | In place. The AI drafts every Arabic and English text for Asil to edit, not write. Site photography and design are bought per job |
| Account sponsor (optional) | Two or three key accounts | Deputy GM, if Asil agrees | **Ask Asil** |
| Bid coordinator | Bid board preparation, submissions, evidence filing, registrations, document chasing | Document Controller | Appoint (existing staff) |
| Estimator | Cost in `qottuf-estimation` | Quantity Surveyor | In place |
| Technical reviewer | Technical sections, method statements, clarifications | Construction or MEP Director | Per bid |
| Elevator desk lead + desk | Calls, budget quotes, closing | CRM `agent` role | In place; working hours set after the 30-day read |
| Elevator technical office | Detailed pricing | CRM `technical` role | In place |
| Maintenance team | Maintenance delivery and the SASO licence on file; **site surveys within 48 hours for elevator quotes** (they are already in the field) | Existing maintenance team | In place |
| Compliance reviewer | Integrity flags, hospitality register | Commercial Manager or counsel | Appoint (existing staff) |
| Builder | Builds and maintains the runtime and integrations; restore drills; evals. Every change is approved by Asil, the same working model as the technical-agent repo | Claude Code | In place |
| Recognition census (optional) | The annual independent interviews | A university research partner: a vendor engagement, not a hire | Asil to approve the budget |

**Asil's time is the scarcest resource in the company,** and Asil now also covers the bilingual role. It is protected four ways:
1. **One weekly BD board, 90 minutes:** pipeline, plans, content and publishing approvals in one batch.
2. **A 48-hour bid path** outside the board: bid decisions, prices and submissions approved by a 15-minute call or a logged phone approval.
3. **Everything that can be prepared is prepared:** meeting briefs and debriefs, board packs, draft Arabic and English copy, draft profiles and posts, prequalification packs, clause libraries. Asil edits and approves; Asil doesn't start from a blank page.
4. **Delegation:** the bid coordinator runs the bid machinery and chases documents; the desk lead runs the elevator desk; the maintenance team runs site surveys.

---

## 3. The two motions, end to end

### 3.1 Projects (SAR 20–100 m main contracts)

```
Coverage of target organisations ─► early signals ─► capture plan ─► prequalification (EOI / owner or PMC list)
   ─► invitation or tender ─► bid / no-bid (48-hour path) ─► bid (compliance first; effort follows the evaluation method)
   ─► clarifications and negotiation ─► award ─► delivery (tracker) ─► handover: completion certificate, referee consent,
   client review (PM + bid coordinator) ─► documented reference ─► next prequalification
```

- **Coverage is the engine:** about 20 priority target organisations (owners, developers, PMCs, consultants that let the most work in the band), each with a named Qottuf owner, a meeting cadence, and an account plan of at most three live actions.
- **Prequalification is the gate:** the prequalification pack, built on documented references, is the single most important artifact of the department.
- **Invited, not hunting:** the aim is that by 2028 most main-contract bids come from invitations.
- **Bid/no-bid knock-outs added at this meeting:** outside SAR 20–100 m; not main contractor; comparable-value references not met.
- **First pursuits are chosen for deliverability, reference value and payer reliability,** not size.
- **Maintenance as access:** maintenance contracts on public-use lifts in universities, hospitals and offices keep Qottuf inside buildings whose owners let SAR 20–100 m contracts. Every maintenance client is a coverage contact.

### 3.2 Elevators and maintenance

```
Readiness gate ─► campaign ─► enquiry ─► acknowledgement ─► call ─► same-day budget quote ─► survey ─► detailed quote
   ─► follow-up ─► win ─► installation ─► maintenance contract ─► inspections, renewals, modernisation, referrals
```

- **Readiness gate before any paid lead** (review 3 December; launch 6 December on Asil's go; 30-day read 5 January):
  - a shared company WhatsApp Business inbox;
  - an approved budget price book for same-day quotes;
  - a callback roster;
  - Meta leads landing in the CRM, or a manual handoff tested end to end by a named person;
  - a privacy notice and consent wording on the forms;
  - the dealer configurator out of the public menu and the campaign's links;
  - correct prices on every configurator page an ad links to;
  - campaign identifiers on every lead;
  - Arabic creative approved by Asil in the elevator register.
- **Site surveys within 48 hours** are made by the maintenance team, who are already in the field.
- **Desk agents and the desk's working hours are set from the 30-day read,** not from assumptions.

---

## 4. The shared spine

| Element | Decision | Owner |
|---|---|---|
| Runtime | **One runtime built to the sales spec's design** (own database, no published ports, every API authenticated, structured outputs, current models). The marketing runtime is retired entirely; five no-model modules (red-flag scanner, statistics test, DNS check, SEO audit, schema mapper; about 600 lines with tests) are ported as code; everything that calls a model is rewritten to the new API rules | Builder (Claude Code; Asil approves) |
| Record | **One Ledger** for accounts, contacts, consent, opportunities, registrations, evidence and outcomes. The elevator CRM stays the desk's tool and syncs to it | Builder (Claude Code; Asil approves) |
| Evidence store | **One store, four tiers** (public, tender, confidential, internal). The fact base is its public tier. Nothing reaches the website, a proposal or a quote cover unless the store backs it. Certificates go in with expiry dates and into every prequalification pack, never into messaging | Claim rules: CMO. Filing: bid coordinator. Prequalification completeness: CSO. Confidential release: Asil |
| Rulebook | **One rulebook:** the brand skill's `brand-rules.json`. `brand_book.yaml` on `main` is retired: it lists the correct name, "Qottuf Aljazeera", and «قطوف الجزيرة» as forbidden variants | CMO |
| Brand gate | On every client-facing word, proposals included. **Service level on bids:** automatic checks on every save in seconds; claim verification in minutes; human review of new text the same working day if received by 13:00, otherwise by 10:00 the next day; final brand pass closes at D-3. If the gate ever misses, the approved clause from the library replaces the unreviewed text: the gate never sends unreviewed text and never costs a deadline. It reads claims, numbers, names and register only; lowest-price tenders get the automatic checks only | CMO |
| Verification | **Independent extraction of every claim and commitment from the final text, checked by code** against the store and versioned records (fixes the marketing verifier, which only checked that an ID exists, and the sales gates that trusted the author's own lists) | Spine |
| Arabic | **Two registers:** formal Modern Standard Arabic for contracting and institutional material; reviewed Saudi conversational only for elevator consumer ads. The voice rule «لا عامية إطلاقاً» is amended accordingly. Arabic is written natively and reviewed by Asil before first use as a template | CMO |
| Approvals | One queue; one weekly board; one 48-hour bid path | Asil |
| Integrity | Deterministic core nobody overrides; hospitality register with caps (zero for officials and live-tender evaluators); model-raised flags to the compliance reviewer | Compliance reviewer |
| Crisis protocol | By G1: the client hears from Asil first, in person; one spokesperson; holding statements approved in advance in both languages; nothing public before the client conversation; no agent ever answers publicly | Asil + CMO |

---

## 5. Agent roster: 38 at full build, 14 in the first 90 days

"Code" means no model call. Phase: **1** = by G0 (31 January 2027); **2** = by G1 (end of Q2 2027); **3** = later, when volume proves the need.

### Spine (12)
| # | Component | Merges | Engine | Phase |
|---|---|---|---|---|
| 1 | Dispatcher | sales S1-03; replaces marketing L1-03 | code | 1 |
| 2 | Pipeline Engine (stages, next step, SLAs, calendar, capacity, 48-hour bid timers) | S1-04 | code | 1 |
| 3 | One-to-one Drafter | S1-05 | model | 2 |
| 4 | Quality Gate (one judge with rubrics per artifact type, incl. the evaluator's chair for bids) | marketing L1-02 + S1-02 + SB-07 | model | 2 |
| 5 | Brand Gate | L0-01 + L0-07 + red-flag scanner port | code + model | 1 |
| 6 | Bilingual Editor | L0-02 + L0-03 | model | 1 |
| 7 | Fact and Evidence Verifier (independent extraction + code checks) | L0-05 + SG-03 | model + code | 1 |
| 8 | Consent, PII and Compliance | L0-04 + SG-04 | code | 1 |
| 9 | Integrity Gate | SG-01 | code + model flags | 2 |
| 10 | Commercial Guard | SG-02 | model + code | 3 |
| 11 | Statistics | marketing D-03 / SE-03 (ported code) | code | 2 |
| 12 | Reporting and Board Pack | SE-04 + D-07 + D-02 | code + model | 1 |

### Win: Projects (9)
| # | Component | Merges | Engine | Phase |
|---|---|---|---|---|
| 13 | Opportunity Scout (tenders, prequalification notices, early signals) | SA-01 + SA-02 + marketing D-04 | code + model | 2 |
| 14 | Pursuit Analyst (scorecard, capture plan) | SB-01 + SB-03 | code + model | 2 |
| 15 | Tender Intake and Compliance (tender-reader on a server) | SB-02 + SB-04 | code + model | 2 |
| 16 | Proposal Writer (weighted evaluations) | SB-05 | model | 3 |
| 17 | Negotiation Prep | SB-08 | model | 3 |
| 18 | Account Planner (the 20 priority organisations) | SD-01 + SA-04 + SD-04 | model | 2 |
| 19 | Meeting Prep and Debrief (for Asil) | SD-02 | model | 1 |
| 20 | Prequalification and Evidence Manager (packs, registrations, reference requests at handover, expiry) | SB-06 + SD-03 + marketing L0-06 | code + model | 1 |
| 21 | Market and Outcome Analyst (award data, competitor map, win/loss) | SA-03 + SE-02 + marketing D-05 | code + model | 3 |

### Win: Elevators and maintenance (6)
| # | Component | Merges | Engine | Phase |
|---|---|---|---|---|
| 22 | Acknowledgement (on-page and in customer-started chats; one-time code before SMS/email) | SC-01 | code | 2 (after the 30-day read) |
| 23 | Call Notes and Qualifier | SC-02 | model | 2 |
| 24 | Call Brief | SC-03 | code | 2 |
| 25 | Quote Builder (budget and detailed) | SC-04 | code | 2 |
| 26 | Follow-up Engine | SC-05 | code | 2 |
| 27 | Installed Base and Maintenance Registry | SC-06 | code | **1** |

### Proof & Demand (11)
| # | Component | Merges | Engine | Phase |
|---|---|---|---|---|
| 28 | Case-Study and Reference Writer | B-04 | model | 1 |
| 29 | Web Page Writer | C-03 + C-04 | model | 2 (after the website decision on 10 December) |
| 30 | Executive Voice (Asil) and company LinkedIn | B-01 + B-06 | model | 2 |
| 31 | Entity and Listings Record | C-06 + C-07 | code | 1 |
| 32 | Site Checker (schema, technical SEO) | C-05 + C-02 (ported code) | code | 1 |
| 33 | AI-Visibility Check (quarterly; not a Tier 1 measure) | C-08 | model | baseline run in phase 1 |
| 34 | Elevator Ad and Content Drafter (elevator register) | B-02 + B-03 | model | 2 |
| 35 | Campaign Data Intake | D-01 | code | 2 |
| 36 | Visual Brief (real photography and configurator footage only; the no-fake-imagery rule in code) | B-05 | model + code | 2 |
| 37 | Publishing Staging | B-08 | code | 2 |
| 38 | DNS and Deliverability Check (protects the inbox quotes are sent from) | A-05 (ported code) | code | 1 |

**Phase 1 (14):** #1, 2, 5, 6, 7, 8, 12, 19, 20, 27, 28, 31, 32, 38, plus one baseline run of #33.

**Cut entirely:** marketing L1-01 CMO Orchestrator, A-00 to A-04, A-06, A-07 (no consented list), B-00, B-07 (for now), C-00, C-01 (search volume doesn't choose contractors), D-00, D-06; sales S1-01 Revenue Orchestrator (already removed in v1.1), SC-07 Specifier and Partner Programme (deferred until the 30-day read shows the homeowner/professional mix).

---

## 6. One scoreboard

**North star:** collectable margin won on projects, plus elevator margin including maintenance.

| Lane | Measures |
|---|---|
| Win: projects | Target organisations covered (decision-maker meetings); prequalifications passed; invitations received; qualified pursuits in band; compliant submissions (100%); shortlist rate; margin won and payment terms; awards (reported, not gated) |
| Win: elevators | Verified enquiries by campaign; same-day budget-quote rate; quote-to-win; maintenance contracts and renewals |
| Proof & Demand | Documented references (value, dates, certificate, consenting referee); **case studies used** in a prequalification pack, proposal or meeting; website due-diligence pass (monthly, by someone outside BD, against a PMC's checklist); recognition census (unaided mentions among the 20 targets, annual, baseline Q1 2027) |
| Guards | **Public claims corrected or withdrawn after publication: target zero;** margin erosion between submission and contract; days to collect (shared with finance); T1-Delivery measures (company-owned, shared) |

---

## 7. Operating rhythm

| Cadence | Forum | Contents |
|---|---|---|
| As needed, ≤ 48 h | Bid path | Bid decisions, prices, submissions: a 15-minute call or a logged phone approval |
| Weekly, 90 min | BD board (Asil, bid coordinator, elevator desk lead) | Pipeline, coverage, approvals batch (content, publishing, plans), capacity. The board pack is prepared by the system |
| Monthly | Pipeline and proof review | References, prequalification status, case studies used, website check, win/loss |
| Quarterly | Plan | Targets, gates, playbook changes, budget |
| Annual (Q1) | Recognition census | Independent interviews with the 20 targets + 20 non-clients |

---

## 8. Phase 1: Proof and Pipeline (to G0, 31 January 2027)

| Date | Commitment | Owner |
|---|---|---|
| This week | Documents requested for all 12 projects plus the Elm and Hilton buildings (contract value, dates, completion certificate, referee consent); the three elevator documents requested (certificate of origin, manufacturer's legal name, authorisation naming Qottuf); Asil gives the team access to the live website, configurator hosting and social/ad accounts; the office landline tested | Bid coordinator, CMO, Asil, desk lead |
| 26 Nov 2026 | **Five urgent website fixes** (given access this week): dealer configurator out of public view; Ministry of Interior logo removed; "Japan" held back (with "partnership"); "13+ Years" → "Since 2014"; project count and headcount removed | CMO |
| 3 Dec | Readiness gate review: go or no-go | CSO; Asil decides |
| 6 Dec | Elevator campaign launch, only if the gate passed | CMO |
| 10 Dec | Decision: recover the live website's source or rebuild the site | Asil |
| 17 Dec | **Proof test, reported to Asil in writing:** Qottuf's own documents (contract value, dates, completion certificate) for three projects. Also: draft prequalification pack; Asil's LinkedIn profile in both languages; the remaining small fixes; hosting and data residency decided | CMO + bid coordinator; Asil |
| 5 Jan 2027 | 30-day campaign read; elevator desk sized | CSO + CMO |
| January | **If the proof test failed: JV-first from January.** Asil's posts begin (at most two a month, from Asil's own voice notes or approved proof; fails closed). Phase 1 build from 18 January (conditional on the hosting decision) | Asil; CMO; builder |
| 31 Jan | **G0:** reference file including referee consents; every project documented or removed from contracting material; Arabic and English clause library (each clause tied to an evidence record, expiring with it); one rulebook; master company record; baseline (backlog, delivery capacity, past bids) from finance and the PMO in the confidential tier; top-20 priority list with named owners; every in-band opportunity in the Ledger; the 14 Phase 1 components live | All |

**The G0 website bar:** nothing false; contact details that work; both languages; the credentials line; documented references only; an enquiry form with consent wording. Full sector pages and new photography follow after G0.

**Claims policy:** "verified" means backed by documents. Beetroot and the private retreat stay in the evidence store but come off contracting-facing material (true, but they tell a SAR 50 m buyer the wrong story), and so does any project still undocumented on 31 January.

---

## 9. Decisions for Asil

In order of urgency. The full reasoning is in the minutes. Status as of Asil's answers on 19 November.

| # | Decision | Recommended | Status |
|---|---|---|---|
| 1 | **Proof:** approve requests to referees, finance and the PMO for all 12 projects plus the Elm and Hilton buildings; send a written instruction to the PMO Director and finance, with dates, that the reference file and the G0 baseline are company priorities | Yes, this week | **Open** |
| 2 | ~~Ceiling and cap~~ | — | **Removed:** classification is Asil's to manage; the band stays SAR 20–100 m as Asil set it |
| 3 | **The pivot rule:** if the 17 December proof test fails, JV-first from January | Adopt | Open |
| 4 | **This department as specified,** with a fixed weekly 90-minute BD board in Asil's calendar | Adopt | Open |
| 5 | **People** | — | **Decided:** no new hires; Asil covers the bilingual role; bid coordinator and compliance reviewer appointed from existing staff; Claude Code builds with Asil approving. Still open: whether the Deputy GM sponsors two or three accounts |
| 6 | **Access:** live website, configurator hosting, social and ad accounts | — | **Decided:** Asil gives the team access. Keep the accounts in company ownership with two admins each |
| 7 | **Hosting and data residency** for the runtime | By 17 December | Open |
| 8 | **Tier 1 commitment** (see the roadmap) | T1-Segment and T1-Delivery by end-2028; T1-Market through JVs if Asil chooses that route | Open |
| 9 | **Asil as the face of Qottuf:** LinkedIn profile, two posts a month, single crisis spokesperson | Agree | Open |
| 10 | **Elevators:** budget price book; readiness gate and launch dates; Fuji documents and wording | Approve | **Villa lifts decided: in scope.** The rest is open |
| 11 | **Claims and brand:** one rulebook, the claims policy, the open Arabic decisions, two registers, one specific promise, written naming permissions, "NCB (now SNB)", names not logos | Adopt; copy decisions at the first weekly board | Open |
| 12 | **Website:** recover or rebuild | By 10 December | Open |
| 13 | **Delivery (company):** tracker live on the next project; finance yes/no on bonding per pursuit | Instruct | Open |
| 14 | **Budget lines:** photography per job; the recognition census (a vendor, not a hire) | Approve | Open (no salaries: no new hires) |
