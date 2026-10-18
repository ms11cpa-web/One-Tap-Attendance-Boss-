# Boss Security & Employee Cleanup Update

Adds three features to the existing **Boss / Cloudflare D1** deployment without resetting attendance or changing office settings.

## New features

1. **Admin password recovery:** Super Admins and HR Admins sign in and open **Office Settings → Admin Account Recovery & Devices**. Confirm the existing admin password and generate **10 single-use offline recovery codes**. Save them immediately in a password manager or offline secure location. Codes are hashed in D1; the plaintext is displayed only once. On the login screen, choose **Forgot admin password? Use recovery code**, supply admin ID, one unused code, and a new password (12+ characters). The code is consumed and all prior sessions are revoked. Wrong-code attempts are rate-limited (5 attempts, 15-minute lock). Recovery doesn't require email or paid services.
2. **Remember this device:** Checked by default on login. The signed-in session expires after **20 days with no actual user activity**. Real clicks/keyboard actions and successful modifications renew the expiry; passive page refreshes or API polling do not. Users may remain signed in while active, but browser cookie removal or administrative revocation can end the session. Without the checkbox, the session expires after 12 hours. Tokens use Secure HttpOnly SameSite=Lax cookies and are hashed in D1; old `boss_token` localStorage values are cleared.
3. **Delete demo employee:** In **People**, the Super Admin sees a red trash icon for ordinary employee accounts. Confirm the exact employee ID and reenter the Super Admin password. Deletion is refused if the account has attendance, remote, leave, correction, reporting relations, or used/pending leave balances. In that case choose **Inactive** to retain history. Admin accounts cannot be erased using this button. Successful deletions are recorded in audit history and the account's sessions are revoked.

## Deploy safely (VS Code terminal / PowerShell)

You already have the real repository at:

`C:\Users\User\One-Tap-Attendance-Boss-`

**Important**: Back up `boss-production-db` first using Cloudflare D1 Backups or an appropriate export. Don't delete your older One Tap database. Never post passwords or recovery codes publicly.

1. Download `Boss_Security_and_Employee_Cleanup_Update.zip` into your Downloads folder.
2. In a VS Code PowerShell terminal opened in your cloned repository, run:

```powershell
cd "C:\Users\User\One-Tap-Attendance-Boss-"
Expand-Archive -Path "$env:USERPROFILE\Downloads\Boss_Security_and_Employee_Cleanup_Update.zip" -DestinationPath . -Force
```

3. **Before pushing the new code** apply the additive migration to your existing Boss production database (binding `DB` only):

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
npx.cmd --yes wrangler@4.151.1 d1 migrations apply DB --remote
```

Verify the Cloudflare prompt names the **Boss database** `boss-production-db` and the **only new migration** `0002_account_security.sql`. Approve once. The file adds session fields and recovery tables, and does not drop or recreate existing business tables. Wrangler tracks completed migrations so it should not apply them twice.

4. After the migration reports success, push the focused update:

```powershell
git add src server.ts migrations/0002_account_security.sql SECURITY_FEATURE_UPDATE.md
git diff --cached --check
git commit -m "Add admin recovery, remembered devices and safe employee deletion"
git push origin main
```

5. Confirm a successful Cloudflare deployment. Open the Boss app and sign in again if required, since moving from localStorage to secure cookies may invalidate the previous browser login. **Immediately generate and securely save recovery codes for every admin account.** Then test with a throwaway employee with no business records.

### Notes and limitations

- Offline recovery codes are implemented. **Email recovery is not included** because Boss has no configured email-delivery provider. A future optional email flow must use verified ownership and one-time tokens.
- Do not create new demo attendance records in real employee accounts just to test deletion.
- Deletion is intentional and irreversible. Employees with business records are protected by server-side checks, not only UI restrictions.
- Migration must be applied before deploying the new backend because login uses the new session columns.
- Local integration checks passed; the live Cloudflare Worker has **not** been edited or tested from this chat.
