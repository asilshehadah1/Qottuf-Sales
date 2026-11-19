# Qottuf Business Development runtime: Phase 1

The agentic workflow from `qottuf-business-development-department-v1.md`, built. The agents find, check and prepare; Asil decides, approves and sends.

**Nothing is ever sent or published.** Every output ends as a draft in Asil's approval queue, and Phase 1 has no send function at all.

## Run it

```bash
cd runtime
npm install
npm test        # 77 tests on a real Postgres engine running in-process (PGlite)
npm run demo    # the whole workflow on fictional data, no setup, no network
```

The demo:
1. Screens four invitations against the SAR 20–100 m band.
2. Records Asil's bid decision with its score.
3. Has the case-study writer draft a wrong figure; the gates catch it and the revision fixes it.
4. Prepares a meeting brief and checks a prequalification pack.
5. Builds the weekly board pack.
6. Checks three of today's public claims against the real brand rulebook, if the brand skill is installed.

## What exists (merged roster, Phase 1, spec §5)

| # | Component | Status | Code |
|---|---|---|---|
| 1 | Dispatcher | Built: per-artifact pipelines, retries with backoff, dead-letter, token budgets, run log | `src/dispatcher/` |
| 2 | Pipeline Engine | Built: stages for both motions; owner + next step + date; knock-outs; 48-hour bid timer; S-G1; SLA and deadline alerts | `src/pipeline/` |
| 5 | Brand Gate | Code part built: a port of the brand skill's checker on the same `brand-rules.json`. Model part not yet | `src/gates/brand.ts` |
| 7 | Fact and Evidence Verifier | Built: bilingual number normaliser, independent extraction, code checks against approved records | `src/gates/claims.ts`, `src/agents/claimExtractor.ts` |
| 8 | Consent, PII and Compliance | Built: redaction before every model call, append-only consent log, four evidence tiers in the database. DPIA documents not yet | `src/gates/pii.ts`, `src/ledger/` |
| 12 | Reporting and Board Pack | Built (code only): decisions first, then proof, pipeline, alerts, expiring evidence | `src/reporting/` |
| 19 | Meeting Prep and Debrief | Built | `src/agents/meetingPrep.ts` |
| 20 | Prequalification and Evidence Manager | Code part built: pack check, expiry at 60/30/7 days, referee consents to request | `src/pipelines/prequalPack.ts` |
| 28 | Case-Study and Reference Writer | Built | `src/agents/caseStudyWriter.ts` |
| 6 | Bilingual Editor | Not yet | |
| 27 | Installed Base and Maintenance Registry | Table only | `migrations/001_ledger.sql` |
| 31, 32, 38 | Entity record, Site Checker, DNS check | Not yet (32 and 38 are ports from the marketing repo) | |
| 33 | AI-visibility baseline run | Not yet | |

Elevators: the engine already runs the CRM's pipeline stages and SLAs (24-hour first contact, 48-hour technical response). The desk agents follow the 30-day read of the first campaign, as the plan says.

## Rules it enforces, and where

- **Contracting scope:** SAR 20–100 m, main contractor only, no villas. These are knock-outs in `config/business-rules.json`; only Asil can override one, with a logged reason.
- **Every open opportunity has an owner, a next step and a date.** The engine refuses anything else.
- **Asil decides:** bids (S-G1), confidential releases (S-G6) and artifact approvals. Evidence approval (S-G5) is Asil or the bid coordinator. Every decision records the rules version that made it.
- **Every number in client material matches an approved record,** in context and next to the right project. This includes Arabic duals, number words, "24/7" and "14-storey".
- **No personal data reaches a model.** Contacts become ids such as `[CNT-0007]`, and the model client refuses unredacted text.
- **Evidence tiers are enforced by Postgres row-level security:**
  - confidential rows are visible only after Asil's release;
  - every read of confidential or internal rows is logged;
  - approved evidence can't be edited, only withdrawn.
- **Logs are append-only,** and the audit log is hash-chained.

## What has run, and what hasn't

- All 77 tests pass and the type check is clean.
- **No real call to Claude has been made.** The model client was tested against the SDK's real request builder with a fake network, and the demo uses scripted outputs. Model calls stay off until Asil decides hosting and data residency (decision #7, due 17 December); then set `QOTTUF_MODEL_CALLS=enabled` and provide an API key.
- **No golden sets yet** (spec §13.4). They come from Qottuf's own past enquiries, tenders and drafts. Until they exist, the agents can't be measured, and no agent should go live.
- **The PII guard misses a bare name** with no title that isn't in the contact registry. This is a known limit and is covered by a test.

## Deviations from the spec, for review

1. **The Dispatcher queue lives in Postgres, not Redis/BullMQ.** It gives the same guarantees (retries, dead-letter, budgets) with one service fewer to run and secure, which matters with no system owner.
2. **No HTTP API yet,** so nothing is exposed. The authenticated API (sessions with MFA for people, scoped keys for services) and Docker Compose come before any deployment.

## Data

No client data is in this repo:
- test and demo data is fictional;
- the brand rulebook is read from the brand skill at run time, never copied.

Real evidence goes into the database, and the database never goes into git.

## Needed from Asil

1. **Hosting and data residency** (by 17 December). This turns model calls on.
2. **Sign off `config/business-rules.json`.** It says `PENDING: Asil`.
3. **The proof documents:** contract value, dates and completion certificate for at least three projects. They go into the evidence store.
4. **CRM access** for the elevator poller (next phase).
