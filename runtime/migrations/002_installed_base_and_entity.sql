-- Phase 1, second migration: the installed-base registry (roster #27) and the entity and listings record (#31).
-- Migrations are append-only: 001 is never edited.

-- ---------------------------------------------------------------- installed base (SC-06, workflow W6)

ALTER TABLE installed_units
  ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','decommissioned')),
  ADD COLUMN source text NOT NULL DEFAULT 'installed' CHECK (source IN ('installed','maintained','takeover')),
  -- The owner's agreement to be registered and contacted (SC-06: "with the clients' agreement").
  ADD COLUMN owner_consent_at date,
  ADD COLUMN maintenance_offer text NOT NULL DEFAULT 'not_offered'
    CHECK (maintenance_offer IN ('not_offered','offered','accepted','declined')),
  ADD COLUMN installed_from_opportunity text REFERENCES opportunities(id),
  ADD COLUMN modernisation_candidate boolean NOT NULL DEFAULT false,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- History of every change to a unit (offers, contracts, inspections, registrations).
CREATE TABLE installed_unit_events (
  id         bigserial PRIMARY KEY,
  unit_id    text NOT NULL REFERENCES installed_units(id),
  at         timestamptz NOT NULL DEFAULT now(),
  actor      text NOT NULL,
  event      text NOT NULL,
  details    jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TRIGGER installed_unit_events_append_only BEFORE UPDATE OR DELETE ON installed_unit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- A renewal or inspection opportunity points at its unit; one open opportunity per unit at a time.
ALTER TABLE opportunities ADD COLUMN installed_unit_id text REFERENCES installed_units(id);
CREATE UNIQUE INDEX opportunities_one_open_per_unit ON opportunities(installed_unit_id)
  WHERE installed_unit_id IS NOT NULL AND stage NOT IN ('won','lost','no_bid','withdrawn','cancelled');

-- ---------------------------------------------------------------- entity and listings (C-06 + C-07)

-- The master company record: one approved version at a time, never edited, each field traced to its source.
CREATE TABLE entity_versions (
  version     serial PRIMARY KEY,
  fields      jsonb NOT NULL,
  sources     jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  note        text
);
CREATE TRIGGER entity_versions_append_only BEFORE UPDATE OR DELETE ON entity_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE SEQUENCE seq_listing;
CREATE TABLE listings (
  id         text PRIMARY KEY DEFAULT 'LST-' || lpad(nextval('seq_listing')::text, 3, '0'),
  platform   text NOT NULL CHECK (platform IN ('website','google_business_profile','linkedin','company_profile',
                                               'etimad','chamber','maroof','national_address','other')),
  url        text,
  owner      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, url)
);

-- What a person or a check saw on a listing, and when. Append-only, so drift over time is visible.
CREATE TABLE listing_observations (
  id          bigserial PRIMARY KEY,
  listing_id  text NOT NULL REFERENCES listings(id),
  observed    jsonb NOT NULL,
  observed_by text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER listing_observations_append_only BEFORE UPDATE OR DELETE ON listing_observations
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

GRANT SELECT, INSERT, UPDATE ON installed_unit_events, entity_versions, listings, listing_observations TO qottuf_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO qottuf_app;
