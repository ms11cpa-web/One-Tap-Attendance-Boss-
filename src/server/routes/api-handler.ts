import { D1DatabaseLike } from '../db/types.ts';
import { hashPassword, verifyPassword, generateSessionToken } from '../auth/crypto.ts';
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } from '../auth/recovery.ts';
import {
  getDhakaNow,
  getDhakaDateString,
  getDhakaTimeString,
  getDhakaDayOfWeek,
  calculateLateness,
  calculateExtraMinutes,
  calculateElapsedMinutes,
  parseHHMMToMinutes,
} from '../utils/time.ts';
import { verifyLocationGeofence } from '../utils/geo.ts';
import { generateBossExcelWorkbook } from '../reports/excel.ts';

export const REMEMBER_IDLE_MS = 20 * 24 * 60 * 60 * 1000;
export const SHORT_SESSION_MS = 12 * 60 * 60 * 1000;

export interface RequestContext {
  token?: string;
  ip?: string;
}

export interface UserSession {
  id: string;
  employee_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'super_admin' | 'hr_admin' | 'team_manager' | 'employee';
  team: string;
  designation: string;
  manager_id: string | null;
  status: string;
  joining_date: string;
}

export async function getUserFromSession(
  db: D1DatabaseLike,
  token?: string
): Promise<UserSession | null> {
  if (!token) return null;

  const storedTokenHash = await hashRecoveryCode(token);
  const sessionRow = await db
    .prepare(
      `SELECT s.user_id, s.expires_at, u.id, u.employee_id, u.name, u.email,
              u.phone, u.role, u.team, u.designation, u.manager_id, u.status, u.joining_date
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE (s.id = ? OR s.id = ?) AND s.expires_at > ?`
    )
    .bind(storedTokenHash, token, Date.now())
    .first<Record<string, unknown>>();

  if (!sessionRow || sessionRow.status !== 'active') {
    return null;
  }

  return {
    id: String(sessionRow.id),
    employee_id: String(sessionRow.employee_id),
    name: String(sessionRow.name),
    email: sessionRow.email ? String(sessionRow.email) : null,
    phone: sessionRow.phone ? String(sessionRow.phone) : null,
    role: sessionRow.role as UserSession['role'],
    team: String(sessionRow.team),
    designation: String(sessionRow.designation),
    manager_id: sessionRow.manager_id ? String(sessionRow.manager_id) : null,
    status: String(sessionRow.status),
    joining_date: String(sessionRow.joining_date),
  };
}

