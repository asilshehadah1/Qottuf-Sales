-- The local board: what it keeps beyond the Phase 1 Ledger. Migrations are append-only: 001 and 002 are never edited.

-- ---------------------------------------------------------------- the elevator CRM, mirrored without personal data
-- The CRM stays the desk's tool and the system of record for every customer (business-development spec §4).
-- The board keeps a copy of each quotation's pipeline facts so the board, the board pack and the agents can see
-- the elevator pipeline when the CRM session has expired, and so its history is kept.
-- Never stored here: customer names, phone numbers, emails, company, notes, configurator choices or client meta.
CREATE TABLE crm_quotes (
  ref        text PRIMARY KEY,
  crm_id     integer NOT NULL,
  status     text NOT NULL,
  source     text NOT NULL,
  data       jsonb NOT NULL,
  created_at timestamptz,
  updated_at timestamptz,
  synced_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_quotes_status ON crm_quotes(status);

CREATE TABLE crm_syncs (
  id       bigserial PRIMARY KEY,
  at       timestamptz NOT NULL DEFAULT now(),
  actor    text NOT NULL,
  quotes   int NOT NULL,
  crm_role text,
  note     text
);

-- ---------------------------------------------------------------- the master company record, before approval
-- entity_versions holds approved versions only (append-only). A proposal and its open questions live here until
-- Asil approves it, which writes a new entity version.
CREATE TABLE entity_proposals (
  id               serial PRIMARY KEY,
  fields           jsonb NOT NULL,
  questions        jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposed_by      text NOT NULL,
  proposed_at      timestamptz NOT NULL DEFAULT now(),
  status           text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','superseded')),
  approved_version int REFERENCES entity_versions(version)
);

-- ---------------------------------------------------------------- lifts known only from a project record
-- Their existence is on record; their dates, maintenance status and the owner's agreement are not, so the registry
-- lists them as "to confirm" rather than inventing gaps such as "maintenance never offered".
ALTER TABLE installed_units
  ADD COLUMN unverified boolean NOT NULL DEFAULT false,
  ADD COLUMN project_ref text;

GRANT SELECT, INSERT, UPDATE ON crm_quotes, crm_syncs, entity_proposals TO qottuf_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO qottuf_app;
