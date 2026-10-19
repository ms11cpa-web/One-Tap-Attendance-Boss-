-- AGN Campus Ambassador Hub v1. Separate identity, sessions and work records.
-- No ALTER/DELETE of users, sessions, attendance_records, leaves, holidays, or settings.
CREATE TABLE IF NOT EXISTS amb_module_settings (
  id TEXT PRIMARY KEY CHECK(id = 'default'),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1))
);
INSERT OR IGNORE INTO amb_module_settings (id, enabled) VALUES ('default', 0);

CREATE TABLE IF NOT EXISTS amb_campuses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_amb_campus_name ON amb_campuses (name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS amb_people (
  id TEXT PRIMARY KEY,
  ambassador_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  campus_id TEXT NOT NULL REFERENCES amb_campuses(id),
  is_lead INTEGER NOT NULL DEFAULT 0 CHECK(is_lead IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK(must_change_password IN (0, 1)),
  joined_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_amb_people_campus ON amb_people(campus_id, status);

CREATE TABLE IF NOT EXISTS amb_sessions (
  id TEXT PRIMARY KEY,
  ambassador_id TEXT NOT NULL REFERENCES amb_people(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_amb_session_expires ON amb_sessions(expires_at);

CREATE TABLE IF NOT EXISTS amb_login_attempts (
  code TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  last_attempt INTEGER NOT NULL DEFAULT 0
);

-- Programme Managers are existing Boss staff explicitly assigned by a Super Admin.
-- No existing office user's role is changed.
CREATE TABLE IF NOT EXISTS amb_program_managers (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  assigned_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS amb_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK(content_type IN ('share', 'post', 'video', 'outreach', 'event', 'other')),
  target_scope TEXT NOT NULL CHECK(target_scope IN ('all', 'campus', 'individual')),
  target_id TEXT,
  points INTEGER NOT NULL CHECK(points BETWEEN 0 AND 100),
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS amb_assignments (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES amb_campaigns(id),
  ambassador_id TEXT NOT NULL REFERENCES amb_people(id),
  assigned_at INTEGER NOT NULL,
  UNIQUE(campaign_id, ambassador_id)
);
CREATE INDEX IF NOT EXISTS idx_amb_assignments_owner ON amb_assignments(ambassador_id);

CREATE TABLE IF NOT EXISTS amb_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL UNIQUE REFERENCES amb_assignments(id),
  proof_url TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted', 'revision_requested', 'approved', 'rejected')),
  submitted_at INTEGER NOT NULL,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at INTEGER,
  review_note TEXT NOT NULL DEFAULT '',
  quality_score INTEGER CHECK(quality_score BETWEEN 1 AND 5),
  revisions INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_amb_submissions_status ON amb_submissions(status);

CREATE TABLE IF NOT EXISTS amb_review_events (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES amb_submissions(id),
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  recorded_at INTEGER NOT NULL
);
