-- ====================================================================
-- Boss — Smart Workforce Management
-- Cloudflare D1 Database Initial Schema (SQLite dialect)
-- ====================================================================

-- 1. Organisation and Office Settings
CREATE TABLE IF NOT EXISTS office_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  company_name TEXT NOT NULL DEFAULT 'Boss Technologies Ltd',
  office_name TEXT NOT NULL DEFAULT 'Dhaka Headquarters — Gulshan 2',
  office_latitude REAL NOT NULL DEFAULT 23.7925,
  office_longitude REAL NOT NULL DEFAULT 90.4078,
  permitted_radius_meters INTEGER NOT NULL DEFAULT 300,
  max_gps_accuracy_meters INTEGER NOT NULL DEFAULT 100,
  work_start_time TEXT NOT NULL DEFAULT '11:00',
  work_end_time TEXT NOT NULL DEFAULT '19:00',
  scheduled_duration_minutes INTEGER NOT NULL DEFAULT 480,
  grace_period_minutes INTEGER NOT NULL DEFAULT 15,
  weekly_holidays TEXT NOT NULL DEFAULT '["Friday","Saturday"]',
  timezone TEXT NOT NULL DEFAULT 'Asia/Dhaka',
  overtime_policy TEXT NOT NULL DEFAULT 'approval_required',
  half_day_hours REAL NOT NULL DEFAULT 4.0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- 2. Users / Employees
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  employee_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL CHECK(role IN ('super_admin', 'hr_admin', 'team_manager', 'employee')),
  team TEXT NOT NULL DEFAULT 'General',
  designation TEXT NOT NULL DEFAULT 'Staff Member',
  manager_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  joining_date TEXT NOT NULL, -- YYYY-MM-DD in Asia/Dhaka
  employment_end_date TEXT,   -- YYYY-MM-DD
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_team ON users(team);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 3. Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- 4. Attendance Records
CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL, -- YYYY-MM-DD in Asia/Dhaka
  work_mode TEXT NOT NULL DEFAULT 'office' CHECK(work_mode IN ('office', 'remote')),
  in_time TEXT, -- HH:mm (e.g. 11:02)
  in_timestamp INTEGER,
  in_latitude REAL,
  in_longitude REAL,
  in_distance_meters REAL,
  in_accuracy_meters REAL,
  in_verified INTEGER DEFAULT 0,
  out_time TEXT, -- HH:mm (e.g. 19:15)
  out_timestamp INTEGER,
  out_latitude REAL,
  out_longitude REAL,
  out_distance_meters REAL,
  out_accuracy_meters REAL,
  out_verified INTEGER DEFAULT 0,
  total_duration_minutes INTEGER DEFAULT 0,
  late_minutes INTEGER DEFAULT 0,
  extra_minutes INTEGER DEFAULT 0,
  shortfall_minutes INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'present' CHECK(status IN ('present', 'late', 'half_day', 'missing_out')),
  schedule_snapshot TEXT, -- JSON snapshot of start/end/grace
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE(user_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance_records(user_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance_records(status);

-- 5. Remote Work Requests
CREATE TABLE IF NOT EXISTS remote_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_date TEXT NOT NULL, -- YYYY-MM-DD
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approved_by TEXT,
  action_reason TEXT,
  action_timestamp INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_remote_user_date ON remote_requests(user_id, request_date);
CREATE INDEX IF NOT EXISTS idx_remote_status ON remote_requests(status);

-- 6. Leave Categories
CREATE TABLE IF NOT EXISTS leave_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_days_per_year REAL NOT NULL,
  paid INTEGER NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT '#0d9488'
);

-- 7. Leave Balances
CREATE TABLE IF NOT EXISTS leave_balances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  allocated_days REAL NOT NULL,
  used_days REAL NOT NULL DEFAULT 0,
  pending_days REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES leave_categories(id) ON DELETE CASCADE,
  UNIQUE(user_id, category_id, year)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_user ON leave_balances(user_id, year);

-- 8. Leave Requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  start_date TEXT NOT NULL, -- YYYY-MM-DD
  end_date TEXT NOT NULL,   -- YYYY-MM-DD
  is_half_day INTEGER NOT NULL DEFAULT 0,
  half_day_type TEXT CHECK(half_day_type IN ('first_half', 'second_half')),
  days_count REAL NOT NULL DEFAULT 1.0,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approved_by TEXT,
  action_reason TEXT,
  action_timestamp INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES leave_categories(id)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON leave_requests(user_id, start_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);

-- 9. Holidays
CREATE TABLE IF NOT EXISTS holidays (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD
  is_full_day INTEGER NOT NULL DEFAULT 1,
  applicable_office TEXT NOT NULL DEFAULT 'all',
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);

-- 10. Attendance Corrections
CREATE TABLE IF NOT EXISTS attendance_corrections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  correction_type TEXT NOT NULL CHECK(correction_type IN ('in_time', 'out_time', 'both')),
  original_in_time TEXT,
  original_out_time TEXT,
  requested_in_time TEXT,
  requested_out_time TEXT,
  explanation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  approved_by TEXT,
  action_timestamp INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_corrections_user ON attendance_corrections(user_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status ON attendance_corrections(status);

-- 11. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
