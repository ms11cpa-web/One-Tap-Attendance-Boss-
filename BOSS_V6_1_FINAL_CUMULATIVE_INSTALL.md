# Boss v6.1 — Final cumulative CRM / Campaign deadline / UI update

This is **one overlay** for the existing GitHub-connected Boss project. It includes the **v6 lead/referral/commission/attendance fix** plus the **v6.1 deadline, calendar navigation and color/contrast fixes**. **Do not install the older v6 ZIP after this one.**

## Confirmed changes

- Campus Ambassador campaigns now expire **automatically at midnight following the due date in Asia/Dhaka**. The deadline is inclusive through 23:59:59 BST on the stated date. No cron or new migration is required for this computed lifecycle.
- Server rejects new submissions and editing existing submissions after expiry, even if a cached screen still says Active; also rejects late new campaign creation, task allocation, reassignment and restoring expired archived campaigns. Campaigns may be deliberately given a future deadline by the manager **only if no submissions exist** (existing edit/history protection is retained).
- Previously submitted work is preserved and stays in the manager's review queue after deadline. Legacy late submissions remain in history, identified as late in review, and are not silently deleted or changed. Archived campaigns remain archived regardless of date.
- Admin lists show prominent **Active, Expired, Archived** badges, overdue unsubmitted assignments, deadline time zone and grouped action buttons. Ambassador portal shows **Overdue** and hides submit/edit forms when expired.
- At 7 PM Dhaka time, daily opt-in reminders **exclude expired campaign tasks**. Existing submissions awaiting review can still trigger the manager's review reminders.
- **Monthly Calendar navigation is hidden** on office desktop/mobile and replaced on mobile with **Leads**. The calendar API, historical attendance and holiday data are **not removed**; Attendance History and other existing reports remain accessible. Office dashboard's calendar link now opens Attendance History.
- Improved campaign card spacing and contrast in both themes; focus outlines for keyboard navigation. Other existing v6 functionality is preserved in this overlay.
- Cumulative v6 features: one-sided correction preserving untouched IN/OUT data, commission agent portal, unified lead/referral tracker, follow-ups, client tracking and configurable in-app chime. **Background phone sound volume is device-controlled.**

## Not changed

No existing migrations are modified. This cumulative update includes **0007_crm_leads_commission.sql** from v6. There is **no 0008 migration** and no automatic deletion or archiving of existing campaign records; expiration is calculated from date and current status. Other account roles, leave and attendance history are not intentionally modified by v6.1.

## Installation — Windows PowerShell

Only use this project folder (not the extracted Downloads source copy):

```powershell
cd "C:\Users\User\One-Tap-Attendance-Boss-"
git status -sb
git branch backup-before-boss-v6-1
```

Review and back up any local modifications before replacing project files. Download `Boss_v6_1_CRM_Campaigns_Final_CUMULATIVE_UPDATE.zip` into **Downloads**, then:

```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\Boss_v6_1_CRM_Campaigns_Final_CUMULATIVE_UPDATE.zip" -DestinationPath . -Force
npm.cmd run build
node --test tests/boss-v6-crm.test.cjs tests/boss-v6-crm-api.test.cjs tests/boss-v6_1-campaign-deadlines.test.cjs tests/boss-v5_1-runtime.test.cjs
node --test tests/boss-security-crud-v5.test.mjs tests/boss-midnight-rollover-v5_2.test.cjs tests/boss-theme.test.mjs tests/agn_notifications_crypto.test.mjs
node --experimental-strip-types --test tests/ambassador-performance.test.ts
```

**Stop if the build or any test fails**. Source reviewer tests are not live integration/permission tests.

### Production backup & migration — only after successful build/tests

```powershell
npx.cmd --yes wrangler@4.151.1 d1 export DB --remote --output "$env:USERPROFILE\Downloads\boss-before-v6-1.sql"
```

Confirm download success and that Wrangler targets `boss-production-db` (`61959550-659f-4e70-b774-65c67d180ce1`). Then:

```powershell
npx.cmd --yes wrangler@4.151.1 d1 migrations apply DB --remote
```

