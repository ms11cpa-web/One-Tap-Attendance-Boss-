-- Boss safe login throttling. Adds one isolated table; no attendance, leave or ambassador data changes.
CREATE TABLE IF NOT EXISTS office_login_attempts (
  employee_id TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  last_attempt INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_office_login_attempts_last ON office_login_attempts(last_attempt);

-- Non-monetary recognition records. Revocation retains history.
CREATE TABLE IF NOT EXISTS amb_recognition_awards (
 id TEXT PRIMARY KEY,
 ambassador_id TEXT NOT NULL REFERENCES amb_people(id),
 title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 award_month TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
 awarded_by TEXT NOT NULL REFERENCES users(id),
 awarded_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_amb_awards_member ON amb_recognition_awards (ambassador_id,award_month);
