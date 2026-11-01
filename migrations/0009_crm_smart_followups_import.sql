-- Boss v7.1: additive, audited imports and follow-up contact outcomes. No records removed.
ALTER TABLE crm_lead_followups ADD COLUMN contact_outcome TEXT NOT NULL DEFAULT 'connected'
  CHECK(contact_outcome IN ('connected','no_answer','rescheduled'));
ALTER TABLE crm_leads ADD COLUMN import_batch_id TEXT;
CREATE TABLE IF NOT EXISTS crm_import_batches (
 id TEXT PRIMARY KEY,
 imported_by TEXT NOT NULL,
 source_filename TEXT NOT NULL,
 row_count INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_import_batch ON crm_leads(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_crm_followup_queue ON crm_leads(next_followup_at,referral_status);
-- Existing approved, consented, active cases without a date join the queue using
-- their last verified contact (3 days), or initial creation (next day). Preserve all manual dates.
UPDATE crm_leads
SET next_followup_at = CASE
  WHEN last_contacted_at IS NOT NULL THEN date(last_contacted_at / 1000,'unixepoch','+6 hours','+3 days')
  ELSE date(created_at / 1000,'unixepoch','+6 hours','+1 day') END
WHERE next_followup_at IS NULL AND consent_confirmed_at>0 AND referral_status='approved'
  AND EXISTS (SELECT 1 FROM crm_lead_profiles p WHERE p.lead_id=crm_leads.id AND p.relationship_status IN ('lead','active_client'));
