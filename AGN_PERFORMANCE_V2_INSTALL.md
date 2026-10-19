# Boss / AGN Campus Ambassador Hub — Monthly Performance v2

This is a **small overlay for the already deployed Campus Hub v1** (GitHub commit `238ceea`). Extract at the root of your existing Boss Git checkout. It is NOT a full application replacement. Do not touch the separate One Tap application.

## New features

- Admin **Performance** tab with report-month picker, month-level rank/score/category, eligibility counts, and monthly top eligible performer.
- Private **Your monthly performance** panel for signed-in ambassadors.
- All scores are computed on the server from the existing `amb_assignments`, `amb_campaigns`, and `amb_submissions` tables. Ordinary ambassadors cannot request the manager-only leaderboard.
- A transparent, consistent rating methodology:
  - 40% task completion = approved / tasks with deadlines in reporting period.
  - 30% content quality = mean approved 1–5 score, divided by 5.
  - 15% punctuality = approved work submitted on/before deadline / approved work.
  - 15% consistency = weeks containing at least one approved task / weeks with eligible task deadlines (Monday-based, grouped by *due date*).
- Categories: Excellent (85–100), Good (70–84.9), Satisfactory (50–69.9), Needs Improvement (<50), Not rated (no eligible assignments).
- Monthly top performer requires 2+ eligible assignments, 2+ approved tasks, and score >= 70; tied scores use approved tasks then quality then name.

**Reporting policy:** Tasks are grouped by their due date in Asia/Dhaka, not the date of admin approval. Current-month results include only deadline days **through yesterday** (so no penalty for tasks due today). Earlier months include the full month. Ratings are provisional/current calculations; late approval or review decisions can change an earlier month's score. An "Ambassador of the Month" display is a *calculated nomination*, not a permanent award or generated certificate.

**Important limits:** This does not collect actual social-media reach/views. Ratings reflect manager-approved tasks only. The module has no stipend, salary, or payment tracking. There is no physical office attendance or GPS dependence.

## Files in this patch

- `src/server/utils/ambassador-performance.ts` (NEW calculation helper)
- `src/server/routes/ambassadors.ts` (one authenticated manager GET endpoint + personal score in tasks)
- `src/worker/index.ts` and `server.ts` (forward validated month query)
- `src/components/ambassadors/AmbassadorAdminView.tsx` (monthly Performance tab)
- `src/components/ambassadors/AmbassadorPortal.tsx` (private monthly score)
- `tests/ambassador-performance.test.ts` (NEW 11 deterministic tests)

**No migration required.** Existing `0004_campus_ambassadors.sql` and D1 data remain as they are. This update only reads existing ambassador data for reporting.

## Safe install — PowerShell in VS Code

1. Confirm prior Campus Hub v1 is working. If you have new local edits, save or commit them before copying this overlay:

```powershell
cd "C:\Users\User\One-Tap-Attendance-Boss-"
git status -sb
git branch backup-before-agn-performance-v2
```

2. Download `Boss_AGN_Monthly_Performance_Ratings_v2.zip` to Downloads, then extract into the same project folder:

```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\Boss_AGN_Monthly_Performance_Ratings_v2.zip" -DestinationPath . -Force
```

3. Build and run focused tests **before pushing**:

```powershell
npm.cmd run build
npx.cmd --no-install tsx --test tests/ambassador-performance.test.ts
```

If npm reports missing tools or a build/test failure, STOP and send the terminal error. Do not use `npm install --force` to hide dependency conflicts.

4. Stage ONLY the seven affected files and optionally this document. No `git add -A` (your repository previously accumulated accidental files):

```powershell
git add src/server/utils/ambassador-performance.ts src/server/routes/ambassadors.ts src/worker/index.ts server.ts src/components/ambassadors/AmbassadorAdminView.tsx src/components/ambassadors/AmbassadorPortal.tsx tests/ambassador-performance.test.ts AGN_PERFORMANCE_V2_INSTALL.md
git diff --cached --check
git diff --cached --stat
git commit -m "Add AGN monthly performance ratings and leaderboard"
git push origin main
```

5. After Cloudflare deployment succeeds, reload Boss, log in as Super Admin, open **Campus Ambassador Hub → Performance**, select a month, and review ratings. Test `/ambassadors` with a private pilot account to confirm its own score only. Verify office GPS attendance, leave, holidays and regular login are unaffected.

## Testing notes

The author tested 11 calculations in Node's test runner, TypeScript/TSX syntax parsing for all changed source files, and a read-only SQLite query against the v1 schema. **A full production Vite build, TypeScript typecheck, Cloudflare deployment, and live browser tests could not be run here** because project npm dependencies / Cloudflare credentials are not available in this environment. The user must run the local build/test commands and verify Cloudflare's deployment before treating it as production ready.
