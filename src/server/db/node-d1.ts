import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { Database, Statement } from 'sql.js';
import { D1DatabaseLike, D1PreparedStatementLike, D1Result } from './types.ts';
import { hashPassword } from '../auth/crypto.ts';

class SqlJsPreparedStatement implements D1PreparedStatementLike {
  private query: string;
  private params: unknown[] = [];
  private db: Database;
  private onMutate?: () => void;

  constructor(query: string, db: Database, onMutate?: () => void) {
    this.query = query;
    this.db = db;
    this.onMutate = onMutate;
  }

  bind(...values: unknown[]): D1PreparedStatementLike {
    this.params = values;
    return this;
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const res = await this.all<T>();
    if (!res.results || res.results.length === 0) return null;
    const firstRow = res.results[0] as Record<string, unknown>;
    if (colName && typeof firstRow === 'object') {
      return (firstRow[colName] as T) ?? null;
    }
    return firstRow as T;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    try {
      const stmt: Statement = this.db.prepare(this.query);
      if (this.params && this.params.length > 0) {
        stmt.bind(this.params as (number | string | null | Uint8Array)[]);
      }

      const results: T[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject() as unknown as T);
      }
      stmt.free();

      return {
        results,
        success: true,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('SQL Query Error:', this.query, this.params, errorMsg);
      return {
        results: [],
        success: false,
        error: errorMsg,
      };
    }
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    try {
      this.db.run(this.query, this.params as (number | string | null | Uint8Array)[]);
      if (this.onMutate) {
        this.onMutate();
      }
      return {
        success: true,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('SQL Run Error:', this.query, this.params, errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  async raw<T = unknown>(): Promise<T[]> {
    const res = await this.all<T>();
    return res.results || [];
  }
}

export class NodeD1Database implements D1DatabaseLike {
  private db: Database;
  private filePath: string;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(db: Database, filePath: string) {
    this.db = db;
    this.filePath = filePath;
  }

  private scheduleSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      try {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.filePath, buffer);
      } catch (e) {
        console.error('Failed to persist database to disk:', e);
      }
    }, 200);
  }

  prepare(query: string): D1PreparedStatementLike {
    return new SqlJsPreparedStatement(query, this.db, () => this.scheduleSave());
  }

