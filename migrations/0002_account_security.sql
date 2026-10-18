-- Boss account-security upgrade. Additive only; preserves all users and attendance.
ALTER TABLE sessions ADD COLUMN last_activity_at INTEGER;
ALTER TABLE sessions ADD COLUMN remember_device INTEGER NOT NULL DEFAULT 0;
UPDATE sessions SET last_activity_at = created_at WHERE last_activity_at IS NULL;
CREATE TABLE IF NOT EXISTS admin_recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_recovery_user ON admin_recovery_codes(user_id, used_at);
CREATE TABLE IF NOT EXISTS admin_recovery_attempts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);
