/**
 * AGN Campus Ambassador Hub — isolated from Boss office identity and attendance.
 * All authorisation is enforced on the server; a hidden UI is never a security boundary.
 */
import type { D1DatabaseLike } from '../db/types.ts';
import { getUserFromSession, logAudit } from './api-handler.ts';
import { hashPassword, verifyPassword, generateSessionToken } from '../auth/crypto.ts';
import { hashRecoveryCode } from '../auth/recovery.ts';
import { getDhakaDateString } from '../utils/time.ts';

type Data = Record<string, unknown>;
type Reply = { status: number; data?: unknown; headers?: Record<string, string> };
type Context = { token?: string; ambassadorToken?: string; ip?: string };
const error = (status: number, message: string): Reply => ({ status, data: { error: message } });
const ok = (data: unknown): Reply => ({ status: 200, data });
const uid = () => crypto.randomUUID();
const input = (value: unknown, limit = 300) => String(value ?? '').trim().slice(0, limit);
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const validProof = (s: string) => { try { const u = new URL(s); return u.protocol === 'https:' && !!u.hostname && s.length <= 1500; } catch { return false; } };
const adminCookie = 'boss_ambassador_session';
const sessionLifetime = 12 * 60 * 60 * 1000;
const getRows = async <T>(db: D1DatabaseLike, query: string, ...args: unknown[]): Promise<T[]> =>
  (await db.prepare(query).bind(...args).all<T>()).results || [];

