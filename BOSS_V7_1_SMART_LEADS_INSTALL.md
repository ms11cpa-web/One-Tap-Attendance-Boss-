# Boss v7.1 — AGN contacts, historical leads import, smart 3-day follow-ups

**Source baseline:** v7 GitHub source provided in this project, with the v7 VM test correction. **Type:** additive 10-file overlay. Does NOT include the entire original repository. **No existing lead, client, referrer or attendance records are deleted.**

## What is actually included

1. **Official AGN contacts, linked from CRM and the office desktop sidebar**
   - Website: https://www.avarianglobal.com
   - Facebook: https://www.facebook.com/avarianglobal
   - WhatsApp: +880 1408-425035 → https://wa.me/8801408425035
   - Email: avarianglobalnetwork@gmail.com
   - Student profile has a click-to-chat link using the student phone. It opens WhatsApp; Boss does not send a message without an operator.
2. **Import Excel `.xlsx` and CSV `.csv` in Leads & Clients** (Super Admin or HR Admin only)
   - First worksheet, 2 MB and 2,000 rows per file. Review 6 mapped columns: student name, phone, email, countries, source/referrer, notes.
   - Confirm/adjust column mappings and see a preview. Imported entries do NOT overwrite existing leads and do NOT auto-approve referrals.
   - Server checks all rows, records import batch ID and audit, performs atomic chunks of at most 50, and flags duplicate normalized phone numbers. Sheets with different naming conventions can be mapped manually.
   - If consent to contact **each** imported student is not verified, leave checkbox OFF. These students are saved but EXCLUDED from automatic outreach until an authorized case manager documents evidence of contact permission. If your old sheet was not collected with verified consent, review legal basis before importing.
   - The existing one-phone-per-lead uniqueness constraint still prevents two students who share a guardian's phone. Such rows are held for manual review, not merged automatically.
   - Phone numbers must be stored as **text** in Excel to preserve leading zeros. Files with 2,000+ rows should be split.
3. **Rolling contacts, Dhaka timezone**
   - New approved referrals get first follow-up in 1 calendar day; existing approved/consented leads with no schedule are backfilled once from their last contact + 3 days or original creation + 1 day.
   - `connected`: schedule 3 days after actual contact; `no_answer`: retry after 1 day without changing `last_contacted_at`; `rescheduled`: set deliberate date with notes.
   - Follow-up Queue includes only DUE TODAY and OVERDUE approved/consented active leads/clients; Upcoming contains future dates.
   - A meaningful contact creates history and updates the queue immediately. Profile changes do not automatically reset the date. Manual due-date changes require a reason recorded in audit history.
   - On hold, completed, lost and closed cases are excluded from normal recurring reminders. No duplicate task rows are generated.
4. **No automatic outbound WhatsApp, Facebook, email or push** is added by this release. The computed queue works without a scheduled Cloudflare job; external messaging and escalation require additional review.

## Before installing

Run commands in **PowerShell** in `C:\Users\User\One-Tap-Attendance-Boss-`. Make sure your latest **v7** is already in place. Check for uncommitted changes and make a backup. Never use `git add -A`.

```powershell
cd "C:\Users\User\One-Tap-Attendance-Boss-"
git status -sb
git branch backup-before-boss-v7-1
Expand-Archive -Path "$env:USERPROFILE\Downloads\Boss_v7_1_AGN_Contacts_Import_Three_Day_Followups_SAFE_UPDATE.zip" -DestinationPath . -Force
npm.cmd run build
node --test tests/boss-v6-crm-api.test.cjs tests/boss-v6-crm.test.cjs tests/boss-v6_1-campaign-deadlines.test.cjs tests/boss-v5_1-runtime.test.cjs
node --test tests/boss-security-crud-v5.test.mjs tests/boss-midnight-rollover-v5_2.test.cjs tests/boss-theme.test.mjs tests/agn_notifications_crypto.test.mjs
node --experimental-strip-types --test tests/ambassador-performance.test.ts
```

Do not proceed to the database step if any test or build fails. The external source environment could parse files and run in-memory SQL/tests, but did NOT run `npm run build` with the actual Windows-installed dependencies.

## Production D1 backup, then new migration

```powershell
npx.cmd --yes wrangler@4.151.1 d1 export DB --remote --output "$env:USERPROFILE\Downloads\boss-before-v7-1.sql"
Test-Path "$env:USERPROFILE\Downloads\boss-before-v7-1.sql"
npx.cmd --yes wrangler@4.151.1 d1 migrations apply DB --remote
```

The expected ONLY new migration is `0009_crm_smart_followups_import.sql`. If `0008` or older migrations appear pending, STOP to verify your D1 migration history. Backup contains student data: do not commit/share it.

Verify schema:

```powershell
npx.cmd --yes wrangler@4.151.1 d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name='crm_import_batches';"
npx.cmd --yes wrangler@4.151.1 d1 execute DB --remote --command "PRAGMA table_info(crm_lead_followups);"
```

Expected table `crm_import_batches` and `contact_outcome` column.

## Stage ONLY these files

```powershell
git add -- migrations/0009_crm_smart_followups_import.sql src/config/agn-contact.ts src/components/crm/CrmImportPanel.tsx src/components/crm/CrmWorkspace.tsx src/components/layout/Sidebar.tsx src/server/crm/router.ts src/server/db/node-d1.ts tests/boss-v6-crm-api.test.cjs BOSS_V7_1_SMART_LEADS_INSTALL.md BOSS_V7_1_FEATURE_MATCH_AUDIT.md
git diff --cached --check
git -c core.pager=cat diff --cached --stat
git commit -m "Add AGN contacts historical lead import and rolling 3-day followups v7.1"
git push origin main
```

After push, verify Cloudflare deployment success and browser hard refresh (`Ctrl+Shift+R`) before testing real account permissions.

## Live acceptance checks (use a fake student, never a real unconsenting phone)

- Desktop sidebar and CRM in dark/light mode show correct website/Facebook/WhatsApp/email URLs.
- Super Admin can upload a sample Excel/CSV, map headers, preview and import; ordinary employee cannot import via API/UI.
- Duplicate phone cannot overwrite the original lead. Imported records with unknown consent have no follow-up due.
- After consent and referral approval, new lead enters Upcoming. Force a test record due today and confirm it appears in Follow-up Queue.
- Record a connected contact, confirm next due date is three Bangladesh calendar days later and record disappears from Due until the next due date. Record no answer, confirm next attempt in one day and last successful contact unchanged.
- Put a client On Hold or Closed, confirm the normal Due queue excludes it.
- Inspect historical records, attendance, commission portal, Campus Hub and export permissions after deployment.

## Security and scalability caveats

- `xlsx@0.18.5` is already an older package with published advisories. Import only trusted spreadsheets until a reviewed replacement is deployed. CSV avoids Excel-format parser complexity; the current app also uses `xlsx` for export.
- Existing `phone_normalized UNIQUE` can block siblings on the same guardian phone. This requires a separate identity migration and a manual conflict process.
- Import batches are atomic per up-to-50-row chunk, not across the whole 2,000-row file. Network failure may leave earlier chunks committed; retry skips existing normalized phone numbers.
- Referrer names from a historical sheet remain **unverified free text** under `third_party` until staff reconcile attribution; no forged internal referrer ID is created.
- CRM push notifications and scheduled escalation are NOT present in this patch; the due/overdue queue is computed from existing D1 dates. That is deliberate to avoid accidental unsolicited outreach.
