# Qottuf Business Development runtime: Phase 1

The agentic workflow from `qottuf-business-development-department-v1.md`, built. The agents find, check and prepare; Asil decides, approves and sends.

**Nothing is ever sent or published.** Every output ends as a draft in Asil's approval queue, and Phase 1 has no send function at all.

## Run it

```bash
cd runtime
npm install
npm test        # 144 tests on a real Postgres engine running in-process (PGlite)
npm run demo    # the whole workflow on fictional data, no setup, no network
npm run board   # the board on this computer: http://localhost:4300
```

## The board, on your computer

**Install on a Mac, in one line** (Terminal). It downloads the code to `~/Qottuf-Sales`, installs Node with Homebrew if it's missing, asks for the Anthropic API key and finds the brand skill. Then it builds **Qottuf Board**, a Mac app, and opens it. Run it again to update; it keeps `.env` and the data:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/asilshehadah1/Qottuf-Sales/refs/heads/claude/hopeful-archimedes-6kncjp/runtime/scripts/install-board.sh)
```

**The app.** Qottuf Board lives in `~/Applications`, with a link on the Desktop; Launchpad and Spotlight find it. It shows the board in its own window:
- opening it starts the board, or uses the one already running;
- links to the CRM and the website open in your browser;
- File, Restart the Board picks up a change to `runtime/.env`;
- quitting it stops the board it started.

The installer compiles the app on the Mac from `desktop/QottufBoard.swift`, with Apple's command line tools (the ones git needs). Without them, the app opens the board in a Chrome app window or your browser instead. When the brand skill is on the Mac, the icon is the Qottuf mark, drawn there and never stored in git; otherwise it is the board's own icon. The log: `~/Library/Logs/Qottuf Board.log`.

From Terminal, `qottuf-board` starts the board and opens it in the browser; `qottuf-board stop` stops it. From a checkout: `npm run board`, then open **http://localhost:4300**.

It is the department's one screen:
- all 38 agents of the merged roster, from the sales and the marketing designs;
- the approvals queue;
- the Ledger, the website and the CRM.

It is one process on your computer:
- the Ledger, in an embedded Postgres in `runtime/.data/board` (outside git), or `DATABASE_URL`;
- the Dispatcher's worker, which runs the agents;
- the board's page.

**Setup.** Copy `.env.example` to `.env` (git ignores it) and fill in what you use:

| Setting | What it does |
|---|---|
| `QOTTUF_MODEL_CALLS=enabled` and `ANTHROPIC_API_KEY` | Turn the writers on. They run on your Anthropic API account and are billed per use, not to your Claude plan. Each run has a token budget, and the board shows the tokens each run used. Without a key, the code agents still run: the website and mail checks, the board pack and the renewals |
| `QOTTUF_BRAND_DIR` | The qottuf-brand skill's folder, if the board doesn't find it in `~/.claude/skills`. The rulebook and the fact base are read from it at start and never copied into git |
| `WEBSITE_PAGES`, `MAIL_DOMAIN` | The pages the site check reads (default: the home page and both configurators on qottuf.com) and the quote inbox's domain |

**What's on it.**

| Page | What it shows |
|---|---|
| Board | What needs you, this week's numbers, the department at a glance, recent runs, alerts |
| Agents | The 38 agents by group (Spine, Win: Projects, Win: Elevators, Proof & Demand), filterable by sales or marketing. A live agent opens a panel to run it and watch each step |
| Approvals | Each draft in both languages, side by side, with its checks |
| Pipeline | The Pipeline Engine: accounts, opportunities, screening, the bid decision (S-G1), history |
| Elevators | The CRM's pipeline as stage columns, with the 24-hour first-contact and 48-hour technical promises checked against the timestamps; each card opens the quotation in the CRM |
| Website | The live site check with "rewrite this page" on each failing page, the mail domain, the master company record and the listings |
| Proof | The proof test, the evidence store, and a one-click import of the brand fact base: the 12 projects, the lifts on record and the proposed company record |
| Lifts | The installed base: confirm the PRJ-005 lifts, owner agreements, contracts, inspections, renewals |
| Check text, Connections | Any copy through the gates, and what the board is connected to |

**The marketing agents.** Three marketing writers were pulled forward from phase 2 at Asil's request. They share one workflow (`src/workflows/content.ts`), with the same gates, an independent claim extraction and one revision round:
- **#30** writes LinkedIn posts, in the company voice or Asil's;
- **#34** writes elevator posts and reel scripts, with Saudi conversational Arabic allowed and real footage only;
- **#29** rewrites a live page that failed the site check, in both languages, with its title, description and the form's consent sentence.

The retired marketing runtime is not called: its model agents are rewritten here, as the spec says.

**The CRM connection.** The CRM has no read-only keys, so the board signs in as a person, from the Elevators page. Use a coordinator account: it sees the whole pipeline and can't change a quotation.
- **The session:** kept in memory only, and synced every 10 minutes. The password is never stored. `CRM_EMAIL` and `CRM_PASSWORD` in `.env` are optional, for an account without two-factor sign-in.
- **What's kept:** each quotation is copied through an allowlist, without the customer's name, phone, email, company, notes, configurator choices or request metadata.
- **Writes:** the board never writes to the CRM.

**The website connection.**
- **Live checks:** the site check and the mail check run from your computer, against the live site and the live DNS.
- **Leads:** enquiries from the website's configurators arrive through the CRM.
- **Rewrites:** the Web Page Writer's rewrites land in Approvals; nothing on the website changes from the board.

**Security.** The board listens on 127.0.0.1 only and answers only requests whose Host header names this machine, which blocks DNS rebinding. Every change must be JSON from the board's own page, so another website open in the same browser can't approve a draft or start a paid run. Pages carry a strict content security policy and can't be framed.

## The console: live, on Asil's Claude plan

**https://claude.ai/artifact/2So2XzTx7RT2hHX32fwVzD**. It's private until Asil shares it from the page's Share menu; give the team **Contributor** access.

**How it runs.**
- It's a claude.ai page. The agents run in the browser, on the viewer's own Claude plan, through the page's `sample` capability: no API key, no separate billing.
- The first agent run asks the viewer to allow Claude.
- It's the same code as the server. The workflows, gates and engine rules are compiled into `console/qottuf-console.js` (`npm run build:console`), so a draft is checked the same way in both places.

**The views.**

| View | What it does |
|---|---|
| Board | Decisions first |
| Pipeline | Accounts, opportunities, screening against the knock-outs, the bid decision (S-G1) |
| Agents | Meeting brief, debrief, case study, bilingual editor |
| Approvals | Drafts waiting for approval. There is no send button |
| Proof | The 17 December proof test, and evidence filing |
| Lifts | The installed base and renewals |
| Footprint | The master company record, listings, and the website and mail checks |
| Check text | Any copy, against the same gates |

**Who can do what.** These are the page's database rules, enforced by claude.ai:

| Who | Can |
|---|---|
| Contributors | Read the records; create accounts and opportunities; run agents; file evidence as drafts; keep the lift registry |
| Asil only (the artifact's owner) | Approve drafts; decide bids, which writes an owner-only record the pipeline shows as "recorded by Asil"; approve or withdraw evidence (S-G5); approve the master record |
| Editors | Also manage contacts and the stored checks |
| Viewers and Commenters | See no records |

**What's in it.** It was seeded on 19 November 2026 with real records only. The team adds its own pipeline.
- The 12 projects from the brand fact base, as public evidence. A client may be named only where the company already names it publicly.
- The six PRJ-005 lifts. Each is marked "to confirm", because only their existence is on record.
- A proposed master company record with four open questions.
- The 19 November website and mail checks.

**Personal data.** Phone numbers, emails, ID numbers, IBANs and titled names (Eng., Dr., المهندس) are removed before Claude sees anything. A bare name isn't, so notes should name roles, not people. Confidential and internal evidence stay out of the console: it files tender and public tiers only.

**Limits.**
- The page can't fetch other sites, so the live website and mail checks don't re-run from it. Paste a page's HTML into Footprint, or run `npm run check`.
- The console's records live in the artifact's database on claude.ai, not in Postgres. They have the page's access rules but not row-level security by tier or the hash-chained audit log.

**Update it.**
1. Run `npm run build:console`.
2. Republish `console/index.html` with three files beside it: `qottuf-console.js`, `config/business-rules.json`, and the brand skill's `assets/brand-rules.json`. The rulebook is never copied into git.

**Checked.**
- A browser pass of 56 checks against a stand-in runtime, all passing. It covered every view, a bid decision and its owner record, a case-study run through to approval, and stopping a run.
- It also covered a rate-limit message, PII redaction, contributor and viewer access, phone width, and the dark theme.
- After publishing, the seed was read back at Contributor level.
- No real Claude call has been made from the console yet: that needs Asil's consent in the browser.

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
| 29 | Web Page Writer | Built (pulled forward from phase 2): rewrites a live page that failed the site check | `src/agents/marketing.ts`, `src/workflows/marketing.ts` |
| 30 | Executive Voice and company LinkedIn | Built (pulled forward from phase 2) | `src/agents/marketing.ts` |
| 34 | Elevator Ad and Content Drafter | Built (pulled forward from phase 2): posts and reel scripts, real footage only | `src/agents/marketing.ts` |
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

- All 144 tests pass and the type check is clean, on Node 22 and on Node 26.13.1 (the version on Asil's Mac). On Node 26 the board also starts, and stops with a page open.
- **The board, checked in a browser:** 18 checks, all passing, on 19 November. The board ran here with:
  - the real brand skill;
  - the live site's pages saved that morning;
  - a stand-in CRM holding fictional quotations;
  - a scripted stand-in for Claude.

  The checks covered the import, the site and mail checks, a case study and a LinkedIn post run to completion, the CRM stage columns, a tender screened, every page at phone width, dark mode, and no page errors.
- **The desktop app hasn't run on a Mac yet.** Its first real build is on Asil's Mac, by the installer. Here, on Linux:
  - its Swift parses and type-checks (Swift 6.1, in both language modes) against stand-ins for AppKit and WebKit;
  - its own pages and its link handling were checked in Chromium;
  - the build script and the browser fallback ran with stand-ins for the macOS tools.
- **Not run from the board yet:**
  - a real Claude call, which needs an API key;
  - a sign-in to the real CRM, which needs an account;
  - a fetch of the live site. This container has no direct internet, so the site check read the saved pages; on your computer it reads the live ones.
- **Real checks, 19 November 2026:**
  - **The site checker on the live website branch** (`content-update-aug2026`, 5 pages): 35 failures, and 1 of the 4 G0 bar items met (working contacts).
  - **The mail check on qottuf.com: unprotected.** There is no DMARC record and the SPF record ends in `?all`; MX and a DKIM key are present.
- **No real call to Claude has been made.**
  - The server's model client was tested against the SDK's real request builder with a fake network, and the demo uses scripted outputs.
  - Server model calls stay off until Asil decides hosting and data residency (decision #7, due 17 December).
  - The console is the exception: it calls Claude on Asil's own plan once Asil allows it in the browser.
- **No golden sets yet** (spec §13.4), so the agents can't be measured and no agent should go live.
- **Known limits:**
  - The PII guard misses a bare name with no title that isn't in the contact registry.
  - The site checker reads static HTML: it doesn't measure Core Web Vitals or run Google's Rich Results Test.
  - Figurative numbers ("one sector at a time") are flagged for a human to dismiss.

## Deviations from the spec, for review

1. **The Dispatcher queue lives in Postgres, not Redis/BullMQ.** It gives the same guarantees with one service fewer to run and secure.
2. **No HTTP API yet,** so nothing is exposed. The authenticated API (sessions with MFA for people, scoped keys for services) and Docker Compose come before any deployment.
3. **The console runs agents in the browser, on Asil's Claude plan, with its data on claude.ai.** This makes the agents usable now, before the hosting decision.
   - The trade-off: the console's access rules are claude.ai's database rules, not Postgres row-level security, and it keeps no hash-chained audit log.
   - So only public and tender evidence go into it.
   - The server runtime remains the target for confidential work.
4. **The board signs in to the CRM as a person.** The CRM has no read-only service key, so the board uses a coordinator's session, kept in memory. Adding a scoped, read-only key to the CRM would let the board sync without a person's session; that's a change to the CRM's repository, for Asil to approve.
5. **Three phase 2 marketing agents (#29, #30, #34) are built now,** at Asil's request; drafts only.

## Data

No client data is in this repo:
- test and demo data is fictional;
- the brand rulebook is read from the brand skill at run time, never copied. The console's copy is published with the artifact on claude.ai, not kept in git.

Real evidence goes into the database (or the console's store on claude.ai), and neither goes into git.

## Needed from Asil

1. **An Anthropic API key, and the decision to turn the writers on.** The board runs on your computer, so its data stays there; model calls go to Anthropic's API and are billed per use. Put the key in `runtime/.env`; data residency for any later hosting is still decision #7 (by 17 December).
2. **Sign off `config/business-rules.json`.** It says `PENDING: Asil`.
3. **The proof documents:** contract value, dates and completion certificate for at least three projects.
4. **The master company record:** CR, VAT, phone, email, website, address. It's proposed on the board's Website page (and in the console's Footprint), with questions to settle before Asil approves it:
   - the Arabic legal name;
   - whether the landline is still answered (the elevator page's code says it was retired, yet the home page still dials +966 11 217 7750, and the rulebook lists it);
   - which domain is the company's;
   - the VAT number.
5. **Two DNS changes on qottuf.com,** for whoever manages the domain:
   - add a DMARC record, starting at `p=none` with a report address, then tightening;
   - change the SPF ending from `?all` to `~all`.
6. **A CRM coordinator account for the board** (a coordinator sees the whole pipeline and can't change a quotation). Sign in from the board's Elevators page.
