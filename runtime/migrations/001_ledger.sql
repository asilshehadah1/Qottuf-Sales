-- Qottuf Business Development runtime: the Ledger, Phase 1.
-- Spec: qottuf-agentic-sales-department-v1.md §12 (data contracts) and §7 (gates);
--       qottuf-business-development-department-v1.md §4 (one Ledger, one evidence store, four tiers).
-- Rules enforced here, in the database, not only in code:
--   * append-only logs (consent, opportunity history, evidence reads, run log, audit) cannot be edited or deleted;
--   * evidence tiers are enforced by row-level security for the application role;
--   * an approved evidence record is immutable (correct it with a new record and withdraw the old one);
--   * an approval decision is final once taken.

-- ---------------------------------------------------------------- helpers

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP;
END $$;

CREATE SEQUENCE seq_account;
CREATE SEQUENCE seq_contact;
CREATE SEQUENCE seq_opportunity;
CREATE SEQUENCE seq_evidence;
CREATE SEQUENCE seq_unit;
CREATE SEQUENCE seq_work_order;
CREATE SEQUENCE seq_artifact;

-- ---------------------------------------------------------------- accounts and contacts

CREATE TABLE accounts (
  id                 text PRIMARY KEY DEFAULT 'ACC-' || lpad(nextval('seq_account')::text, 4, '0'),
  name_en            text NOT NULL,
  name_ar            text,
  type               text NOT NULL CHECK (type IN ('owner','developer','pmc','consultant','main_contractor',
                                                   'university','hospital_group','bank','corporate','government','other')),
  parent_id          text REFERENCES accounts(id),
  sector             text,
  relationship_owner text NOT NULL,
  executive_sponsor  text,
  priority_rank      int CHECK (priority_rank BETWEEN 1 AND 20),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX accounts_priority_rank ON accounts(priority_rank) WHERE priority_rank IS NOT NULL;

-- Personal data lives only in this table. Agents see the contact id (a pseudonym), never these fields.
CREATE TABLE contacts (
  id                 text PRIMARY KEY DEFAULT 'CNT-' || lpad(nextval('seq_contact')::text, 4, '0'),
  account_id         text NOT NULL REFERENCES accounts(id),
  full_name_en       text,
  full_name_ar       text,
  role_title         text,
  committee_role     text CHECK (committee_role IN ('decision_maker','evaluator','influencer','user','gatekeeper','sponsor')),
  preferred_channel  text CHECK (preferred_channel IN ('whatsapp','email','phone','meeting','linkedin')),
  preferred_language text CHECK (preferred_language IN ('ar','en')),
  phone              text,
  email              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Append-only: a withdrawal is a new event, never an edit.
CREATE TABLE consent_events (
  id              bigserial PRIMARY KEY,
  contact_id      text NOT NULL REFERENCES contacts(id),
  channel         text NOT NULL CHECK (channel IN ('whatsapp','email','sms','phone','linkedin')),
  scope           text NOT NULL CHECK (scope IN ('one_to_one','marketing','reference_request')),
  action          text NOT NULL CHECK (action IN ('grant','withdraw')),
  wording_version text NOT NULL,
  source          text NOT NULL,
  recorded_by     text NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER consent_events_append_only BEFORE UPDATE OR DELETE ON consent_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ---------------------------------------------------------------- opportunities

CREATE TABLE opportunities (
  id               text PRIMARY KEY DEFAULT 'OPP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('seq_opportunity')::text, 4, '0'),
  version          int  NOT NULL DEFAULT 1,
  motion           text NOT NULL CHECK (motion IN ('contracting','elevator')),
  title            text NOT NULL,
  account_id       text REFERENCES accounts(id),
  route            text NOT NULL CHECK (route IN ('invited_private','etimad_public','direct_negotiated','framework',
                                                  'prequalification_list','inbound_elevator','maintenance_renewal')),
  qottuf_role      text NOT NULL CHECK (qottuf_role IN ('main_contractor','subcontractor','jv_partner','supplier_installer')),
  sector           text,
  service_lines    text[] NOT NULL DEFAULT '{}',
  stage            text NOT NULL,
  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  owner            text NOT NULL,
  next_step        jsonb,            -- {action, owner, due_at}; required in every open stage (enforced in the engine)
  value_min_sar    numeric(16,2),
  value_max_sar    numeric(16,2),
  value_source     text NOT NULL DEFAULT 'unknown' CHECK (value_source IN ('tender','estimate','client','unknown')),
  dates            jsonb NOT NULL DEFAULT '{}'::jsonb,
  requirements     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- what the tender asks for (references, certificates)
  scorecard        jsonb,            -- latest scorecard result, with its rules version
  outcome          jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (value_min_sar IS NULL OR value_max_sar IS NULL OR value_min_sar <= value_max_sar)
);

CREATE TABLE opportunity_events (
  id             bigserial PRIMARY KEY,
  opportunity_id text NOT NULL REFERENCES opportunities(id),
  at             timestamptz NOT NULL DEFAULT now(),
  actor          text NOT NULL,
  event          text NOT NULL CHECK (event IN ('created','transition','next_step','decision','override','update')),
  from_stage     text,
  to_stage       text,
  rules_version  text NOT NULL,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TRIGGER opportunity_events_append_only BEFORE UPDATE OR DELETE ON opportunity_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ---------------------------------------------------------------- evidence store (four tiers)

CREATE TABLE evidence_records (
  id             text PRIMARY KEY DEFAULT 'EV-' || lpad(nextval('seq_evidence')::text, 4, '0'),
  type           text NOT NULL CHECK (type IN ('contract','completion_certificate','referee_consent','reference_letter',
                                               'certificate','financial_statement','bank_letter','case_facts',
                                               'company_record','client_naming_approval','cost_record')),
  tier           text NOT NULL CHECK (tier IN ('public','tender','confidential','internal')),
  tier_rank      int  GENERATED ALWAYS AS (CASE tier WHEN 'public' THEN 0 WHEN 'tender' THEN 1
                                                     WHEN 'confidential' THEN 2 ELSE 3 END) STORED,
  project_ref    text,                       -- PRJ-xxx for project evidence
  title          text NOT NULL,
  issuer         text,
  issued_at      date,
  expires_at     date,
  file_name      text,
  file_hash      text,                       -- sha256 of the document as filed; the file itself stays outside git
  permitted_uses text[] NOT NULL DEFAULT '{}',
  facts          jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{id, kind, value, context, label}]
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','withdrawn')),
  approved_by    text,
  approved_at    timestamptz,
  created_by     text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (expires_at IS NULL OR issued_at IS NULL OR expires_at >= issued_at)
);

CREATE OR REPLACE FUNCTION evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'evidence records are never deleted: withdraw instead';
  END IF;
  IF OLD.status = 'withdrawn' THEN
    RAISE EXCEPTION 'evidence record % is withdrawn and cannot change', OLD.id;
  END IF;
  IF OLD.status = 'approved' THEN
    IF NEW.status <> 'withdrawn'
       OR (NEW.type, NEW.tier, NEW.project_ref, NEW.title, NEW.issuer, NEW.issued_at, NEW.expires_at,
           NEW.file_hash, NEW.permitted_uses, NEW.facts, NEW.approved_by, NEW.approved_at)
          IS DISTINCT FROM
          (OLD.type, OLD.tier, OLD.project_ref, OLD.title, OLD.issuer, OLD.issued_at, OLD.expires_at,
           OLD.file_hash, OLD.permitted_uses, OLD.facts, OLD.approved_by, OLD.approved_at) THEN
      RAISE EXCEPTION 'approved evidence record % is immutable: file a new record and withdraw this one', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER evidence_records_guard BEFORE UPDATE OR DELETE ON evidence_records
  FOR EACH ROW EXECUTE FUNCTION evidence_guard();

-- Every read of confidential or internal evidence is logged (§12.2).
CREATE TABLE evidence_read_log (
  id          bigserial PRIMARY KEY,
  evidence_id text NOT NULL REFERENCES evidence_records(id),
  tier        text NOT NULL,
  read_by     text NOT NULL,
  purpose     text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER evidence_read_log_append_only BEFORE UPDATE OR DELETE ON evidence_read_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Asil's release of a confidential record into one named artifact (gate S-G6).
CREATE TABLE confidential_releases (
  id          bigserial PRIMARY KEY,
  evidence_id text NOT NULL REFERENCES evidence_records(id),
  purpose     text NOT NULL,
  released_by text NOT NULL,
  released_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE TRIGGER confidential_releases_append_only BEFORE UPDATE OR DELETE ON confidential_releases
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ---------------------------------------------------------------- elevators: installed base (Phase 1 registry)

CREATE TABLE installed_units (
  id                    text PRIMARY KEY DEFAULT 'UNIT-' || lpad(nextval('seq_unit')::text, 5, '0'),
  site                  text NOT NULL,
  owner_account_id      text REFERENCES accounts(id),
  model                 text,
  manufacturer          text,
  origin_document       text,             -- certificate of origin reference (SASO lift regulation 12/4)
  handed_over_at        date,
  warranty_ends_at      date,
  maintenance_contract  jsonb,            -- {contract_ref, tier, starts_at, ends_at} or null
  next_inspection_due   date,             -- annual inspection (14/3)
  next_registration_due date,             -- annual registration (12/8)
  crm_quote_id          text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- capacity ledger

CREATE TABLE capacity_roster (
  role            text NOT NULL,
  week_start      date NOT NULL,
  hours_available numeric(6,1) NOT NULL CHECK (hours_available >= 0),
  PRIMARY KEY (role, week_start)
);

CREATE TABLE capacity_bookings (
  id             bigserial PRIMARY KEY,
  opportunity_id text NOT NULL REFERENCES opportunities(id),
  role           text NOT NULL,
  week_start     date NOT NULL,
  hours          numeric(6,1) NOT NULL CHECK (hours > 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- dispatcher, artifacts, approvals

CREATE TABLE work_orders (
  id             text PRIMARY KEY DEFAULT 'WO-' || lpad(nextval('seq_work_order')::text, 6, '0'),
  artifact_type  text NOT NULL,
  status         text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','needs_human','dead')),
  input          jsonb NOT NULL,
  opportunity_id text REFERENCES opportunities(id),
  attempts       int  NOT NULL DEFAULT 0,
  max_attempts   int  NOT NULL DEFAULT 3,
  token_budget   int  NOT NULL CHECK (token_budget > 0),
  tokens_used    int  NOT NULL DEFAULT 0,
  not_before     timestamptz NOT NULL DEFAULT now(),
  last_error     text,
  created_by     text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  finished_at    timestamptz
);
CREATE INDEX work_orders_ready ON work_orders(status, not_before);

CREATE TABLE run_log (
  id              bigserial PRIMARY KEY,
  work_order_id   text NOT NULL REFERENCES work_orders(id),
  step            text NOT NULL,
  agent           text,
  prompt_version  text,
  model_requested text,
  model_served    text,
  effort          text,
  input_tokens    int,
  output_tokens   int,
  cache_read_tokens int,
  latency_ms      int,
  outcome         text NOT NULL CHECK (outcome IN ('ok','failed','refused','retry','blocked')),
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  at              timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER run_log_append_only BEFORE UPDATE OR DELETE ON run_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE artifacts (
  id                text PRIMARY KEY DEFAULT 'ART-' || lpad(nextval('seq_artifact')::text, 6, '0'),
  work_order_id     text REFERENCES work_orders(id),
  artifact_type     text NOT NULL,
  title             text NOT NULL,
  audience          text NOT NULL CHECK (audience IN ('asil','internal','client','public')),
  opportunity_id    text REFERENCES opportunities(id),
  account_id        text REFERENCES accounts(id),
  recipient_contact text REFERENCES contacts(id),
  content           jsonb NOT NULL,      -- the typed payload
  rendered_en       text,
  rendered_ar       text,
  content_hash      text NOT NULL,
  evidence_tier_max text NOT NULL CHECK (evidence_tier_max IN ('public','tender','confidential','internal')),
  gate_report       jsonb NOT NULL,
  provenance        jsonb NOT NULL,      -- prompt versions, models served, rules version
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER artifacts_immutable BEFORE UPDATE OR DELETE ON artifacts
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE approvals (
  artifact_id  text PRIMARY KEY REFERENCES artifacts(id),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by   text,
  decided_at   timestamptz,
  reason       text,
  CHECK ((status = 'pending') = (decided_by IS NULL)),
  CHECK (status <> 'rejected' OR reason IS NOT NULL)
);

CREATE OR REPLACE FUNCTION approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'approvals are never deleted';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'approval for % was already decided (%)', OLD.artifact_id, OLD.status;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approvals_guard BEFORE UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION approval_guard();

-- ---------------------------------------------------------------- audit log (hash-chained, append-only)

CREATE TABLE audit_log (
  id        bigserial PRIMARY KEY,
  at        timestamptz NOT NULL DEFAULT now(),
  actor     text NOT NULL,
  action    text NOT NULL,
  entity    text NOT NULL,
  entity_id text NOT NULL,
  details   jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash text NOT NULL,
  hash      text NOT NULL UNIQUE
);
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ---------------------------------------------------------------- the application role and evidence tiers

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qottuf_app') THEN
    CREATE ROLE qottuf_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO qottuf_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO qottuf_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO qottuf_app;

ALTER TABLE evidence_records ENABLE ROW LEVEL SECURITY;

-- The reader's ceiling comes from a transaction-local setting; when it is missing, only public rows are visible (fail closed).
CREATE POLICY evidence_read_by_tier ON evidence_records FOR SELECT TO qottuf_app
  USING (tier_rank <= coalesce(nullif(current_setting('qottuf.max_tier_rank', true), '')::int, 0));
CREATE POLICY evidence_insert ON evidence_records FOR INSERT TO qottuf_app WITH CHECK (true);
CREATE POLICY evidence_update ON evidence_records FOR UPDATE TO qottuf_app
  USING (tier_rank <= coalesce(nullif(current_setting('qottuf.max_tier_rank', true), '')::int, 0))
  WITH CHECK (true);
