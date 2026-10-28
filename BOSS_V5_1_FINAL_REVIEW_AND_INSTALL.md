# Boss v5.1 — Reviewed cumulative security, management and ambassador update

Prepared from the **user-uploaded repository snapshot of 28 October 2026**, not directly from a live authenticated deployment. This is a **cumulative overlay** containing the earlier v5 changes and second-pass corrections. It does **not** replace the whole project. It does not contain D1 exports, secrets, `.git`, or `.wrangler/`.

## Coverage of requested requirements

1. Employee management: existing authorized profile edits, status changes, password resets, and Super-Admin-only deletion for genuinely record-free ordinary employees; history-bearing staff must be deactivated. Holiday edit/delete preserved. Requests/Approvals retains the full reason **View** reader across leave, remote and correction tabs.
2. Campus management: campus/ambassador edits and constrained deletion, campaign edit/archive/delete, assignment add/reassign/remove. Ambassador portal now permits **Edit submission** and **Withdraw** before the first managerial review only. Submissions with review history remain immutable except when managers explicitly request a revision. All removal/edit operations enforce permissions and state on the server.
3. Ambassador performance and rewards: 40/30/15/15 monthly rating, points solely from approved work, audited Super Admin review corrections; separate non-monetary recognition creation/edit/audited revocation. No paid role or stipend feature.
4. Super Admin: no personal GPS punch option or personal attendance summary; retains attendance oversight.
5. Employee IDs and Ambassador IDs are used for directory ordering, with natural-number sorting (`AGN2` before `AGN10`), not alphabetical name order. Ranked performance lists intentionally remain ranked by performance.
6. Colors: dark/light theme remains intact with targeted contrasting edit/reward panels. Device/browser visual QA is still needed across employee and ambassador pages.

## Additional defects corrected on second pass

- Manager dashboard company totals, leaves, and pending approvals now only include their own team. HR/Super Admin remain company-wide.
- Dashboard month and leave-balance year no longer say **October 2026** or **(2026)** forever; they use Asia/Dhaka local date.
- Overnight attendance: an already-open shift now blocks a second clock-in on the next date; the Today API returns the previous open shift so the employee sees the OUT button, with the original date clearly labeled. Valid OUT from a prior date (up to 24h) is supported. This avoids overlapping shifts.
- Campus-wide campaign creation uses transactional `db.batch()` so a failed assignment won't leave a partial campaign. Node's local D1 emulator now emulates the batch transaction and throws on SQL error, with `meta.changes` for optimistic update checks.
- Excel monthly summary reports approved leaves and filters staff-private sheets to the permitted employees (v5), and Excel employee rows use natural ID ordering (v5.1).
- New submission edit resets `submitted_at` to the edit time so late edits are not incorrectly counted as on-time. Withdrawal only works while the submission is unreviewed and lacks any review events.

## Validation completed in this environment

- 12 existing security/theme/notification checks: PASS. Many security checks are source assertions; they do not replace a penetration test.
- 11 monthly performance calculation tests: PASS.
- In-memory D1 route execution: initial submit, edit pending, withdraw, revision-history protection, approved-submission protection, natural ID ordering and transactional campaign creation: PASS. Auth and notification delivery are mocked for this test.
- All six migrations (`0001`–`0006`) applied successfully to an isolated SQLite test database; production records were **not** accessed or modified.
- TypeScript/TSX syntax + relative import checks: PASS.
- **Full Vite production build, clean npm install, real Cloudflare D1 integration, browser/phone checks, and live cross-role security tests were not possible here.** These are required gates; do not claim 100% accuracy yet.

## Safe installation (PowerShell in VS Code)

1. **Ensure you have a fresh repository copy**, backup your project and check `git status -sb`. If your tree contains edits to any listed file, back them up first. Don't blindly overwrite newer work.
2. Create a backup Git reference (once):

```powershell
cd "C:\Users\User\One-Tap-Attendance-Boss-"
git branch backup-before-boss-v5-1
```

3. Download this ZIP, extract its *root contents* into the **existing** project folder, and overwrite matching code files. Do not replace `.git`, secrets or database files (none are inside the ZIP).

```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\Boss_v5_1_Reviewed_Cumulative_SAFE_UPDATE.zip" -DestinationPath . -Force
```

