# Boss — Smart Workforce Management

> **Tagline:** Smart Workforce Management  
> **Application Type:** Employee Attendance, Leave, Remote Work, GPS Geofencing, Holiday and Workforce Management System  
> **Target Hosting:** Cloudflare Free Tier (Cloudflare Workers / Pages)  
> **Target Database:** Cloudflare D1 (SQLite)  
> **Timezone:** Asia/Dhaka (Bangladesh Standard Time, UTC+6)  
> **Default Working Schedule:** 11:00 AM to 7:00 PM (8 hours, 15-minute grace period)  

---

## Overview

**Boss** is a full-stack workforce and attendance management platform. It offers employees a one-tap check-in/check-out experience with GPS geofencing, while providing administrators with automated duration calculations, late arrival tracking, leave quotas, remote work authorizations, holiday calendars, and native multi-sheet Excel (`.xlsx`) reporting.

---

## Key Features

1. **One-Tap Attendance with GPS Geofencing**
   - High-precision Haversine geofence validation on the backend.
   - Configurable office coordinates (default: Dhaka Headquarters in Gulshan 2) and radius (100m, 150m, 250m, 300m, 500m).
   - Rejection of spoofed or inaccurate GPS signals exceeding the accuracy threshold.
   - Atomic punch operations preventing duplicate check-ins on the same day.
   - Automatic daily reset at midnight in `Asia/Dhaka`.
   - Distinct detection of "Missing OUT" vs "Absent".

2. **User Roles & Granular Access Control**
   - **Super Admin:** Full organization governance, office location, schedule settings, admin delegation, audit trails. Guardrail: Cannot demote or deactivate the last remaining Super Admin.
   - **HR Admin:** Manage company-wide attendance, employee profiles, leave allowances, and attendance corrections.
   - **Team Manager:** Manage department members, approve/reject leave, and review team attendance.
   - **Employee:** One-tap punch in/out, view hours, apply for leaves, apply for remote dates, submit punch corrections.

3. **Remote Work Management**
   - Employees request specific remote dates with justifications.
   - Once approved by a manager or admin, the dashboard switches to **Remote IN** / **Remote OUT** with office geofencing waived for that date.

4. **Leave Management & Half-Day Support**
   - Pre-configured categories: Casual Leave (10d), Sick Leave (14d), Annual Leave (15d), Emergency Leave (5d), Unpaid Leave (30d).
   - Support for Full-Day and Half-Day leave (First Half / Second Half, 0.5 day deduction).
   - Quota tracking prevents overlapping or negative leave allocations.

5. **Accurate Absence & Holiday Calculations**
   - **No false absences:** Never marks an employee absent before their joining date or on weekends/holidays.
   - Configurable weekly holidays (default: Friday & Saturday in Bangladesh).
   - Public and company holiday calendar (Independence Day, Eid-ul-Fitr, Pohela Boishakh, Victory Day, etc.).

6. **Attendance Corrections**
   - Allows employees who forgot to clock in or out to request corrections with mandatory explanations.
   - Admins review original vs requested times and approve with one click; attendance calculations update automatically while preserving audit history.

7. **Native Excel Reporting (.xlsx)**
   - Generates authentic Microsoft Excel XML workbooks (not renamed CSVs) compatible with Cloudflare Workers without requiring Node child processes.
   - Multi-sheet export:
     - Sheet 1: Daily Attendance Sheet (with verified GPS distance in meters)
     - Sheet 2: Monthly Summary Sheet (office days, remote days, leave days, late minutes, extra minutes, net hours)
     - Sheet 3: Leave Requests Sheet
     - Sheet 4: Remote Work Sheet
     - Sheet 5: Attendance Corrections Sheet
     - Sheet 6: Holiday Calendar Sheet

8. **Progressive Web App (PWA)**
   - Installable on Android, iPhone, iPad, and desktop.
   - Native in-app install button with custom iOS Safari instructions.
   - Standalone mobile mode with app manifest and compliant icons.

---

## Default User Accounts (Demo Credentials)

All demo accounts share the default password: `Password@123`

| Role | Employee ID | Name | Department |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `EMP001` | Md. Rafiqul Islam | Executive Leadership |
| **HR Admin** | `EMP002` | Nusrat Jahan | Human Resources |
| **Team Manager** | `EMP003` | Tanvir Ahmed | Software Engineering |
| **Employee 1** | `EMP004` | Farhan Kabir | Software Engineering |
| **Employee 2** | `EMP005` | Sabrina Yasmin | Product & Design |

---

## Technology Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, `vite-plugin-pwa`.
- **Backend:** Cloudflare Workers (TypeScript REST API), Node.js Express for local AI Studio runner.
- **Database:** Cloudflare D1 (SQLite) with binding name `DB`.
- **Reporting:** Pure JavaScript native XLSX generation (`xlsx`).
- **Security:** Web Crypto API (`crypto.subtle`) PBKDF2 salted password hashing, HTTP-only SameSite session cookies.

---

## Local Development & AI Studio

1. **Run Dev Server:**
   ```bash
   npm run dev
   ```
   Starts full-stack Express + Vite dev server on port `3000`. The server emulates Cloudflare D1 using WebAssembly SQLite (`data/boss.sqlite`), running initial migrations and seeding default users automatically.

2. **Run Automated Test Suite:**
   ```bash
   npx tsx tests/boss.test.ts
   ```
   Runs automated tests verifying cryptography, Haversine formulas, geofencing thresholds, lateness math, and D1 database operations.

3. **Build Frontend Bundle:**
   ```bash
   npm run build
   ```

---

## Cloudflare Free Tier Deployment Guide

### Step 1: Create Your GitHub Repository
1. Push this project to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Boss workforce management system"
   git remote add origin https://github.com/<your-username>/boss-workforce.git
   git push -u origin main
   ```

### Step 2: Provision Cloudflare D1 Database
1. Login to Cloudflare via the Wrangler CLI:
   ```bash
   npx wrangler login
   ```
2. Create the D1 database:
   ```bash
   npx wrangler d1 create boss-production-db
   ```
3. Copy the output `database_id` and update `wrangler.toml`:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "boss-production-db"
   database_id = "<YOUR_ACTUAL_DATABASE_ID_FROM_CLOUDFLARE>"
   migrations_dir = "migrations"
   ```

### Step 3: Run Database Migrations on Cloudflare D1
Execute the SQL migration on your production D1 database:
```bash
npx wrangler d1 migrations apply DB --remote
```

### Step 4: Deploy Cloudflare Worker & Static Assets
Deploy the application directly:
```bash
npm run build
npx wrangler deploy
```

Your Boss application is now live on Cloudflare Workers with free HTTPS and global edge routing!

---

## Cloudflare Pages Alternative Deployment

If you prefer connecting GitHub to **Cloudflare Pages**:
1. Open Cloudflare Dashboard -> **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
2. Select your `boss-workforce` repository.
3. Build Settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. In Settings -> **Functions** -> **D1 Database Bindings**:
   - Variable name: `DB`
   - Database name: select `boss-production-db`.
5. Every time you push a commit to `main`, Cloudflare automatically builds and deploys your changes.

---

## License

This software is released under the Apache-2.0 License.
