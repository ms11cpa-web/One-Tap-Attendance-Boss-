/**
 * AGN Campus Ambassador Hub — isolated from Boss office identity and attendance.
 * All authorisation is enforced on the server; a hidden UI is never a security boundary.
 */
import type { D1DatabaseLike } from '../db/types.ts';
import { getUserFromSession, logAudit } from './api-handler.ts';
import { hashPassword, verifyPassword, generateSessionToken } from '../auth/crypto.ts';
import { hashRecoveryCode } from '../auth/recovery.ts';
import { getDhakaDateString } from '../utils/time.ts';
import { campaignAcceptsWork } from '../../utils/campaign-deadline.ts';
import { calculateMonthlyPerformance, monthWindow, winnerEligible, type EligibleTask } from '../utils/ambassador-performance.ts';
import { queueAmbassadors, queueManagers } from '../notifications/notification-core.ts';

type Data = Record<string, unknown>;
type Reply = { status: number; data?: unknown; headers?: Record<string, string> };
type Context = { token?: string; ambassadorToken?: string; ip?: string; query?: Record<string, string> };
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
    if (!superAdmin && (!assigned || !['hr_admin','team_manager'].includes(staff.role))) return error(403, 'Campus Hub manager access required.');
    if (path === '/api/ambassadors/admin/state' && verb === 'GET') {
      const campuses = await getRows(db, 'SELECT * FROM amb_campuses ORDER BY name');
      const people = await getRows(db, `SELECT p.id,p.ambassador_code,p.name,p.email,p.department,p.campus_id,p.is_lead,p.status,p.must_change_password,c.name AS campus_name
        FROM amb_people p JOIN amb_campuses c ON c.id=p.campus_id ORDER BY p.ambassador_code COLLATE NOCASE`);
      const campaigns = await getRows(db, `SELECT c.*, CASE WHEN c.status='archived' THEN 'archived' WHEN c.due_date < ? THEN 'expired' ELSE 'active' END AS effective_status, (SELECT COUNT(*) FROM amb_assignments a WHERE a.campaign_id=c.id) AS assignments
        FROM amb_campaigns c ORDER BY c.created_at DESC`, getDhakaDateString());
      const submissions = await getRows(db, `SELECT s.id,s.assignment_id,s.proof_url,s.notes,s.status,s.submitted_at,s.reviewed_at,s.review_note,s.quality_score,
        p.name AS ambassador_name,p.email AS ambassador_email,p.campus_id,c.title AS campaign_title,c.points,c.due_date
        FROM amb_submissions s JOIN amb_assignments a ON a.id=s.assignment_id
        JOIN amb_people p ON p.id=a.ambassador_id JOIN amb_campaigns c ON c.id=a.campaign_id ORDER BY s.submitted_at DESC LIMIT 500`);
      const assignments = await getRows(db, `SELECT a.id,a.campaign_id,a.ambassador_id,p.ambassador_code,p.name AS ambassador_name,
        s.status AS submission_status FROM amb_assignments a JOIN amb_people p ON p.id=a.ambassador_id
        LEFT JOIN amb_submissions s ON s.assignment_id=a.id ORDER BY p.ambassador_code COLLATE NOCASE LIMIT 2000`);
      const leaderboard = await getRows(db, `SELECT p.id,p.name,p.ambassador_code,cp.name AS campus_name,
        COALESCE(SUM(CASE WHEN s.status='approved' THEN c.points ELSE 0 END),0) AS points,
        COUNT(CASE WHEN s.status='approved' THEN 1 END) AS approved,
        COUNT(a.id) AS assigned,
        ROUND(AVG(CASE WHEN s.status='approved' THEN s.quality_score END),1) AS quality_average,
        COUNT(CASE WHEN s.status='approved' AND date(s.submitted_at/1000,'unixepoch','+6 hours') <= c.due_date THEN 1 END) AS on_time
        FROM amb_people p JOIN amb_campuses cp ON cp.id=p.campus_id
        LEFT JOIN amb_assignments a ON a.ambassador_id=p.id LEFT JOIN amb_campaigns c ON c.id=a.campaign_id
        LEFT JOIN amb_submissions s ON s.assignment_id=a.id GROUP BY p.id ORDER BY points DESC,p.ambassador_code COLLATE NOCASE LIMIT 100`);
      const awards = await getRows(db, `SELECT w.*,p.ambassador_code,p.name AS ambassador_name FROM amb_recognition_awards w
        JOIN amb_people p ON p.id=w.ambassador_id ORDER BY w.awarded_at DESC LIMIT 500`);
      const managers = superAdmin ? await getRows(db, `SELECT u.id,u.employee_id,u.name FROM amb_program_managers m JOIN users u ON u.id=m.user_id ORDER BY u.name`) : [];
      // Human ID ordering: AGN2 must appear before AGN10, regardless of name.
      const byCode = new Intl.Collator('en', {numeric:true,sensitivity:'base'});
      people.sort((a,b)=>byCode.compare(String((a as Data).ambassador_code),String((b as Data).ambassador_code)));
      assignments.sort((a,b)=>byCode.compare(String((a as Data).ambassador_code),String((b as Data).ambassador_code)));
      managers.sort((a,b)=>byCode.compare(String((a as Data).employee_id),String((b as Data).employee_id)));
      return ok({ enabled, is_super_admin: superAdmin, campuses, people, campaigns, assignments, submissions, leaderboard, awards, managers });
    }
    if (path === '/api/ambassadors/admin/performance' && verb === 'GET') {
      // Explicit manager-only route; no client-calculated or client-supplied scores.
      const month = String(ctx.query?.month ?? getDhakaDateString().slice(0,7));
      let window: ReturnType<typeof monthWindow>;
      try { window = monthWindow(month, getDhakaDateString()); }
      catch { return error(400,'Select a valid YYYY-MM month (2000–2100).'); }
      const members = await getRows<{id:string;ambassador_code:string;name:string;campus_name:string;status:string}>(db,
        `SELECT p.id,p.ambassador_code,p.name,cp.name AS campus_name,p.status
         FROM amb_people p JOIN amb_campuses cp ON cp.id=p.campus_id ORDER BY p.ambassador_code COLLATE NOCASE,p.id`);
      const allTasks = window.cutoff >= window.start ? await getRows<EligibleTask & {ambassador_id:string}>(db,
        `SELECT a.ambassador_id,c.due_date,c.points,s.status,s.quality_score,s.submitted_at
         FROM amb_assignments a JOIN amb_campaigns c ON c.id=a.campaign_id
         LEFT JOIN amb_submissions s ON s.assignment_id=a.id
         WHERE c.due_date >= ? AND c.due_date <= ?`, window.start,window.cutoff) : [];
      const tasksByOwner = new Map<string,EligibleTask[]>();
      for (const task of allTasks) {
        const items=tasksByOwner.get(task.ambassador_id)||[];
        items.push(task);
        tasksByOwner.set(task.ambassador_id,items);
      }
      const results = members.map(person => ({ ...person,
        ...calculateMonthlyPerformance(tasksByOwner.get(person.id)||[]) }));
      results.sort((a,b)=> (b.score??-1)-(a.score??-1) || b.approved-a.approved ||
        (b.quality_average??0)-(a.quality_average??0) || a.ambassador_code.localeCompare(b.ambassador_code,undefined,{numeric:true}));
      const winner = results.find(r=>winnerEligible(r)) || null;
      return ok({ month,as_of:window.cutoff,complete:window.complete,
        weights:{completion:40,quality:30,timeliness:15,consistency:15},
        winner: winner ? {id:winner.id,name:winner.name,ambassador_code:winner.ambassador_code,
          campus_name:winner.campus_name,score:winner.score} : null,
        leaderboard:results });
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
      if (body.remove === true) {
        await db.prepare('DELETE FROM amb_program_managers WHERE user_id=?').bind(target.id).run();
        await db.prepare("DELETE FROM amb_push_subscriptions WHERE owner_type='manager' AND owner_id=?").bind(target.id).run();
      }
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
      if (status === 'inactive') {
        await db.prepare('DELETE FROM amb_sessions WHERE ambassador_id=?').bind(id).run();
        await db.prepare("DELETE FROM amb_push_subscriptions WHERE owner_type='ambassador' AND owner_id=?").bind(id).run();
      }
      await logAudit(db,staff,'AMBASSADOR_STATUS','amb_person',id,{ status },ctx.ip);
      return ok({ success: true });
    }
    // Edit details while retaining stable internal IDs, assignments and recognition history.
    if (path === '/api/ambassadors/admin/people/edit' && verb === 'POST') {
      const id=input(body.id,90), name=input(body.name,130), email=input(body.email,180),
        dept=input(body.department,130), campusId=input(body.campus_id,90);
      if(name.length<2 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return error(400,'Check name and email.');
      const target=await db.prepare('SELECT id FROM amb_people WHERE id=?').bind(id).first();
      const campus=await db.prepare("SELECT id FROM amb_campuses WHERE id=? AND status='active'").bind(campusId).first();
      if(!target||!campus)return error(404,'Ambassador or active campus not found.');
      await db.prepare('UPDATE amb_people SET name=?,email=?,department=?,campus_id=?,is_lead=?,updated_at=? WHERE id=?')
        .bind(name,email,dept,campusId,body.is_lead===true?1:0,Date.now(),id).run();
      await logAudit(db,staff,'AMBASSADOR_EDIT','amb_person',id,{name,campusId},ctx.ip);
      return ok({success:true});
    }
    if (path === '/api/ambassadors/admin/people/delete' && verb === 'POST') {
      if(!superAdmin)return error(403,'Only Super Admin can permanently delete unused ambassador profiles.');
      const id=input(body.id,90),confirm=input(body.confirm_code,40).toUpperCase();
      const target=await db.prepare('SELECT ambassador_code FROM amb_people WHERE id=?').bind(id).first<{ambassador_code:string}>();
      if(!target)return error(404,'Ambassador not found.');
      if(confirm!==target.ambassador_code)return error(400,'Enter the exact Ambassador ID to confirm.');
      const count=await db.prepare('SELECT COUNT(*) AS n FROM amb_assignments WHERE ambassador_id=?').bind(id).first<{n:number}>();
      if(Number(count?.n)>0)return error(409,'This ambassador has task history. Deactivate instead to preserve approvals and points.');
      // Never partially erase sessions or device records if any historical evidence exists.
      const notifs=await db.prepare("SELECT COUNT(*) AS n FROM amb_notifications WHERE owner_type='ambassador' AND owner_id=?").bind(id).first<{n:number}>();
      const awards=await db.prepare('SELECT COUNT(*) AS n FROM amb_recognition_awards WHERE ambassador_id=?').bind(id).first<{n:number}>();
      if(Number(notifs?.n)>0||Number(awards?.n)>0)return error(409,'Notification or recognition history exists. Deactivate to preserve evidence.');
      await db.prepare('DELETE FROM amb_sessions WHERE ambassador_id=?').bind(id).run();
      await db.prepare('DELETE FROM amb_login_attempts WHERE code=?').bind(confirm).run();
      await db.prepare("DELETE FROM amb_notification_deliveries WHERE subscription_id IN (SELECT id FROM amb_push_subscriptions WHERE owner_type='ambassador' AND owner_id=?)").bind(id).run();
      await db.prepare("DELETE FROM amb_push_subscriptions WHERE owner_type='ambassador' AND owner_id=?").bind(id).run();
      await db.prepare("DELETE FROM amb_notification_preferences WHERE owner_type='ambassador' AND owner_id=?").bind(id).run();
      await db.prepare('DELETE FROM amb_people WHERE id=? AND NOT EXISTS (SELECT 1 FROM amb_assignments WHERE ambassador_id=?)').bind(id,id).run();
      await logAudit(db,staff,'AMBASSADOR_DELETE','amb_person',id,{ambassador_code:confirm},ctx.ip);
      return ok({success:true});
    }
    if (path === '/api/ambassadors/admin/campuses/edit' && verb === 'POST') {
      const id=input(body.id,90),name=input(body.name,110),city=input(body.city,90),status=input(body.status,15);
      if(name.length<3||!['active','inactive'].includes(status))return error(400,'Invalid campus name/status.');
      const c=await db.prepare('SELECT id FROM amb_campuses WHERE id=?').bind(id).first();
      if(!c)return error(404,'Campus not found.');
      await db.prepare('UPDATE amb_campuses SET name=?,city=?,status=? WHERE id=?').bind(name,city,status,id).run();
      await logAudit(db,staff,'CAMPUS_EDIT','amb_campus',id,{name,status},ctx.ip);return ok({success:true});
    }
    if (path === '/api/ambassadors/admin/campuses/delete' && verb === 'POST') {
      if(!superAdmin)return error(403,'Only Super Admin can remove unused campuses.');
      const id=input(body.id,90);
      const c=await db.prepare('SELECT id,name FROM amb_campuses WHERE id=?').bind(id).first<{id:string;name:string}>();
      if(!c)return error(404,'Campus not found.');
      if(input(body.confirm_name,110)!==c.name)return error(400,'Type the campus name to confirm.');
      const r=await db.prepare('DELETE FROM amb_campuses WHERE id=? AND NOT EXISTS (SELECT 1 FROM amb_people WHERE campus_id=?)').bind(id,id).run();
      if(Number(r.meta?.changes)===0)return error(409,'Campus has ambassadors. Move them first or mark campus inactive.');
      await logAudit(db,staff,'CAMPUS_DELETE','amb_campus',id,{name:c.name},ctx.ip);return ok({success:true});
    }
    if (path === '/api/ambassadors/admin/campaigns/edit' && verb === 'POST') {
      const id=input(body.id,90),title=input(body.title,140),instructions=input(body.instructions,1800),
        type=input(body.content_type,18),due=input(body.due_date,10),points=Number(body.points);
      if(title.length<5||instructions.length<12||!['share','post','video','outreach','event','other'].includes(type)||!validDate(due)||due<getDhakaDateString()||!Number.isInteger(points)||points<0||points>100)
        return error(400,'Campaign details must be valid and the due date cannot be in the past (Dhaka time).');
      const c=await db.prepare('SELECT * FROM amb_campaigns WHERE id=?').bind(id).first<Record<string,unknown>>();
      if(!c)return error(404,'Campaign not found.');
      const count=await db.prepare('SELECT COUNT(*) AS n FROM amb_submissions s JOIN amb_assignments a ON a.id=s.assignment_id WHERE a.campaign_id=?').bind(id).first<{n:number}>();
      if(Number(count?.n)>0)return error(409,'Submissions already exist. Archive this campaign and create a corrected campaign to protect rating history.');
      await db.prepare('UPDATE amb_campaigns SET title=?,instructions=?,content_type=?,due_date=?,points=? WHERE id=?')
        .bind(title,instructions,type,due,points,id).run();
      await logAudit(db,staff,'CAMPAIGN_EDIT','amb_campaign',id,{title,due,points},ctx.ip);return ok({success:true});
    }
    if (path === '/api/ambassadors/admin/campaigns/archive' && verb === 'POST') {
      const id=input(body.id,90),status=input(body.status,15);
      if(!['active','archived'].includes(status))return error(400,'Invalid status.');
      const c=await db.prepare('SELECT id,due_date,status FROM amb_campaigns WHERE id=?').bind(id).first<{id:string;due_date:string;status:string}>();
      if(!c)return error(404,'Campaign not found.');
      if(status==='active'&&!campaignAcceptsWork('active',c.due_date,getDhakaDateString())) return error(409,'This deadline has passed. Create a new campaign instead of restoring an expired task.');
      await db.prepare('UPDATE amb_campaigns SET status=? WHERE id=?').bind(status,id).run();
      await logAudit(db,staff,'CAMPAIGN_STATUS','amb_campaign',id,{status},ctx.ip);return ok({success:true});
    }
    if (path === '/api/ambassadors/admin/campaigns/delete' && verb === 'POST') {
      if(!superAdmin)return error(403,'Super Admin required for permanent deletion.');
      const id=input(body.id,90);
      const c=await db.prepare('SELECT title FROM amb_campaigns WHERE id=?').bind(id).first<{title:string}>();
      if(!c)return error(404,'Campaign not found.');
      if(input(body.confirm_title,140)!==c.title)return error(400,'Type exact campaign title to confirm.');
      const count=await db.prepare('SELECT COUNT(*) AS n FROM amb_submissions s JOIN amb_assignments a ON a.id=s.assignment_id WHERE a.campaign_id=?').bind(id).first<{n:number}>();
      if(Number(count?.n)>0)return error(409,'Campaign has submissions/reviews. Archive instead to preserve ratings.');
      await db.prepare('DELETE FROM amb_assignments WHERE campaign_id=? AND NOT EXISTS (SELECT 1 FROM amb_submissions WHERE assignment_id=amb_assignments.id)').bind(id).run();
      await db.prepare('DELETE FROM amb_campaigns WHERE id=? AND NOT EXISTS (SELECT 1 FROM amb_assignments WHERE campaign_id=?)').bind(id,id).run();
      await logAudit(db,staff,'CAMPAIGN_DELETE','amb_campaign',id,{title:c.title},ctx.ip);return ok({success:true});
    }
    if (path === '/api/ambassadors/admin/assignments/add' && verb === 'POST') {
      const campaignId=input(body.campaign_id,90),ambassadorId=input(body.ambassador_id,90);
      const camp=await db.prepare("SELECT id,status,due_date FROM amb_campaigns WHERE id=?").bind(campaignId).first<{id:string;status:string;due_date:string}>();
      const person=await db.prepare("SELECT id FROM amb_people WHERE id=? AND status='active'").bind(ambassadorId).first();
      if(!camp||!person||!campaignAcceptsWork(camp.status,camp.due_date,getDhakaDateString())) return error(409,'Select an active campaign with an unexpired deadline and an active ambassador.');
      const exists=await db.prepare('SELECT id FROM amb_assignments WHERE campaign_id=? AND ambassador_id=?').bind(campaignId,ambassadorId).first();
      if(exists)return error(409,'Already assigned.');
      const id=uid();await db.prepare('INSERT INTO amb_assignments(id,campaign_id,ambassador_id,assigned_at) VALUES(?,?,?,?)').bind(id,campaignId,ambassadorId,Date.now()).run();
      await logAudit(db,staff,'ASSIGNMENT_ADD','amb_assignment',id,{campaignId,ambassadorId},ctx.ip);
      try { await queueAmbassadors(db,[ambassadorId],'task',`assignment:${id}`,'New AGN task assigned','Check your Campus Hub for the new assignment.'); } catch(e){ console.error('Push queue failed',e); }
      return ok({success:true});
    }
    if (path === '/api/ambassadors/admin/assignments/reassign' && verb === 'POST') {
      const id=input(body.id,90),personId=input(body.ambassador_id,90);
      const original=await db.prepare('SELECT a.id,a.campaign_id,a.ambassador_id,c.status AS campaign_status,c.due_date FROM amb_assignments a JOIN amb_campaigns c ON c.id=a.campaign_id WHERE a.id=?').bind(id).first<{id:string;campaign_id:string;ambassador_id:string;campaign_status:string;due_date:string}>();
      if(!original)return error(404,'Assignment not found.');
      if(!campaignAcceptsWork(original.campaign_status,original.due_date,getDhakaDateString())) return error(409,'Expired or archived assignments cannot be reassigned.');
      const target=await db.prepare("SELECT id FROM amb_people WHERE id=? AND status='active'").bind(personId).first();
      if(!target)return error(400,'Choose an active ambassador.');
      const proof=await db.prepare('SELECT id FROM amb_submissions WHERE assignment_id=?').bind(id).first();
      if(proof)return error(409,'Cannot reassign a task after submission. Archive or create a new assignment.');
      const duplicate=await db.prepare('SELECT id FROM amb_assignments WHERE campaign_id=? AND ambassador_id=?').bind(original.campaign_id,personId).first();
      if(duplicate && (duplicate as {id:string}).id!==id)return error(409,'New ambassador already has this task.');
      const changed=await db.prepare(`UPDATE amb_assignments SET ambassador_id=? WHERE id=? AND NOT EXISTS
        (SELECT 1 FROM amb_submissions WHERE assignment_id=?)`).bind(personId,id,id).run();
      if(Number(changed.meta?.changes)===0)return error(409,'Assignment changed while being edited.');
      await logAudit(db,staff,'ASSIGNMENT_REASSIGN','amb_assignment',id,{previous:original.ambassador_id,next:personId},ctx.ip);
      try{await queueAmbassadors(db,[personId],'task',`reassign:${id}:${personId}`,'AGN task reassigned','A task is now assigned to you.');}catch(e){console.error('Notification queue failed',e);}
      return ok({success:true});
    }
    if (path === '/api/ambassadors/admin/assignments/delete' && verb === 'POST') {
      const id=input(body.id,90);
      const assigned=await db.prepare('SELECT a.id,p.ambassador_code FROM amb_assignments a JOIN amb_people p ON p.id=a.ambassador_id WHERE a.id=?').bind(id).first<{id:string;ambassador_code:string}>();
      if(!assigned)return error(404,'Assignment not found.');
      if(input(body.confirm_code,40).toUpperCase()!==assigned.ambassador_code)return error(400,'Confirm the assigned Ambassador ID.');
      const result=await db.prepare('DELETE FROM amb_assignments WHERE id=? AND NOT EXISTS (SELECT 1 FROM amb_submissions WHERE assignment_id=?)').bind(id,id).run();
      if(Number(result.meta?.changes)===0)return error(409,'Submission already exists. Archive the campaign instead.');
      await logAudit(db,staff,'ASSIGNMENT_DELETE','amb_assignment',id,{ambassador:assigned.ambassador_code},ctx.ip);return ok({success:true});
    }
    if (path === '/api/ambassadors/admin/awards' && verb === 'POST') {
      const ambassadorId=input(body.ambassador_id,90),title=input(body.title,110),description=input(body.description,1200),month=input(body.award_month,7);
      if(title.length<4 || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) return error(400,'Valid recognition title and award month are required.');
      const member=await db.prepare('SELECT id FROM amb_people WHERE id=?').bind(ambassadorId).first();
      if(!member)return error(404,'Ambassador not found.');
      const id=uid(),now=Date.now();
      await db.prepare(`INSERT INTO amb_recognition_awards(id,ambassador_id,title,description,award_month,awarded_by,awarded_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?)`).bind(id,ambassadorId,title,description,month,staff.id,now,now).run();
      await logAudit(db,staff,'RECOGNITION_CREATE','amb_award',id,{ambassadorId,title,month},ctx.ip);
      return ok({id});
    }
    if (path === '/api/ambassadors/admin/awards/update' && verb === 'POST') {
      const id=input(body.id,90),title=input(body.title,110),description=input(body.description,1200),month=input(body.award_month,7);
      if(title.length<4||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return error(400,'Check title and month.');
      const row=await db.prepare("SELECT id FROM amb_recognition_awards WHERE id=? AND status='active'").bind(id).first();
      if(!row)return error(404,'Active award not found.');
      await db.prepare('UPDATE amb_recognition_awards SET title=?,description=?,award_month=?,updated_at=? WHERE id=?')
        .bind(title,description,month,Date.now(),id).run();
      await logAudit(db,staff,'RECOGNITION_EDIT','amb_award',id,{title,month},ctx.ip);
      return ok({success:true});
    }
    if (path === '/api/ambassadors/admin/awards/revoke' && verb === 'POST') {
      if(!superAdmin)return error(403,'Only Super Admin can revoke published recognition.');
      const id=input(body.id,90),reason=input(body.reason,1000);
      if(reason.length<12)return error(400,'A reason of at least 12 characters is required.');
      const row=await db.prepare("SELECT id FROM amb_recognition_awards WHERE id=? AND status='active'").bind(id).first();
      if(!row)return error(404,'Active award not found.');
      await db.prepare("UPDATE amb_recognition_awards SET status='revoked',updated_at=? WHERE id=? AND status='active'").bind(Date.now(),id).run();
      await logAudit(db,staff,'RECOGNITION_REVOKE','amb_award',id,{reason},ctx.ip);
      return ok({success:true});
    }
    if (path === '/api/ambassadors/admin/reviews/correct' && verb === 'POST') {
      if(!superAdmin)return error(403,'Only Super Admin may correct a completed review.');
      const id=input(body.submission_id,90),note=input(body.reason,1000),action=input(body.action,15),score=Number(body.quality_score);
      if(note.length<12||!['rerate','revoke'].includes(action)||action==='rerate'&&(!Number.isInteger(score)||score<1||score>5))
        return error(400,'Select a valid correction and provide at least 12 characters explaining why.');
      const prior=await db.prepare("SELECT id,status,quality_score FROM amb_submissions WHERE id=?").bind(id).first<{id:string;status:string;quality_score:number}>();
      if(!prior||prior.status!=='approved')return error(409,'Only approved work can have its rating corrected or approval revoked.');
      const result=await db.prepare("UPDATE amb_submissions SET status=?,quality_score=?,review_note=?,reviewed_by=?,reviewed_at=? WHERE id=? AND status='approved'")
        .bind(action==='revoke'?'rejected':'approved',action==='revoke'?null:score,note,staff.id,Date.now(),id).run();
      if(Number(result.meta?.changes)===0)return error(409,'Review changed. Reload and retry.');
      await db.prepare('INSERT INTO amb_review_events(id,submission_id,reviewer_id,decision,note,recorded_at) VALUES(?,?,?,?,?,?)')
        .bind(uid(),id,staff.id,action==='revoke'?'approval_revoked':`rating_corrected_${score}`,note,Date.now()).run();
      await logAudit(db,staff,'REVIEW_CORRECTION','amb_submission',id,{previousScore:prior.quality_score,action,newScore:action==='rerate'?score:null,reason:note},ctx.ip);
      return ok({success:true});
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
          || !['all','campus','individual'].includes(scope) || !validDate(dueDate) || dueDate < getDhakaDateString()
          || !Number.isInteger(points) || points < 0 || points > 100) return error(400,'Campaign deadline must be today or later in Asia/Dhaka; also check title, instructions, type, target and points (0–100).');
      if (scope !== 'all' && !targetId) return error(400,'Select a target campus or ambassador.');
      const whoQuery = scope === 'all' ? "SELECT id FROM amb_people WHERE status='active'"
        : scope === 'campus' ? "SELECT id FROM amb_people WHERE status='active' AND campus_id=?"
        : "SELECT id FROM amb_people WHERE status='active' AND id=?";
      const targets = await getRows<{id:string}>(db,whoQuery,...(scope === 'all' ? []:[targetId]));
      if (!targets.length) return error(400,'No active ambassadors match the selected target.');
      const id=uid(),now=Date.now();
      // D1 batch is transactional: a partial campus-wide assignment is not published.
      await db.batch([
        db.prepare(`INSERT INTO amb_campaigns (id,title,instructions,content_type,target_scope,target_id,points,due_date,created_by,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,title,instructions,contentType,scope,scope==='all'?null:targetId,points,dueDate,staff.id,now),
        ...targets.map(target=>db.prepare('INSERT INTO amb_assignments (id,campaign_id,ambassador_id,assigned_at) VALUES (?,?,?,?)')
          .bind(uid(),id,target.id,now)),
      ]);
      await logAudit(db,staff,'CAMPAIGN_CREATE','amb_campaign',id,{ title,assignments:targets.length },ctx.ip);
      try {
        await queueAmbassadors(db,targets.map(t=>t.id),'task',`campaign:${id}`,'New AGN task assigned',`${title} · Due ${dueDate}`);
        await queueManagers(db,'task',`campaign-manager:${id}`,'AGN campaign published',`${title} assigned to ${targets.length} ambassadors.`);
      } catch(e) { console.error('Notification queue failed after campaign creation',e); }
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
      const owner=await db.prepare('SELECT a.ambassador_id,c.title FROM amb_submissions s JOIN amb_assignments a ON a.id=s.assignment_id JOIN amb_campaigns c ON c.id=a.campaign_id WHERE s.id=?').bind(id).first<{ambassador_id:string;title:string}>();
      if(owner) { try { await queueAmbassadors(db,[owner.ambassador_id],'review',`review:${id}:${decision}`,decision==='approved'?'AGN submission approved':decision==='revision_requested'?'AGN revision requested':'AGN submission reviewed',`${owner.title} · ${decision.replace('_',' ')}`); } catch(e){ console.error('Notification queue failed after review',e); } }
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
    const today = getDhakaDateString();
    const tasks = await getRows(db,`SELECT a.id AS assignment_id,c.title,c.instructions,c.content_type,c.points,c.due_date,CASE WHEN c.status='archived' THEN 'archived' WHEN c.due_date < ? THEN 'expired' ELSE 'active' END AS campaign_status,
      s.id AS submission_id,s.proof_url,s.notes,s.status AS submission_status,s.review_note,s.quality_score,s.submitted_at
      FROM amb_assignments a JOIN amb_campaigns c ON c.id=a.campaign_id
      LEFT JOIN amb_submissions s ON s.assignment_id=a.id WHERE a.ambassador_id=? ORDER BY c.due_date DESC,c.created_at DESC`,today,member.id);
    const campusProgress = Number(member.is_lead) ? await db.prepare(`SELECT COUNT(DISTINCT a.id) AS assigned,
      COUNT(DISTINCT CASE WHEN s.status='approved' THEN a.id END) AS approved
      FROM amb_assignments a JOIN amb_people p ON p.id=a.ambassador_id
      LEFT JOIN amb_submissions s ON s.assignment_id=a.id WHERE p.campus_id=?`).bind(member.campus_id).first() : null;
    const period=monthWindow(today.slice(0,7),today);
    const performanceTasks = period.cutoff >= period.start ? await getRows<EligibleTask>(db,
      `SELECT c.due_date,c.points,s.status,s.quality_score,s.submitted_at
       FROM amb_assignments a JOIN amb_campaigns c ON c.id=a.campaign_id
       LEFT JOIN amb_submissions s ON s.assignment_id=a.id
       WHERE a.ambassador_id=? AND c.due_date >= ? AND c.due_date <= ?`,member.id,period.start,period.cutoff) : [];
    const awards=await getRows(db,`SELECT id,title,description,award_month,awarded_at FROM amb_recognition_awards
      WHERE ambassador_id=? AND status='active' ORDER BY award_month DESC,awarded_at DESC LIMIT 30`,member.id);
    return ok({ tasks, awards, campus_progress: campusProgress, today,
      monthly_performance: {month:today.slice(0,7), ...calculateMonthlyPerformance(performanceTasks)} });
  }
  if (path === '/api/ambassadors/submit' && verb === 'POST') {
    const assignmentId=input(body.assignment_id,90),url=input(body.proof_url,1501),notes=input(body.notes,1000);
    if (!validProof(url)) return error(400,'Use a valid HTTPS proof URL (max 1500 characters).');
    const assignment = await db.prepare(`SELECT a.id,c.status AS campaign_status,c.due_date FROM amb_assignments a JOIN amb_campaigns c ON c.id=a.campaign_id
      WHERE a.id=? AND a.ambassador_id=?`).bind(assignmentId,member.id).first<{id:string;campaign_status:string;due_date:string}>();
    if (!assignment) return error(404,'Assigned task not found.');
    if (!campaignAcceptsWork(assignment.campaign_status,assignment.due_date,getDhakaDateString())) return error(409,'Submission closed: this campaign is archived or its Dhaka-time deadline has passed. Contact your programme manager for a new campaign.');
    const old = await db.prepare('SELECT id,status,revisions FROM amb_submissions WHERE assignment_id=?').bind(assignmentId)
      .first<{id:string;status:string;revisions:number}>();
    const now=Date.now();
    if (!old) await db.prepare('INSERT INTO amb_submissions (id,assignment_id,proof_url,notes,submitted_at) VALUES (?,?,?,?,?)')
      .bind(uid(),assignmentId,url,notes,now).run();
    else if (old.status === 'revision_requested') {
      const updated = await db.prepare(`UPDATE amb_submissions SET proof_url=?,notes=?,status='submitted',submitted_at=?,reviewed_by=NULL,reviewed_at=NULL,
        review_note='',quality_score=NULL,revisions=? WHERE id=? AND status='revision_requested'`)
        .bind(url,notes,now,Number(old.revisions)+1,old.id).run();
      if (updated.meta?.changes === 0) return error(409,'This submission was reviewed while you were editing. Reload.');
    } else if (old.status === 'submitted' && body.edit_pending === true) {
      // Draft correction is possible only before a manager reviews the submission.
      // Timestamp is updated so a post-deadline edit cannot inherit an earlier on-time score.
      const updated = await db.prepare(`UPDATE amb_submissions SET proof_url=?,notes=?,submitted_at=?,revisions=revisions+1
        WHERE id=? AND assignment_id=? AND status='submitted'`).bind(url,notes,now,old.id,assignmentId).run();
      if (updated.meta?.changes === 0) return error(409,'A manager has already reviewed this submission. Reload.');
      await logAudit(db,null,'AMBASSADOR_SUBMISSION_EDIT','amb_submission',old.id,{ambassador_id:member.id,assignment_id:assignmentId},ctx.ip);
    } else return error(409,'This task is already submitted or has a final review decision.');
    try { await queueManagers(db,'task',`submission:${assignmentId}:${now}`,'New AGN submission',`An ambassador has submitted work for review.`); } catch(e){ console.error('Notification queue failed after submission',e); }
    return ok({ success:true });
  }
  if (path === '/api/ambassadors/withdraw' && verb === 'POST') {
    const assignmentId=input(body.assignment_id,90);
    // Only the author can withdraw unreviewed work; approved/rejected/revision
    // records (and their linked rating history) must remain intact.
    const submitted=await db.prepare(`SELECT s.id FROM amb_submissions s
      JOIN amb_assignments a ON a.id=s.assignment_id
      WHERE a.id=? AND a.ambassador_id=? AND s.status='submitted'
        AND NOT EXISTS (SELECT 1 FROM amb_review_events e WHERE e.submission_id=s.id)`)
      .bind(assignmentId,member.id).first<{id:string}>();
    if (!submitted) return error(409,'Only your own submissions with no manager review history can be withdrawn.');
    const removed=await db.prepare(`DELETE FROM amb_submissions WHERE id=? AND assignment_id=? AND status='submitted'
        AND NOT EXISTS (SELECT 1 FROM amb_review_events e WHERE e.submission_id=amb_submissions.id)`)
      .bind(submitted.id,assignmentId).run();
    if (removed.meta?.changes === 0) return error(409,'A manager reviewed your submission. Reload.');
    await logAudit(db,null,'AMBASSADOR_SUBMISSION_WITHDRAW','amb_submission',submitted.id,
      {ambassador_id:member.id,assignment_id:assignmentId},ctx.ip);
    return ok({success:true});
  }
  return error(404,'Campus Ambassador endpoint not found.');
}
