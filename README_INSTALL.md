# Boss — Always-visible Install Boss button

This update changes **only** `src/components/pwa/PWAInstallButton.tsx`.

The Install Boss button now appears whenever Boss is opened in a normal browser, even if the browser has not emitted a native PWA installation prompt. On click:
- If an install prompt is available, it opens.
- Otherwise, a short guide appears with steps for Android, iPhone/iPad, Chrome, Edge, or Safari.
- In an already-installed standalone app window, the button stays hidden because Boss is already installed.

No backend, database, authentication, or attendance files are changed.

## Apply from VS Code (Windows PowerShell)

1. Download `Boss_Install_Button_Update.zip` to the Windows Downloads folder.
2. Open your **real cloned** repository in VS Code, `C:\Users\User\One-Tap-Attendance-Boss-`.
3. Run:

```powershell
cd "C:\Users\User\One-Tap-Attendance-Boss-"
Expand-Archive -Path "$env:USERPROFILE\Downloads\Boss_Install_Button_Update.zip" -DestinationPath . -Force
git status --short
```

4. Confirm only the PWA file is modified (README_INSTALL.md may appear as an untracked extra and can be left uncommitted).
5. Publish:

```powershell
git add src/components/pwa/PWAInstallButton.tsx
git commit -m "Keep Install Boss button visible with manual instructions"
git push origin main
```

Cloudflare should rebuild from GitHub. On a browser with the website open, refresh to see **Install Boss** near the top-right of the login screen and dashboard. You might need to close/reopen the tab if a cached PWA version is being used.

## Verification

- Desktop Chrome/Edge: If no browser install prompt is available, a manual guide appears.
- Android Chrome: Tapping the button opens the native prompt if offered; otherwise instructions appear.
- iPhone/iPad: A Safari Add to Home Screen guide appears.
- Already-installed Boss app (standalone): Installation button is hidden as intended.

This button cannot force a browser to install the app. Browser and device installability requirements still apply.
