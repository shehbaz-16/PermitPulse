-- PermitPulse Ontario — PostgreSQL schema (runs on embedded PGlite or any Postgres 14+)
-- Multi-city by design: every tenant-facing table hangs off municipalities.id (city_slug).
-- Adding Vaughan / Richmond Hill / etc. = INSERT a municipality row + register an adapter. No migrations.

CREATE TABLE IF NOT EXISTS municipalities (
  id            SERIAL PRIMARY KEY,
  city_slug     TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  province      TEXT NOT NULL DEFAULT 'ON',
  status        TEXT NOT NULL DEFAULT 'coming_soon' CHECK (status IN ('active','coming_soon')),
  sort_order    INT  NOT NULL DEFAULT 0,
  license_name  TEXT,
  attribution   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS neighbourhoods (
  id              SERIAL PRIMARY KEY,
  municipality_id INT NOT NULL REFERENCES municipalities(id),
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  adjacent        JSONB NOT NULL DEFAULT '[]',
  UNIQUE (municipality_id, slug)
);

CREATE TABLE IF NOT EXISTS data_sources (
  id              SERIAL PRIMARY KEY,
  municipality_id INT NOT NULL REFERENCES municipalities(id),
  source_key      TEXT NOT NULL,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL,
  description     TEXT,
  last_sync_at    TIMESTAMPTZ,
  last_mode       TEXT,
  last_status     TEXT,
  last_message    TEXT,
  record_count    INT NOT NULL DEFAULT 0,
  UNIQUE (municipality_id, source_key)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id              SERIAL PRIMARY KEY,
  municipality_id INT NOT NULL REFERENCES municipalities(id),
  source_key      TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  mode            TEXT,
  status          TEXT,
  fetched         INT NOT NULL DEFAULT 0,
  upserted        INT NOT NULL DEFAULT 0,
  message         TEXT
);

CREATE TABLE IF NOT EXISTS permits (
  id              SERIAL PRIMARY KEY,
  municipality_id INT NOT NULL REFERENCES municipalities(id),
  source_key      TEXT NOT NULL,
  source_id       TEXT NOT NULL,
  permit_number   TEXT NOT NULL,
  permit_code     TEXT NOT NULL,
  permit_type     TEXT NOT NULL,
  category        TEXT NOT NULL,
  status          TEXT NOT NULL,
  filed_at        TIMESTAMPTZ NOT NULL,
  issued_at       TIMESTAMPTZ,
  status_changed_at TIMESTAMPTZ NOT NULL,
  street_number   TEXT,
  street_name     TEXT NOT NULL,
  unit            TEXT,
  address         TEXT NOT NULL,
  neighbourhood   TEXT,
  postal_fsa      TEXT,
  est_value       INT,
  scope           TEXT NOT NULL,
  trades          JSONB NOT NULL DEFAULT '[]',
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  is_demo         BOOLEAN NOT NULL DEFAULT true,   -- true = fixture/fictional record, false = real public record
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (municipality_id, source_key, source_id)
);
ALTER TABLE permits ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS permits_city_filed_idx ON permits (municipality_id, filed_at DESC);
CREATE INDEX IF NOT EXISTS permits_city_code_idx  ON permits (municipality_id, permit_code);
CREATE INDEX IF NOT EXISTS permits_city_hood_idx  ON permits (municipality_id, neighbourhood);

CREATE TABLE IF NOT EXISTS contractors (
  id            SERIAL PRIMARY KEY,
  company_name  TEXT NOT NULL,
  trade         TEXT NOT NULL,
  contact_name  TEXT,
  email         TEXT,
  phone         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE contractors ADD COLUMN IF NOT EXISTS facebook_page TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS instagram_handle TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS nextdoor_name TEXT;
ALTER TABLE permits ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}';
ALTER TABLE permits ADD COLUMN IF NOT EXISTS enrichment JSONB;

CREATE TABLE IF NOT EXISTS lead_states (
  contractor_id INT NOT NULL REFERENCES contractors(id),
  permit_id     INT NOT NULL REFERENCES permits(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','quoted','won_archived')),
  bookmarked    BOOLEAN NOT NULL DEFAULT false,
  notes         TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contractor_id, permit_id)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id               SERIAL PRIMARY KEY,
  municipality_id  INT NOT NULL REFERENCES municipalities(id),
  contractor_id    INT NOT NULL REFERENCES contractors(id),
  permit_id        INT NOT NULL REFERENCES permits(id),
  trade            TEXT NOT NULL,
  company_name     TEXT NOT NULL,
  format           TEXT NOT NULL CHECK (format IN ('postcard','letter')),
  include_property BOOLEAN NOT NULL DEFAULT true,
  neighbour_homes  INT NOT NULL DEFAULT 0,
  mail_pieces      INT NOT NULL,
  mail_cents       INT NOT NULL,
  social_enabled   BOOLEAN NOT NULL DEFAULT false,
  social_budget_cents INT NOT NULL DEFAULT 0,
  social_reach     INT NOT NULL DEFAULT 0,
  subtotal_cents   INT NOT NULL,
  tax_cents        INT NOT NULL,
  total_cents      INT NOT NULL,
  coupon_code      TEXT,
  mail_status      TEXT NOT NULL DEFAULT 'Mail Queued for Print',
  social_status    TEXT,
  simulated        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS social_platforms JSONB NOT NULL DEFAULT '[]';
-- payment_status: 'demo' (no billing configured), 'unpaid' (Stripe Checkout created), 'paid'
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS doorknock_doors INT NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS doorknock_cents INT NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS doorknock_status TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS plan_status TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS trades JSONB NOT NULL DEFAULT '[]';   -- trades the contractor follows
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS extra_trades INT NOT NULL DEFAULT 0;  -- paid trade add-ons beyond the plan
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS posting_as JSONB NOT NULL DEFAULT '{}';

-- Managed ("done for you") social campaigns: the contractor requests, the PermitPulse team builds it by hand
-- in the contractor's own Meta / Nextdoor ad accounts, gets approval, and sets it live.
CREATE TABLE IF NOT EXISTS social_requests (
  id               SERIAL PRIMARY KEY,
  campaign_id      INT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  municipality_id  INT NOT NULL REFERENCES municipalities(id),
  contractor_id    INT NOT NULL REFERENCES contractors(id),
  permit_id        INT NOT NULL REFERENCES permits(id),
  platforms        JSONB NOT NULL DEFAULT '[]',
  ad_budget_cents  INT NOT NULL,
  duration_days    INT NOT NULL DEFAULT 7,
  management_cents INT NOT NULL,
  target_area      TEXT,
  ad_copy          TEXT,
  notes            TEXT NOT NULL DEFAULT '',
  account_status   TEXT NOT NULL DEFAULT 'unsure',
  status           TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','awaiting_approval','live','done','cancelled')),
  manager_notes    TEXT NOT NULL DEFAULT '',
  notified         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE social_requests ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'social'; -- 'social' | 'doorknock'
ALTER TABLE social_requests ADD COLUMN IF NOT EXISTS doors INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id              SERIAL PRIMARY KEY,
  contractor_id   INT NOT NULL REFERENCES contractors(id),
  municipality_id INT NOT NULL REFERENCES municipalities(id),
  email_enabled   BOOLEAN NOT NULL DEFAULT false,
  email           TEXT,
  sms_enabled     BOOLEAN NOT NULL DEFAULT false,
  sms_phone       TEXT,
  wa_enabled      BOOLEAN NOT NULL DEFAULT false,
  wa_phone        TEXT,
  trades          JSONB NOT NULL DEFAULT '[]',
  neighbourhoods  JSONB NOT NULL DEFAULT '[]',
  frequency       TEXT NOT NULL DEFAULT 'daily_7am' CHECK (frequency IN ('daily_7am','instant')),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contractor_id, municipality_id)
);

CREATE TABLE IF NOT EXISTS alert_log (
  id            SERIAL PRIMARY KEY,
  contractor_id INT NOT NULL REFERENCES contractors(id),
  channel       TEXT NOT NULL,
  recipient     TEXT,
  subject       TEXT,
  body          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'simulated_sent',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS territory_slots (
  municipality_id INT NOT NULL REFERENCES municipalities(id),
  trade           TEXT NOT NULL,
  total_slots     INT NOT NULL DEFAULT 2,
  claimed         INT NOT NULL DEFAULT 0,
  PRIMARY KEY (municipality_id, trade)
);

CREATE TABLE IF NOT EXISTS territory_requests (
  id              SERIAL PRIMARY KEY,
  municipality_id INT NOT NULL REFERENCES municipalities(id),
  kind            TEXT NOT NULL CHECK (kind IN ('waitlist','plan')),
  plan            TEXT,
  trade           TEXT,
  neighbourhoods  JSONB NOT NULL DEFAULT '[]',
  company_name    TEXT,
  email           TEXT,
  outcome         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