export async function handleAmbassadorRequest(
  method: string, path: string, body: Data, ctx: Context, db: D1DatabaseLike
): Promise<Reply> {
  const verb = method.toUpperCase();
  const setting = await db.prepare("SELECT enabled FROM amb_module_settings WHERE id='default'").first<{enabled: number}>();
  if (!setting) return error(503, 'Campus Hub migration 0004 is not installed.');
  const enabled = Number(setting.enabled) === 1;

  // Isolated portal authentication. The office session is never accepted here.
  if (path === '/api/ambassadors/login' && verb === 'POST') {
    if (!enabled) return error(403, 'Campus Ambassador Hub is not enabled yet.');
    const code = input(body.ambassador_code, 40).toUpperCase();
    const password = String(body.password || '');
    if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !password) return error(401, 'Invalid ambassador ID or password.');
    const now = Date.now();
    const failures = await db.prepare('SELECT failures, locked_until, last_attempt FROM amb_login_attempts WHERE code=?').bind(code).first<{failures:number;locked_until:number;last_attempt:number}>();
    if (failures && Number(failures.locked_until) > now) return error(429, 'Too many attempts. Try again in 15 minutes.');
    const person = await db.prepare('SELECT * FROM amb_people WHERE ambassador_code=?').bind(code).first<Record<string, unknown>>();
    const valid = person && person.status === 'active' && await verifyPassword(password, String(person.password_hash));
    if (!valid) {
      const old = failures && now - Number(failures.last_attempt) < 15 * 60_000 ? Number(failures.failures) : 0;
      const next = old + 1;
      await db.prepare(`INSERT INTO amb_login_attempts (code,failures,locked_until,last_attempt) VALUES (?,?,?,?)
        ON CONFLICT(code) DO UPDATE SET failures=excluded.failures, locked_until=excluded.locked_until, last_attempt=excluded.last_attempt`)
        .bind(code, next, next >= 5 ? now + 15 * 60_000 : 0, now).run();
      return error(401, 'Invalid ambassador ID or password.');
    }
    await db.prepare('DELETE FROM amb_login_attempts WHERE code=?').bind(code).run();
    const token = generateSessionToken();
    await db.prepare('DELETE FROM amb_sessions WHERE expires_at < ?').bind(now).run();
    await db.prepare('INSERT INTO amb_sessions (id,ambassador_id,expires_at,created_at) VALUES (?,?,?,?)')
      .bind(await hashRecoveryCode(token), person!.id, now + sessionLifetime, now).run();
    return { status: 200, headers: { 'Set-Cookie': `${adminCookie}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/api/ambassadors; Max-Age=${sessionLifetime / 1000}` }, data: { success: true } };
  }

  if (path === '/api/ambassadors/logout' && verb === 'POST') {
    if (ctx.ambassadorToken) await db.prepare('DELETE FROM amb_sessions WHERE id=?').bind(await hashRecoveryCode(ctx.ambassadorToken)).run();
    return { status: 200, headers: { 'Set-Cookie': `${adminCookie}=; HttpOnly; Secure; SameSite=Lax; Path=/api/ambassadors; Max-Age=0` }, data: { success: true } };
  }

  // Office administrators can configure the hub while disabled. Other staff
  // have no access until a Super Admin explicitly appoints them as managers.
  if (path.startsWith('/api/ambassadors/admin/')) {
    const staff = await getUserFromSession(db, ctx.token);
    if (!staff) return error(401, 'Sign in to Boss as an authorised administrator.');
    const superAdmin = staff.role === 'super_admin';
    const assigned = await db.prepare('SELECT user_id FROM amb_program_managers WHERE user_id=?').bind(staff.id).first();
    if (!superAdmin && !assigned) return error(403, 'Campus Hub manager access required.');
    if (path === '/api/ambassadors/admin/state' && verb === 'GET') {
      const campuses = await getRows(db, 'SELECT * FROM amb_campuses ORDER BY name');
      const people = await getRows(db, `SELECT p.id,p.ambassador_code,p.name,p.email,p.department,p.campus_id,p.is_lead,p.status,p.must_change_password,c.name AS campus_name
        FROM amb_people p JOIN amb_campuses c ON c.id=p.campus_id ORDER BY p.name`);
      const campaigns = await getRows(db, `SELECT c.*, (SELECT COUNT(*) FROM amb_assignments a WHERE a.campaign_id=c.id) AS assignments
        FROM amb_campaigns c ORDER BY c.created_at DESC`);
      const submissions = await getRows(db, `SELECT s.id,s.assignment_id,s.proof_url,s.notes,s.status,s.submitted_at,s.reviewed_at,s.review_note,s.quality_score,
        p.name AS ambassador_name,p.email AS ambassador_email,p.campus_id,c.title AS campaign_title,c.points,c.due_date
        FROM amb_submissions s JOIN amb_assignments a ON a.id=s.assignment_id
        JOIN amb_people p ON p.id=a.ambassador_id JOIN amb_campaigns c ON c.id=a.campaign_id ORDER BY s.submitted_at DESC LIMIT 500`);
      const leaderboard = await getRows(db, `SELECT p.id,p.name,p.ambassador_code,cp.name AS campus_name,
        COALESCE(SUM(CASE WHEN s.status='approved' THEN c.points ELSE 0 END),0) AS points,
        COUNT(CASE WHEN s.status='approved' THEN 1 END) AS approved,
        COUNT(a.id) AS assigned,
        ROUND(AVG(CASE WHEN s.status='approved' THEN s.quality_score END),1) AS quality_average,
        COUNT(CASE WHEN s.status='approved' AND date(s.submitted_at/1000,'unixepoch','+6 hours') <= c.due_date THEN 1 END) AS on_time
        FROM amb_people p JOIN amb_campuses cp ON cp.id=p.campus_id
        LEFT JOIN amb_assignments a ON a.ambassador_id=p.id LEFT JOIN amb_campaigns c ON c.id=a.campaign_id
        LEFT JOIN amb_submissions s ON s.assignment_id=a.id GROUP BY p.id ORDER BY points DESC,p.name LIMIT 100`);
      const managers = superAdmin ? await getRows(db, `SELECT u.id,u.employee_id,u.name FROM amb_program_managers m JOIN users u ON u.id=m.user_id ORDER BY u.name`) : [];
      return ok({ enabled, is_super_admin: superAdmin, campuses, people, campaigns, submissions, leaderboard, managers });
    }
    if (path === '/api/ambassadors/admin/enable' && verb === 'POST') {
      if (!superAdmin) return error(403, 'Only the Super Admin can enable the Hub.');
      if (typeof body.enabled !== 'boolean') return error(400, 'enabled must be true or false.');
      await db.prepare("UPDATE amb_module_settings SET enabled=? WHERE id='default'").bind(body.enabled ? 1 : 0).run();
      await logAudit(db, staff, 'AMBASSADOR_MODULE_TOGGLE', 'campus_hub', null, { enabled: body.enabled }, ctx.ip);
      return ok({ enabled: body.enabled });
    }
    if (path === '/api/ambassadors/admin/managers' && verb === 'POST') {
      if (!superAdmin) return error(403, 'Super Admin required.');
      const code = input(body.employee_id, 40).toUpperCase();
      const target = await db.prepare('SELECT id,role,status FROM users WHERE UPPER(employee_id)=?').bind(code).first<{id:string;role:string;status:string}>();
      if (!target || target.status !== 'active') return error(404, 'Active Boss staff member not found.');
      if (target.role === 'employee') return error(400, 'Assign an existing office administrator or manager, not a regular employee.');
      if (body.remove === true) await db.prepare('DELETE FROM amb_program_managers WHERE user_id=?').bind(target.id).run();
      else await db.prepare('INSERT OR IGNORE INTO amb_program_managers (user_id,assigned_at) VALUES (?,?)').bind(target.id,Date.now()).run();
      await logAudit(db,staff,'AMBASSADOR_MANAGER_ACCESS','campus_hub',target.id,{ remove:body.remove === true },ctx.ip);
      return ok({ success: true });
    }
    if (path === '/api/ambassadors/admin/campuses' && verb === 'POST') {
      const name = input(body.name, 110), city = input(body.city, 90);
      if (name.length < 3) return error(400, 'Campus name must have at least 3 characters.');
      const existing = await db.prepare('SELECT id FROM amb_campuses WHERE name=? COLLATE NOCASE').bind(name).first();
      if (existing) return error(409, 'Campus already exists.');
      const id = uid();
      await db.prepare('INSERT INTO amb_campuses (id,name,city,created_at) VALUES (?,?,?,?)').bind(id,name,city,Date.now()).run();
      await logAudit(db,staff,'CAMPUS_CREATE','amb_campus',id,{ name },ctx.ip);
      return ok({ id });
    }
    if (path === '/api/ambassadors/admin/people' && verb === 'POST') {
      const code = input(body.ambassador_code, 40).toUpperCase();
      const name = input(body.name, 130), email = input(body.email, 180);
      const department = input(body.department, 130), campusId = input(body.campus_id, 90);
      const pass = String(body.initial_password || '');
      if (!/^[A-Z0-9_-]{3,40}$/.test(code) || name.length < 2 || pass.length < 12 || pass.length > 256) return error(400, 'Valid ID, name and a 12+ character initial password are required.');
      const campus = await db.prepare("SELECT id FROM amb_campuses WHERE id=? AND status='active'").bind(campusId).first();
      if (!campus) return error(400, 'Select an active campus.');
      const duplicate = await db.prepare('SELECT id FROM amb_people WHERE ambassador_code=?').bind(code).first();
      if (duplicate) return error(409, 'Ambassador ID already exists.');
      const id = uid(), now = Date.now();
      await db.prepare(`INSERT INTO amb_people
        (id,ambassador_code,name,email,department,campus_id,is_lead,password_hash,joined_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(id,code,name,email,department,campusId,body.is_lead === true ? 1:0,await hashPassword(pass),now,now).run();
      await logAudit(db,staff,'AMBASSADOR_CREATE','amb_person',id,{ code,campusId },ctx.ip);
      return ok({ id });
    }
    if (path === '/api/ambassadors/admin/people/update' && verb === 'POST') {
      const id = input(body.id,90), status = input(body.status, 15);
      if (!['active','inactive'].includes(status)) return error(400, 'Invalid status.');
      const member = await db.prepare('SELECT id FROM amb_people WHERE id=?').bind(id).first();
      if (!member) return error(404, 'Ambassador not found.');
      await db.prepare('UPDATE amb_people SET status=?, updated_at=? WHERE id=?').bind(status,Date.now(),id).run();
      if (status === 'inactive') await db.prepare('DELETE FROM amb_sessions WHERE ambassador_id=?').bind(id).run();
      await logAudit(db,staff,'AMBASSADOR_STATUS','amb_person',id,{ status },ctx.ip);
      return ok({ success: true });
    }
    if (path === '/api/ambassadors/admin/people/reset-password' && verb === 'POST') {
      const id = input(body.id,90), pass = String(body.new_password || '');
      if (pass.length < 12 || pass.length > 256) return error(400, 'Temporary password must be 12–256 characters.');
      const member = await db.prepare('SELECT id FROM amb_people WHERE id=?').bind(id).first();
      if (!member) return error(404, 'Ambassador not found.');
      await db.prepare('UPDATE amb_people SET password_hash=?,must_change_password=1,updated_at=? WHERE id=?').bind(await hashPassword(pass),Date.now(),id).run();
      await db.prepare('DELETE FROM amb_sessions WHERE ambassador_id=?').bind(id).run();
      await logAudit(db,staff,'AMBASSADOR_PASSWORD_RESET','amb_person',id,{},ctx.ip);
      return ok({ success: true });
    }
    if (path === '/api/ambassadors/admin/campaigns' && verb === 'POST') {
      const title=input(body.title,140), instructions=input(body.instructions,1800);
      const contentType=input(body.content_type,18), scope=input(body.target_scope,15), targetId=input(body.target_id,90);
      const dueDate=input(body.due_date,10), points=Number(body.points);
      if (title.length < 5 || instructions.length < 12 || !['share','post','video','outreach','event','other'].includes(contentType)
          || !['all','campus','individual'].includes(scope) || !validDate(dueDate)
          || !Number.isInteger(points) || points < 0 || points > 100) return error(400,'Check campaign title, instructions, type, target, due date and points (0–100).');
      if (scope !== 'all' && !targetId) return error(400,'Select a target campus or ambassador.');
      const whoQuery = scope === 'all' ? "SELECT id FROM amb_people WHERE status='active'"
        : scope === 'campus' ? "SELECT id FROM amb_people WHERE status='active' AND campus_id=?"
        : "SELECT id FROM amb_people WHERE status='active' AND id=?";
      const targets = await getRows<{id:string}>(db,whoQuery,...(scope === 'all' ? []:[targetId]));
      if (!targets.length) return error(400,'No active ambassadors match the selected target.');
      const id=uid(),now=Date.now();
      await db.prepare(`INSERT INTO amb_campaigns (id,title,instructions,content_type,target_scope,target_id,points,due_date,created_by,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,title,instructions,contentType,scope,scope==='all'?null:targetId,points,dueDate,staff.id,now).run();
      for (const target of targets) {
        await db.prepare('INSERT INTO amb_assignments (id,campaign_id,ambassador_id,assigned_at) VALUES (?,?,?,?)')
          .bind(uid(),id,target.id,now).run();
      }
      await logAudit(db,staff,'CAMPAIGN_CREATE','amb_campaign',id,{ title,assignments:targets.length },ctx.ip);
      return ok({ id, assignments:targets.length });
    }
    if (path === '/api/ambassadors/admin/reviews' && verb === 'POST') {
      const id=input(body.submission_id,90), decision=input(body.decision,25), note=input(body.review_note,1000);
      const score=Number(body.quality_score);
      if (!['approved','revision_requested','rejected'].includes(decision)) return error(400,'Invalid review decision.');
      if (decision !== 'approved' && note.length < 5) return error(400,'Provide useful feedback when requesting a revision or rejecting work.');
      if (decision === 'approved' && (!Number.isInteger(score) || score < 1 || score > 5)) return error(400,'Approved content needs a quality score from 1 to 5.');
      const sub = await db.prepare(`SELECT s.id,s.status,p.email AS ambassador_email FROM amb_submissions s
        JOIN amb_assignments a ON a.id=s.assignment_id JOIN amb_people p ON p.id=a.ambassador_id WHERE s.id=?`).bind(id)
        .first<{id:string;status:string;ambassador_email:string}>();
      if (!sub) return error(404,'Submission not found.');
      if (sub.status !== 'submitted') return error(409,'Only submitted work can be reviewed.');
      if (staff.email && sub.ambassador_email && staff.email.toLowerCase() === sub.ambassador_email.toLowerCase()) return error(403,'You cannot review your own ambassador work.');
      const now=Date.now();
      // Optimistic status guard stops a second reviewer overwriting a prior decision.
      const result=await db.prepare(`UPDATE amb_submissions SET status=?,reviewed_by=?,reviewed_at=?,review_note=?,quality_score=?
        WHERE id=? AND status='submitted'`).bind(decision,staff.id,now,note,decision==='approved'?score:null,id).run();
      if (result.meta && typeof result.meta.changes === 'number' && result.meta.changes === 0) return error(409,'Submission was already reviewed.');
      await db.prepare('INSERT INTO amb_review_events (id,submission_id,reviewer_id,decision,note,recorded_at) VALUES (?,?,?,?,?,?)')
        .bind(uid(),id,staff.id,decision,note,now).run();
      await logAudit(db,staff,'AMBASSADOR_REVIEW','amb_submission',id,{ decision },ctx.ip);
      return ok({ success: true });
    }
    return error(404,'Campus Hub manager endpoint not found.');
  }

  // Every other endpoint is for the ambassador portal only.
  if (!enabled) return error(403,'Campus Ambassador Hub is currently disabled.');
  if (!ctx.ambassadorToken) return error(401,'Sign in to the ambassador portal.');
  const tokenHash = await hashRecoveryCode(ctx.ambassadorToken);
  const member = await db.prepare(`SELECT p.id,p.ambassador_code,p.name,p.email,p.department,p.campus_id,p.is_lead,p.status,p.must_change_password,c.name AS campus_name
    FROM amb_sessions s JOIN amb_people p ON p.id=s.ambassador_id JOIN amb_campuses c ON c.id=p.campus_id
    WHERE s.id=? AND s.expires_at>?`).bind(tokenHash,Date.now()).first<Record<string,unknown>>();
  if (!member || member.status !== 'active') return error(401,'Your session has expired. Please sign in again.');

  if (path === '/api/ambassadors/me' && verb === 'GET') return ok({ member });
  if (path === '/api/ambassadors/change-password' && verb === 'POST') {
    const oldPass = String(body.current_password || ''), newPass = String(body.new_password || '');
    if (newPass.length < 12 || newPass.length > 256) return error(400,'New password must be 12–256 characters.');
    const row = await db.prepare('SELECT password_hash FROM amb_people WHERE id=?').bind(member.id).first<{password_hash:string}>();
    if (!row || !await verifyPassword(oldPass,row.password_hash)) return error(400,'Current password is incorrect.');
    await db.prepare('UPDATE amb_people SET password_hash=?,must_change_password=0,updated_at=? WHERE id=?').bind(await hashPassword(newPass),Date.now(),member.id).run();
    await db.prepare('DELETE FROM amb_sessions WHERE ambassador_id=? AND id<>?').bind(member.id,tokenHash).run();
    return ok({ success:true });
  }
  if (Number(member.must_change_password)) return error(403,'Change your temporary password before accessing tasks.');

  if (path === '/api/ambassadors/tasks' && verb === 'GET') {
    const tasks = await getRows(db,`SELECT a.id AS assignment_id,c.title,c.instructions,c.content_type,c.points,c.due_date,c.status AS campaign_status,
      s.id AS submission_id,s.proof_url,s.notes,s.status AS submission_status,s.review_note,s.quality_score,s.submitted_at
      FROM amb_assignments a JOIN amb_campaigns c ON c.id=a.campaign_id
      LEFT JOIN amb_submissions s ON s.assignment_id=a.id WHERE a.ambassador_id=? ORDER BY c.due_date DESC,c.created_at DESC`,member.id);
    const campusProgress = Number(member.is_lead) ? await db.prepare(`SELECT COUNT(DISTINCT a.id) AS assigned,
      COUNT(DISTINCT CASE WHEN s.status='approved' THEN a.id END) AS approved
      FROM amb_assignments a JOIN amb_people p ON p.id=a.ambassador_id
      LEFT JOIN amb_submissions s ON s.assignment_id=a.id WHERE p.campus_id=?`).bind(member.campus_id).first() : null;
    const today = getDhakaDateString();
    return ok({ tasks, campus_progress: campusProgress, today });
  }
  if (path === '/api/ambassadors/submit' && verb === 'POST') {
    const assignmentId=input(body.assignment_id,90),url=input(body.proof_url,1501),notes=input(body.notes,1000);
    if (!validProof(url)) return error(400,'Use a valid HTTPS proof URL (max 1500 characters).');
    const assignment = await db.prepare(`SELECT a.id,c.status AS campaign_status FROM amb_assignments a JOIN amb_campaigns c ON c.id=a.campaign_id
      WHERE a.id=? AND a.ambassador_id=?`).bind(assignmentId,member.id).first<{id:string;campaign_status:string}>();
    if (!assignment) return error(404,'Assigned task not found.');
    if (assignment.campaign_status !== 'active') return error(409,'This campaign has been archived.');
    const old = await db.prepare('SELECT id,status,revisions FROM amb_submissions WHERE assignment_id=?').bind(assignmentId)
      .first<{id:string;status:string;revisions:number}>();
    const now=Date.now();
    if (!old) await db.prepare('INSERT INTO amb_submissions (id,assignment_id,proof_url,notes,submitted_at) VALUES (?,?,?,?,?)')
      .bind(uid(),assignmentId,url,notes,now).run();
    else if (old.status === 'revision_requested') await db.prepare(`UPDATE amb_submissions SET proof_url=?,notes=?,status='submitted',submitted_at=?,reviewed_by=NULL,reviewed_at=NULL,
        review_note='',quality_score=NULL,revisions=? WHERE id=? AND status='revision_requested'`).bind(url,notes,now,Number(old.revisions)+1,old.id).run();
    else return error(409,'This task is already submitted or has a final review decision.');
    return ok({ success:true });
  }
  return error(404,'Campus Ambassador endpoint not found.');
}
