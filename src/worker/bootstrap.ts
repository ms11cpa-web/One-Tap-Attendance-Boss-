import type { D1DatabaseLike } from '../server/db/types.ts';
import { hashPassword } from '../server/auth/crypto.ts';
import { getDhakaDateString } from '../server/utils/time.ts';

interface BootstrapEnv {
  DB: D1DatabaseLike;
  BOSS_BOOTSTRAP_SECRET?: string;
}

type ApiResponse = { status: number; data: Record<string, unknown> };

async function tablesReady(db: D1DatabaseLike): Promise<boolean> {
  try {
    const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").first<{name: string}>();
    return !!row;
  } catch { return false; }
}

async function adminExists(db: D1DatabaseLike): Promise<boolean> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin'").first<{ n: number }>();
  return Number(row?.n || 0) > 0;
}

function secureEqual(a: string, b: string): boolean {
  // Constant-time over UTF-8 bytes for same-length secrets.
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function handleBootstrapRequest(method: string, path: string,
  body: Record<string, unknown>, env: BootstrapEnv): Promise<ApiResponse> {
  if (!env.DB) return { status: 503, data: { error: 'Cloudflare D1 binding DB is missing.' } };
  const ready = await tablesReady(env.DB);

  if (method === 'GET' && path === '/api/bootstrap/status') {
    if (!ready) return { status: 200, data: { database_ready: false, needs_setup: false } };
    return { status: 200, data: { database_ready: true, needs_setup: !(await adminExists(env.DB)) } };
  }

  if (method !== 'POST' || path !== '/api/bootstrap/create')
    return { status: 404, data: { error: 'Not found' } };
  if (!ready) return { status: 503, data: { error: 'Database tables are not initialized. Apply the D1 migrations first.' } };
  if (await adminExists(env.DB))
    return { status: 409, data: { error: 'Super Admin already exists. Initial setup is closed.' } };

  const actualSecret = String(env.BOSS_BOOTSTRAP_SECRET || '');
  const providedSecret = String(body.setup_secret || '');
  if (actualSecret.length < 24) return {
    status: 503,
    data: { error: 'Set BOSS_BOOTSTRAP_SECRET (24+ random characters) as a Cloudflare Worker secret to unlock initial setup.' },
  };
  if (!secureEqual(providedSecret, actualSecret))
    return { status: 403, data: { error: 'Invalid setup secret.' } };

  const employeeId = String(body.employee_id || '').trim().toUpperCase();
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  const officeName = String(body.office_name || '').trim();
  const latitude = Number(body.office_latitude);
  const longitude = Number(body.office_longitude);
  const radius = Number(body.radius ?? 300);
  if (!/^[A-Z0-9_-]{2,32}$/.test(employeeId) || name.length < 2 || name.length > 120)
    return { status: 400, data: { error: 'Enter an Employee ID (2–32 letters/numbers) and your full name.' } };
  if (password.length < 12 || password.length > 128)
    return { status: 400, data: { error: 'Use an administrator password between 12 and 128 characters.' } };
  if (officeName.length < 2 || officeName.length > 100 || !Number.isFinite(latitude)
      || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
      || (latitude === 0 && longitude === 0))
    return { status: 400, data: { error: 'Enter valid office name and GPS coordinates before creating the administrator.' } };
  if (!Number.isInteger(radius) || radius < 50 || radius > 1500)
    return { status: 400, data: { error: 'Set office radius between 50 and 1500 metres.' } };

  const id = 'usr_' + crypto.randomUUID();
  const timestamp = Date.now();
  const hash = await hashPassword(password);
  // D1 batch runs transactionally: neither account nor office setting is
  // partially committed if there is an error.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users
      (id, employee_id, name, role, team, designation, status, joining_date, password_hash, created_at, updated_at)
      SELECT ?, ?, ?, 'super_admin', 'Management', 'Super Admin', 'active', ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'super_admin')`)
      .bind(id, employeeId, name, getDhakaDateString(), hash, timestamp, timestamp),
    env.DB.prepare(`INSERT OR IGNORE INTO office_settings
      (id, company_name, office_name, office_latitude, office_longitude, permitted_radius_meters)
      VALUES ('default', 'Boss', ?, ?, ?, ?)`)
      .bind(officeName, latitude, longitude, radius),
    // Reference data is required for leave management. No demo users or
    // fabricated attendance records are created in production.
    ...[
      ['cat_annual', 'Annual Leave', 14, 1, '#0d9488'],
      ['cat_casual', 'Casual Leave', 10, 1, '#2563eb'],
      ['cat_sick', 'Sick Leave', 10, 1, '#7c3aed'],
      ['cat_emergency', 'Emergency Leave', 5, 1, '#ea580c'],
      ['cat_unpaid', 'Unpaid Leave', 0, 0, '#64748b'],
    ].map(([catId, catName, days, paid, color]) =>
      env.DB.prepare(`INSERT OR IGNORE INTO leave_categories
        (id, name, default_days_per_year, paid, color) VALUES (?, ?, ?, ?, ?)`)
        .bind(catId, catName, days, paid, color)),
  ]);
  const created = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!created) return { status: 409, data: { error: 'Initial setup was already completed by another request.' } };
  return { status: 201, data: { success: true, employee_id: employeeId, message: 'Super Admin created. Sign in with your credentials.' } };
}
