-- Boss CRM / Referral Tracker v6. Additive, no existing employee/attendance tables altered.
-- Data here is personal information. Access must always be scoped on the server.
CREATE TABLE IF NOT EXISTS crm_commission_agents (
 id TEXT PRIMARY KEY, agent_code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, phone TEXT, email TEXT,
 password_hash TEXT NOT NULL, must_change_password INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS crm_commission_sessions (
 id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES crm_commission_agents(id),
 expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_session_expires ON crm_commission_sessions(expires_at);
CREATE TABLE IF NOT EXISTS crm_commission_attempts (
 agent_code TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0,
 locked_until INTEGER NOT NULL DEFAULT 0, last_attempt INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS crm_delegations (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 can_manage_leads INTEGER NOT NULL DEFAULT 0,
 can_manage_agents INTEGER NOT NULL DEFAULT 0,
 updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS crm_leads (
 id TEXT PRIMARY KEY,
 full_name TEXT NOT NULL, phone TEXT NOT NULL, phone_normalized TEXT NOT NULL UNIQUE, email TEXT, address TEXT,
 preferred_countries TEXT NOT NULL DEFAULT '',
 referrer_type TEXT NOT NULL CHECK(referrer_type IN ('office','ambassador','commission','third_party')),
 referrer_id TEXT, referrer_display TEXT NOT NULL,
 external_reference_note TEXT NOT NULL DEFAULT '',
 created_by_type TEXT NOT NULL CHECK(created_by_type IN ('office','ambassador','commission')),
 created_by_id TEXT NOT NULL,
 consent_confirmed_at INTEGER NOT NULL,
 assigned_to_user_id TEXT REFERENCES users(id),
 referral_status TEXT NOT NULL DEFAULT 'pending' CHECK(referral_status IN ('pending','approved','rejected')),
 referral_reviewed_by TEXT, referral_reviewed_at INTEGER,
 stage TEXT NOT NULL DEFAULT 'New',
 client_status TEXT NOT NULL DEFAULT 'lead' CHECK(client_status IN ('lead','client','archived')),
 notes TEXT NOT NULL DEFAULT '',
 last_contacted_at INTEGER, next_followup_at TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_leads_referrer ON crm_leads(referrer_type,referrer_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_owner ON crm_leads(assigned_to_user_id,updated_at);
CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON crm_leads(client_status,stage);
CREATE INDEX IF NOT EXISTS idx_crm_leads_followup ON crm_leads(next_followup_at);
CREATE TABLE IF NOT EXISTS crm_lead_followups (
 id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES crm_leads(id),
 channel TEXT NOT NULL CHECK(channel IN ('call','whatsapp','email','meeting','other')),
 notes TEXT NOT NULL, contacted_at INTEGER NOT NULL, next_followup_at TEXT,
 created_by_type TEXT NOT NULL, created_by_id TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_followup_lead ON crm_lead_followups(lead_id,contacted_at);
CREATE TABLE IF NOT EXISTS crm_lead_history (
 id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES crm_leads(id),
 action TEXT NOT NULL, old_value TEXT, new_value TEXT, note TEXT,
 actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_history_lead ON crm_lead_history(lead_id,created_at);
CREATE TABLE IF NOT EXISTS crm_agent_tasks (
 id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES crm_commission_agents(id),
 title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', due_date TEXT,
 status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','in_progress','submitted','approved','revision_requested','cancelled')),
 proof_url TEXT, agent_note TEXT,
 reviewer_note TEXT, assigned_by TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_agent ON crm_agent_tasks(agent_id,status);

CREATE TABLE IF NOT EXISTS crm_agent_task_history (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES crm_agent_tasks(id),
 from_status TEXT, to_status TEXT NOT NULL, details TEXT,
 actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_agent_task_history ON crm_agent_task_history(task_id,created_at);
