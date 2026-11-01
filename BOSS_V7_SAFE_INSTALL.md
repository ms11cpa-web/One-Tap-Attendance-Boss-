# Boss v7 Safe installation — 1 Nov 2026

**Use this overlay with your existing GitHub-connected project** `C:\Users\User\One-Tap-Attendance-Boss-`, based on the latest ZIP supplied in this chat. It is **not** a replacement repository and contains no `.git` folder. It includes only changed code, tests, database migration and documentation. It is **not production-verified** until the checks below pass.

## Before copying

1. Open the correct VS Code folder and confirm `git status -sb` and `git log -1 --oneline`.
2. If existing modified files are present, back them up or commit them separately before replacing them. Do not copy into a Downloads extract. Confirm no sensitive files are staged.
3. Create a Git safety branch: `git branch backup-before-boss-v7` (only if that name does not already exist).
4. Extract the ZIP into the **root** of the real project, overwriting only listed files.

## Build and test — STOP if any step fails

```powershell
cd "C:\Users\User\One-Tap-Attendance-Boss-"
npm.cmd run build
node --test tests/boss-v6-crm-api.test.cjs tests/boss-v6-crm.test.cjs tests/boss-v6_1-campaign-deadlines.test.cjs tests/boss-v5_1-runtime.test.cjs
node --test tests/boss-security-crud-v5.test.mjs tests/boss-theme.test.mjs tests/agn_notifications_crypto.test.mjs tests/boss-midnight-rollover-v5_2.test.cjs
node --experimental-strip-types --test tests/ambassador-performance.test.ts
```

Also run `npm.cmd run lint`. If it finds existing problems, identify which are old and which are introduced before deploying. Avoid using `--force` to bypass dependency conflicts. Security-review the `xlsx` library before accepting uploads from unknown files.

## Back up and migrate Cloudflare D1 — BEFORE publishing code

1. Confirm the target Worker is `one-tap-attendance-boss`, binding is `DB`, and the production database is `boss-production-db`.
2. Export a **private** D1 backup. Do not publish or upload it to public GitHub:

```powershell
npx.cmd --yes wrangler@4.151.1 d1 export DB --remote --output "$env:USERPROFILE\Downloads\boss-before-v7.sql"
```

3. Only if the backup was successful, apply the pending migration:

```powershell
npx.cmd --yes wrangler@4.151.1 d1 migrations apply DB --remote
```

Expected new migration: `0008_crm_cases_workflow.sql`. If `0007` is still pending, **review why** and confirm the source/database are in sync before proceeding. No database migration should be re-run manually after Wrangler records it.

4. Read-only verification:

```powershell
npx.cmd --yes wrangler@4.151.1 d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('crm_lead_profiles','crm_applications','crm_application_history');"
```

These three names should appear.

## Stage and push only relevant files

```powershell
git add -- migrations/0008_crm_cases_workflow.sql src/App.tsx src/components/crm/CrmWorkspace.tsx src/components/crm/CrmCaseManager.tsx src/components/crm/CrmTimeline.tsx src/components/layout/Sidebar.tsx src/components/layout/MobileNav.tsx src/components/employees/EmployeesView.tsx src/server/crm/router.ts src/server/db/node-d1.ts src/theme/boss-theme.css tests/boss-v6-crm-api.test.cjs BOSS_V7_SAFE_INSTALL.md BOSS_V7_RESEARCH_AND_AUDIT.md
git diff --cached --check
git -c core.pager=cat diff --cached --stat
```

Review the staged files: never include `.env`, `.wrangler/`, keys, export backups or unrelated files. Then:

```powershell
git commit -m "Improve AGN student case CRM, access control and Excel reporting v7"
git push origin main
```

## Live acceptance test (use fake/test student contact details)

1. Confirm Cloudflare deployment **Success**. Test normal Boss login, attendance, requests, holidays and ambassador/commission portals as regression checks.
2. As Super Admin see **Leads & Clients** and **Commission-Based Team** as separate sidebar/mobile menu options.
3. Register a test referral. Verify that Employee/Ambassador/Commission Agent can only submit their own referral; manager approval is required.
4. Convert the approved lead to **Active client**. Add two different applications. Set one to refused with a reason. Confirm the client is **not** automatically marked Lost.
5. Mark the client **Closed/Lost** with a reason, and reopen it. Verify both applications, the original referrer and all old follow-ups remain intact.
6. Create more than 50 test records in **local/staging** (not production) and verify page two and search. Test **Show All Records**, overdue follow-up queue and case history.
7. An authorized manager should download an XLSX file containing Leads, Clients, Closed/Lost, Applications and Follow Ups. An ordinary employee must receive `403` on `/api/crm/export-xlsx`.
8. Test Light/Dark modes and especially the Team Manager role badge, CRM tabs, form focus, long Bengali text, mobile scrolling and error messages.
9. Deactivate a staff/commission account and verify its session cannot access private CRM data. Verify cross-team manager access is denied.

If a test fails, do not roll out CRM to real students. The `backup-before-boss-v7` branch preserves pre-patch code; database migration 0008 is additive but should not be casually rolled back.
