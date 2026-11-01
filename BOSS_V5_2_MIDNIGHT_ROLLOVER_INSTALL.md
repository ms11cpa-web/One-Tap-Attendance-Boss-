# Boss v5.2 — Dhaka Midnight Rollover & Super Admin Adjustment

**Applies on top of Boss v5.1 (commit `9237de4`).** This is a limited source overlay, not a replacement application.

## Behavior

- Uses **Asia/Dhaka** and starts a new attendance day at local 00:00.
- An unfinished shift on any previous date is flagged **Missing OUT**, without supplying any fictional checkout time. Existing historical attendance is retained.
- No previous-day record is returned as today's attendance. Employees can punch IN for the new date without waiting for old corrections.
- Past-date attendance corrections remain available after midnight. If a request omits a necessary punch, the approver must obtain the missing time; the system will not manufacture 11:00 / 19:00.
- A **Super Admin-only** `Adjust Employee Attendance` dialog is available under **Requests & Approvals → Attendance Corrections**. It can create or correct records for earlier dates using a mandatory documented reason. Adjustments have unverified GPS flags and an audit log entry in the same D1 atomic batch.
- The existing hourly Cloudflare Worker Cron Trigger also flags unfinished shifts during the 00:00 Asia/Dhaka hour. Requests make the rollover idempotently if cron is late or missed. No new Cron Trigger is required.
- Mobile attendance state and GPS refresh after a day changes.
- **No schema migration** is required. The existing `missing_out` status and audit logs are used; all migrations 0001–0006 remain unchanged.

**Policy assumption:** Boss uses a strict calendar-day boundary. A real overnight work shift crossing midnight will need a formal correction or a future overnight-shift exception setting. Do not deploy this strict policy where overnight shifts are routinely allowed without agreeing a separate rule.

## Install and verify

1. In VS Code, open `C:\Users\User\One-Tap-Attendance-Boss-`.
2. Before copying, run `git status -sb` and `git log -1 --oneline`. Stash/commit unrelated changes; keep a backup branch. Make sure you're on your updated v5.1 repository.
3. Extract `Boss_v5_2_Daily_Attendance_Reset_Admin_Adjustment.zip` directly into the project root with `Expand-Archive -Path "$env:USERPROFILE\Downloads\Boss_v5_2_Daily_Attendance_Reset_Admin_Adjustment.zip" -DestinationPath . -Force`.
4. Run `node --test tests/boss-midnight-rollover-v5_2.test.cjs` then `npm.cmd run build`.
5. Confirm your existing v5.1 regression tests continue to pass. Test once with a nonproduction employee account.
6. No Cloudflare D1 migration. Back up D1 before deploying, as usual.
7. Stage only this overlay's changed files (command below), inspect the diff, then commit and push:

```powershell
git add -- src/server/routes/api-handler.ts src/server/utils/attendance-rollover.ts src/server/utils/manual-attendance.ts src/worker/index.ts src/components/attendance/OneTapAttendance.tsx src/components/modals/ApplyCorrectionModal.tsx src/components/requests/RequestsApprovalsView.tsx src/components/requests/SuperAdminAttendanceAdjust.tsx tests/boss-midnight-rollover-v5_2.test.cjs BOSS_V5_2_MIDNIGHT_ROLLOVER_INSTALL.md
git diff --cached --check
git -c core.pager=cat diff --cached --stat
git commit -m "Fix Boss midnight attendance rollover and admin adjustments"
git push origin main
```

## Live manual acceptance tests

- A test employee with an old IN and no OUT sees a new blank day after midnight and can punch IN on today's date.
- The former record stays in history and is marked Missing OUT with its original IN, no fabricated OUT, and no computed shift duration.
- The employee can submit an attendance correction for that previous date *after* midnight, and it is visible for review.
- Super Admin opens Requests & Approvals -> Attendance Corrections -> Adjust Employee Attendance. The employee list is ordered by ID, prior values appear, and a documented adjustment is saved. The audit log records prior and adjusted values.
- A regular Employee and Team Manager cannot call `PUT /api/admin/attendance/adjust` or `GET /api/admin/attendance/record`.
- Existing approved leave, remote work, GPS geofencing, holidays, ambassador tasks and notifications remain functional.

## Verification limitations

The overlay was checked for TypeScript/TSX syntax and imports, five Node regression tests passed, and the existing 0001–0006 migrations plus rollover behavior passed SQLite tests. Full Vite production build and Cloudflare role-based E2E tests require your project dependencies and authenticated environment, and have **not been verified here**.