If v6 was not previously deployed, Wrangler should apply **0007_crm_leads_commission.sql**. If already applied, **No migrations to apply** is expected. Never manually re-run a migration already applied.

Optional read-only check:

```powershell
npx.cmd --yes wrangler@4.151.1 d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('crm_leads','crm_commission_agents','crm_agent_tasks');"
```

### Stage only intended paths (avoid `.wrangler`, backups and stray files)

```powershell
git add -- index.html server.ts src/App.tsx src/components/ambassadors/AmbassadorAdminView.tsx src/components/ambassadors/AmbassadorPortal.tsx src/components/ambassadors/NotificationCenter.tsx src/components/auth/LoginView.tsx src/components/crm/ src/components/dashboard/DashboardView.tsx src/components/layout/MobileNav.tsx src/components/layout/Sidebar.tsx src/components/modals/ApplyCorrectionModal.tsx src/server/crm/ src/server/db/node-d1.ts src/server/notifications/notification-core.ts src/server/routes/ambassadors.ts src/server/routes/api-handler.ts src/theme/ThemeContext.tsx src/theme/boss-theme.css src/utils/campaign-deadline.ts src/worker/index.ts migrations/0007_crm_leads_commission.sql tests/boss-v6-crm.test.cjs tests/boss-v6-crm-api.test.cjs tests/boss-v6_1-campaign-deadlines.test.cjs tests/boss-v5_1-runtime.test.cjs BOSS_V6_1_FINAL_CUMULATIVE_INSTALL.md

git diff --cached --check
git -c core.pager=cat diff --cached --stat
```

If and only if the staged changes look correct, the local build/tests pass, the D1 backup succeeded and the migration is applied:

```powershell
git commit -m "Add AGN CRM commission portal and fix expired campaigns v6.1"
git push origin main
```

Cloudflare's deployment must independently report **Success**; a Git push alone does not verify live behavior.

## Live acceptance checklist (use only test records)

1. Regular employee login, attendance, existing historical records, corrections, leave, holidays and exports remain correct; **IN-only** correction does not create an OUT time.
2. Super Admin login; Employees, Approvals, Audit, Campus Hub, CRM work normally. Monthly Calendar is absent from navigation but attendance history is accessible.
3. On Campaigns, an older due date shows **Expired**, not Active. Archived campaigns show **Archived**.
4. Ambassador account assigned an expired task sees **Overdue**, cannot submit new proof or edit an existing pending submission. Direct API POST should return HTTP **409** after expiry, even if the browser has a stale screen.
5. A campaign due **today** remains open through the end of the Bangladesh day; the next Dhaka date closes it. Test using a dedicated test campaign—not production time changes.
6. Manager still sees, reviews and can approve a submission originally sent before expiry. No prior points, proof or recognition lost.
7. Expired campaigns are not included in pending-task daily reminders; reviews of pending submissions still reach managers.
8. Commission test account logs in, changes password, submits a referral, receives task, submits proof. Office manager approves referral and updates lead/client/follow-up. Other agent cannot access another's data.
9. Light/Dark campaign card text, badges, buttons and CRM forms are readable on phone and desktop; focus/keyboard access works.
10. Check notifications with app open and phone locked. The optional in-app sound does not override device-controlled background notification volume.

## Limits and remaining improvements

- **Full Vite build and live authenticated role tests must run in your Windows/Cloudflare installation.** Container source parsing and in-memory SQLite tests are not a 100% accuracy or security certification.
- The calendar is **hidden in navigation**, not deleted. The existing calendar API and data remain untouched to preserve historical functionality; you can restore the menu later if needed.
- An expired campaign is an **effective/computed status**. The original `status` column still contains active/archived because D1 enforces those values; backend authorization checks always incorporate the due date.
- Client data requires an explicit consent/retention policy, least-privilege role review, regular backups, and more extensive browser/role tests. Larger lead volumes will need CRM pagination/search and deduplication workflows.
- The existing Vite/esbuild clean-install dependency mismatch previously reported still merits resolving in a dedicated dependency update. Browser GPS can be spoofed; it is not a perfect fraud control.
- Commission-agent task deadlines are independent of Campus Ambassador campaign deadlines; they have not been silently changed in this patch.