4. **Build + test**. Stop if any command fails:

```powershell
npm.cmd run build
node --test tests/boss-security-crud-v5.test.mjs tests/boss-theme.test.mjs tests/agn_notifications_crypto.test.mjs
node --experimental-strip-types --test tests/ambassador-performance.test.ts
node --test tests/boss-v5_1-runtime.test.cjs
```

5. **Back up D1 and apply migration `0006` ONLY if still pending**, before publishing v5 server code. The migration is additive: login throttling + ambassador recognition tables. If you already deployed v5 and this migration was applied, it will report no pending migrations.

```powershell
npx.cmd --yes wrangler@4.151.1 d1 export DB --remote --output "$env:USERPROFILE\Downloads\boss-before-v5-1.sql"
npx.cmd --yes wrangler@4.151.1 d1 migrations apply DB --remote
```

Verify the selected target is **boss-production-db**. Treat exported D1 data as confidential. Avoid posting exported links or credentials in chats.

6. **Stage exact overlay files**; never `git add -A` here due earlier local-cache/stray-file incidents:

```powershell
git add -- src/App.tsx src/components/ambassadors/AmbassadorAdminView.tsx src/components/ambassadors/AmbassadorPortal.tsx src/components/attendance/OneTapAttendance.tsx src/components/dashboard/DashboardView.tsx src/components/employees/EmployeesView.tsx src/components/layout/MobileNav.tsx src/components/layout/Sidebar.tsx src/components/settings/SettingsView.tsx src/server/db/node-d1.ts src/server/notifications/notification-core.ts src/server/reports/excel.ts src/server/routes/ambassadors.ts src/server/routes/api-handler.ts src/server/utils/geo.ts src/theme/boss-theme.css migrations/0006_boss_security_hardening.sql tests/boss-security-crud-v5.test.mjs tests/boss-v5_1-runtime.test.cjs BOSS_V5_1_FINAL_REVIEW_AND_INSTALL.md

git diff --cached --check
git -c core.pager=cat diff --cached --stat
```

7. If the staged summary is correct, after *all* tests and the migration complete:

```powershell
git commit -m "Review Boss security, records, campus workflows and reporting v5.1"
git push origin main
```

8. Verify Cloudflare deployment succeeds. Test with separate Employee, Team Manager, HR Admin, Super Admin and Campus Ambassador accounts. Specifically test: denied employee cross-user Excel data, denied other-team manager approvals, record-free employee deletion versus history-bearing deactivation, ID sorting with AGN2/AGN10, manager task edit/delete guards, submitting/editing/withdrawing an unreviewed video, denying withdrawal after review, score correction and recognition revocation, full-text View, dark/light contrast, 7 PM push reminders and Super Admin having no personal Punch button. Check performance scores against hand-calculated examples.

## Explicit remaining issues / release limitations

- **Clean install**: `package.json` uses `esbuild ^0.25.0` with Vite 8, which caused an npm peer-dependency error previously. Fix the version/lockfile in a controlled, tested future change; an existing `node_modules` build isn't enough.
- **Leave accounting**: Leave spanning multiple years and holidays/weekends needs a defined HR policy and atomic balance updates. This patch preserves existing policy rather than silently changing paid-leave balances.
- **GPS**: browser-provided coordinates are spoofable, even if accuracy validation is improved.
- **Rewards**: Monthly ranking recalculates from historical reviews, so the 'Ambassador of the Month' display is provisional unless an award is separately issued as a recognition record.
- **Push sound**: custom in-app tong can't force a custom notification-bar tone when the app is closed. Test actual Android/iPhone permission and OS sounds.
- **Source revision**: this package is based on the uploaded ZIP. If your live GitHub branch has newer edits after that ZIP, manually merge/diff rather than replace.
- **Security history**: audit the historic `.wrangler` cache Git commit; removing the file today does not erase previous commits.
- Full **role-based integration/security testing and manual accessibility checks** are needed. This update is not a claim of 100% correctness.

## Rollback

Revert the new code through the Git backup branch / Git revert and redeploy. Keep the additive `0006` tables; do not manually delete database tables to roll back the code. Restore the confidential D1 backup only if truly needed, after evaluating data created since the backup.
