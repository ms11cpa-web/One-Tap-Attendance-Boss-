# Boss — Cloudflare D1/Login Repair (18 October 2026)

This is an updated SOURCE-CODE package for the user's EXISTING Boss GitHub / Cloudflare deployment. **It has not been deployed to the user's Cloudflare account.**

## Diagnosed issues in original source

1. `src/server/db/node-d1.ts` applies SQL migrations and seeds demo accounts only in the local Express/SQL.js environment. The production Cloudflare Worker accesses `env.DB` and never executes the local seeding code. A fresh D1 database therefore has no users; before migrations, it has no tables and `/api/auth/login` throws HTTP 500.
2. `src/server/routes/api-handler.ts` contains SQL comparisons with double-quoted string literals such as `id = "default"`. These are not portable to stricter SQLite configurations; repaired queries use SQL single quotes.
3. Public production login screen displayed demo IDs and a globally known password, and employee create/reset endpoints defaulted to that password. Those public shortcuts and defaults have been removed.
4. The original package shipped `data/boss.sqlite`, a preseeded local demo database. It is omitted from this package and excluded in `.gitignore`.

## Changes included

- Secure first-admin creation via `GET /api/bootstrap/status` and `POST /api/bootstrap/create`. The initial setup page appears only when `users` exists but **no Super Admin** exists.
- First admin setup REQUIRES a strong Worker secret named `BOSS_BOOTSTRAP_SECRET` (>=24 characters). **Never put this value in GitHub or frontend code.** Only the Cloudflare secret value is used server-side.
- On initial setup, creates the Super Admin, office configuration, and five leave categories with a transactional D1 batch; does **not** generate demo employees or attendance.
- Office GPS coordinates can be filled with **Use this device location** while physically at the office, or typed manually. Default hours remain 11 AM–7 PM, radius default 300 m, default late grace 15 minutes (editable later).
- More useful API error messaging when tables are missing. Server-side exceptions continue to be logged to Cloudflare Observability.
- Removed demo account buttons; new or reset employee passwords must be explicitly supplied and at least 12 characters.
- Tightened HR permissions for existing administrator accounts. Set new employees' joining date to today's Dhaka date instead of a hardcoded date.

## Deployment — preserves the existing Worker and D1 database

**Back up your current GitHub repository and D1 database first. Do NOT import the local SQL.js demo database and DO NOT delete D1.**

1. Replace files in the EXISTING GitHub repository with the corresponding paths from this package, and commit on your deployment branch. This should trigger the already configured Cloudflare Workers build. If you don't want to overwrite unchanged files, only the files listed under "Files changed" below need updating.
2. In **Cloudflare → Workers & Pages → one-tap-attendance-boss → Settings → Variables and Secrets**, add a **Secret** named `BOSS_BOOTSTRAP_SECRET` with a new random, unique value of 24+ characters. Retain it privately for one-time setup. Do not post it in chats or logs.
3. Make sure the **Deploy command** for the Worker Build is exactly:

   ```bash
   npx wrangler d1 migrations apply DB --remote && npx wrangler deploy
   ```

   Keep the project's original frontend Build command, `bun run build` (or `npm run build`). Only run migrations after reviewing and backing up the production data. The existing `migrations/0001_initial.sql` uses `CREATE TABLE IF NOT EXISTS` and was tested against a fresh SQLite database.
4. Re-run deployment if needed. Visit your Boss URL. The initial admin setup screen should now appear. Enter the same secret configured in Cloudflare, your unique admin ID, full name, strong admin password, and **true** office location. This creates one Super Admin and reference records, without demo accounts.
5. Sign in with that new administrator ID and password. Test a new employee with a unique password before rolling out to everyone. Verify D1 tables are present and employee requests persist after refresh.
6. Once setup is complete, **delete `BOSS_BOOTSTRAP_SECRET` from Cloudflare Secrets**. The setup route refuses to register more admins after the first Super Admin already exists, regardless of this secret. (The Super Admin can add authorized admins through the app.)

### If the site shows "Boss needs database setup"

The production D1 schema has not been migrated. Verify Cloudflare build logs for `npx wrangler d1 migrations apply DB --remote`. In Cloudflare D1 Console you may confirm with the READ-ONLY query:

```sql
SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;
```

A fresh migrated database should show 11 application tables; additional migration tracking tables may also appear.

### If the site still shows a 500 error

Open Cloudflare → Worker → Observability → Logs and look at the precise underlying exception for the failing `/api/...` request. The generic response deliberately avoids exposing sensitive DB details to the public.

## Files changed

- `src/worker/index.ts` — bootstrap routing & error reporting
- `src/worker/bootstrap.ts` — NEW secure first-time setup backend
- `src/components/auth/LoginView.tsx` — setup-status and no demo sign-in
- `src/components/auth/BootstrapView.tsx` — NEW initial admin/office setup UI
- `src/server/routes/api-handler.ts` — SQL quote compatibility, remove default passwords, permissions
- `src/components/employees/EmployeesView.tsx` — remove default passwords and old joining date
- `.gitignore` — exclude local demo DB
- `BOSS_REPAIR_README.md` — this file

## Testing and limitations

- Original SQL schema verified by executing `migrations/0001_initial.sql` in a fresh SQLite database (11 application tables created).
- 12 bootstrap tests passed using a real in-memory SQLite engine: missing schema, migration, secret rejection, password validation, one-time admin, office setup, leave categories, and no demo users.
- 4 integrated authentication assertions passed: bootstrapped Super Admin login, session retrieval, and incorrect-password rejection.
- All modified TypeScript/TSX files passed syntactic transpilation checks.
- **A full Vite build, real Cloudflare D1 execution, browser UI and end-to-end production deployment have not been tested** in this environment. You must test in Cloudflare before rollout.
- This patch addresses the diagnosed login/initialization failure and a few high-risk credential defaults; it is NOT a complete independent security audit of every HR, approval, GPS or report route. Additional QA, role and data protection review are recommended before storing real employee data.
