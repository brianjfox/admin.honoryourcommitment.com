-- Self-service password reset: a hashed, time-limited token on the user row.
ALTER TABLE admin.users ADD COLUMN IF NOT EXISTS reset_token_hash text;
ALTER TABLE admin.users ADD COLUMN IF NOT EXISTS reset_expires_at timestamptz;
