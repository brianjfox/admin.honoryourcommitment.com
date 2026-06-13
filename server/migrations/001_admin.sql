-- Admin-owned objects live in their own `admin` schema so they never collide
-- with the API's public.* tables. Requires the API tables (public.signatures,
-- public.cases, public.claimants) to already exist — deploy/migrate the API first.

CREATE SCHEMA IF NOT EXISTS admin;

-- Staff accounts for the admin site (distinct from campaign "people").
CREATE TABLE IF NOT EXISTS admin.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'VIEWER')),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS admin.tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  color       text,
  description text,
  created_by  uuid REFERENCES admin.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- A tag applied to a person (identity = lowercased email).
CREATE TABLE IF NOT EXISTS admin.taggings (
  tag_id       uuid NOT NULL REFERENCES admin.tags(id) ON DELETE CASCADE,
  person_email text NOT NULL,
  created_by   uuid REFERENCES admin.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, person_email)
);
CREATE INDEX IF NOT EXISTS idx_taggings_person ON admin.taggings (person_email);

CREATE TABLE IF NOT EXISTS admin.groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  created_by  uuid REFERENCES admin.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.group_members (
  group_id     uuid NOT NULL REFERENCES admin.groups(id) ON DELETE CASCADE,
  person_email text NOT NULL,
  created_by   uuid REFERENCES admin.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, person_email)
);
CREATE INDEX IF NOT EXISTS idx_group_members_person ON admin.group_members (person_email);

-- Unified "person" identity: the three campaign tables merged by lowercased
-- email. One row per person, aggregating which forms they used, their
-- country(ies), investment details, confirmation status, and timestamps.
CREATE OR REPLACE VIEW admin.people AS
WITH unified AS (
  SELECT lower(email) AS email,
         nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '') AS name,
         country,
         NULL::int     AS application_year,
         NULL::text    AS investment_type,
         NULL::numeric AS investment_amount,
         NULL::int     AS family_members,
         confirmed_at, created_at, 'signature'::text AS source
    FROM public.signatures
  UNION ALL
  SELECT lower(email),
         nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), ''),
         country, application_year, investment_type, investment_amount,
         family_members, confirmed_at, created_at, 'case'
    FROM public.cases
  UNION ALL
  SELECT lower(email), full_name, country, application_year,
         NULL, NULL, NULL, confirmed_at, created_at, 'claimant'
    FROM public.claimants
)
SELECT
  email,
  (array_remove(array_agg(DISTINCT name), NULL))[1]      AS name,
  (array_agg(DISTINCT country))[1]                       AS country,
  array_agg(DISTINCT country)                            AS countries,
  array_agg(DISTINCT source ORDER BY source)            AS sources,
  min(application_year)                                  AS application_year,
  (array_remove(array_agg(DISTINCT investment_type), NULL))[1] AS investment_type,
  nullif(sum(coalesce(investment_amount, 0)), 0)        AS investment_amount,
  max(family_members)                                   AS family_members,
  bool_or(confirmed_at IS NOT NULL)                     AS confirmed,
  min(created_at)                                        AS first_seen,
  max(created_at)                                        AS last_seen
FROM unified
GROUP BY email;
