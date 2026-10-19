import * as XLSX from 'xlsx';
import { D1DatabaseLike } from '../db/types.ts';
import { formatMinutesToHumanDuration, formatTime12FromHHMM } from '../utils/time.ts';

interface ExportFilterParams {
  startDate?: string;
  endDate?: string;
  team?: string;
  userId?: string;
}

export async function generateBossExcelWorkbook(
  db: D1DatabaseLike,
  filters: ExportFilterParams
): Promise<Uint8Array> {
  const wb = XLSX.utils.book_new();

  // 1. Fetch data
  const usersRes = await db
    .prepare('SELECT id, employee_id, name, email, role, team, designation, status, joining_date FROM users ORDER BY employee_id')
    .all<Record<string, unknown>>();
  const users = usersRes.results || [];
  const userMap = new Map<string, Record<string, unknown>>(users.map(u => [String(u.id), u]));

  // Attendance records query
  let attQuery = 'SELECT * FROM attendance_records WHERE 1=1';
  const attParams: unknown[] = [];
  if (filters.startDate) {
    attQuery += ' AND attendance_date >= ?';
    attParams.push(filters.startDate);
  }
  if (filters.endDate) {
    attQuery += ' AND attendance_date <= ?';
    attParams.push(filters.endDate);
  }
  if (filters.userId) {
    attQuery += ' AND user_id = ?';
    attParams.push(filters.userId);
  }
  attQuery += ' ORDER BY attendance_date DESC, in_time ASC';

  const attRes = await db.prepare(attQuery).bind(...attParams).all<Record<string, unknown>>();
  const attendanceRecords = attRes.results || [];

  // Leave records query
  let leaveQuery = `
    SELECT lr.*, u.employee_id, u.name as employee_name, u.team, lc.name as leave_type_name
    FROM leave_requests lr
    JOIN users u ON lr.user_id = u.id
    JOIN leave_categories lc ON lr.category_id = lc.id
    WHERE 1=1
  `;
  const leaveParams: unknown[] = [];
  if (filters.startDate) {
    leaveQuery += ' AND lr.start_date >= ?';
    leaveParams.push(filters.startDate);
  }
  if (filters.endDate) {
    leaveQuery += ' AND lr.end_date <= ?';
    leaveParams.push(filters.endDate);
  }
  leaveQuery += ' ORDER BY lr.created_at DESC';
  const leaveRes = await db.prepare(leaveQuery).bind(...leaveParams).all<Record<string, unknown>>();
  const leaveRecords = leaveRes.results || [];

  // Remote records query
  let remoteQuery = `
    SELECT rr.*, u.employee_id, u.name as employee_name, u.team
    FROM remote_requests rr
    JOIN users u ON rr.user_id = u.id
    ORDER BY rr.request_date DESC
  `;
  const remoteRes = await db.prepare(remoteQuery).all<Record<string, unknown>>();
  const remoteRecords = remoteRes.results || [];

  // Corrections query
  const corrRes = await db
    .prepare(`
      SELECT ac.*, u.employee_id, u.name as employee_name, u.team
      FROM attendance_corrections ac
      JOIN users u ON ac.user_id = u.id
      ORDER BY ac.created_at DESC
    `)
    .all<Record<string, unknown>>();
  const correctionRecords = corrRes.results || [];

  // Holidays
  const holRes = await db.prepare('SELECT * FROM holidays ORDER BY date ASC').all<Record<string, unknown>>();
  const holidays = holRes.results || [];

  // ==========================================
  // SHEET 1: Daily Attendance Sheet
  // ==========================================
  const dailyRows = attendanceRecords.map(rec => {
    const user = userMap.get(String(rec.user_id));
    let gpsStatus = 'N/A (Remote)';
    if (rec.work_mode === 'office') {
      gpsStatus = rec.in_verified ? `Verified (${rec.in_distance_meters || 0}m)` : 'Failed Geofence';
    }

    return {
      'Date': rec.attendance_date,
      'Employee ID': user ? user.employee_id : rec.user_id,
      'Employee Name': user ? user.name : 'Unknown',
      'Team': user ? user.team : 'General',
      'Work Mode': String(rec.work_mode).toUpperCase(),
      'Status': String(rec.status).toUpperCase(),
      'Scheduled IN': '11:00 AM',
      'Scheduled OUT': '07:00 PM',
      'Actual IN': formatTime12FromHHMM(rec.in_time as string),
      'Actual OUT': formatTime12FromHHMM(rec.out_time as string),
      'Total Elapsed Hours': formatMinutesToHumanDuration(Number(rec.total_duration_minutes) || 0),
      'Late Minutes': Number(rec.late_minutes) || 0,
      'Extra Minutes': Number(rec.extra_minutes) || 0,
      'Shortfall Minutes': Number(rec.shortfall_minutes) || 0,
      'GPS Verification Result': gpsStatus,
    };
  });

  const wsDaily = XLSX.utils.json_to_sheet(dailyRows);
  wsDaily['!cols'] = [
    { wch: 12 }, // Date
    { wch: 14 }, // Emp ID
    { wch: 22 }, // Name
    { wch: 20 }, // Team
    { wch: 12 }, // Mode
    { wch: 14 }, // Status
    { wch: 14 }, // Sched IN
    { wch: 14 }, // Sched OUT
    { wch: 14 }, // Actual IN
    { wch: 14 }, // Actual OUT
    { wch: 18 }, // Duration
    { wch: 14 }, // Late
    { wch: 14 }, // Extra
    { wch: 16 }, // Shortfall
    { wch: 24 }, // GPS
  ];
  XLSX.utils.book_append_sheet(wb, wsDaily, 'Daily Attendance');

  // ==========================================
  // SHEET 2: Monthly Summary Sheet
  // ==========================================
  const summaryMap = new Map<string, {
    empId: string;
    name: string;
    team: string;
    officeDays: number;
    remoteDays: number;
    leaveDays: number;
    halfDays: number;
    lateDays: number;
    totalLateMinutes: number;
    totalExtraMinutes: number;
    totalMinutes: number;
    missingOut: number;
  }>();

  for (const u of users) {
    summaryMap.set(String(u.id), {
      empId: String(u.employee_id),
      name: String(u.name),
      team: String(u.team),
      officeDays: 0,
      remoteDays: 0,
      leaveDays: 0,
      halfDays: 0,
      lateDays: 0,
      totalLateMinutes: 0,
      totalExtraMinutes: 0,
      totalMinutes: 0,
      missingOut: 0,
    });
  }

  for (const r of attendanceRecords) {
    const s = summaryMap.get(String(r.user_id));
    if (s) {
      if (r.work_mode === 'office') s.officeDays += 1;
      if (r.work_mode === 'remote') s.remoteDays += 1;
      if (r.status === 'half_day') s.halfDays += 1;
      if (r.status === 'missing_out') s.missingOut += 1;
      if (Number(r.late_minutes) > 0) {
        s.lateDays += 1;
        s.totalLateMinutes += Number(r.late_minutes);
      }
      s.totalExtraMinutes += Number(r.extra_minutes) || 0;
      s.totalMinutes += Number(r.total_duration_minutes) || 0;
    }
  }

  const monthlyRows = Array.from(summaryMap.values()).map(s => ({
    'Employee ID': s.empId,
    'Employee Name': s.name,
    'Team': s.team,
    'Office Days': s.officeDays,
    'Remote Days': s.remoteDays,
    'Approved Leave Days': s.leaveDays,
    'Half Days': s.halfDays,
    'Late Days': s.lateDays,
    'Missing OUT': s.missingOut,
    'Total Late (Minutes)': s.totalLateMinutes,
    'Total Extra (Minutes)': s.totalExtraMinutes,
    'Total Attendance Hours': formatMinutesToHumanDuration(s.totalMinutes),
  }));

  const wsMonthly = XLSX.utils.json_to_sheet(monthlyRows);
  wsMonthly['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Summary');

  // ==========================================
  // SHEET 3: Leave Report
  // ==========================================
  const leaveRows = leaveRecords.map(r => ({
    'Employee ID': r.employee_id,
    'Employee Name': r.employee_name,
    'Team': r.team,
    'Leave Category': r.leave_type_name,
    'Start Date': r.start_date,
    'End Date': r.end_date,
    'Total Days': r.days_count,
    'Half Day': r.is_half_day ? String(r.half_day_type) : 'No',
    'Reason': r.reason || 'None provided',
    'Status': String(r.status).toUpperCase(),
    'Approved By': r.approved_by || 'Pending',
  }));

  const wsLeave = XLSX.utils.json_to_sheet(leaveRows);
  wsLeave['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 18 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 26 },
    { wch: 12 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsLeave, 'Leave Requests');

  // ==========================================
  // SHEET 4: Remote Work Report
  // ==========================================
  const remoteRows = remoteRecords.map(r => ({
    'Employee ID': r.employee_id,
    'Employee Name': r.employee_name,
    'Team': r.team,
    'Date': r.request_date,
    'Reason': r.reason || 'None provided',
    'Status': String(r.status).toUpperCase(),
    'Approved By': r.approved_by || 'Pending',
  }));
  const wsRemote = XLSX.utils.json_to_sheet(remoteRows);
  wsRemote['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 18 },
    { wch: 14 },
    { wch: 26 },
    { wch: 14 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRemote, 'Remote Work');

  // ==========================================
  // SHEET 5: Attendance Corrections
  // ==========================================
  const corrRows = correctionRecords.map(r => ({
    'Employee ID': r.employee_id,
    'Employee Name': r.employee_name,
    'Date': r.attendance_date,
    'Correction Type': r.correction_type,
    'Requested IN': formatTime12FromHHMM(r.requested_in_time as string),
    'Requested OUT': formatTime12FromHHMM(r.requested_out_time as string),
    'Explanation': r.explanation,
    'Status': String(r.status).toUpperCase(),
    'Approved By': r.approved_by || 'Pending',
  }));
  const wsCorr = XLSX.utils.json_to_sheet(corrRows);
  XLSX.utils.book_append_sheet(wb, wsCorr, 'Corrections');

  // ==========================================
  // SHEET 6: Holiday Calendar
  // ==========================================
  const holRows = holidays.map(h => ({
    'Holiday Name': h.name,
    'Start Date': h.date,
    'End Date': h.end_date || h.date,
    'Category': h.description || 'Public Holiday',
    'Full Day': h.is_full_day ? 'Yes' : 'Half Day',
  }));
  const wsHol = XLSX.utils.json_to_sheet(holRows);
  XLSX.utils.book_append_sheet(wb, wsHol, 'Holidays');

  // Output as binary XLSX buffer
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  return new Uint8Array(out);
}
