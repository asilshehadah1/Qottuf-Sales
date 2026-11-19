# Qottuf Business Development runtime: Phase 1

The agentic workflow from `qottuf-business-development-department-v1.md`, built. The agents find, check and prepare; Asil decides, approves and sends.

**Nothing is ever sent or published.** Every output ends as a draft in Asil's approval queue, and Phase 1 has no send function at all.

## Run it

```bash
cd runtime
npm install
npm test        # 115 tests on a real Postgres engine running in-process (PGlite)
npm run demo    # the whole workflow on fictional data, no setup, no network
```

## Checks the team can run today

No database, no client data:

```bash
npm run check -- site https://www.qottuf.com --phone "+966 11 217 7750" --email info@qottuf.com --website https://www.qottuf.com
npm run check -- mail qottuf.com          # add --doh on networks that block DNS
```

The site check:
- tests each page against the website bar set for G0: nothing false, working contacts, both languages, and an enquiry form with consent wording;
- runs the real brand rulebook and claims check on everything a visitor reads;
- checks the technical basics.

The mail check:
- reads the domain's MX, SPF, DKIM and DMARC records;
- says whether quotes sent from it can be spoofed or land in spam.

## What exists (merged roster, Phase 1, spec §5)

| # | Component | Status | Code |
|---|---|---|---|
| 1 | Dispatcher | Built: per-artifact pipelines, retries with backoff, dead-letter, token budgets, run log | `src/dispatcher/` |
| 2 | Pipeline Engine | Built: stages for both motions; owner + next step + date; knock-outs; 48-hour bid timer; S-G1; SLA and deadline alerts | `src/pipeline/` |
| 5 | Brand Gate | Code part built: a port of the brand skill's checker on the same `brand-rules.json`. Model part not yet | `src/gates/brand.ts` |
| 6 | Bilingual Editor | Built: near-final English–Arabic pair, with code checks for figure parity, no figures added to the source, glossary terms and the Arabic register | `src/agents/bilingualEditor.ts`, `src/gates/parity.ts` |
| 7 | Fact and Evidence Verifier | Built: bilingual number normaliser, independent extraction, code checks against approved records | `src/gates/claims.ts`, `src/agents/claimExtractor.ts` |
| 8 | Consent, PII and Compliance | Built: redaction before every model call, append-only consent log, four evidence tiers in the database. DPIA documents not yet | `src/gates/pii.ts`, `src/ledger/` |
| 12 | Reporting and Board Pack | Built (code only): decisions, proof, pipeline, alerts, expiring evidence, installed base, public footprint | `src/reporting/` |
| 19 | Meeting Prep and Debrief | Built | `src/agents/meetingPrep.ts` |
| 20 | Prequalification and Evidence Manager | Code part built: pack check, expiry at 60/30/7 days, referee consents to request | `src/pipelines/prequalPack.ts` |
| 27 | Installed Base and Maintenance Registry | Built: lifts with owner consent, maintenance offers and contracts, inspection and registration dates; renewals become pipeline opportunities; gaps flagged | `src/installedBase/` |
| 28 | Case-Study and Reference Writer | Built | `src/agents/caseStudyWriter.ts` |
| 31 | Entity and Listings Record | Built: master company record approved by Asil and bound to the rulebook; every listing compared field by field | `src/entity/` |
| 32 | Site Checker | Built: ported from marketing, with its bugs fixed | `src/site/` |
| 38 | DNS and Deliverability Check | Built: ported from marketing, with its bugs fixed | `src/deliverability/` |
| 33 | AI-visibility baseline run | Not yet (one run in Phase 1; needs the model switched on) | |

**Bugs fixed in the ports from the marketing repo:**
- The schema generator named the company "Qottuf Al Jazeera", a spelling the rulebook forbids.
- The site auditor resolved redirects against the wrong address.
- The mail check could read the DMARC subdomain policy as the main policy.
- The marketing Arabic editor's prompt also used the forbidden spelling.

Elevators: the engine already runs the CRM's pipeline stages and SLAs, and the registry handles after-sales. The desk agents follow the 30-day read of the first campaign, as the plan says.

## Rules it enforces, and where

- **Contracting scope:** SAR 20–100 m, main contractor only, no villas. These are knock-outs in `config/business-rules.json`; only Asil can override one, with a logged reason.
- **Every open opportunity has an owner, a next step and a date.** Maintenance renewals become opportunities too.
- **Asil decides:**
  - bids (S-G1);
  - confidential releases (S-G6);
  - artifact approvals;
  - the master company record.
- **Evidence and the registry:** the bid coordinator can also approve evidence (S-G5). The desk lead and maintenance supervisor keep the lift registry.
- **Every figure in client material matches an approved record,** in context and next to the right project, in both languages and in the same value.
- **No personal data reaches a model.** Lift owners are contacted only with their recorded agreement.
- **Evidence tiers are enforced by Postgres row-level security.** Logs are append-only, and the audit log is hash-chained.
- **Calendar dates stay exact in any timezone.** The suite runs in Riyadh time.

## What has run, and what hasn't

- All 115 tests pass and the type check is clean.
- **Real checks, 19 November 2026:**
  - **The site checker on the live website branch** (`content-update-aug2026`, 5 pages): 35 failures, and 1 of the 4 G0 bar items met (working contacts).
  - **The mail check on qottuf.com: unprotected.** There is no DMARC record and the SPF record ends in `?all`; MX and a DKIM key are present.
- **No real call to Claude has been made.** The model client was tested against the SDK's real request builder with a fake network, and the demo uses scripted outputs. Model calls stay off until Asil decides hosting and data residency (decision #7, due 17 December).
- **No golden sets yet** (spec §13.4), so the agents can't be measured and no agent should go live.
- **Known limits:**
  - The PII guard misses a bare name with no title that isn't in the contact registry.
  - The site checker reads static HTML: it doesn't measure Core Web Vitals or run Google's Rich Results Test.
  - Figurative numbers ("one sector at a time") are flagged for a human to dismiss.

## Deviations from the spec, for review

1. **The Dispatcher queue lives in Postgres, not Redis/BullMQ.** It gives the same guarantees with one service fewer to run and secure.
2. **No HTTP API yet,** so nothing is exposed. The authenticated API (sessions with MFA for people, scoped keys for services) and Docker Compose come before any deployment.

## Data

No client data is in this repo:
- test and demo data is fictional;
- the brand rulebook is read from the brand skill at run time, never copied.

Real evidence goes into the database, and the database never goes into git.

## Needed from Asil

1. **Hosting and data residency** (by 17 December). This turns model calls on.
2. **Sign off `config/business-rules.json`.** It says `PENDING: Asil`.
3. **The proof documents:** contract value, dates and completion certificate for at least three projects.
4. **The master company record:** CR, VAT, phone, email, website, address. One open question: the elevator page's code says the office landline was retired, yet the home page still dials +966 11 217 7750, and the rulebook lists it.
5. **Two DNS changes on qottuf.com,** for whoever manages the domain:
   - add a DMARC record, starting at `p=none` with a report address, then tightening;
   - change the SPF ending from `?all` to `~all`.
6. **CRM access** for the elevator poller (next phase).