  async batch<T = unknown>(statements: D1PreparedStatementLike[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    for (const stmt of statements) {
      results.push(await stmt.run<T>());
    }
    this.scheduleSave();
    return results;
  }

  async exec(query: string): Promise<{ count: number; duration: number }> {
    const start = Date.now();
    this.db.exec(query);
    this.scheduleSave();
    return { count: 1, duration: Date.now() - start };
  }
}

let dbInstance: NodeD1Database | null = null;

export async function getOrCreateNodeD1Database(): Promise<NodeD1Database> {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();
  const dataDir = path.resolve('data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'boss.sqlite');
  let db: Database;

  if (fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } catch {
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  const nodeDb = new NodeD1Database(db, dbPath);

  // Apply migrations
  const migrationFile = path.resolve('migrations/0001_initial.sql');
  if (fs.existsSync(migrationFile)) {
    const migrationSql = fs.readFileSync(migrationFile, 'utf8');
    db.exec(migrationSql);
  }

  // Apply the optional account-security migration only once for local development.
  const colNames = db.exec('PRAGMA table_info(sessions)');
  const hasLastActivity = colNames[0]?.values.some(v => v[1] === 'last_activity_at');
  if (!hasLastActivity) {
    const securityMigration = path.resolve('migrations/0002_account_security.sql');
    if (fs.existsSync(securityMigration)) {
      db.exec(fs.readFileSync(securityMigration, 'utf8'));
    }
  }

  // Seed default data if users table is empty
  await seedInitialData(nodeDb);

  dbInstance = nodeDb;
  return nodeDb;
}

async function seedInitialData(db: D1DatabaseLike) {
  const existingUser = await db.prepare('SELECT id FROM users LIMIT 1').first();
  if (existingUser) {
    return; // Already seeded
  }

  console.log('[Boss] Seeding initial database records...');

  // 1. Office Settings
  await db
    .prepare(
      `INSERT OR REPLACE INTO office_settings (
        id, company_name, office_name, office_latitude, office_longitude,
        permitted_radius_meters, max_gps_accuracy_meters, work_start_time,
        work_end_time, scheduled_duration_minutes, grace_period_minutes,
        weekly_holidays, timezone, overtime_policy, half_day_hours
      ) VALUES (
        'default', 'Boss Technologies Ltd', 'Dhaka Headquarters — Gulshan 2',
        23.7925, 90.4078, 300, 100, '11:00', '19:00', 480, 15,
        '["Friday","Saturday"]', 'Asia/Dhaka', 'approval_required', 4.0
      )`
    )
    .run();

  // 2. Leave Categories
  const leaveCategories = [
    { id: 'cat_casual', name: 'Casual Leave', days: 10, paid: 1, color: '#0d9488' },
    { id: 'cat_sick', name: 'Sick Leave', days: 14, paid: 1, color: '#2563eb' },
    { id: 'cat_annual', name: 'Annual Leave', days: 15, paid: 1, color: '#7c3aed' },
    { id: 'cat_emergency', name: 'Emergency Leave', days: 5, paid: 1, color: '#ea580c' },
    { id: 'cat_unpaid', name: 'Unpaid Leave', days: 30, paid: 0, color: '#64748b' },
  ];

  for (const cat of leaveCategories) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO leave_categories (id, name, default_days_per_year, paid, color)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(cat.id, cat.name, cat.days, cat.paid, cat.color)
      .run();
  }

  // 3. Default Users (Pass: "Password@123")
  const defaultPasswordHash = await hashPassword('Password@123');

  const users = [
    {
      id: 'usr_001',
      employee_id: 'EMP001',
      name: 'Md. Rafiqul Islam',
      email: 'admin@boss.internal',
      phone: '+880 1711-000001',
      role: 'super_admin',
      team: 'Executive Leadership',
      designation: 'Chief Operations Officer',
      manager_id: null,
      status: 'active',
      joining_date: '2023-01-01',
    },
    {
      id: 'usr_002',
      employee_id: 'EMP002',
      name: 'Nusrat Jahan',
      email: 'hr@boss.internal',
      phone: '+880 1711-000002',
      role: 'hr_admin',
      team: 'Human Resources',
      designation: 'Senior HR Manager',
      manager_id: 'usr_001',
      status: 'active',
      joining_date: '2023-03-15',
    },
    {
      id: 'usr_003',
      employee_id: 'EMP003',
      name: 'Tanvir Ahmed',
      email: 'manager@boss.internal',
      phone: '+880 1711-000003',
      role: 'team_manager',
      team: 'Software Engineering',
      designation: 'Engineering Lead',
      manager_id: 'usr_001',
      status: 'active',
      joining_date: '2023-06-01',
    },
    {
      id: 'usr_004',
      employee_id: 'EMP004',
      name: 'Farhan Kabir',
      email: 'farhan@boss.internal',
      phone: '+880 1711-000004',
      role: 'employee',
      team: 'Software Engineering',
      designation: 'Frontend Developer',
      manager_id: 'usr_003',
      status: 'active',
      joining_date: '2024-01-10',
    },
    {
      id: 'usr_005',
      employee_id: 'EMP005',
      name: 'Sabrina Yasmin',
      email: 'sabrina@boss.internal',
      phone: '+880 1711-000005',
      role: 'employee',
      team: 'Product & Design',
      designation: 'UI/UX Designer',
      manager_id: 'usr_003',
      status: 'active',
      joining_date: '2024-02-01',
    },
  ];

  const currentYear = new Date().getFullYear();

  for (const u of users) {
    await db
      .prepare(
        `INSERT INTO users (
          id, employee_id, name, email, phone, role, team,
          designation, manager_id, status, joining_date, password_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        u.id,
        u.employee_id,
        u.name,
        u.email,
        u.phone,
        u.role,
        u.team,
        u.designation,
        u.manager_id,
        u.status,
        u.joining_date,
        defaultPasswordHash
      )
      .run();

    // Assign initial leave balances for 2026
    for (const cat of leaveCategories) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO leave_balances (id, user_id, category_id, year, allocated_days, used_days, pending_days)
           VALUES (?, ?, ?, ?, ?, 0, 0)`
        )
        .bind(`bal_${u.id}_${cat.id}_${currentYear}`, u.id, cat.id, currentYear, cat.days)
        .run();
    }
  }

  // 4. Bangladesh Public & National Holidays (2026)
  const holidays = [
    { id: 'hol_01', name: 'International Mother Language Day (Shaheed Dibosh)', date: '2026-02-21', desc: 'National Holiday' },
    { id: 'hol_02', name: 'Independence & National Day', date: '2026-03-26', desc: 'National Holiday' },
    { id: 'hol_03', name: 'Eid-ul-Fitr (Day 1)', date: '2026-03-20', desc: 'Islamic Holiday' },
    { id: 'hol_04', name: 'Eid-ul-Fitr (Day 2)', date: '2026-03-21', desc: 'Islamic Holiday' },
    { id: 'hol_05', name: 'Pohela Boishakh (Bengali New Year)', date: '2026-04-14', desc: 'Traditional Cultural Festival' },
    { id: 'hol_06', name: 'May Day (Labor Day)', date: '2026-05-01', desc: 'International Workers Day' },
    { id: 'hol_07', name: 'Eid-ul-Adha (Day 1)', date: '2026-05-27', desc: 'Islamic Holiday' },
    { id: 'hol_08', name: 'Eid-ul-Adha (Day 2)', date: '2026-05-28', desc: 'Islamic Holiday' },
    { id: 'hol_09', name: 'Ashura', date: '2026-06-26', desc: 'Religious Holiday' },
    { id: 'hol_10', name: 'National Mourning Day', date: '2026-08-15', desc: 'National Observance' },
    { id: 'hol_11', name: 'Durga Puja (Bijoya Dashami)', date: '2026-10-21', desc: 'Hindu Festival' },
    { id: 'hol_12', name: 'Victory Day (Bijoy Dibosh)', date: '2026-12-16', desc: 'National Holiday' },
    { id: 'hol_13', name: 'Christmas Day', date: '2026-12-25', desc: 'Christian Holiday' },
  ];

  for (const h of holidays) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO holidays (id, name, date, is_full_day, applicable_office, description)
         VALUES (?, ?, ?, 1, 'all', ?)`
      )
      .bind(h.id, h.name, h.date, h.desc)
      .run();
  }

  console.log('[Boss] Seeding completed successfully!');
}
