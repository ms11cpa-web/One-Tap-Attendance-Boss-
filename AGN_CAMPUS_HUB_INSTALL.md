# AGN Campus Ambassador Hub v1 — Safe Boss Update

## What this update adds

The Campus Ambassador Hub is a **separate, opt-in module**, not a conversion of office employees. There is one Campus Ambassador account type and an optional Campus Lead designation. No paid ambassador category, salary, stipend, payment or payroll tracking is included.

- For the **Super Admin**: Campus Hub tab in Boss, enable/disable, campus and ambassador registration, assign existing office managers to the Hub.
- For **Super Admin and explicitly assigned Programme Managers**: Create a campaign task for all active ambassadors, a campus, or one ambassador; review links and notes; request a revision, approve with a quality score, or reject. Review actions are recorded.
- For **ambassadors**: Separate sign-in at `/ambassadors`, mandatory change of temporary password, view assignments, submit an HTTPS proof link and notes, revise requested submissions, see approved points.
- For **Campus Leads**: The same ambassador account plus aggregated completed/assigned totals at their campus. No approval powers or access to teammates' private submissions.
- For **reporting**: A simple leaderboard with approved points, approved/assigned counts, on-time approvals, and average quality. No external social-media metrics are claimed or collected.

**Important limits of v1:** One deliverable per campaign; assignments are created when the manager publishes the campaign (new joiners do not receive old assignments automatically). Videos are submitted as secure external links, not uploaded. There is no automated notification, certificate PDF generator, bulk import, in-app messaging or payroll feature. It is intended for initial rollout and supervised testing.

## Source compatibility

This ZIP contains **only files added/changed for the Hub**. Extract into the EXISTING Git checkout at:

`C:\Users\User\One-Tap-Attendance-Boss-`

It must **not** be extracted as a new repository or over an unrelated app. Your existing `.git`, database, local environment files and other Boss source files must remain. Review if you have manually changed the files listed below since the latest shared Boss source; this package was prepared from the uploaded full Boss source plus the subsequent login-password visibility fix, not a live snapshot of your Windows Git checkout.

## Deployment steps (PowerShell / VS Code)

### 1. Before copying

1. Save/commit your current working changes, if any.
2. In VS Code terminal, run:

```powershell
cd "C:\Users\User\One-Tap-Attendance-Boss-"
git status -sb
git branch backup-before-campus-hub
```

3. Unzip `Boss_AGN_Campus_Ambassador_Hub_v1_SAFE_UPDATE.zip` into the current project root. Choose **Replace** only for matching files after checking your existing edits; do not delete other files.

```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\Boss_AGN_Campus_Ambassador_Hub_v1_SAFE_UPDATE.zip" -DestinationPath . -Force
```

4. Check the exact changes:

```powershell
git status --short
git diff --stat
git diff --check
```

### 2. Check the build before touching D1

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
npm.cmd run build
```

STOP if this fails and send the full error. `npm install` may report an existing `vite` vs `esbuild` dependency conflict in the current package.json; do not use `--force` to mask it. No dependencies were changed by this update. If you have clean build dependencies already, do not reinstall them just to apply this module.

### 3. Back up production D1 then apply the NEW migration

**Read the Cloudflare prompt carefully and verify `boss-production-db` before confirming.** Export to Downloads OUTSIDE your repository:

```powershell
npx.cmd --yes wrangler@4.151.1 d1 export DB --remote --output "$env:USERPROFILE\Downloads\boss-before-campus-hub.sql"
```

If backup/export fails, STOP and resolve that first. Keep the backup private. Once it succeeds:

```powershell
Get-ChildItem .\migrations\*.sql | Select-Object -ExpandProperty Name
npx.cmd --yes wrangler@4.151.1 d1 migrations apply DB --remote
```

Required order: `0001_initial.sql`, `0002_account_security.sql`, `0003_holiday_date_ranges.sql`, then **`0004_campus_ambassadors.sql`**. Confirm D1 shows migration `0004` applied. This migration creates ten new `amb_*` tables and defaults the Hub to disabled. It has no ALTER, DROP, DELETE or UPDATE against existing Boss business tables.

### 4. Push only the relevant files

```powershell
git add AGN_CAMPUS_HUB_INSTALL.md migrations/0004_campus_ambassadors.sql tests/ambassador_schema_verify.py server.ts wrangler.toml src/App.tsx src/components/auth/LoginView.tsx src/components/layout/Sidebar.tsx src/components/layout/MobileNav.tsx src/components/ambassadors/AmbassadorAdminView.tsx src/components/ambassadors/AmbassadorPortal.tsx src/server/db/node-d1.ts src/server/routes/ambassadors.ts src/worker/index.ts
git diff --cached --check
git diff --cached --stat
git commit -m "Add isolated AGN Campus Ambassador Hub"
git push origin main
```

Do **not** use `git add -A` until you have removed accidental local files from your Git index. Cloudflare should rebuild automatically; check the deployment status in Cloudflare before proceeding.

### 5. Smoke test / initial pilot

1. Confirm regular office login, GPS attendance, employee directory and holidays still work.
2. Sign in as Boss Super Admin; open **Campus Ambassador Hub** from the sidebar (on mobile: More).
3. In the Hub, confirm portal status is **disabled**. Add one campus.
4. Create a *test* ambassador with ID such as `AGNTEST01` and a unique 12+ character temporary password. Share the ID/password only through a private channel.
5. Create a test campaign (e.g. an AGN short-form video) targeted to that ambassador.
6. Enable the Hub using the Super Admin control. Open `/ambassadors` in a private browser window.
7. Sign in, change temporary password, submit an HTTPS proof URL, and confirm the manager receives the submission.
8. Test **Request revision → resubmit → approve** and confirm the member receives points **once**. Then deactivate the test ambassador.
9. If something fails, **disable ambassador login** with the Hub toggle. Office login and GPS attendance are independent.

## Data and security notes

- Ambassador passwords use the existing Boss salted PBKDF2 password function, separate from office user passwords.
- Ambassador sessions are independent HttpOnly cookies lasting up to 12 hours. Office remembered-device sessions and password recovery are not changed.
- Login attempts are limited per ambassador code; administrative operations require the Boss Super Admin or an explicitly assigned Programme Manager.
- A real Campus Lead is **not** an office administrator, cannot review submissions, and gets only campus-level aggregate totals.
- Proof links must use HTTPS. Direct video uploads are intentionally not supported in v1; consider Cloudflare R2 in a later update.
- Existing office users, attendance, leave, holidays, existing migration history, and Excel reports are not altered by this package.
- Do not publish the production database export, Cloudflare credentials, or temporary passwords in GitHub.

## Verification before release

Package development checks included: 41 source TS/TSX files parsed without syntax errors; additive migration applied successfully after 0001/0002/0003 and office sample data survived; 28 API-flow scenarios passed against a temporary in-memory SQLite database (with office admin identity stubbed). A clean `npm install`, full Vite production build, authenticated Cloudflare D1 application, actual production Cloudflare deployment, and browser end-to-end interactions **could not be executed in this isolated environment**. Run `npm.cmd run build` locally and verify the pilot before onboarding actual ambassadors. These verification statements describe this reconstructed package, not your currently deployed GitHub code.
