-- Campaign-update broadcasts: a record of each mass email plus a per-recipient
-- delivery log (for audit, idempotency, and progress reporting). Recipients are
-- resolved at send time from public.signatures where consent_contact = true and
-- the address is confirmed and not on public.email_suppressions.

CREATE TABLE IF NOT EXISTS admin.broadcasts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject        text NOT NULL,
  body           text NOT NULL,
  audience       jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience_label text,
  status         text NOT NULL DEFAULT 'sending', -- sending | sent | failed
  total          int  NOT NULL DEFAULT 0,
  sent_count     int  NOT NULL DEFAULT 0,
  failed_count   int  NOT NULL DEFAULT 0,
  created_by     uuid REFERENCES admin.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);

CREATE TABLE IF NOT EXISTS admin.broadcast_recipients (
  broadcast_id uuid NOT NULL REFERENCES admin.broadcasts(id) ON DELETE CASCADE,
  email        text NOT NULL,
  locale       text,
  status       text NOT NULL DEFAULT 'pending', -- pending | sent | failed
  error        text,
  sent_at      timestamptz,
  PRIMARY KEY (broadcast_id, email)
);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_bid
  ON admin.broadcast_recipients (broadcast_id);
