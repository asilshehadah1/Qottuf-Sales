# Qottuf Aljazeera — Weakness Register
### v1.0 · 19 November 2026 · agreed by the CSO and the CMO

*Every weakness found across the six Qottuf repositories, the brand fact base, three red-team rounds and the executive meeting of 18–19 November 2026, from the smallest detail to the biggest, each with a fix, an owner (a role) and a timing. Minutes: `meetings/2026-11-19-cso-cmo-executive-meeting.md` (item 4).*

**How to read it**
- **Size** is the effort to fix. **S:** under a day. **M:** days to weeks. **L:** months. **XL:** company-level, existential.
- **Impact** is the damage if the weakness is left unfixed: **High**, **Med** or **Low**. A small fix can carry a high impact: the Ministry of Interior logo takes minutes to remove and is among the most damaging items.
- **When:** five urgent fixes by **26 Nov 2026**, given website access this week (#4, #5, #6, #27, #52, #53); other S items by **17 Dec 2026**; M items by **G0, 31 Jan 2027**; L items by **G2, end 2027**, unless a row says otherwise. "Readiness" means the elevator campaign readiness gate on **3 Dec 2026**.
- **Owners:** Asil (Head of BD); CSO (Win lane); CMO (Proof & Demand lane); the bid coordinator (Document Controller); the bilingual coordinator (to be hired); the system owner (to be appointed); the technical office; the estimator (QS); the PMO; finance; the shareholders.

---

## The ten biggest, ranked by impact

| Rank | Weakness | Register items | Committed solution | Owner |
|---|---|---|---|---|
| **1** | **The proof gap.** Qottuf cannot document a single main contract of SAR 20 m or more, and its "verified" projects are verified only against its own brochure and website. Every decision in the meeting (the scorecard's fit factor, the prequalification pack, case studies, the website, the census, T1-Delivery, the classification upgrade) assumes the opposite | 59, 96 | Reference file: contract value, dates, completion certificate and a consenting referee per project. **The test is 17 December:** Qottuf's own documents (contract value, dates, completion certificate) for three projects. If it fails, Business Development turns JV-first in January, and Asil is told in writing. Referee consents are due 31 January; a slow client never triggers the pivot | Bid coordinator + CMO, with the PMO (certificates) and finance (values); Asil approves every request to a referee |
| 2 | One senior person and nobody to do the work: Asil sells, decides and approves; the GM is unavailable; there are no marketing, design or bid staff | 56, 57, 72, 97 | Bid coordinator; bilingual coordinator; Deputy GM sponsoring two or three accounts; weekly board plus 48-hour bid path; second BD hire after G1 | Asil (headcount sits above BD) |
| 3 | Delivery capacity: PMs, engineers, planners, HSE and QA/QC, and a tracker live on no project | 48, 68 | Hiring plan tied to the pipeline; tracker live on the next project | GM, PMO Director, Construction Director. **Neither BD lane can fix this** |
| 4 | Capital and bonding: unknown whether Qottuf can bond several SAR 20–100 m contracts at once; Grade 1 by 2028 needs capital or a partner | 60, 70 | A yes or no from finance per pursuit; route C put to the shareholders explicitly | Finance, GM, shareholders. **Neither BD lane can fix this** |
| 5 | Classification ceiling unverified (public sources range from SAR 30 m to 200 m) | 58a, 58b | Read it off the certificate this week; if below SAR 100 m, the cap options go to Asil | Bid coordinator, then Asil; the upgrade is the company's application |
| 6 | Public claims that contradict the evidence at due diligence | 4, 5, 52, 53, 69, 75 | Five urgent fixes by 26 Nov, the other small fixes by 17 Dec; website passes due diligence by G0; verifier and rulebook fixed | CMO |
| 7 | No coverage of the owners, developers, PMCs and consultants in the band; prequalification status unknown | 61, 62a, 62b | Top-20 list; coverage programme; census baseline; prequalification submissions | CSO + Asil |
| 8 | Pricing blind to the market | 45, 46, 64 | Award data; freeze each submitted estimate; one estimation code line | Estimator + CSO. If costs are structurally above market, only the GM and operations can fix it |
| 9 | Systems in pieces; the CRM lost its data twice; nobody owns the systems | 50, 66 | One runtime, one Ledger with shared IDs, restore drills | System owner, funded by Asil |
| 10 | Concentration with no crisis protocol: a few large projects a year, so one loss or one troubled project swings the year | 71, 93 | First pursuits chosen for deliverability, reference value and payer reliability; maintenance book as steady income; crisis protocol by G1 | CSO (pursuits), CMO (protocol), Asil (spokesperson) |

---

## S · fix in under a day

| # | Weakness | Impact | Fix | Owner | When |
|---|---|---|---|---|---|
| 1 | Hero buttons link to sections that don't exist | Low | Point them at real sections or remove them | CMO | 17 Dec |
| 2 | Default 404 page with no route home | Low | Branded 404 with links home and to contact | CMO | 17 Dec |
| 3 | No favicon, robots.txt, sitemap, Open Graph or canonical tags | Low | Add them (and keep them in the rebuild) | CMO | 17 Dec |
| 4 | "13 Key Projects" counter beside "fourteen" in the text | Med | Never publish a project count; name the projects | CMO | 26 Nov |
| 5 | "13+ Years" (founded 2014; the brand bans years-of-experience claims) | High | "Since 2014" only | CMO | 26 Nov |
| 6 | "More than two hundred people" (no source; also bears on SME eligibility) | Med | Remove until sourced | CMO | 26 Nov |
| 7 | Configurator Arabic copy says the quote goes to "your estimation team" | Low | Correct the copy | CMO | 17 Dec |
| 8 | Configurator says "Sent to <email>", but no email is sent | Med | Change the text now; send a real confirmation later | CSO + system owner | 17 Dec (text) |
| 9 | CRM error message sends visitors to a site with no form | Med | Show WhatsApp and phone fallbacks on failure | CSO + system owner | 17 Dec |
| 11 | Arabic hero line «بناء التميز» reads as a calque | Med | Asil decides the line once (with #77) | CMO + Asil | G0 |
| 12 | Logo artwork reads "QOTTUF JAZEERA" | Low | Use the logo as supplied; never type that form of the name in running text (rule in the rules file) | CMO | 17 Dec |
| 13 | Two domains in use (Qottuf.com vs QOTTUFJAZEERA.COM) | Med | Asil picks one; the other redirects (part of #85) | CMO + Asil | G0 |
| 14 | Website colours off the brand palette | Low | Rebuild on the brand tokens | CMO | G0 |
| 15 | Brand guidelines use an emoji and "world-class / leading" lines that break their own rules | Low | Amend the guidelines | CMO | G0 |
| 16 | Price list: freight 450 kg reads "5100sr" (likely a missing zero) | Low | Correct it | Technical office | 17 Dec |
| 17 | Stair-lift add-on priced about ten times too low | High | Correct it in the pricing admin and republish | Technical office | Readiness |
| 18 | PRJ-001 contradicts itself (a college, or a female students' club?) | Med | Reconcile from documents in the reference file | CMO + bid coordinator | 17 Dec |
| 19 | Older site version pasted the 29,000 m² / 13-floor figure onto the KSrelief card | Low | Keep it out of the rebuild | CMO | G0 |
| 20 | Development-fallback ingest key hard-coded in the configurator JavaScript | Med | Rotate the key; remove the fallback | System owner | 17 Dec |
| 21 | Office address marked "needs client confirmation" in the site code | Med | Confirm from the master record (#85) | CMO | G0 |
| 22 | Four elevator sizes priced from the nearest capacity, unconfirmed | Med | Technical office confirms or corrects | Technical office | Readiness |
| 24 | The main "Call the office" button may ring a retired landline | **High** | Ring it this week; replace every instance if retired | Desk lead (test); CMO (fix) | This week (test); 17 Dec (fix) |
| 27 | The dealer configurator (the negotiation floor) is in the public menu | **High** | Remove from the menu and the campaign's links; gate it | CMO | 26 Nov |
| 53 | Ministry logos on the website, including the Ministry of Interior (PRJ-007's client is never named) | **High** | Remove the logos; client names in text, with permission (#86) | CMO | 26 Nov |
| 55 | Smart accessibility listed as a service with no authorisation letter and no delivered project | Med | Suspend from contracting material until both exist | CMO | 17 Dec |
| 58a | Grade 3 ceiling not read | **High** | Read the ceiling and expiry off the certificate | Bid coordinator | This week |
| 73 | Marketing README's sample work order cites PRJ-011 for an invented "3,200 sqm NCB branch… delivered on schedule" | Low | Delete it; samples use real records only | CMO | 17 Dec |
| 74 | B-06 (executive voice) defaults to writing as "the General Manager" | Low | Repoint to Asil under the agreed conditions | CMO | 17 Dec |
| 75 | Brand-file errors: "a ministry helipad" (names PRJ-007's client); "several government ministries"; 13 projects (there are 12); PRJ-011 "delivered in 45 days" (only the cladding steel); university buildings counted as 4 and as 6+; KSrelief listed as a government client; persona 5 built on villas; pillar 5 resting on two unproven partnerships | **High** | Correct to facts-and-claims.md; drop persona 5; suspend pillar 5 | CMO | 17 Dec |
| 76 | Copy failing the competitor test: "a beacon of innovation"; "We Build What Others Only Imagine." | Med | Asil approves one specific promise; retire the line | CMO + Asil | G0 |
| 77 | Open Arabic decisions: digits, the Arabic term for "MEP", the hero line | Med | Asil decides once; the rules file records it | CMO + Asil | G0 |
| 78 | Campaign plan dated 27 Sep (seven weeks late); links professionals to the dealer configurator; splits SAR 1,700 across two ad sets too small to separate two messages | **High** | Re-date to the readiness gate; link to the enquiry form; one ad set carrying both messages | CMO | Readiness |
| 79 | The AI-visibility monitor queries one answer engine of four | Low | Out of the measures; a quarterly check of what engines say about Qottuf by name | CMO | Done by decision |
| 80 | No SPF, DKIM or DMARC on record for either domain | Med | Run the DNS check and fix before quotes go out from the company inbox | CMO + system owner | Readiness |
| 81 | Ownership of the Facebook page, Instagram account, Meta ad account and LinkedIn page unconfirmed | **High** | Company-owned accounts, two admins each | CMO | Readiness |
| 82 | No vector logo master; the navy in the logo file doesn't match the brand colour | Low | Obtain the 2024 rebrand source files | CMO | G0 |

## M · days to weeks

| # | Weakness | Impact | Fix | Owner | When |
|---|---|---|---|---|---|
| 10 | In Arabic mode the hero intro, "Who We Are" and client captions stay English | Med | Native Arabic copy, reviewed by Asil | CMO | G0 |
| 23 | No enquiry or prequalification-request path for contracting buyers; no WhatsApp | **High** | A path for owners and PMCs (prequalification request; profile on request); a company WhatsApp number | CMO + CSO | G0 |
| 25 | No analytics; no campaign identifiers persisted, so attribution is impossible | High | Privacy-respecting analytics; campaign identifiers on every lead in the CRM | CMO + system owner | Readiness (identifiers); G0 |
| 26 | No privacy notice, consent wording or consent log (PDPL) | **High** | Privacy notice; consent wording; an append-only consent log | CMO + CSO | Readiness |
| 28 | 22 of 41 elevator sizes unpriced | High | Fill the costs, or replace "Contact us" with a callback booking (sizes the ads link to first) | Technical office | Readiness; G0 for the rest |
| 29 | Failed submissions sit in the visitor's browser; nobody sees them | Med | Fallback options (#9) and a server-side retry | System owner | G0 |
| 30 | CRM ingest rejects leads without an email, so Meta leads won't land | High | A Meta ingest route needing name and phone, or a manual handoff tested end to end | System owner + CSO | Readiness |
| 31 | CRM ingest accepts requests with no Origin header | Med | Origin required for browsers; signatures for servers; bot check; send caps | System owner | G0 |
| 32 | Lost reasons are free text | Med | An enumerated loss-reason column | System owner + CSO | G0 |
| 33 | Technical responses overwrite in place; no record of what was offered | High | Versioned responses with structured terms | System owner | G1 |
| 34 | The CRM emits no events; notifications reach only an open tab | Med | Ledger polls the CRM; a named paging channel | System owner | G1 |
| 35 | Customer conversations on personal WhatsApp | **High** | A shared company WhatsApp Business inbox | CSO | Readiness |
| 36 | Elevator speed: 24 h first contact, 48 h pricing, no same-day budget quote, no survey role | High | Approved budget price book; SLAs; survey role sized after the 30-day read | CSO + technical office | Readiness; 5 Jan |
| 37 | The maintenance book isn't connected to any sales record | High | Maintenance registry in the Ledger (Phase 1); licence filed | CSO + maintenance supervisor | G0 |
| 38 | The live website's source isn't in the repo; OneDrive duplicates; repo behind production | **High** | Decide: recover the source or rebuild; one canonical repo | CMO + system owner; Asil decides | 10 Dec decision; G0 |
| 39 | No Arabic URL or hreflang | Med | Bilingual site with Arabic URLs and hreflang | CMO | G0 |
| 40 | No service, sector or case-study pages; no company profile; no prequalification pack | **High** | Case-study pages from documented references; prequalification pack v1 | CMO + bid coordinator | 17 Dec (draft); G0 |
| 41–43 | Marketing runtime: retired model, forced tool calls, old SDK; no authentication; published database ports; empty fact base on `main` | — | **Closed by decision:** the runtime is retired and never deployed; its records move to the evidence store | CMO | Closed |
| 44 | No observability, golden sets or evals for the new runtime's agents | Med | Tracing, golden sets and CI regression before any component ships | System owner | Per component |
| 45 | Estimation: two divergent code lines; empty margin parameters; simulation on by default; open email webhook; spoofable client IP; supplier replies attributed without SPF/DKIM | High | Asil chooses one line; fix the four open audit items; fill the parameters | Estimator + system owner; Asil decides | G0 (decision); G1 |
| 46 | Estimation records no client tender outcome, frozen submitted price or financing cost | High | The Ledger records outcome and the frozen estimate; add a financing-cost line | CSO + estimator | G1 |
| 47 | Tender-reader: laptop-bound, provisional schema, pilot not engineer-checked | High | Server sandbox; versioned contract and validator; engineer spot-check | System owner + technical reviewer | G1 |
| 48 | Tracker not live; demo on US hosting; no service accounts; a client's P6 programme in git history | **High** | Live on the next project; hosting decision; remove the third-party file per the tracker's plan | PMO + system owner | G1 |
| 49 | Data residency and PDPL transfer safeguards undecided | **High** | Hosting decision; DPIA per agent; transfer assessment per provider | Asil + system owner + counsel | G0 (decision); G1 |
| 50 | The CRM lost its data twice; no restore drills | **High** | Backups, monthly restore drills, database fingerprint check after deploys | System owner | G0 |
| 51 | Duplicate copies (OneDrive vs repos) can silently revert fixes | Med | One canonical location; duplicates archived (Asil decides deletions) | System owner + Asil | G0 |
| 52 | "Fuji Japan" and "partnership" make three claims (origin, which Fuji, partnership) without the three documents | **High** | Off every public surface until the certificate of origin, the manufacturer's legal name and an authorisation naming Qottuf are in hand; wording set by the CMO, approved by Asil | Bid coordinator + CMO | 26 Nov (off); G0 |
| 54 | Office furniture is on the LCGPA Mandatory List: imported furniture can't go into government fit-outs | Med | A Saudi furniture manufacturer partner for government work | CSO + procurement | G1 |
| 62a | Prequalification and registration status with major owners unknown | **High** | Audit Etimad, Muqawil and owner portals | Bid coordinator | G0 |
| 83 | The brand rules exist in three copies; the one on `main` lists the correct name, "Qottuf Aljazeera", and «قطوف الجزيرة» as forbidden | **High** | One versioned rules file, from the brand skill, read by every checker | CMO | G0 |
| 84 | The claim verifier only checks that a cited ID exists | **High** | Independent extraction of each claim, checked by code against the record | Spine (CSO + CMO) | G0 |
| 85 | No master record of company details: "Qottuf Jazeera" on the website; the Arabic legal name adds «والتجارة»; the office number; no national address; two domains | **High** | One record copied from the commercial registration and tested; audit Muqawil, Etimad, the chamber, Google Maps and LinkedIn against it | CMO + bid coordinator | G0 |
| 86 | All 12 clients marked approved for naming with no written permission; "National Commercial Bank" shown as if it still exists; ministry logos | **High** | Written permission per client; "NCB (now SNB)"; names in text, not logos | CMO + Asil | G0 |
| 87 | The voice rule bans Saudi dialect; the elevator plans use it | Med | Two approved registers | CMO + Asil | Readiness |
| 88 | Imagery: no footage of a lift Qottuf installed; project photos without client approval or consent of the people shown; no rule against showing security features | High | Film PSU's six lifts with PSU's permission; approval per image set; never show security features | CMO | G0 |
| 89 | Two projects in the photo archive (an Elm company building, a university-area Hilton) are undocumented | Med | Request scope, value and dates; they may be missing corporate and hospitality references | Bid coordinator | 17 Dec |
| 90 | Personas omit PMCs, consultants and developers, who decide work in the band | High | Rebuild from the census and the top-20 list | CMO | G1 |
| 91 | Certificate expiry dates (CR, Zakat, GOSI, chamber, classification) tracked nowhere | **High** | Expiry dates in the evidence store, alerts at 60, 30 and 7 days | Bid coordinator | G0 |
| 92 | Nobody checks a tender's confidentiality clause before its documents reach an AI provider | **High** | Check at intake, before any AI reads the documents | CSO | Before the first AI-read tender |
| 93 | No crisis protocol | **High** | Client hears from Asil first, in person; one spokesperson; holding statements approved in both languages; nothing public before the client conversation; no agent answers publicly | CMO + Asil | G1 |
| 94 | The handover has no owner, so no reference is captured | **High** | The PM and the bid coordinator jointly own the completion certificate, referee consent and client review. No project manager, no reference | PMO + bid coordinator | G0 (rule) |
| 95 | No careers page | Low | Bilingual careers page in the rebuild; roles, never headcount | CMO | G0 |

## L · months

| # | Weakness | Impact | Fix | Owner | When |
|---|---|---|---|---|---|
| 56 | One person sells contracting (Asil), who also approves every gate and reviews all Arabic | **High** | Bid coordinator; bilingual coordinator; weekly board + 48-hour bid path; prepared briefs; second BD hire after G1 | Asil | G0 (people); G2 (hire) |
| 57 | The GM is unavailable for client meetings, including award-stage ones | Med | Asil leads; the Deputy GM sponsors two or three accounts if Asil agrees | Asil | G0 |
| 58b | If the ceiling is below SAR 100 m, part of the band's government work is out of reach | **High** | Cap options to Asil; JV route or upgrade path decided by mid-2027 | Asil + company | G1 |
| 60 | Bonding and financial capacity for concurrent SAR 20–100 m projects unknown to BD | **High** | A yes or no from finance per pursuit; never figures in agent context | Finance | G0 |
| 61 | No coverage of the owners, developers, PMCs and consultants in the band; no early project visibility | **High** | Top-20 list with named owners and cadence; Opportunity Scout; Account Planner | CSO + Asil | G0 (list); G1 |
| 62b | Changing prequalification status with the major owners | **High** | Prequalification submissions to the 20 priority organisations | CSO + bid coordinator | G1 |
| 63 | No measured baseline (bids, wins, losses, prices, backlog, capacity, elevator funnel) | **High** | G0 baseline from finance and the PMO (confidential tier); CRM history export | CSO + finance + PMO | G0 |
| 64 | Pricing blind to the market | **High** | Award data; frozen estimates; outcome capture | CSO + estimator | G1–G2 |
| 65 | Marketing shipped nothing; personas omit the deciders | **High** | Phase 1 ships proof ("case studies used"), the campaign (6 Dec), personas rebuilt | CMO | G0–G1 |
| 66 | Tools in pieces with no shared IDs: CRM, two estimation lines, tender-reader, tracker, marketing | **High** | One runtime, one Ledger, shared IDs, a system owner | System owner; Asil funds | G1 |
| 67 | No targets, incentives or operating rhythm | High | The scoreboard; targets from the G0 baseline; desk commission; BD bonus on margin collected; weekly board | Asil + CSO | G0–G1 |
| 68 | Delivery capacity to execute larger projects | **High** | Hiring plan tied to the pipeline | GM + PMO + Construction Director | G1–G2 |
| 69 | Brand claims that don't match reality at the moment of due diligence | **High** | S fixes; rebuild; verifier and rulebook (#83, #84) | CMO | 26 Nov–G0 |
| 96 | The 12 "verified" projects are verified against the company's own profile and website, not contracts or certificates | **High** | "Verified" means backed by documents; every record re-verified through the reference file | CMO + bid coordinator | G0 |
| 97 | No marketing, design, communications or bid role anywhere in the company | **High** | Hire the bilingual coordinator now; formalise the bid coordinator; second BD hire after G1 | Asil | 26 Nov (start); G0 |

## XL · company-level

| # | Weakness | Impact | Fix | Owner | When |
|---|---|---|---|---|---|
| 59 | **The proof gap:** comparable-value references not organised; not one SAR 20 m+ main contract documented | **High (rank 1)** | Reference file (value, dates, completion certificate, consenting referee). **17 Dec test on Qottuf's own documents for three projects; January pivot to JV-first if it fails;** referee consents by 31 Jan | Bid coordinator + CMO + PMO + finance; Asil approves referee requests | 17 Dec (test); 31 Jan (consents) |
| 70 | **The ambition gap:** Tier 1 by 2028 from a Grade 3, SAR 20–100 m base needs capital, classification, references and organisation that commercial work alone can't produce | **High** | Tier 1 defined at four levels; routes A, B and C; gates with consequences (`qottuf-tier1-2028-roadmap.md`) | Asil + shareholders | G0 (definition); 2027 (route C) |
| 71 | **Concentration:** a few large projects a year; one loss or one troubled project swings the year and the reputation | **High** | First pursuits for deliverability, reference value and payer reliability; maintenance as steady income; crisis protocol | CSO + CMO + Asil | G1 |
| 72 | **The commercial engine rests on one person and on AI systems that haven't produced one external output** | **High** | People (#56, #97); Phase 1 ships real outputs by G0; nothing built that doesn't touch revenue | Asil + CSO + CMO | G0 |

---

## Who can fix what

| Fixable inside Business Development | Needs the company | Needs the shareholders |
|---|---|---|
| Items 1–47, 49–59 (the proof gap, with the PMO and finance), 61–67, 69, 71–97 | 48 and 68 (delivery capacity and the tracker), 60 (bonding), 58b (classification upgrade), 63 (baseline data), 94 (handover owner) | 70 (route C: capital or partner for T1-Formal) |