export async function logAudit(
  db: D1DatabaseLike,
  user: UserSession | null,
  action: string,
  resourceType: string,
  resourceId: string | null,
  details: Record<string, unknown>,
  ip = '127.0.0.1'
) {
  const logId = 'aud_' + Math.random().toString(36).substring(2, 11);
  await db
    .prepare(
      `INSERT INTO audit_logs (id, user_id, user_name, action, resource_type, resource_id, details, ip_address, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      logId,
      user ? user.id : 'system',
      user ? user.name : 'System',
      action,
      resourceType,
      resourceId,
      JSON.stringify(details),
      ip,
      Date.now()
    )
    .run();
}

/**
 * Main Universal API Request Router
 */
export async function handleApiRequest(
  method: string,
  urlPath: string,
  query: Record<string, string>,
  body: Record<string, unknown>,
  context: RequestContext,
  db: D1DatabaseLike
): Promise<{ status: number; data?: unknown; headers?: Record<string, string>; binary?: Uint8Array }> {
  const normalizedMethod = method.toUpperCase() === 'HEAD' ? 'GET' : method.toUpperCase();
  const user = await getUserFromSession(db, context.token);

  // -------------------------------------------------------------
  // AUTH ROUTES (PUBLIC & ME)
  // -------------------------------------------------------------
  if (urlPath === '/api/auth/login' && normalizedMethod === 'POST') {
    const employeeId = String(body.employee_id || '').trim().toUpperCase();
    const password = String(body.password || '');

    if (!employeeId || !password) {
      return { status: 400, data: { error: 'Please enter both Employee ID and password.' } };
    }

    const userRow = await db
      .prepare('SELECT * FROM users WHERE UPPER(employee_id) = ?')
      .bind(employeeId)
      .first<Record<string, unknown>>();

    if (!userRow) {
      return { status: 401, data: { error: 'Invalid Employee ID or password.' } };
    }

    if (userRow.status !== 'active') {
      return { status: 403, data: { error: 'Account is deactivated. Please contact your administrator.' } };
    }

    const isValid = await verifyPassword(password, String(userRow.password_hash));
    if (!isValid) {
      return { status: 401, data: { error: 'Invalid Employee ID or password.' } };
    }

    const rememberDevice = body.remember_device === true;
    const token = generateSessionToken();
    const now = Date.now();
    const expiresAt = now + (rememberDevice ? REMEMBER_IDLE_MS : SHORT_SESSION_MS);
    await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();
    await db
      .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at, last_activity_at, remember_device) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(await hashRecoveryCode(token), userRow.id, expiresAt, now, now, rememberDevice ? 1 : 0)
      .run();

    await logAudit(
      db,
      {
        id: String(userRow.id),
        employee_id: String(userRow.employee_id),
        name: String(userRow.name),
        email: userRow.email ? String(userRow.email) : null,
        phone: userRow.phone ? String(userRow.phone) : null,
        role: userRow.role as UserSession['role'],
        team: String(userRow.team),
        designation: String(userRow.designation),
        manager_id: null,
        status: 'active',
        joining_date: String(userRow.joining_date),
      },
      'LOGIN',
      'auth',
      String(userRow.id),
      { employee_id: userRow.employee_id },
      context.ip
    );

    const settings = await db.prepare(`SELECT * FROM office_settings WHERE id = 'default'`).first();

    return {
      status: 200,
      headers: {
        'Set-Cookie': `boss_session=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${Math.floor((expiresAt - now) / 1000)}`,
      },
      data: {
        success: true,
        settings,
        user: {
          id: userRow.id,
          employee_id: userRow.employee_id,
          name: userRow.name,
          email: userRow.email,
          phone: userRow.phone,
          role: userRow.role,
          team: userRow.team,
          designation: userRow.designation,
          joining_date: userRow.joining_date,
        },
      },
    };
  }

  if (urlPath === '/api/auth/logout' && normalizedMethod === 'POST') {
    if (context.token) {
      await db.prepare('DELETE FROM sessions WHERE id = ? OR id = ?')
        .bind(await hashRecoveryCode(context.token), context.token).run();
    }
    return {
      status: 200,
      headers: {
        'Set-Cookie': 'boss_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0',
      },
      data: { success: true },
    };
  }

  if (urlPath === '/api/auth/me' && normalizedMethod === 'GET') {
    if (!user) {
      return { status: 401, data: { error: 'Unauthenticated' } };
    }

    const settings = await db.prepare(`SELECT * FROM office_settings WHERE id = 'default'`).first();

    return {
      status: 200,
      data: {
        user,
        settings,
      },
    };
  }

  if (urlPath === '/api/auth/change-password' && normalizedMethod === 'POST') {
    if (!user) return { status: 401, data: { error: 'Unauthenticated' } };

    const currentPassword = String(body.current_password || '');
    const newPassword = String(body.new_password || '');

    if (!currentPassword || !newPassword || newPassword.length < 12) {
      return { status: 400, data: { error: 'New password must be at least 12 characters long.' } };
    }

    const userRow = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>();
    if (!userRow) return { status: 404, data: { error: 'User not found' } };

    const isMatch = await verifyPassword(currentPassword, userRow.password_hash);
    if (!isMatch) {
      return { status: 400, data: { error: 'Current password does not match.' } };
    }

    const newHash = await hashPassword(newPassword);
    await db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(newHash, Date.now(), user.id)
      .run();

    await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
    await logAudit(db, user, 'PASSWORD_CHANGE', 'user', user.id, { employee_id: user.employee_id }, context.ip);

    return { status: 200, data: { success: true, message: 'Password updated successfully.' } };
  }

  // Admin password recovery uses separately issued, single-use offline codes.
  // Unknown accounts and incorrect codes receive the same response.
  if (urlPath === '/api/auth/recovery/reset' && normalizedMethod === 'POST') {
    const employeeId = String(body.employee_id || '').trim().toUpperCase();
    const code = normalizeRecoveryCode(String(body.recovery_code || ''));
    const newPassword = String(body.new_password || '');
    if (!employeeId || code.length < 20 || newPassword.length < 12 || newPassword.length > 256) {
      return { status: 400, data: { error: 'Enter your admin ID, recovery code and a new password of at least 12 characters.' } };
    }
    const target = await db.prepare(`SELECT id, role, status FROM users WHERE UPPER(employee_id) = ?`)
      .bind(employeeId).first<{ id: string; role: string; status: string }>();
    const invalid = { status: 400, data: { error: 'Recovery failed. Check the code or contact another Super Admin.' } };
    if (!target || target.status !== 'active' || !['super_admin', 'hr_admin'].includes(target.role)) return invalid;

    const now = Date.now();
    const attempt = await db.prepare('SELECT attempts, locked_until FROM admin_recovery_attempts WHERE user_id = ?')
      .bind(target.id).first<{attempts:number;locked_until:number}>();
    if (attempt && Number(attempt.locked_until) > now) {
      return { status: 429, data: { error: 'Too many attempts. Wait 15 minutes before trying again.' } };
    }
    const codeHash = await hashRecoveryCode(code);
    const found = await db.prepare('SELECT id FROM admin_recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL')
      .bind(target.id, codeHash).first<{ id: string }>();
    if (!found) {
      const next = (attempt && Number(attempt.locked_until) > 0 && Number(attempt.locked_until) <= now)
        ? 1 : (Number(attempt?.attempts || 0) + 1);
      await db.prepare(`INSERT INTO admin_recovery_attempts (user_id, attempts, locked_until) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET attempts = excluded.attempts, locked_until = excluded.locked_until`)
        .bind(target.id, next, next >= 5 ? now + 15 * 60 * 1000 : 0).run();
      return invalid;
    }
    const passwordHash = await hashPassword(newPassword);
    // Conditional code consumption prevents two concurrent requests using the same code.
    const updated = await db.prepare(`UPDATE admin_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL`)
      .bind(now, found.id).run();
    if (updated.meta?.changes !== undefined && Number(updated.meta.changes) !== 1) return invalid;
    await db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(passwordHash, now, target.id).run();
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id).run();
    await db.prepare('DELETE FROM admin_recovery_attempts WHERE user_id = ?').bind(target.id).run();
    await logAudit(db, null, 'ADMIN_RECOVERY_RESET', 'user', target.id, { employee_id: employeeId }, context.ip);
    return { status: 200, data: { success: true, message: 'Password updated. Sign in with your new password.' } };
  }

  // From here down, require valid user session
  if (!user) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  if (urlPath === '/api/auth/activity' && normalizedMethod === 'POST') {
    return { status: 200, data: { success: true } };
  }

  if (urlPath === '/api/auth/recovery/status' && normalizedMethod === 'GET') {
    if (!['super_admin', 'hr_admin'].includes(user.role)) return { status: 403, data: { error: 'Only administrators have recovery codes.' } };
    const count = await db.prepare('SELECT COUNT(*) AS count FROM admin_recovery_codes WHERE user_id = ? AND used_at IS NULL')
      .bind(user.id).first<{ count: number }>();
    return { status: 200, data: { remaining: Number(count?.count || 0) } };
  }

  if (urlPath === '/api/auth/recovery/generate' && normalizedMethod === 'POST') {
    if (!['super_admin', 'hr_admin'].includes(user.role)) return { status: 403, data: { error: 'Only administrators have recovery codes.' } };
    const password = String(body.current_password || '');
    const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>();
    if (!row || !await verifyPassword(password, row.password_hash)) return { status: 403, data: { error: 'Current password is incorrect.' } };
    const codes = generateRecoveryCodes(10);
    const statements = [db.prepare('DELETE FROM admin_recovery_codes WHERE user_id = ?').bind(user.id)];
    for (const code of codes) {
      statements.push(db.prepare('INSERT INTO admin_recovery_codes (id, user_id, code_hash, created_at) VALUES (?, ?, ?, ?)')
        .bind('rec_' + crypto.randomUUID(), user.id, await hashRecoveryCode(normalizeRecoveryCode(code)), Date.now()));
    }
    await db.batch(statements);
    await logAudit(db, user, 'RECOVERY_CODES_REGENERATED', 'user', user.id, { count: codes.length }, context.ip);
    return { status: 200, data: { codes, message: 'Store these codes safely. They will not be displayed again.' } };
  }

  if (urlPath === '/api/auth/logout-all' && normalizedMethod === 'POST') {
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
    await logAudit(db, user, 'LOGOUT_ALL_DEVICES', 'user', user.id, {}, context.ip);
    return { status: 200, headers: { 'Set-Cookie': 'boss_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0' }, data: { success: true } };
  }

  // -------------------------------------------------------------
  // ATTENDANCE: TODAY & PUNCH IN / OUT
  // -------------------------------------------------------------
  const todayDateStr = getDhakaDateString();
  const dayOfWeek = getDhakaDayOfWeek(todayDateStr);

  if (urlPath === '/api/attendance/today' && normalizedMethod === 'GET') {
    const settings = (await db.prepare(`SELECT * FROM office_settings WHERE id = 'default'`).first<Record<string, unknown>>()) || {
      office_latitude: 23.7925,
      office_longitude: 90.4078,
      permitted_radius_meters: 300,
      max_gps_accuracy_meters: 100,
      work_start_time: '11:00',
      work_end_time: '19:00',
      grace_period_minutes: 15,
      weekly_holidays: '["Friday","Saturday"]',
    };

    // Check if user has approved remote work for today
    const remoteReq = await db
      .prepare(`SELECT id, status FROM remote_requests WHERE user_id = ? AND request_date = ? AND status = 'approved'`)
      .bind(user.id, todayDateStr)
      .first();

    const isRemoteApproved = !!remoteReq;

    // Check today's attendance record
    const attendance = await db
      .prepare('SELECT * FROM attendance_records WHERE user_id = ? AND attendance_date = ?')
      .bind(user.id, todayDateStr)
      .first<Record<string, unknown>>();

    // Check if today is a holiday
    const holiday = await db
      .prepare('SELECT * FROM holidays WHERE date <= ? AND COALESCE(end_date, date) >= ? ORDER BY date ASC LIMIT 1')
      .bind(todayDateStr, todayDateStr)
      .first();

    // Check if today is weekly off
    const weeklyOffList: string[] = JSON.parse(String(settings.weekly_holidays || '[]'));
    const isWeeklyOff = weeklyOffList.includes(dayOfWeek);

    return {
      status: 200,
      data: {
        date: todayDateStr,
        dayName: dayOfWeek,
        isRemoteApproved,
        isHoliday: !!holiday,
        holidayName: holiday ? (holiday as { name: string }).name : null,
        isWeeklyOff,
        attendance: attendance || null,
        settings: {
          office_name: settings.office_name,
          office_latitude: settings.office_latitude,
          office_longitude: settings.office_longitude,
          permitted_radius_meters: settings.permitted_radius_meters,
          max_gps_accuracy_meters: settings.max_gps_accuracy_meters,
          work_start_time: settings.work_start_time,
          work_end_time: settings.work_end_time,
          grace_period_minutes: settings.grace_period_minutes,
        },
      },
    };
  }

  // PUNCH IN
  if (urlPath === '/api/attendance/punch-in' && normalizedMethod === 'POST') {
    const settings = (await db.prepare(`SELECT * FROM office_settings WHERE id = 'default'`).first<Record<string, unknown>>()) || {
      office_latitude: 23.7925,
      office_longitude: 90.4078,
      permitted_radius_meters: 300,
      max_gps_accuracy_meters: 100,
      work_start_time: '11:00',
      work_end_time: '19:00',
      grace_period_minutes: 15,
    };

    // Check for existing punch-in today
    const existing = await db
      .prepare('SELECT * FROM attendance_records WHERE user_id = ? AND attendance_date = ?')
      .bind(user.id, todayDateStr)
      .first<Record<string, unknown>>();

    if (existing && existing.in_time) {
      return {
        status: 400,
        data: {
          error: `Office IN has already been marked for today at ${existing.in_time}. Duplicate entries are prohibited.`,
        },
      };
    }

    const workMode = (body.work_mode === 'remote') ? 'remote' : 'office';
    let distanceMeters = 0;
    let accuracyMeters = Number(body.accuracy) || 0;
    const userLat = Number(body.latitude);
    const userLon = Number(body.longitude);

    if (workMode === 'office') {
      const officeLat = Number(settings.office_latitude);
      const officeLon = Number(settings.office_longitude);
      const maxRadius = Number(settings.permitted_radius_meters) || 300;
      const maxAccuracy = Number(settings.max_gps_accuracy_meters) || 100;

      const geoCheck = verifyLocationGeofence(
        userLat,
        userLon,
        accuracyMeters,
        officeLat,
        officeLon,
        maxRadius,
        maxAccuracy
      );

      if (!geoCheck.allowed) {
        return {
          status: 400,
          data: {
            error: geoCheck.message || 'Geofence check failed.',
            distanceMeters: geoCheck.distanceMeters,
            permittedRadius: maxRadius,
          },
        };
      }
      distanceMeters = geoCheck.distanceMeters;
    } else {
      // Must have approved remote request
      const approvedRemote = await db
        .prepare(`SELECT id FROM remote_requests WHERE user_id = ? AND request_date = ? AND status = 'approved'`)
        .bind(user.id, todayDateStr)
        .first();

      if (!approvedRemote) {
        return {
          status: 403,
          data: {
            error: 'Remote attendance requires an approved remote work request for today.',
          },
        };
      }
    }

    // Trusted server time in Asia/Dhaka
    const inTime = getDhakaTimeString();
    const inTimestamp = Date.now();
    const lateMinutes = calculateLateness(
      inTime,
      String(settings.work_start_time || '11:00'),
      Number(settings.grace_period_minutes) || 15
    );

    const initialStatus = lateMinutes > 0 ? 'late' : 'present';
    const recordId = 'att_' + user.id + '_' + todayDateStr.replace(/-/g, '');

    const scheduleSnapshot = JSON.stringify({
      work_start_time: settings.work_start_time,
      work_end_time: settings.work_end_time,
      grace_period_minutes: settings.grace_period_minutes,
      scheduled_duration_minutes: settings.scheduled_duration_minutes,
    });

    try {
      await db
        .prepare(
          `INSERT INTO attendance_records (
            id, user_id, attendance_date, work_mode, in_time, in_timestamp,
            in_latitude, in_longitude, in_distance_meters, in_accuracy_meters,
            in_verified, late_minutes, status, schedule_snapshot, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
        )
        .bind(
          recordId,
          user.id,
          todayDateStr,
          workMode,
          inTime,
          inTimestamp,
          workMode === 'office' ? userLat : null,
          workMode === 'office' ? userLon : null,
          distanceMeters,
          accuracyMeters,
          lateMinutes,
          initialStatus,
          scheduleSnapshot,
          Date.now(),
          Date.now()
        )
        .run();

      await logAudit(
        db,
        user,
        'PUNCH_IN',
        'attendance',
        recordId,
        { in_time: inTime, work_mode: workMode, distanceMeters, lateMinutes },
        context.ip
      );

      return {
        status: 200,
        data: {
          success: true,
          message: `${workMode === 'remote' ? 'Remote' : 'Office'} IN successful — ${inTime}`,
          inTime,
          distanceMeters,
          lateMinutes,
          status: initialStatus,
        },
      };
    } catch (err: unknown) {
      console.error('Punch in insert error:', err);
      return {
        status: 400,
        data: { error: 'Attendance punch-in could not be recorded or already recorded for today.' },
      };
    }
  }

  // PUNCH OUT
  if (urlPath === '/api/attendance/punch-out' && normalizedMethod === 'POST') {
    const settings = (await db.prepare(`SELECT * FROM office_settings WHERE id = 'default'`).first<Record<string, unknown>>()) || {
      office_latitude: 23.7925,
      office_longitude: 90.4078,
      permitted_radius_meters: 300,
      max_gps_accuracy_meters: 100,
      work_start_time: '11:00',
      work_end_time: '19:00',
      scheduled_duration_minutes: 480,
    };

    const existing = await db
      .prepare('SELECT * FROM attendance_records WHERE user_id = ? AND attendance_date = ?')
      .bind(user.id, todayDateStr)
      .first<Record<string, unknown>>();

    if (!existing || !existing.in_time) {
      return {
        status: 400,
        data: { error: 'Cannot mark Office OUT without marking Office IN first.' },
      };
    }

    if (existing.out_time) {
      return {
        status: 400,
        data: { error: `Office OUT has already been marked for today at ${existing.out_time}.` },
      };
    }

    const workMode = existing.work_mode as string;
    let distanceMeters = 0;
    const accuracyMeters = Number(body.accuracy) || 0;
    const userLat = Number(body.latitude);
    const userLon = Number(body.longitude);

    if (workMode === 'office') {
      const officeLat = Number(settings.office_latitude);
      const officeLon = Number(settings.office_longitude);
      const maxRadius = Number(settings.permitted_radius_meters) || 300;
      const maxAccuracy = Number(settings.max_gps_accuracy_meters) || 100;

      const geoCheck = verifyLocationGeofence(
        userLat,
        userLon,
        accuracyMeters,
        officeLat,
        officeLon,
        maxRadius,
        maxAccuracy
      );

      if (!geoCheck.allowed) {
        return {
          status: 400,
          data: {
            error: geoCheck.message || 'Geofence verification failed.',
            distanceMeters: geoCheck.distanceMeters,
          },
        };
      }
      distanceMeters = geoCheck.distanceMeters;
    }

    const outTime = getDhakaTimeString();
    const outTimestamp = Date.now();
    const inTime = String(existing.in_time);

    const totalDurationMinutes = calculateElapsedMinutes(inTime, outTime);
    const extraMinutes = calculateExtraMinutes(outTime, String(settings.work_end_time || '19:00'));
    const scheduledTotal = Number(settings.scheduled_duration_minutes) || 480;
    const shortfallMinutes = Math.max(0, scheduledTotal - totalDurationMinutes);

    // Determine final daily status
    let finalStatus = existing.status;
    if (totalDurationMinutes < 240) {
      finalStatus = 'half_day';
    } else if (existing.late_minutes && Number(existing.late_minutes) > 0) {
      finalStatus = 'late';
    } else {
      finalStatus = 'present';
    }

    await db
      .prepare(
        `UPDATE attendance_records
         SET out_time = ?, out_timestamp = ?, out_latitude = ?, out_longitude = ?,
             out_distance_meters = ?, out_accuracy_meters = ?, out_verified = 1,
             total_duration_minutes = ?, extra_minutes = ?, shortfall_minutes = ?,
             status = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        outTime,
        outTimestamp,
        workMode === 'office' ? userLat : null,
        workMode === 'office' ? userLon : null,
        distanceMeters,
        accuracyMeters,
        totalDurationMinutes,
        extraMinutes,
        shortfallMinutes,
        finalStatus,
        Date.now(),
        existing.id
      )
      .run();

    await logAudit(
      db,
      user,
      'PUNCH_OUT',
      'attendance',
      String(existing.id),
      { out_time: outTime, totalDurationMinutes, extraMinutes },
      context.ip
    );

    return {
      status: 200,
      data: {
        success: true,
        message: `${workMode === 'remote' ? 'Remote' : 'Office'} OUT successful — ${outTime}`,
        outTime,
        totalDurationMinutes,
        extraMinutes,
        status: finalStatus,
      },
    };
  }

  // -------------------------------------------------------------
  // ATTENDANCE: HISTORY & CALENDAR
  // -------------------------------------------------------------
  if (urlPath === '/api/attendance/history' && normalizedMethod === 'GET') {
    let sql = `
      SELECT a.*, u.employee_id, u.name as employee_name, u.team, u.designation
      FROM attendance_records a
      JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    // Role restrictions
    if (user.role === 'employee') {
      sql += ' AND a.user_id = ?';
      params.push(user.id);
    } else if (user.role === 'team_manager') {
      sql += ' AND (u.team = ? OR a.user_id = ?)';
      params.push(user.team, user.id);
    } else {
      // Super admin & HR Admin can filter by userId or team
      if (query.userId) {
        sql += ' AND a.user_id = ?';
        params.push(query.userId);
      }
      if (query.team) {
        sql += ' AND u.team = ?';
        params.push(query.team);
      }
    }

    if (query.startDate) {
      sql += ' AND a.attendance_date >= ?';
      params.push(query.startDate);
    }
    if (query.endDate) {
      sql += ' AND a.attendance_date <= ?';
      params.push(query.endDate);
    }
    if (query.status) {
      sql += ' AND a.status = ?';
      params.push(query.status);
    }

    sql += ' ORDER BY a.attendance_date DESC, a.in_time DESC LIMIT 100';

    const records = await db.prepare(sql).bind(...params).all();

    return {
      status: 200,
      data: { records: records.results || [] },
    };
  }

  if (urlPath === '/api/attendance/calendar' && normalizedMethod === 'GET') {
    const targetUserId = (user.role === 'super_admin' || user.role === 'hr_admin' || user.role === 'team_manager') && query.userId
      ? query.userId
      : user.id;

    const targetUser = await db.prepare('SELECT * FROM users WHERE id = ?').bind(targetUserId).first<Record<string, unknown>>();
    if (!targetUser) {
      return { status: 404, data: { error: 'Employee not found' } };
    }

    const yearMonth = query.month || todayDateStr.substring(0, 7); // e.g. "2026-10"
    const startDate = `${yearMonth}-01`;
    const [y, m] = yearMonth.split('-').map(Number);
    const lastDayOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const endDate = `${yearMonth}-${String(lastDayOfMonth).padStart(2, '0')}`;

    const settings = (await db.prepare(`SELECT weekly_holidays FROM office_settings WHERE id = 'default'`).first<Record<string, unknown>>()) || {
      weekly_holidays: '["Friday","Saturday"]',
    };
    const weeklyHolidays: string[] = JSON.parse(String(settings.weekly_holidays || '[]'));

    // Fetch attendance for month
    const attList = (await db
      .prepare('SELECT * FROM attendance_records WHERE user_id = ? AND attendance_date >= ? AND attendance_date <= ?')
      .bind(targetUserId, startDate, endDate)
      .all<Record<string, unknown>>()).results || [];
    const attMap = new Map<string, Record<string, unknown>>(attList.map(r => [String(r.attendance_date), r]));

    // Fetch approved leaves
    const leaveList = (await db
      .prepare(`
        SELECT lr.*, lc.name as category_name, lc.color
        FROM leave_requests lr
        JOIN leave_categories lc ON lr.category_id = lc.id
        WHERE lr.user_id = ? AND lr.status = 'approved'
          AND ((lr.start_date <= ? AND lr.end_date >= ?) OR (lr.start_date >= ? AND lr.start_date <= ?))
      `)
      .bind(targetUserId, endDate, startDate, startDate, endDate)
      .all<Record<string, unknown>>()).results || [];

    // Fetch holidays
    const holidayList = (await db
      .prepare('SELECT * FROM holidays WHERE date <= ? AND COALESCE(end_date, date) >= ? ORDER BY date ASC')
      .bind(endDate, startDate)
      .all<Record<string, unknown>>()).results || [];

    const days = [];
    const joiningDate = String(targetUser.joining_date);

    for (let d = 1; d <= lastDayOfMonth; d++) {
      const dayDateStr = `${yearMonth}-${String(d).padStart(2, '0')}`;
      const dayName = getDhakaDayOfWeek(dayDateStr);
      const isPast = dayDateStr < todayDateStr;
      const isToday = dayDateStr === todayDateStr;
      const isFuture = dayDateStr > todayDateStr;
      const isEmployed = dayDateStr >= joiningDate;

      const att = attMap.get(dayDateStr);
      const hol = holidayList.find(h =>
        dayDateStr >= String(h.date) && dayDateStr <= String(h.end_date || h.date)
      );
      const isWeeklyOff = weeklyHolidays.includes(dayName);

      // Check leave
      const leave = leaveList.find(l => dayDateStr >= String(l.start_date) && dayDateStr <= String(l.end_date));

      let dayStatus: 'present' | 'late' | 'remote' | 'half_day' | 'leave' | 'holiday' | 'weekly_off' | 'missing_out' | 'absent' | 'future' | 'not_employed' = 'future';
      let title = '';

      if (!isEmployed) {
        dayStatus = 'not_employed';
        title = 'Before Joining Date';
      } else if (isFuture) {
        if (hol) {
          dayStatus = 'holiday';
          title = String(hol.name);
        } else if (isWeeklyOff) {
          dayStatus = 'weekly_off';
          title = 'Weekly Off';
        } else {
          dayStatus = 'future';
        }
      } else if (att) {
        if (att.out_time === null && !isToday) {
          dayStatus = 'missing_out';
          title = 'Missing OUT';
        } else if (att.work_mode === 'remote') {
          dayStatus = 'remote';
          title = 'Remote Work';
        } else if (att.status === 'half_day') {
          dayStatus = 'half_day';
          title = 'Half Day';
        } else if (att.status === 'late') {
          dayStatus = 'late';
          title = `Late (${att.late_minutes}m)`;
        } else {
          dayStatus = 'present';
          title = 'Present';
        }
      } else if (leave) {
        dayStatus = 'leave';
        title = `${leave.category_name} (${leave.is_half_day ? 'Half Day' : 'Full Day'})`;
      } else if (hol) {
        dayStatus = 'holiday';
        title = String(hol.name);
      } else if (isWeeklyOff) {
        dayStatus = 'weekly_off';
        title = 'Weekly Off';
      } else {
        // Active employee, past date, no attendance, no leave, not holiday, not weekend
        dayStatus = isToday ? 'present' : 'absent';
        title = isToday ? 'Pending Punch-in' : 'Absent';
      }

      days.push({
        date: dayDateStr,
        dayNumber: d,
        dayName,
        status: dayStatus,
        title,
        attendance: att || null,
        holiday: hol || null,
        leave: leave || null,
      });
    }

    return {
      status: 200,
      data: {
        month: yearMonth,
        employee: { id: targetUser.id, name: targetUser.name, employee_id: targetUser.employee_id },
        days,
      },
    };
  }

  // -------------------------------------------------------------
  // DASHBOARD SUMMARY
  // -------------------------------------------------------------
  if (urlPath === '/api/dashboard/summary' && normalizedMethod === 'GET') {
    // 1. Employee personal monthly stats
    const monthPrefix = todayDateStr.substring(0, 7);
    const personalAtt = (await db
      .prepare('SELECT * FROM attendance_records WHERE user_id = ? AND attendance_date LIKE ?')
      .bind(user.id, `${monthPrefix}%`)
      .all<Record<string, unknown>>()).results || [];

    let personalOfficeDays = 0;
    let personalRemoteDays = 0;
    let personalLateDays = 0;
    let personalMinutes = 0;

    for (const p of personalAtt) {
      if (p.work_mode === 'office') personalOfficeDays++;
      if (p.work_mode === 'remote') personalRemoteDays++;
      if (Number(p.late_minutes) > 0) personalLateDays++;
      personalMinutes += Number(p.total_duration_minutes) || 0;
    }

    // Leave balances for current user
    const leaveBalances = (await db
      .prepare(`
        SELECT lb.*, lc.name, lc.color, lc.default_days_per_year
        FROM leave_balances lb
        JOIN leave_categories lc ON lb.category_id = lc.id
        WHERE lb.user_id = ? AND lb.year = ?
      `)
      .bind(user.id, new Date().getFullYear())
      .all<Record<string, unknown>>()).results || [];

    // Admin / Manager Company-wide Stats
    let companySummary = null;
    if (user.role !== 'employee') {
      const activeEmpCount = await db
        .prepare(`SELECT COUNT(*) as count FROM users WHERE status = 'active'`)
        .first<{ count: number }>();

      // Attendance today
      const todayAtt = (await db
        .prepare('SELECT * FROM attendance_records WHERE attendance_date = ?')
        .bind(todayDateStr)
        .all<Record<string, unknown>>()).results || [];

      const officeToday = todayAtt.filter(r => r.work_mode === 'office').length;
      const remoteToday = todayAtt.filter(r => r.work_mode === 'remote').length;
      const lateToday = todayAtt.filter(r => Number(r.late_minutes) > 0).length;
      const missingCheckout = todayAtt.filter(r => r.in_time && !r.out_time).length;

      // Leaves today
      const onLeaveToday = await db
        .prepare(`SELECT COUNT(*) as count FROM leave_requests WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`)
        .bind(todayDateStr, todayDateStr)
        .first<{ count: number }>();

      // Pending Approvals
      const pendingLeave = await db.prepare(`SELECT COUNT(*) as count FROM leave_requests WHERE status = 'pending'`).first<{ count: number }>();
      const pendingRemote = await db.prepare(`SELECT COUNT(*) as count FROM remote_requests WHERE status = 'pending'`).first<{ count: number }>();
      const pendingCorrections = await db.prepare(`SELECT COUNT(*) as count FROM attendance_corrections WHERE status = 'pending'`).first<{ count: number }>();

      const totalActive = activeEmpCount ? activeEmpCount.count : 0;
      const presentCount = todayAtt.length;
      const leaveCount = onLeaveToday ? onLeaveToday.count : 0;
      const absentCount = Math.max(0, totalActive - presentCount - leaveCount);

      companySummary = {
        totalEmployees: totalActive,
        presentToday: presentCount,
        officeAttendees: officeToday,
        remoteAttendees: remoteToday,
        lateArrivals: lateToday,
        onLeave: leaveCount,
        absentToday: absentCount,
        missingCheckouts: missingCheckout,
        pendingApprovals: {
          leave: pendingLeave ? pendingLeave.count : 0,
          remote: pendingRemote ? pendingRemote.count : 0,
          corrections: pendingCorrections ? pendingCorrections.count : 0,
          total: (pendingLeave?.count || 0) + (pendingRemote?.count || 0) + (pendingCorrections?.count || 0),
        },
      };
    }

    return {
      status: 200,
      data: {
        personal: {
          officeDays: personalOfficeDays,
          remoteDays: personalRemoteDays,
          lateDays: personalLateDays,
          totalMinutes: personalMinutes,
          leaveBalances,
        },
        company: companySummary,
      },
    };
  }

  // -------------------------------------------------------------
  // REMOTE WORK REQUESTS
  // -------------------------------------------------------------
  if (urlPath === '/api/remote-work' && normalizedMethod === 'GET') {
    let sql = `
      SELECT r.*, u.employee_id, u.name as employee_name, u.team
      FROM remote_requests r
      JOIN users u ON r.user_id = u.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (user.role === 'employee') {
      sql += ' AND r.user_id = ?';
      params.push(user.id);
    } else if (user.role === 'team_manager') {
      sql += ' AND (u.team = ? OR r.user_id = ?)';
      params.push(user.team, user.id);
    }

    sql += ' ORDER BY r.request_date DESC LIMIT 100';
    const list = await db.prepare(sql).bind(...params).all();

    return { status: 200, data: { requests: list.results || [] } };
  }

  if (urlPath === '/api/remote-work' && normalizedMethod === 'POST') {
    const requestDate = String(body.request_date || '').trim();
    const reason = String(body.reason || '').trim();

    if (!requestDate) {
      return { status: 400, data: { error: 'Please choose a date for remote work.' } };
    }

    // Check duplicate
    const existing = await db
      .prepare(`SELECT id, status FROM remote_requests WHERE user_id = ? AND request_date = ? AND status IN ('pending', 'approved')`)
      .bind(user.id, requestDate)
      .first();

    if (existing) {
      return { status: 400, data: { error: 'A remote work request already exists for this date.' } };
    }

    const reqId = 'rem_' + Math.random().toString(36).substring(2, 11);
    await db
      .prepare(
        `INSERT INTO remote_requests (id, user_id, request_date, reason, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`
      )
      .bind(reqId, user.id, requestDate, reason, Date.now())
      .run();

    await logAudit(db, user, 'CREATE_REMOTE_REQUEST', 'remote_work', reqId, { requestDate, reason }, context.ip);

    return { status: 200, data: { success: true, message: 'Remote work request submitted for approval.' } };
  }

  if (urlPath.startsWith('/api/remote-work/') && urlPath.endsWith('/action') && normalizedMethod === 'PUT') {
    if (user.role === 'employee') {
      return { status: 403, data: { error: 'Not authorized to approve remote work requests.' } };
    }

    const id = urlPath.replace('/api/remote-work/', '').replace('/action', '');
    const action = String(body.status); // 'approved' | 'rejected'
    const actionReason = String(body.action_reason || '');

    if (action !== 'approved' && action !== 'rejected') {
      return { status: 400, data: { error: 'Invalid action.' } };
    }

    await db
      .prepare(
        'UPDATE remote_requests SET status = ?, approved_by = ?, action_reason = ?, action_timestamp = ? WHERE id = ?'
      )
      .bind(action, user.name, actionReason, Date.now(), id)
      .run();

    await logAudit(db, user, `REMOTE_REQUEST_${action.toUpperCase()}`, 'remote_work', id, { actionReason }, context.ip);

    return { status: 200, data: { success: true, message: `Remote request ${action}.` } };
  }

  // -------------------------------------------------------------
  // LEAVE MANAGEMENT
  // -------------------------------------------------------------
  if (urlPath === '/api/leaves/categories' && normalizedMethod === 'GET') {
    const list = await db.prepare('SELECT * FROM leave_categories ORDER BY name').all();
    return { status: 200, data: { categories: list.results || [] } };
  }

  if (urlPath === '/api/leaves/balances' && normalizedMethod === 'GET') {
    const targetUserId = query.userId && (user.role === 'super_admin' || user.role === 'hr_admin')
      ? query.userId
      : user.id;

    const currentYear = new Date().getFullYear();
    const list = await db
      .prepare(`
        SELECT lb.*, lc.name, lc.color, lc.default_days_per_year, lc.paid
        FROM leave_balances lb
        JOIN leave_categories lc ON lb.category_id = lc.id
        WHERE lb.user_id = ? AND lb.year = ?
      `)
      .bind(targetUserId, currentYear)
      .all();

    return { status: 200, data: { balances: list.results || [] } };
  }

  if (urlPath === '/api/leaves/requests' && normalizedMethod === 'GET') {
    let sql = `
      SELECT lr.*, u.employee_id, u.name as employee_name, u.team, lc.name as category_name, lc.color
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      JOIN leave_categories lc ON lr.category_id = lc.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (user.role === 'employee') {
      sql += ' AND lr.user_id = ?';
      params.push(user.id);
    } else if (user.role === 'team_manager') {
      sql += ' AND (u.team = ? OR lr.user_id = ?)';
      params.push(user.team, user.id);
    }

    sql += ' ORDER BY lr.created_at DESC LIMIT 100';
    const list = await db.prepare(sql).bind(...params).all();

    return { status: 200, data: { requests: list.results || [] } };
  }

  if (urlPath === '/api/leaves/requests' && normalizedMethod === 'POST') {
    const categoryId = String(body.category_id || '');
    const startDate = String(body.start_date || '');
    const endDate = String(body.end_date || '');
    const isHalfDay = !!body.is_half_day;
    const halfDayType = isHalfDay ? String(body.half_day_type || 'first_half') : null;
    const reason = String(body.reason || '');

    if (!categoryId || !startDate || !endDate) {
      return { status: 400, data: { error: 'Please fill in leave type and date range.' } };
    }

    if (endDate < startDate) {
      return { status: 400, data: { error: 'End date cannot precede start date.' } };
    }

    // Calculate days count
    let daysCount = 1.0;
    if (isHalfDay) {
      daysCount = 0.5;
    } else {
      const d1 = new Date(startDate);
      const d2 = new Date(endDate);
      const diffTime = Math.abs(d2.getTime() - d1.getTime());
      daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    // Check balance
    const currentYear = new Date().getFullYear();
    const balance = await db
      .prepare('SELECT * FROM leave_balances WHERE user_id = ? AND category_id = ? AND year = ?')
      .bind(user.id, categoryId, currentYear)
      .first<Record<string, unknown>>();

    if (balance) {
      const remaining = Number(balance.allocated_days) - Number(balance.used_days) - Number(balance.pending_days);
      if (daysCount > remaining) {
        return {
          status: 400,
          data: { error: `Insufficient leave balance. You have ${remaining} days available, but requested ${daysCount} days.` },
        };
      }
    }

    const reqId = 'lvr_' + Math.random().toString(36).substring(2, 11);

    await db
      .prepare(
        `INSERT INTO leave_requests (
          id, user_id, category_id, start_date, end_date,
          is_half_day, half_day_type, days_count, reason, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      )
      .bind(
        reqId,
        user.id,
        categoryId,
        startDate,
        endDate,
        isHalfDay ? 1 : 0,
        halfDayType,
        daysCount,
        reason,
        Date.now()
      )
      .run();

    // Increment pending days
    if (balance) {
      await db
        .prepare('UPDATE leave_balances SET pending_days = pending_days + ? WHERE id = ?')
        .bind(daysCount, balance.id)
        .run();
    }

    await logAudit(db, user, 'APPLY_LEAVE', 'leave', reqId, { categoryId, startDate, endDate, daysCount }, context.ip);

    return { status: 200, data: { success: true, message: 'Leave application submitted successfully.' } };
  }

  if (urlPath.startsWith('/api/leaves/requests/') && urlPath.endsWith('/action') && normalizedMethod === 'PUT') {
    if (user.role === 'employee') {
      return { status: 403, data: { error: 'Not authorized to approve leave applications.' } };
    }

    const id = urlPath.replace('/api/leaves/requests/', '').replace('/action', '');
    const action = String(body.status); // 'approved' | 'rejected'
    const actionReason = String(body.action_reason || '');

    const req = await db.prepare('SELECT * FROM leave_requests WHERE id = ?').bind(id).first<Record<string, unknown>>();
    if (!req) return { status: 404, data: { error: 'Leave request not found.' } };
    if (req.status !== 'pending') {
      return { status: 400, data: { error: `Request is already ${req.status}.` } };
    }

    const daysCount = Number(req.days_count) || 1;
    const currentYear = new Date().getFullYear();

    if (action === 'approved') {
      await db
        .prepare(`UPDATE leave_requests SET status = 'approved', approved_by = ?, action_reason = ?, action_timestamp = ? WHERE id = ?`)
        .bind(user.name, actionReason, Date.now(), id)
        .run();

      // Deduct from pending, add to used
      await db
        .prepare('UPDATE leave_balances SET pending_days = MAX(0, pending_days - ?), used_days = used_days + ? WHERE user_id = ? AND category_id = ? AND year = ?')
        .bind(daysCount, daysCount, req.user_id, req.category_id, currentYear)
        .run();
    } else {
      await db
        .prepare(`UPDATE leave_requests SET status = 'rejected', approved_by = ?, action_reason = ?, action_timestamp = ? WHERE id = ?`)
        .bind(user.name, actionReason, Date.now(), id)
        .run();

      // Release pending days
      await db
        .prepare('UPDATE leave_balances SET pending_days = MAX(0, pending_days - ?) WHERE user_id = ? AND category_id = ? AND year = ?')
        .bind(daysCount, req.user_id, req.category_id, currentYear)
        .run();
    }

    await logAudit(db, user, `LEAVE_${action.toUpperCase()}`, 'leave', id, { actionReason, daysCount }, context.ip);

    return { status: 200, data: { success: true, message: `Leave request has been ${action}.` } };
  }

  // -------------------------------------------------------------
  // ATTENDANCE CORRECTIONS
  // -------------------------------------------------------------
  if (urlPath === '/api/corrections' && normalizedMethod === 'GET') {
    let sql = `
      SELECT ac.*, u.employee_id, u.name as employee_name, u.team
      FROM attendance_corrections ac
      JOIN users u ON ac.user_id = u.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (user.role === 'employee') {
      sql += ' AND ac.user_id = ?';
      params.push(user.id);
    } else if (user.role === 'team_manager') {
      sql += ' AND (u.team = ? OR ac.user_id = ?)';
      params.push(user.team, user.id);
    }

    sql += ' ORDER BY ac.created_at DESC LIMIT 100';
    const list = await db.prepare(sql).bind(...params).all();

    return { status: 200, data: { corrections: list.results || [] } };
  }

  if (urlPath === '/api/corrections' && normalizedMethod === 'POST') {
    const attendanceDate = String(body.attendance_date || '');
    const correctionType = String(body.correction_type || 'both');
    const requestedInTime = body.requested_in_time ? String(body.requested_in_time) : null;
    const requestedOutTime = body.requested_out_time ? String(body.requested_out_time) : null;
    const explanation = String(body.explanation || '').trim();

    if (!attendanceDate || !explanation) {
      return { status: 400, data: { error: 'Please specify the date and explanation for the correction.' } };
    }

    // Fetch existing attendance record if any
    const existing = await db
      .prepare('SELECT * FROM attendance_records WHERE user_id = ? AND attendance_date = ?')
      .bind(user.id, attendanceDate)
      .first<Record<string, unknown>>();

    const corrId = 'cor_' + Math.random().toString(36).substring(2, 11);

    await db
      .prepare(
        `INSERT INTO attendance_corrections (
          id, user_id, attendance_date, correction_type, original_in_time,
          original_out_time, requested_in_time, requested_out_time, explanation,
          status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      )
      .bind(
        corrId,
        user.id,
        attendanceDate,
        correctionType,
        existing ? existing.in_time : null,
        existing ? existing.out_time : null,
        requestedInTime,
        requestedOutTime,
        explanation,
        Date.now()
      )
      .run();

    await logAudit(db, user, 'SUBMIT_CORRECTION', 'attendance_correction', corrId, { attendanceDate, explanation }, context.ip);

    return { status: 200, data: { success: true, message: 'Correction request submitted for administrative review.' } };
  }

  if (urlPath.startsWith('/api/corrections/') && urlPath.endsWith('/action') && normalizedMethod === 'PUT') {
    if (user.role !== 'super_admin' && user.role !== 'hr_admin') {
      return { status: 403, data: { error: 'Only Administrators can approve attendance corrections.' } };
    }

    const id = urlPath.replace('/api/corrections/', '').replace('/action', '');
    const action = String(body.status); // 'approved' | 'rejected'

    const corr = await db.prepare('SELECT * FROM attendance_corrections WHERE id = ?').bind(id).first<Record<string, unknown>>();
    if (!corr) return { status: 404, data: { error: 'Correction request not found.' } };
    if (corr.status !== 'pending') return { status: 400, data: { error: 'Request is already processed.' } };

    if (action === 'approved') {
      // Safely apply correction to attendance_records
      const attDate = String(corr.attendance_date);
      const targetUserId = String(corr.user_id);
      const targetIn = (corr.requested_in_time as string) || (corr.original_in_time as string) || '11:00';
      const targetOut = (corr.requested_out_time as string) || (corr.original_out_time as string) || '19:00';

      const totalMins = calculateElapsedMinutes(targetIn, targetOut);
      const lateMins = calculateLateness(targetIn, '11:00', 15);
      const extraMins = calculateExtraMinutes(targetOut, '19:00');

      const status = totalMins < 240 ? 'half_day' : (lateMins > 0 ? 'late' : 'present');

      // Check if existing record exists
      const existing = await db
        .prepare('SELECT id FROM attendance_records WHERE user_id = ? AND attendance_date = ?')
        .bind(targetUserId, attDate)
        .first<{ id: string }>();

      if (existing) {
        await db
          .prepare(`
            UPDATE attendance_records
            SET in_time = ?, out_time = ?, total_duration_minutes = ?, late_minutes = ?,
                extra_minutes = ?, status = ?, updated_at = ?
            WHERE id = ?
          `)
          .bind(targetIn, targetOut, totalMins, lateMins, extraMins, status, Date.now(), existing.id)
          .run();
      } else {
        const newAttId = 'att_' + targetUserId + '_' + attDate.replace(/-/g, '');
        await db
          .prepare(`
            INSERT INTO attendance_records (
              id, user_id, attendance_date, work_mode, in_time, out_time,
              in_verified, out_verified, total_duration_minutes, late_minutes,
              extra_minutes, status, created_at, updated_at
            ) VALUES (?, ?, ?, 'office', ?, ?, 1, 1, ?, ?, ?, ?, ?, ?)
          `)
          .bind(newAttId, targetUserId, attDate, targetIn, targetOut, totalMins, lateMins, extraMins, status, Date.now(), Date.now())
          .run();
      }

      await db
        .prepare(`UPDATE attendance_corrections SET status = 'approved', approved_by = ?, action_timestamp = ? WHERE id = ?`)
        .bind(user.name, Date.now(), id)
        .run();
    } else {
      await db
        .prepare(`UPDATE attendance_corrections SET status = 'rejected', approved_by = ?, action_timestamp = ? WHERE id = ?`)
        .bind(user.name, Date.now(), id)
        .run();
    }

    await logAudit(db, user, `CORRECTION_${action.toUpperCase()}`, 'attendance_correction', id, {}, context.ip);

    return { status: 200, data: { success: true, message: `Correction request ${action}.` } };
  }

  // -------------------------------------------------------------
  // EMPLOYEES MANAGEMENT
  // -------------------------------------------------------------
  if (urlPath === '/api/employees' && normalizedMethod === 'GET') {
    let sql = 'SELECT id, employee_id, name, email, phone, role, team, designation, manager_id, status, joining_date, created_at FROM users WHERE 1=1';
    const params: unknown[] = [];

    if (query.team) {
      sql += ' AND team = ?';
      params.push(query.team);
    }
    if (query.role) {
      sql += ' AND role = ?';
      params.push(query.role);
    }
    if (query.status) {
      sql += ' AND status = ?';
      params.push(query.status);
    }
    if (query.search) {
      sql += ' AND (name LIKE ? OR employee_id LIKE ? OR email LIKE ?)';
      params.push(`%${query.search}%`, `%${query.search}%`, `%${query.search}%`);
    }

    sql += ' ORDER BY employee_id ASC';
    const list = await db.prepare(sql).bind(...params).all();

    return { status: 200, data: { employees: list.results || [] } };
  }

  if (urlPath === '/api/employees' && normalizedMethod === 'POST') {
    if (user.role !== 'super_admin' && user.role !== 'hr_admin') {
      return { status: 403, data: { error: 'Only Administrators can create new employee records.' } };
    }

    const employeeId = String(body.employee_id || '').trim().toUpperCase();
    const name = String(body.name || '').trim();
    const email = body.email ? String(body.email).trim() : null;
    const phone = body.phone ? String(body.phone).trim() : null;
    const role = String(body.role || 'employee');
    const team = String(body.team || 'General');
    const designation = String(body.designation || 'Staff');
    const managerId = body.manager_id ? String(body.manager_id) : null;
    const joiningDate = String(body.joining_date || todayDateStr);
    const password = String(body.password || '');

    // Only Super Admin can assign super_admin or hr_admin roles
    if ((role === 'super_admin' || role === 'hr_admin') && user.role !== 'super_admin') {
      return { status: 403, data: { error: 'Only Super Admin can create administrator accounts.' } };
    }

    if (!employeeId || !name) {
      return { status: 400, data: { error: 'Employee ID and Name are required.' } };
    }
    if (password.length < 12) return { status: 400, data: { error: 'Set a unique employee password of at least 12 characters.' } };

    // Check duplicate employee_id
    const existing = await db.prepare('SELECT id FROM users WHERE employee_id = ?').bind(employeeId).first();
    if (existing) {
      return { status: 400, data: { error: `Employee ID ${employeeId} already exists.` } };
    }

    const newId = 'usr_' + Math.random().toString(36).substring(2, 11);
    const passHash = await hashPassword(password);

    await db
      .prepare(`
        INSERT INTO users (
          id, employee_id, name, email, phone, role, team,
          designation, manager_id, status, joining_date, password_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
      `)
      .bind(
        newId,
        employeeId,
        name,
        email,
        phone,
        role,
        team,
        designation,
        managerId,
        joiningDate,
        passHash,
        Date.now(),
        Date.now()
      )
      .run();

    // Assign leave balances for current year
    const currentYear = new Date().getFullYear();
    const categories = (await db.prepare('SELECT id, default_days_per_year FROM leave_categories').all<Record<string, unknown>>()).results || [];
    for (const c of categories) {
      await db
        .prepare(`
          INSERT OR IGNORE INTO leave_balances (id, user_id, category_id, year, allocated_days, used_days, pending_days)
          VALUES (?, ?, ?, ?, ?, 0, 0)
        `)
        .bind(`bal_${newId}_${c.id}_${currentYear}`, newId, c.id, currentYear, c.default_days_per_year)
        .run();
    }

    await logAudit(db, user, 'CREATE_EMPLOYEE', 'user', newId, { employeeId, name, role, team }, context.ip);

    return { status: 200, data: { success: true, message: `Employee ${name} (${employeeId}) created successfully.` } };
  }

  // Permanent deletion is only available for ordinary employees with no
  // business records. The D1 database preserves historical records otherwise.
  if (urlPath.startsWith('/api/employees/') && normalizedMethod === 'DELETE') {
    if (user.role !== 'super_admin') return { status: 403, data: { error: 'Only the Super Admin can delete employees.' } };
    const targetId = urlPath.slice('/api/employees/'.length);
    const target = await db.prepare('SELECT id, employee_id, name, role FROM users WHERE id = ?')
      .bind(targetId).first<{ id:string; employee_id:string; name:string; role:string }>();
    if (!target) return { status: 404, data: { error: 'Employee not found.' } };
    if (target.role !== 'employee' || target.id === user.id) {
      return { status: 403, data: { error: 'Administrator/manager accounts cannot be permanently deleted here. Deactivate them or manage roles instead.' } };
    }
    const adminPassword = String(body.current_password || '');
    const adminHash = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{password_hash:string}>();
    if (!adminHash || !await verifyPassword(adminPassword, adminHash.password_hash)) {
      return { status: 403, data: { error: 'Confirm your Super Admin password before deleting an employee.' } };
    }
    if (String(body.confirm_employee_id || '').trim().toUpperCase() !== target.employee_id.toUpperCase()) {
      return { status: 400, data: { error: 'Type the exact Employee ID to confirm deletion.' } };
    }
    const blockers = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM attendance_records WHERE user_id = ?) AS attendance,
      (SELECT COUNT(*) FROM leave_requests WHERE user_id = ?) AS leaves,
      (SELECT COUNT(*) FROM remote_requests WHERE user_id = ?) AS remote,
      (SELECT COUNT(*) FROM attendance_corrections WHERE user_id = ?) AS corrections,
      (SELECT COUNT(*) FROM users WHERE manager_id = ?) AS reports,
      (SELECT COUNT(*) FROM leave_balances WHERE user_id = ? AND (used_days > 0 OR pending_days > 0)) AS leave_usage`)
      .bind(target.id, target.id, target.id, target.id, target.id, target.id).first<Record<string, number>>();
    if (blockers && Object.values(blockers).some(x => Number(x) > 0)) {
      return { status: 409, data: { error: 'Employee has attendance, leave, correction, remote-work, balance usage or reporting records. Deactivate instead to preserve history.', blockers } };
    }
    // Recheck every blocker in the DELETE itself to avoid a race with a new punch/request.
    const result = await db.prepare(`DELETE FROM users WHERE id = ? AND role = 'employee'
      AND NOT EXISTS (SELECT 1 FROM attendance_records WHERE user_id = ?)
      AND NOT EXISTS (SELECT 1 FROM leave_requests WHERE user_id = ?)
      AND NOT EXISTS (SELECT 1 FROM remote_requests WHERE user_id = ?)
      AND NOT EXISTS (SELECT 1 FROM attendance_corrections WHERE user_id = ?)
      AND NOT EXISTS (SELECT 1 FROM users WHERE manager_id = ?)
      AND NOT EXISTS (SELECT 1 FROM leave_balances WHERE user_id = ? AND (used_days > 0 OR pending_days > 0))`)
      .bind(target.id, target.id, target.id, target.id, target.id, target.id, target.id).run();
    if (result.meta?.changes !== undefined && Number(result.meta.changes) !== 1) {
      return { status: 409, data: { error: 'Employee data changed. Please refresh and try again.' } };
    }
    await logAudit(db, user, 'DELETE_EMPLOYEE', 'user', target.id, { deleted_employee_id: target.employee_id, deleted_name: target.name }, context.ip);
    return { status: 200, data: { success: true, message: `Demo employee ${target.employee_id} permanently deleted.` } };
  }

  if (urlPath.startsWith('/api/employees/') && normalizedMethod === 'PUT') {
    if (user.role !== 'super_admin' && user.role !== 'hr_admin') {
      return { status: 403, data: { error: 'Unauthorized.' } };
    }

    const targetId = urlPath.replace('/api/employees/', '');
    const targetUser = await db.prepare('SELECT * FROM users WHERE id = ?').bind(targetId).first<Record<string, unknown>>();
    if (!targetUser) return { status: 404, data: { error: 'Employee not found.' } };
    if (user.role !== 'super_admin' && (targetUser.role === 'super_admin' || targetUser.role === 'hr_admin')) {
      return { status: 403, data: { error: 'Only Super Admin can modify administrator accounts.' } };
    }

    // Prevent demoting or deactivating the last active super_admin
    if (targetUser.role === 'super_admin' && (body.role !== 'super_admin' || body.status === 'inactive')) {
      const activeSuperAdmins = await db
        .prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'super_admin' AND status = 'active'`)
        .first<{ count: number }>();

      if ((activeSuperAdmins?.count || 0) <= 1) {
        return { status: 400, data: { error: 'Cannot deactivate or demote the last remaining active Super Admin.' } };
      }
    }

    // Only Super Admin can change someone to super_admin or hr_admin
    if (body.role && (body.role === 'super_admin' || body.role === 'hr_admin') && user.role !== 'super_admin') {
      return { status: 403, data: { error: 'Only Super Admin can grant administrative privileges.' } };
    }

    const name = body.name ? String(body.name).trim() : String(targetUser.name);
    const email = body.email !== undefined ? (body.email ? String(body.email).trim() : null) : targetUser.email;
    const phone = body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : targetUser.phone;
    const team = body.team ? String(body.team).trim() : String(targetUser.team);
    const designation = body.designation ? String(body.designation).trim() : String(targetUser.designation);
    const role = (user.role === 'super_admin' && body.role) ? String(body.role) : String(targetUser.role);
    const status = body.status ? String(body.status) : String(targetUser.status);
    const joiningDate = body.joining_date ? String(body.joining_date) : String(targetUser.joining_date);

    await db
      .prepare(`
        UPDATE users
        SET name = ?, email = ?, phone = ?, team = ?, designation = ?,
            role = ?, status = ?, joining_date = ?, updated_at = ?
        WHERE id = ?
      `)
      .bind(name, email, phone, team, designation, role, status, joiningDate, Date.now(), targetId)
      .run();

    await logAudit(db, user, 'UPDATE_EMPLOYEE', 'user', targetId, { name, role, status, team }, context.ip);

    return { status: 200, data: { success: true, message: 'Employee updated successfully.' } };
  }

  if (urlPath.startsWith('/api/employees/') && urlPath.endsWith('/reset-password') && normalizedMethod === 'POST') {
    if (user.role !== 'super_admin' && user.role !== 'hr_admin') {
      return { status: 403, data: { error: 'Unauthorized.' } };
    }

    const targetId = urlPath.replace('/api/employees/', '').replace('/reset-password', '');
    const newPassword = String(body.new_password || '');
    const targetAccount = await db.prepare('SELECT role FROM users WHERE id = ?').bind(targetId).first<{ role: string }>();
    if (!targetAccount) return { status: 404, data: { error: 'Employee not found.' } };
    if (user.role !== 'super_admin' && (targetAccount.role === 'super_admin' || targetAccount.role === 'hr_admin')) {
      return { status: 403, data: { error: 'Only Super Admin can reset administrator passwords.' } };
    }
    if (newPassword.length < 12) return { status: 400, data: { error: 'New password must be at least 12 characters.' } };

    const newHash = await hashPassword(newPassword);
    await db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(newHash, Date.now(), targetId)
      .run();

    await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId).run();
    await logAudit(db, user, 'ADMIN_RESET_PASSWORD', 'user', targetId, {}, context.ip);

    return { status: 200, data: { success: true, message: 'Employee password reset successfully.' } };
  }

  // -------------------------------------------------------------
  // SETTINGS & HOLIDAYS
  // -------------------------------------------------------------
  if (urlPath === '/api/settings' && normalizedMethod === 'GET') {
    const settings = await db.prepare(`SELECT * FROM office_settings WHERE id = 'default'`).first();
    return { status: 200, data: { settings } };
  }

  if (urlPath === '/api/settings' && normalizedMethod === 'PUT') {
    if (user.role !== 'super_admin') {
      return { status: 403, data: { error: 'Only Super Admin can modify organization and office policies.' } };
    }

    const companyName = String(body.company_name || 'Boss Technologies Ltd');
    const officeName = String(body.office_name || 'Dhaka Headquarters');
    const officeLatitude = Number(body.office_latitude) || 23.7925;
    const officeLongitude = Number(body.office_longitude) || 90.4078;
    const permittedRadius = Number(body.permitted_radius_meters) || 300;
    const maxGpsAccuracy = Number(body.max_gps_accuracy_meters) || 100;
    const workStartTime = String(body.work_start_time || '11:00');
    const workEndTime = String(body.work_end_time || '19:00');
    const graceMinutes = Number(body.grace_period_minutes) || 15;
    const weeklyHolidays = Array.isArray(body.weekly_holidays) ? JSON.stringify(body.weekly_holidays) : String(body.weekly_holidays || '["Friday","Saturday"]');

    await db
      .prepare(`
        UPDATE office_settings
        SET company_name = ?, office_name = ?, office_latitude = ?, office_longitude = ?,
            permitted_radius_meters = ?, max_gps_accuracy_meters = ?, work_start_time = ?,
            work_end_time = ?, grace_period_minutes = ?, weekly_holidays = ?, updated_at = ?
        WHERE id = 'default'
      `)
      .bind(
        companyName,
        officeName,
        officeLatitude,
        officeLongitude,
        permittedRadius,
        maxGpsAccuracy,
        workStartTime,
        workEndTime,
        graceMinutes,
        weeklyHolidays,
        Date.now()
      )
      .run();

    await logAudit(db, user, 'UPDATE_OFFICE_SETTINGS', 'settings', 'default', { officeName, permittedRadius, workStartTime, workEndTime }, context.ip);

    return { status: 200, data: { success: true, message: 'Office settings saved.' } };
  }

  if (urlPath === '/api/holidays' && normalizedMethod === 'GET') {
    const list = await db.prepare('SELECT * FROM holidays ORDER BY date ASC').all();
    return { status: 200, data: { holidays: list.results || [] } };
  }

  if (urlPath === '/api/holidays' && normalizedMethod === 'POST') {
    if (user.role !== 'super_admin' && user.role !== 'hr_admin') {
      return { status: 403, data: { error: 'Unauthorized.' } };
    }

    const name = String(body.name || '').trim();
    const date = String(body.start_date || body.date || '').trim();
    const endDate = String(body.end_date || date).trim();
    const desc = body.description ? String(body.description).trim() : null;

    if (!name || !date) {
      return { status: 400, data: { error: 'Holiday name and date are required.' } };
    }
    const isValidDate = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    if (!isValidDate(date) || !isValidDate(endDate) || endDate < date) {
      return { status: 400, data: { error: 'Enter a valid holiday date range with the end date on or after the start date.' } };
    }

    const holId = 'hol_' + Math.random().toString(36).substring(2, 11);
    await db
      .prepare(`INSERT INTO holidays (id, name, date, end_date, is_full_day, applicable_office, description, created_at) VALUES (?, ?, ?, ?, 1, 'all', ?, ?)`)
      .bind(holId, name, date, endDate, desc, Date.now())
      .run();

    await logAudit(db, user, 'ADD_HOLIDAY', 'holiday', holId, { name, date, end_date: endDate }, context.ip);

    return { status: 200, data: { success: true, message: 'Holiday added.' } };
  }

  if (urlPath.startsWith('/api/holidays/') && normalizedMethod === 'DELETE') {
    if (user.role !== 'super_admin' && user.role !== 'hr_admin') {
      return { status: 403, data: { error: 'Unauthorized.' } };
    }

    const holId = urlPath.replace('/api/holidays/', '');
    await db.prepare('DELETE FROM holidays WHERE id = ?').bind(holId).run();

    await logAudit(db, user, 'DELETE_HOLIDAY', 'holiday', holId, {}, context.ip);

    return { status: 200, data: { success: true } };
  }

  // -------------------------------------------------------------
  // AUDIT LOGS
  // -------------------------------------------------------------
  if (urlPath === '/api/audit-logs' && normalizedMethod === 'GET') {
    if (user.role !== 'super_admin' && user.role !== 'hr_admin') {
      return { status: 403, data: { error: 'Unauthorized.' } };
    }

    const logs = await db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100').all();
    return { status: 200, data: { logs: logs.results || [] } };
  }

  // -------------------------------------------------------------
  // EXCEL REPORT EXPORT
  // -------------------------------------------------------------
  if (urlPath === '/api/reports/export-xlsx' && normalizedMethod === 'GET') {
    if (user.role === 'employee' && query.userId && query.userId !== user.id) {
      return { status: 403, data: { error: 'Unauthorized' } };
    }

    const filters = {
      startDate: query.startDate,
      endDate: query.endDate,
      team: query.team,
      userId: user.role === 'employee' ? user.id : query.userId,
    };

    const binaryBuffer = await generateBossExcelWorkbook(db, filters);

    return {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Boss_Attendance_Report_${todayDateStr}.xlsx"`,
      },
      binary: binaryBuffer,
    };
  }

  return { status: 404, data: { error: `Route not found: ${method} ${urlPath}` } };
}
