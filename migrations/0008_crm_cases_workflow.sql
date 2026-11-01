-- Boss v7: additive normalized student and application records. No legacy CRM/attendance records deleted.
CREATE TABLE IF NOT EXISTS crm_lead_profiles (
 lead_id TEXT PRIMARY KEY REFERENCES crm_leads(id),
 relationship_status TEXT NOT NULL DEFAULT 'lead' CHECK(relationship_status IN ('lead','active_client','on_hold','completed','lost','closed')),
 closed_reason TEXT NOT NULL DEFAULT '', closed_at INTEGER, converted_at INTEGER,
 education_level TEXT NOT NULL DEFAULT '', study_subject TEXT NOT NULL DEFAULT '',
 target_intake TEXT NOT NULL DEFAULT '', budget_band TEXT NOT NULL DEFAULT '',
 preferred_contact TEXT NOT NULL DEFAULT '', last_reviewed_by TEXT, updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO crm_lead_profiles(lead_id,relationship_status,updated_at,converted_at)
SELECT id,CASE client_status WHEN 'client' THEN 'active_client' WHEN 'archived' THEN 'closed' ELSE 'lead' END,
updated_at,CASE WHEN client_status='client' THEN updated_at ELSE NULL END FROM crm_leads;
CREATE INDEX IF NOT EXISTS idx_crm_profile_lifecycle ON crm_lead_profiles(relationship_status);
CREATE TABLE IF NOT EXISTS crm_applications (
 id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES crm_leads(id),
 destination_country TEXT NOT NULL, institution TEXT NOT NULL DEFAULT '',
 programme TEXT NOT NULL DEFAULT '', intake TEXT NOT NULL DEFAULT '',
 application_status TEXT NOT NULL DEFAULT 'researching' CHECK(application_status IN
 ('researching','preparing','submitted','under_review','conditional_offer','unconditional_offer','accepted','rejected','withdrawn')),
 visa_status TEXT NOT NULL DEFAULT 'not_started' CHECK(visa_status IN
 ('not_started','documents_preparing','lodged','biometrics_pending','appointment_waiting','decision_pending','approved','refused','withdrawn','not_applicable')),
 outcome_note TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_applications_lead ON crm_applications(lead_id,updated_at);
CREATE TABLE IF NOT EXISTS crm_application_history (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES crm_applications(id),
 action TEXT NOT NULL, previous_status TEXT, next_status TEXT, note TEXT NOT NULL DEFAULT '',
 actor_id TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_app_history ON crm_application_history(application_id,created_at);
