/** AGN CRM: unified lead attribution, follow-ups, and isolated commission-agent accounts.
 * No unauthenticated lead data is returned. All writes are permission-checked server-side.
 */
import type { D1DatabaseLike } from '../db/types.ts';
import { getUserFromSession } from '../routes/api-handler.ts';
import { hashPassword, verifyPassword, generateSessionToken } from '../auth/crypto.ts';
import { hashRecoveryCode } from '../auth/recovery.ts';
import { getDhakaDateString } from '../utils/time.ts';

type Dict = Record<string, unknown>;
type Reply = {status:number;data:unknown;headers?:Record<string,string>;binary?:Uint8Array};
type Context = {officeToken?:string;ambassadorToken?:string;commissionToken?:string;query?:Record<string,string>};
type Actor = {kind:'office'|'ambassador'|'commission';id:string;name:string;role:string;team?:string;selfCode?:string};
const fail = (status:number,error:string):Reply=>({status,data:{error}});
const success=(data:unknown):Reply=>({status:200,data});
const str=(v:unknown,max=255)=>String(v??'').trim().slice(0,max);
const uuid=()=>crypto.randomUUID();
const daysAfterDhaka=(ts:number,days:number)=>{const d=getDhakaDateString(new Date(ts));const u=new Date(d+'T12:00:00Z');u.setUTCDate(u.getUTCDate()+days);return u.toISOString().slice(0,10);};
const dateOk=(v:string)=>/^\d{4}-\d\d-\d\d$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const rowList=async(db:D1DatabaseLike,sql:string,...vals:unknown[])=>((await db.prepare(sql).bind(...vals).all<Dict>()).results||[]);
const admin=(a:Actor)=>a.kind==='office'&&['super_admin','hr_admin'].includes(a.role);
const stages=['New','Contacted','Counselling','Application Started','Offer Letter Received','On Board','Documents Submitted to VFS','VFS Appointment Waiting','Embassy Waiting','Visa Approved','Visa Refused','Closed - Not Interested','Other'];
const cookie='boss_commission_session';
const sessionMax=12*60*60*1000;
const validPhone=(s:string)=>/^\+?[\d()\s-]{7,24}$/.test(s);
const normalizePhone=(s:string)=>{
  const digits=s.replace(/\D/g,'');
  // Normalize Bangladesh local and E.164 numbers to the same contact.
  if(/^008801[3-9]\d{8}$/.test(digits))return digits.slice(2);
  if(/^01[3-9]\d{8}$/.test(digits))return '88'+digits;
  if(/^1[3-9]\d{8}$/.test(digits))return '880'+digits;
  return digits;
};
const validEmail=(s:string)=>!s||(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<=180);

async function actorFor(db:D1DatabaseLike,ctx:Context):Promise<Actor|null>{
  if(ctx.officeToken){const staff=await getUserFromSession(db,ctx.officeToken);
    if(staff&&staff.status==='active')return {kind:'office',id:staff.id,name:staff.name,role:staff.role,team:staff.team,selfCode:staff.employee_id};}
  if(ctx.ambassadorToken){const hashed=await hashRecoveryCode(ctx.ambassadorToken);
    const p=await db.prepare(`SELECT p.id,p.name,p.ambassador_code FROM amb_sessions s JOIN amb_people p ON p.id=s.ambassador_id
      WHERE s.id=? AND s.expires_at>? AND p.status='active' AND p.must_change_password=0`).bind(hashed,Date.now()).first<{id:string;name:string;ambassador_code:string}>();
    if(p)return {kind:'ambassador',id:p.id,name:p.name,role:'ambassador',selfCode:p.ambassador_code};}
  if(ctx.commissionToken){const hashed=await hashRecoveryCode(ctx.commissionToken);
    const p=await db.prepare(`SELECT a.id,a.name,a.agent_code,a.must_change_password FROM crm_commission_sessions s
      JOIN crm_commission_agents a ON a.id=s.agent_id WHERE s.id=? AND s.expires_at>? AND a.status='active'`)
      .bind(hashed,Date.now()).first<{id:string;name:string;agent_code:string;must_change_password:number}>();
    if(p)return {kind:'commission',id:p.id,name:p.name,role:Number(p.must_change_password)?'password_change_required':'commission',selfCode:p.agent_code};}
  return null;
}
async function delegated(db:D1DatabaseLike,a:Actor){
  if(a.kind!=='office')return {leads:false,agents:false};
  if(admin(a))return {leads:true,agents:true};
  const d=await db.prepare('SELECT can_manage_leads,can_manage_agents FROM crm_delegations WHERE user_id=?').bind(a.id).first<{can_manage_leads:number;can_manage_agents:number}>();
  return {leads:a.role==='team_manager'||Number(d?.can_manage_leads)===1,agents:Number(d?.can_manage_agents)===1};
}
async function canReadLead(db:D1DatabaseLike,a:Actor,l:Dict):Promise<boolean>{
  if(admin(a))return true;
  if(l.referrer_type===a.kind&&l.referrer_id===a.id)return true;
  if(a.kind!=='office')return false;
  if(l.assigned_to_user_id===a.id)return true;
  if(a.role==='team_manager' && !l.assigned_to_user_id && l.referral_status==='pending' && l.referrer_type==='office')return !!await db.prepare('SELECT id FROM users WHERE id=? AND team=?').bind(l.referrer_id,a.team).first();
  if(a.role==='team_manager'){
    const u=await db.prepare('SELECT id FROM users WHERE id=? AND team=?').bind(l.assigned_to_user_id,a.team).first();
    if(u)return true;
  }
  return false;
}
async function canManageLead(db:D1DatabaseLike,a:Actor,l:Dict):Promise<boolean>{
  if(admin(a))return true;
  if(a.kind!=='office')return false;
  const d=await delegated(db,a);
  if(!d.leads)return false;
  if(l.assigned_to_user_id===a.id)return true;
  if(a.role==='team_manager' && !l.assigned_to_user_id && l.referral_status==='pending' && l.referrer_type==='office')return !!await db.prepare('SELECT id FROM users WHERE id=? AND team=?').bind(l.referrer_id,a.team).first();
  if(a.role==='team_manager')return !!await db.prepare('SELECT id FROM users WHERE id=? AND team=?').bind(l.assigned_to_user_id,a.team).first();
  return false;
}
// Same access scope used by pagination AND exports. Never trust a UI filter for permissions.
function scopeWhere(a:Actor,managerOnly=false):{where:string;args:unknown[]}{
 if(admin(a))return {where:'1=1',args:[]};
 if(a.kind!=='office')return {where:'1=0',args:[]};
 if(a.role==='team_manager')return managerOnly?{where:"(l.assigned_to_user_id=? OR (o.team=? AND o.status='active') OR (l.assigned_to_user_id IS NULL AND l.referral_status='pending' AND l.referrer_type='office' AND EXISTS (SELECT 1 FROM users r WHERE r.id=l.referrer_id AND r.team=?)))",args:[a.id,a.team||'',a.team||'']}:{where:"(l.assigned_to_user_id=? OR (l.referrer_type='office' AND l.referrer_id=?) OR (o.team=? AND o.status='active') OR (l.assigned_to_user_id IS NULL AND l.referral_status='pending' AND l.referrer_type='office' AND EXISTS (SELECT 1 FROM users r WHERE r.id=l.referrer_id AND r.team=?)))",args:[a.id,a.id,a.team||'',a.team||'']};
 return managerOnly?{where:"l.assigned_to_user_id=?",args:[a.id]}:{where:"(l.assigned_to_user_id=? OR (l.referrer_type='office' AND l.referrer_id=?))",args:[a.id,a.id]};
}
const safeCell=(v:unknown):string=>{
 const s=String(v??'');
 // Explicit literal string cells. Guard against spreadsheet formula markers and control chars.
 return /^[\s\uFEFF]*[=+@\-\uFF1D\uFF0B\uFF0D\uFF20]/u.test(s)?"'"+s:s;
};
async function readAllExport(db:D1DatabaseLike,sql:string,args:unknown[]):Promise<Dict[]|null>{
 const results:Dict[]=[];
 const chunk=300;
 for(let offset=0;offset<50000;offset+=chunk){
   const batch=await rowList(db,sql+' LIMIT ? OFFSET ?',...args,chunk,offset);
   results.push(...batch);
   if(batch.length<chunk)return results;
 }
 return null; // fail explicitly rather than silently deliver a partial export
}
async function trail(db:D1DatabaseLike,leadId:string,a:Actor,action:string,from:unknown,to:unknown,note=''){
  await db.prepare(`INSERT INTO crm_lead_history(id,lead_id,action,old_value,new_value,note,actor_type,actor_id,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(uuid(),leadId,action,from===undefined?null:JSON.stringify(from),to===undefined?null:JSON.stringify(to),note,a.kind,a.id,Date.now()).run();
}

export async function handleCrmRequest(method:string,rawPath:string,body:Dict,ctx:Context,db:D1DatabaseLike):Promise<Reply>{
 const path=rawPath.replace(/^\/api\/crm\/agent\//,'/api/crm/');
 const verb=method.toUpperCase(), now=Date.now();
 // Separate password-protected commission portal; no employee attendance role.
 if(path==='/api/crm/login'&&verb==='POST'){
   const code=str(body.agent_code,40).toUpperCase(),password=String(body.password||'');
   if(!/^[A-Z0-9_-]{3,40}$/.test(code)||!password)return fail(401,'Invalid ID or password.');
   const attempt=await db.prepare('SELECT failures,locked_until,last_attempt FROM crm_commission_attempts WHERE agent_code=?').bind(code)
     .first<{failures:number;locked_until:number;last_attempt:number}>();
   if(Number(attempt?.locked_until)>now)return fail(429,'Too many attempts. Try again after 15 minutes.');
   const agent=await db.prepare('SELECT * FROM crm_commission_agents WHERE agent_code=?').bind(code).first<Dict>();
   const good=agent?.status==='active'&&await verifyPassword(password,String(agent.password_hash));
   if(!good){const failures=(attempt&&now-Number(attempt.last_attempt)<900000?Number(attempt.failures):0)+1;
     await db.prepare(`INSERT INTO crm_commission_attempts(agent_code,failures,locked_until,last_attempt) VALUES(?,?,?,?)
       ON CONFLICT(agent_code) DO UPDATE SET failures=excluded.failures,locked_until=excluded.locked_until,last_attempt=excluded.last_attempt`)
       .bind(code,failures,failures>=5?now+900000:0,now).run();return fail(401,'Invalid ID or password.');}
   await db.prepare('DELETE FROM crm_commission_attempts WHERE agent_code=?').bind(code).run();
   const token=generateSessionToken();
   await db.prepare('INSERT INTO crm_commission_sessions(id,agent_id,expires_at,created_at) VALUES(?,?,?,?)')
     .bind(await hashRecoveryCode(token),agent.id,now+sessionMax,now).run();
   return {status:200,data:{success:true,must_change_password:!!agent.must_change_password},headers:{'Set-Cookie':`${cookie}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/api/crm; Max-Age=${sessionMax/1000}`}};
 }
 if(path==='/api/crm/logout'&&verb==='POST'){
   if(ctx.commissionToken)await db.prepare('DELETE FROM crm_commission_sessions WHERE id=?').bind(await hashRecoveryCode(ctx.commissionToken)).run();
   return {status:200,data:{success:true},headers:{'Set-Cookie':`${cookie}=; HttpOnly; Secure; SameSite=Lax; Path=/api/crm; Max-Age=0`}};
 }
 const a=await actorFor(db,ctx);
 if(!a)return fail(401,'Please sign in to the appropriate Boss portal.');
 if(a.role==='password_change_required'&&path!=='/api/crm/change-password')return fail(403,'Change your temporary password before using the portal.');
 if(path==='/api/crm/change-password'&&verb==='POST'){
   if(a.kind!=='commission')return fail(403,'Only commission agents can use this action.');
   const pass=String(body.new_password||'');
   if(pass.length<12||pass.length>128)return fail(400,'New password must be 12–128 characters.');
   const person=await db.prepare('SELECT password_hash,must_change_password FROM crm_commission_agents WHERE id=?').bind(a.id).first<{password_hash:string;must_change_password:number}>();
   if(!person)return fail(401,'Account no longer active.');
   if(!Number(person.must_change_password)&&!(await verifyPassword(String(body.current_password||''),person.password_hash)))return fail(403,'Current password is required to change an existing password.');
   await db.prepare('UPDATE crm_commission_agents SET password_hash=?,must_change_password=0,updated_at=? WHERE id=?')
      .bind(await hashPassword(pass),now,a.id).run();
   return success({success:true});
 }
 if(path==='/api/crm/metrics'&&verb==='GET'){
   if(a.kind!=='office')return fail(403,'Office account required.');
   const {where,args}=scopeWhere(a);
   const today=getDhakaDateString();
   const m=await db.prepare(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN l.referral_status='pending' THEN 1 ELSE 0 END) AS pending,
    SUM(CASE WHEN p.relationship_status='lead' THEN 1 ELSE 0 END) AS leads,
    SUM(CASE WHEN p.relationship_status IN ('active_client','on_hold','completed') THEN 1 ELSE 0 END) AS clients,
    SUM(CASE WHEN p.relationship_status IN ('lost','closed') THEN 1 ELSE 0 END) AS closed,
    SUM(CASE WHEN l.next_followup_at IS NOT NULL AND l.next_followup_at < ? AND p.relationship_status IN ('lead','active_client') AND l.referral_status='approved' AND l.consent_confirmed_at>0 THEN 1 ELSE 0 END) AS overdue
   FROM crm_leads l JOIN crm_lead_profiles p ON p.lead_id=l.id LEFT JOIN users o ON o.id=l.assigned_to_user_id WHERE (${where})`).bind(today,...args).first<Dict>();
   return success({total:Number(m?.total||0),pending:Number(m?.pending||0),leads:Number(m?.leads||0),clients:Number(m?.clients||0),closed:Number(m?.closed||0),overdue:Number(m?.overdue||0)});
 }
 // Historical lead import. No auto-approval, no automatic consent, no overwriting existing records.
 // Each chunk commits atomically. The caller must show a preview before it sends commit=true.
 if(path==='/api/crm/import'&&verb==='POST'){
   if(!admin(a))return fail(403,'Only Super Admin / HR Admin may import historical students.');
   const rows=Array.isArray(body.rows)?body.rows:[];
   if(rows.length<1||rows.length>50)return fail(400,'Import 1 to 50 rows per batch.');
   const commit=body.commit===true,confirmed=body.consent_confirmed===true;
   const file=str(body.filename,150)||'historical-leads.csv';
   const issues:{row:number;reason:string}[]=[],accepted:Dict[]=[],seen=new Set<string>();
   for(let i=0;i<rows.length;i++){
     const input=rows[i]&&typeof rows[i]==='object'?rows[i] as Dict:{};
     const full_name=str(input.full_name,130),phone=str(input.phone,24),email=str(input.email,180);
     const normalized=normalizePhone(phone);
     let reason='';
     if(full_name.length<2||!validPhone(phone)||!validEmail(email))reason='Name, valid phone or email is missing/invalid';
     else if(seen.has(normalized))reason='Duplicate telephone within this batch';
     else if(await db.prepare('SELECT id FROM crm_leads WHERE phone_normalized=?').bind(normalized).first())reason='Possible existing student: matching phone (manual review required)';
     seen.add(normalized);
     if(reason)issues.push({row:i+1,reason});
     else accepted.push({full_name,phone,normalized,email,preferred_countries:str(input.preferred_countries,300),notes:str(input.notes,1500),referrer_display:str(input.referrer_display,150)||'Historical AGN lead sheet'});
   }
   if(!commit)return success({accepted:accepted.length,issues,total:rows.length});
   // Never silently accept a partial batch on confirm. The operator can remove invalid rows.
   if(issues.length)return {status:409,data:{error:'Correct or remove duplicate/invalid rows before importing.',issues}};
   const batchId=uuid(),due=confirmed?daysAfterDhaka(now,1):null;
   const statements=[db.prepare('INSERT INTO crm_import_batches(id,imported_by,source_filename,row_count,created_at) VALUES(?,?,?,?,?)').bind(batchId,a.id,file,accepted.length,now)];
   for(const r of accepted){
     const id=uuid();
     statements.push(db.prepare(`INSERT INTO crm_leads(id,full_name,phone,phone_normalized,email,preferred_countries,referrer_type,referrer_id,referrer_display,created_by_type,created_by_id,consent_confirmed_at,assigned_to_user_id,referral_status,stage,client_status,notes,next_followup_at,created_at,updated_at,import_batch_id)
       VALUES(?,?,?,?,?,?,'third_party',NULL,?,'office',?, ?,NULL,'pending','New','lead',?,?,?,?,?)`)
       .bind(id,r.full_name,r.phone,r.normalized,r.email||null,r.preferred_countries,r.referrer_display,a.id,confirmed?now:0,r.notes,due,now,now,batchId));
     statements.push(db.prepare("INSERT INTO crm_lead_profiles(lead_id,relationship_status,updated_at) VALUES(?,'lead',?)").bind(id,now));
   }
   statements.push(db.prepare('INSERT INTO audit_logs(id,user_id,user_name,action,resource_type,resource_id,details,timestamp) VALUES(?,?,?,?,?,?,?,?)')
     .bind(uuid(),a.id,a.name,'CRM_IMPORT','crm_import',batchId,JSON.stringify({filename:file,rows:accepted.length,consent_confirmed:confirmed}),now));
   try{await db.batch(statements);}catch{return fail(409,'Import cancelled: one of these students may already exist. No rows in this batch were saved.');}
   return success({imported:accepted.length,batch_id:batchId,consent_status:confirmed?'confirmed':'unverified'});
 }
 // Imported contacts with unknown consent cannot enter the calling queue until verified.
 if(path==='/api/crm/leads/consent'&&verb==='PUT'){
   const id=str(body.id,80),lead=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(id).first<Dict>();
   if(!lead)return fail(404,'Student not found.');
   if(!(await canManageLead(db,a,lead)))return fail(403,'Case-manager permission required.');
   if(body.confirmed!==true||str(body.evidence,500).length<5)return fail(400,'Confirm lawful permission and describe its source.');
   await db.batch([
     db.prepare('UPDATE crm_leads SET consent_confirmed_at=?,next_followup_at=COALESCE(next_followup_at,?),updated_at=? WHERE id=?').bind(now,daysAfterDhaka(now,1),now,id),
     db.prepare('INSERT INTO crm_lead_history(id,lead_id,action,old_value,new_value,note,actor_type,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(uuid(),id,'contact_consent_verified',null,JSON.stringify({verified_at:now}),str(body.evidence,500),a.kind,a.id,now)
   ]);
   return success({success:true});
 }
 // Office CRM: page through ALL accessible records, without the preview endpoint's 500-row limit.
 if(path==='/api/crm/leads/page'&&verb==='GET'){
   if(a.kind!=='office')return fail(403,'Office sign-in required for the lead register.');
   const filter=str(ctx.query?.filter,12)||'leads';
   if(!['leads','clients','closed','followups','upcoming','all'].includes(filter))return fail(400,'Invalid list filter.');
   const page=Math.max(1,Math.min(100000,Number.parseInt(str(ctx.query?.page,8),10)||1));
   const pageSize=50;
   const q=str(ctx.query?.search,100);
   const {where,args}=scopeWhere(a);
   const clause=filter==='clients'?"p.relationship_status IN ('active_client','on_hold','completed')":filter==='closed'?"p.relationship_status IN ('lost','closed')":filter==='leads'?"p.relationship_status='lead'":filter==='followups'?"l.next_followup_at IS NOT NULL AND l.next_followup_at <= ? AND p.relationship_status IN ('lead','active_client') AND l.referral_status='approved' AND l.consent_confirmed_at>0":filter==='upcoming'?"l.next_followup_at > ? AND p.relationship_status IN ('lead','active_client') AND l.referral_status='approved' AND l.consent_confirmed_at>0":'1=1';
   const textSql=q?' AND (l.full_name LIKE ? OR l.phone LIKE ? OR l.referrer_display LIKE ? OR l.id LIKE ?)':'';
   const vals=[...args,...(['followups','upcoming'].includes(filter)?[getDhakaDateString()]:[]),...(q?[`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`]:[])];
   const joined=` FROM crm_leads l JOIN crm_lead_profiles p ON p.lead_id=l.id LEFT JOIN users o ON o.id=l.assigned_to_user_id WHERE (${where}) AND (${clause})${textSql}`;
   const count=await db.prepare(`SELECT COUNT(*) AS n${joined}`).bind(...vals).first<{n:number}>();
   const rows=await rowList(db,`SELECT l.*,p.relationship_status,p.closed_reason,p.closed_at,p.converted_at,p.education_level,p.study_subject,p.target_intake,p.budget_band,p.preferred_contact${joined} ORDER BY ${['followups','upcoming'].includes(filter)?'l.next_followup_at ASC,':''} l.updated_at DESC,l.id DESC LIMIT ? OFFSET ?`,...vals,pageSize,(page-1)*pageSize);
   const rights=await delegated(db,a);
   if(!admin(a)&&!rights.leads)rows.forEach(l=>{delete l.notes;delete l.address;});
   return success({rows,total:Number(count?.n||0),page,page_size:pageSize});
 }
 // Export must read server-scoped records, never the browser's limited preview.
 if(path==='/api/crm/export-xlsx'&&verb==='GET'){
   const rights=await delegated(db,a);
   if(a.kind!=='office'||!rights.leads)return fail(403,'An authorized CRM manager account is required for exports.');
   const {where,args}=scopeWhere(a,true);
   const leads=await readAllExport(db,`SELECT l.id,l.full_name,l.phone,l.email,l.address,l.preferred_countries,l.referrer_type,l.referrer_display,l.referral_status,l.stage,l.client_status,l.assigned_to_user_id,l.last_contacted_at,l.next_followup_at,l.created_at,p.relationship_status,p.closed_reason,p.closed_at,p.education_level,p.study_subject,p.target_intake,p.budget_band FROM crm_leads l JOIN crm_lead_profiles p ON p.lead_id=l.id LEFT JOIN users o ON o.id=l.assigned_to_user_id WHERE (${where}) ORDER BY l.created_at DESC,l.id DESC`,args);
   if(leads===null)return fail(413,'The report is too large for one export. Ask the administrator to export in smaller batches.');
   const applications=await readAllExport(db,`SELECT x.id,x.lead_id,x.destination_country,x.institution,x.programme,x.intake,x.application_status,x.visa_status,x.outcome_note,x.created_at,x.updated_at FROM crm_applications x JOIN crm_leads l ON l.id=x.lead_id LEFT JOIN users o ON o.id=l.assigned_to_user_id WHERE (${where}) ORDER BY x.created_at DESC`,args);
   const followups=await readAllExport(db,`SELECT f.lead_id,f.channel,f.notes,f.contacted_at,f.next_followup_at,f.created_by_id FROM crm_lead_followups f JOIN crm_leads l ON l.id=f.lead_id LEFT JOIN users o ON o.id=l.assigned_to_user_id WHERE (${where}) ORDER BY f.contacted_at DESC`,args);
   if(applications===null||followups===null)return fail(413,'The report is too large for one export.');
   const XLSX=await import('xlsx');
   const workbook=XLSX.utils.book_new();
   const add=(name:string,items:Dict[],cols:string[])=>{
     // Force every user-provided field into literal strings, never spreadsheet formulas.
     const rows=[cols,...items.map(item=>cols.map(col=>safeCell(item[col])))];
     XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),name);
   };
   const cols=['id','full_name','phone','email','address','preferred_countries','referrer_type','referrer_display','referral_status','stage','client_status','relationship_status','closed_reason','assigned_to_user_id','last_contacted_at','next_followup_at','created_at','education_level','study_subject','target_intake','budget_band'];
   add('Leads',leads.filter(l=>l.relationship_status==='lead'),cols);
   add('Clients',leads.filter(l=>['active_client','on_hold','completed'].includes(String(l.relationship_status))),cols);
   add('Closed and Lost',leads.filter(l=>['closed','lost'].includes(String(l.relationship_status))),cols);
   add('All Students',leads,cols);
   add('Applications',applications,['id','lead_id','destination_country','institution','programme','intake','application_status','visa_status','outcome_note','created_at','updated_at']);
   add('Follow Ups',followups,['lead_id','channel','notes','contacted_at','next_followup_at','created_by_id']);
   const out=XLSX.write(workbook,{bookType:'xlsx',type:'array'});
   await db.prepare('INSERT INTO audit_logs(id,user_id,user_name,action,resource_type,resource_id,details,timestamp) VALUES(?,?,?,?,?,?,?,?)')
     .bind(uuid(),a.id,a.name,'CRM_EXPORT','crm','all',JSON.stringify({leads:leads.length,applications:applications.length,followups:followups.length}),now).run();
   return {status:200,data:null,binary:new Uint8Array(out),headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="AGN_Leads_Clients_Report.xlsx"','Cache-Control':'no-store'}};
 }
 if(path==='/api/crm/timeline'&&verb==='GET'){
   const id=str(ctx.query?.lead_id,80),lead=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(id).first<Dict>();
   if(!lead)return fail(404,'Lead not found.');
   if(!(await canManageLead(db,a,lead)))return fail(403,'Internal follow-up history is restricted to the authorized case manager.');
   const page=Math.max(1,Math.min(100000,Number.parseInt(str(ctx.query?.page,8),10)||1));
   const count1=await db.prepare('SELECT COUNT(*) AS n FROM crm_lead_followups WHERE lead_id=?').bind(id).first<{n:number}>();
   const count2=await db.prepare('SELECT COUNT(*) AS n FROM crm_lead_history WHERE lead_id=?').bind(id).first<{n:number}>();
   const followups=await rowList(db,'SELECT * FROM crm_lead_followups WHERE lead_id=? ORDER BY contacted_at DESC,id DESC LIMIT 50 OFFSET ?',id,(page-1)*50);
   const history=await rowList(db,'SELECT * FROM crm_lead_history WHERE lead_id=? ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?',id,(page-1)*50);
   return success({followups,history,followups_total:Number(count1?.n||0),history_total:Number(count2?.n||0),page});
 }
 if(path==='/api/crm/applications'&&verb==='GET'){
   const id=str(ctx.query?.lead_id,80);
   const lead=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(id).first<Dict>();
   if(!lead)return fail(404,'Student not found.');
   if(!(await canManageLead(db,a,lead)))return fail(403,'Only the authorized case manager can view application details.');
   const records=await rowList(db,'SELECT * FROM crm_applications WHERE lead_id=? ORDER BY created_at DESC',id);
   return success({applications:records});
 }
 if(path==='/api/crm/profiles'&&verb==='PUT'){
   const id=str(body.lead_id,80),l=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(id).first<Dict>();
   if(!l)return fail(404,'Lead not found.');
   if(!(await canManageLead(db,a,l)))return fail(403,'Manager access required.');
   if(l.referral_status!=='approved')return fail(409,'Approve referral first.');
   const cur=await db.prepare('SELECT * FROM crm_lead_profiles WHERE lead_id=?').bind(id).first<Dict>();
   if(!cur)return fail(503,'Apply CRM migration 0008 first.');
   const status=str(body.relationship_status,24);
   if(!['lead','active_client','on_hold','completed','lost','closed'].includes(status))return fail(400,'Invalid relationship status.');
   const reason=str(body.closed_reason,350);
   if(['lost','closed'].includes(status)&&reason.length<5)return fail(400,'A closure or loss reason is required.');
   if(status==='active_client'&&l.referral_status!=='approved')return fail(409,'Client conversion requires approved referral.');
   const educational={education_level:str(body.education_level,100),study_subject:str(body.study_subject,120),target_intake:str(body.target_intake,60),budget_band:str(body.budget_band,80),preferred_contact:str(body.preferred_contact,40)};
   const nowClosed=['lost','closed'].includes(status)?now:null;
   const legacy=status==='lead'?'lead':['lost','closed'].includes(status)?'archived':'client';
   await db.batch([
     db.prepare(`UPDATE crm_lead_profiles SET relationship_status=?,closed_reason=?,closed_at=?,converted_at=CASE WHEN ?='active_client' AND converted_at IS NULL THEN ? ELSE converted_at END,education_level=?,study_subject=?,target_intake=?,budget_band=?,preferred_contact=?,last_reviewed_by=?,updated_at=? WHERE lead_id=?`)
       .bind(status,['lost','closed'].includes(status)?reason:'',nowClosed,status,now,educational.education_level,educational.study_subject,educational.target_intake,educational.budget_band,educational.preferred_contact,a.id,now,id),
     db.prepare('UPDATE crm_leads SET client_status=?,updated_at=? WHERE id=?').bind(legacy,now,id),
     db.prepare('INSERT INTO crm_lead_history(id,lead_id,action,old_value,new_value,note,actor_type,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
       .bind(uuid(),id,'relationship_change',JSON.stringify(cur),JSON.stringify({relationship_status:status,reason,...educational}),reason,a.kind,a.id,now)
   ]);
   return success({success:true});
 }
 if(path==='/api/crm/applications'&&verb==='POST'){
   const id=str(body.lead_id,80),l=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(id).first<Dict>();
   if(!l)return fail(404,'Lead not found.');
   if(!(await canManageLead(db,a,l)))return fail(403,'Manager permission required.');
   const lifecycle=await db.prepare('SELECT relationship_status FROM crm_lead_profiles WHERE lead_id=?').bind(id).first<{relationship_status:string}>();
   if(l.referral_status!=='approved'||lifecycle?.relationship_status!=='active_client')return fail(409,'Only an active, approved client can open a new application.');
   const country=str(body.destination_country,80),institution=str(body.institution,160),programme=str(body.programme,160),intake=str(body.intake,70);
   if(country.length<2)return fail(400,'Choose a destination country.');
   const appId=uuid();
   await db.batch([
     db.prepare('INSERT INTO crm_applications(id,lead_id,destination_country,institution,programme,intake,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
       .bind(appId,id,country,institution,programme,intake,a.id,a.id,now,now),
     db.prepare('INSERT INTO crm_application_history(id,application_id,action,previous_status,next_status,note,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)')
       .bind(uuid(),appId,'created',null,'researching / not_started','Application opened',a.id,now)
   ]);
   return success({success:true,id:appId});
 }
 if(path==='/api/crm/applications'&&verb==='PUT'){
   const id=str(body.id,80),old=await db.prepare('SELECT * FROM crm_applications WHERE id=?').bind(id).first<Dict>();
   if(!old)return fail(404,'Application not found.');
   const l=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(old.lead_id).first<Dict>();
   if(!l||!(await canManageLead(db,a,l)))return fail(403,'Manager permission required.');
   const applicationStatus=str(body.application_status,36),visaStatus=str(body.visa_status,36);
   const appOptions=['researching','preparing','submitted','under_review','conditional_offer','unconditional_offer','accepted','rejected','withdrawn'];
   const visaOptions=['not_started','documents_preparing','lodged','biometrics_pending','appointment_waiting','decision_pending','approved','refused','withdrawn','not_applicable'];
   if(!appOptions.includes(applicationStatus)||!visaOptions.includes(visaStatus))return fail(400,'Invalid admission or visa stage.');
   const note=str(body.outcome_note,1500);
   if(['rejected'].includes(applicationStatus)&&note.length<5)return fail(400,'Record the rejection reason.');
   if(['refused'].includes(visaStatus)&&note.length<5)return fail(400,'Record the visa refusal outcome.');
   await db.batch([
     db.prepare('UPDATE crm_applications SET application_status=?,visa_status=?,outcome_note=?,updated_by=?,updated_at=? WHERE id=?')
       .bind(applicationStatus,visaStatus,note,a.id,now,id),
     db.prepare('INSERT INTO crm_application_history(id,application_id,action,previous_status,next_status,note,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)')
       .bind(uuid(),id,'stage_changed',String(old.application_status)+' / '+String(old.visa_status),applicationStatus+' / '+visaStatus,note,a.id,now)
   ]);
   return success({success:true});
 }

 if(path==='/api/crm/state'&&verb==='GET'){
   const rights=await delegated(db,a);
   let leads:Dict[]=[];
   if(admin(a))leads=await rowList(db,`SELECT * FROM crm_leads ORDER BY updated_at DESC LIMIT 500`);
   else if(a.kind==='office'){
     leads=await rowList(db,`SELECT DISTINCT l.* FROM crm_leads l LEFT JOIN users o ON o.id=l.assigned_to_user_id
       WHERE (l.referrer_type='office' AND l.referrer_id=?)
       OR l.assigned_to_user_id=? OR (?='team_manager' AND o.team=?) OR (?='team_manager' AND l.assigned_to_user_id IS NULL AND l.referral_status='pending' AND l.referrer_type='office' AND EXISTS (SELECT 1 FROM users r WHERE r.id=l.referrer_id AND r.team=?)) ORDER BY l.updated_at DESC LIMIT 350`,a.id,a.id,a.role,a.team||'',a.role,a.team||'');
     // A regular employee can view referral progress but not internal counselling notes.
     if(!admin(a)&&a.role==='employee'&&!(await delegated(db,a)).leads)
       leads=leads.map(l=>({...l,notes:null}));
   }else leads=await rowList(db,`SELECT id,full_name,phone,email,address,preferred_countries,referrer_type,referrer_id,
      referrer_display,referral_status,stage,client_status,last_contacted_at,next_followup_at,created_at,updated_at
      FROM crm_leads WHERE referrer_type=? AND referrer_id=? ORDER BY updated_at DESC LIMIT 200`,a.kind,a.id);
   let ids=leads.map(x=>String(x.id));
   // Referring someone does not automatically grant access to internal counselling notes.
   if(a.kind==='office'&&!admin(a)){
     const scoped=scopeWhere(a,true);
     const managed=await rowList(db,`SELECT l.id FROM crm_leads l LEFT JOIN users o ON o.id=l.assigned_to_user_id WHERE ${scoped.where} ORDER BY l.updated_at DESC LIMIT 1000`,...scoped.args);
     const permitted=new Set(managed.map(r=>String(r.id)));
     ids=ids.filter(id=>permitted.has(id));
     // A referring team manager may see progress, not sensitive notes from another team's case.
     leads=leads.map(l=>permitted.has(String(l.id))?l:{...l,notes:null,address:null,email:null});
   }
   let followups:Dict[]=[],history:Dict[]=[];
   if(a.kind==='office'&&(admin(a)||rights.leads)&&ids.length){const placeholders=ids.map(()=>'?').join(',');
     followups=await rowList(db,`SELECT * FROM crm_lead_followups WHERE lead_id IN (${placeholders}) ORDER BY contacted_at DESC LIMIT 700`,...ids);
     history=await rowList(db,`SELECT * FROM crm_lead_history WHERE lead_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 700`,...ids);
   }
   let agents:Dict[]=[],tasks:Dict[]=[],office:Dict[]=[],ambassadors:Dict[]=[];
   if(a.kind==='commission')tasks=await rowList(db,'SELECT * FROM crm_agent_tasks WHERE agent_id=? ORDER BY created_at DESC LIMIT 200',a.id);
   if(a.kind==='office'&&(rights.agents||rights.leads)){
     agents=rights.agents?await rowList(db,'SELECT id,agent_code,name,email,phone,status,must_change_password FROM crm_commission_agents ORDER BY agent_code LIMIT 500'):[];
     tasks=rights.agents?await rowList(db,`SELECT t.*,a.name AS agent_name,a.agent_code FROM crm_agent_tasks t JOIN crm_commission_agents a ON a.id=t.agent_id ORDER BY t.created_at DESC LIMIT 500`):[];
     office=await rowList(db,"SELECT id,employee_id,name,team,role FROM users WHERE status='active' ORDER BY employee_id");
     ambassadors=await rowList(db,"SELECT id,ambassador_code,name FROM amb_people WHERE status='active' ORDER BY ambassador_code");
   }
   return success({actor:a,rights,leads,followups,history,agents,tasks,office,ambassadors,stages});
 }
 if(path==='/api/crm/agents'&&verb==='POST'){
   const rights=await delegated(db,a);if(!rights.agents)return fail(403,'Agent administration is restricted.');
   const code=str(body.agent_code,40).toUpperCase(),name=str(body.name,120),pass=String(body.initial_password||'');
   if(!/^[A-Z0-9_-]{3,40}$/.test(code)||name.length<2||pass.length<12)return fail(400,'ID, name and initial password (12+ characters) required.');
   const id=uuid();
   try{await db.prepare(`INSERT INTO crm_commission_agents(id,agent_code,name,phone,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(id,code,name,str(body.phone,24)||null,str(body.email,180)||null,await hashPassword(pass),now,now).run();}
   catch{return fail(409,'Commission agent ID already exists.');}
   return success({success:true,id});
 }
 if(path==='/api/crm/agents/status'&&verb==='PUT'){
   const rights=await delegated(db,a);if(!rights.agents)return fail(403,'Agent administration is restricted.');
   const status=str(body.status,10);if(!['active','inactive'].includes(status))return fail(400,'Invalid status.');
   const result=await db.prepare('UPDATE crm_commission_agents SET status=?,updated_at=? WHERE id=?')
      .bind(status,now,str(body.id,70)).run();return success({success:true,changed:result.meta?.changes??0});
 }
 if(path==='/api/crm/agents/reset-password'&&verb==='PUT'){
   const rights=await delegated(db,a);if(!rights.agents)return fail(403,'Agent administration is restricted.');
   const id=str(body.id,80),password=String(body.new_password||'');
   if(password.length<12||password.length>128)return fail(400,'Temporary password must be 12–128 characters.');
   const account=await db.prepare('SELECT id FROM crm_commission_agents WHERE id=?').bind(id).first();
   if(!account)return fail(404,'Agent not found.');
   await db.batch([
     db.prepare('UPDATE crm_commission_agents SET password_hash=?,must_change_password=1,updated_at=? WHERE id=?')
       .bind(await hashPassword(password),now,id),
     db.prepare('DELETE FROM crm_commission_sessions WHERE agent_id=?').bind(id),
     db.prepare('INSERT INTO audit_logs(id,user_id,user_name,action,resource_type,resource_id,details,timestamp) VALUES(?,?,?,?,?,?,?,?)')
       .bind(uuid(),a.id,a.name,'COMMISSION_PASSWORD_RESET','commission_agent',id,'Forced temporary-password change',now)
   ]);
   return success({success:true});
 }
 if(path==='/api/crm/delegations'&&verb==='PUT'){
   if(a.kind!=='office'||a.role!=='super_admin')return fail(403,'Super Admin only.');
   const target=str(body.user_id,70);
   const person=await db.prepare('SELECT id FROM users WHERE id=? AND status=\'active\'').bind(target).first();
   if(!person)return fail(404,'Active employee not found.');
   await db.prepare(`INSERT INTO crm_delegations(user_id,can_manage_leads,can_manage_agents,updated_by,updated_at) VALUES(?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET can_manage_leads=excluded.can_manage_leads,can_manage_agents=excluded.can_manage_agents,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
     .bind(target,body.can_manage_leads===true?1:0,body.can_manage_agents===true?1:0,a.id,now).run();
   return success({success:true});
 }
 if(path==='/api/crm/leads'&&verb==='POST'){
   const name=str(body.full_name,130),phone=str(body.phone,24),email=str(body.email,180),countries=str(body.preferred_countries,300);
   if(name.length<2||!validPhone(phone)||!validEmail(email))return fail(400,'Name, valid phone, and optional valid email required.');
   if(body.consent_confirmed!==true)return fail(400,'Confirm that the individual agreed to be contacted.');
   if(a.kind!=='office'){
     const recent=await db.prepare('SELECT COUNT(*) AS n FROM crm_leads WHERE created_by_type=? AND created_by_id=? AND created_at>?')
       .bind(a.kind,a.id,Date.now()-86_400_000).first<{n:number}>();
     if(Number(recent?.n||0)>=25)return fail(429,'Daily referral submission limit reached. Contact a programme manager.');
   }
   let refType:string=a.kind,refId:string|null=a.id,refDisplay=`${a.name} (${a.selfCode||a.kind})`;
   let assigned:string|null=null;
   if(a.kind==='office'){
     const rights=await delegated(db,a);
     if(admin(a)||rights.leads){
       refType=str(body.referrer_type,30)||'office';refId=str(body.referrer_id,80)||null;
       if(!['office','ambassador','commission','third_party'].includes(refType))return fail(400,'Invalid reference type.');
       if(refType==='third_party'){refId=null;refDisplay=str(body.referrer_display,150);if(refDisplay.length<2)return fail(400,'Provide the external referrer name.');}
       else {
         const lookup=refType==='office'?['users','name','employee_id']:refType==='ambassador'?['amb_people','name','ambassador_code']:['crm_commission_agents','name','agent_code'];
         if(!refId)return fail(400,'Select the internal referrer.');
         // Static table/column names sourced only from the fixed enum above.
         const found=await db.prepare(`SELECT ${lookup[1]} AS name,${lookup[2]} AS code FROM ${lookup[0]} WHERE id=?`).bind(refId).first<{name:string;code:string}>();
         if(!found)return fail(404,'Selected referrer not found.');
         refDisplay=`${found.name} (${found.code})`;
       }
       assigned=str(body.assigned_to_user_id,80)||null;
       if(assigned){const owner=await db.prepare('SELECT id,team FROM users WHERE id=? AND status=\'active\'').bind(assigned).first<{id:string;team:string}>();
         if(!owner)return fail(400,'Lead owner must be an active office employee.');
         if(!admin(a)&&owner.team!==a.team)return fail(403,'Team Lead can assign only within their own team.');}
     }
   }
   const existing=await db.prepare("SELECT id FROM crm_leads WHERE phone_normalized=? LIMIT 1")
     .bind(normalizePhone(phone)).first();
   if(existing)return fail(409,'This contact cannot be submitted as a new lead. Ask a programme manager to check the record.');
   const id=uuid();
   if(a.kind==='office'&&!assigned&&(admin(a)||a.role==='team_manager'))assigned=a.id;
   try {await db.prepare(`INSERT INTO crm_leads(id,full_name,phone,phone_normalized,email,address,preferred_countries,referrer_type,referrer_id,referrer_display,external_reference_note,created_by_type,created_by_id,consent_confirmed_at,assigned_to_user_id,stage,client_status,notes,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'New','lead',?,?,?)`)
     .bind(id,name,phone,normalizePhone(phone),email||null,str(body.address,500)||null,countries,refType,refId,refDisplay,str(body.external_reference_note,500),a.kind,a.id,now,assigned,str(body.notes,3000),now,now).run();}
   catch {return fail(409,'Lead could not be registered, possibly because the phone already exists.');}
   await db.prepare("INSERT OR IGNORE INTO crm_lead_profiles(lead_id,relationship_status,updated_at) VALUES(?,'lead',?)").bind(id,now).run();
   await trail(db,id,a,'created',undefined,{referrer_type:refType,referrer_id:refId,referrer_display:refDisplay});
   return success({success:true,id});
 }
 if(path==='/api/crm/leads/review'&&verb==='PUT'){
   const id=str(body.id,80),result=str(body.referral_status,12);
   if(!['approved','rejected'].includes(result))return fail(400,'Select Approve or Reject.');
   const lead=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(id).first<Dict>();
   if(!lead)return fail(404,'Referral not found.');
   if(!await canManageLead(db,a,lead))return fail(403,'Only the assigned authorized manager can review this referral.');
   if(lead.referral_status!=='pending')return fail(409,'Referral already reviewed; use the audit workflow for changes.');
   await db.prepare('UPDATE crm_leads SET referral_status=?,referral_reviewed_by=?,referral_reviewed_at=?,assigned_to_user_id=COALESCE(assigned_to_user_id,?),next_followup_at=CASE WHEN ?=\'approved\' AND consent_confirmed_at>0 AND next_followup_at IS NULL THEN ? ELSE next_followup_at END,updated_at=? WHERE id=? AND referral_status=\'pending\'')
     .bind(result,a.id,now,a.kind==='office'?a.id:null,result,daysAfterDhaka(now,1),now,id).run();
   await trail(db,id,a,'referral_'+result,{status:'pending'},{status:result},str(body.reason,500));
   return success({success:true});
 }
 if(path==='/api/crm/leads/update'&&verb==='PUT'){
   const id=str(body.id,80),lead=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(id).first<Dict>();
   if(!lead)return fail(404,'Lead not found.');
   if(!(await canManageLead(db,a,lead)))return fail(403,'Only the assigned authorized manager can change lead details or status.');
   if(lead.referral_status!=='approved')return fail(409,'Approve the referral before progressing the lead.');
   const stage=str(body.stage,70)||String(lead.stage),clientStatus=str(body.client_status,15)||String(lead.client_status);
   if(!stages.includes(stage)||!['lead','client','archived'].includes(clientStatus))return fail(400,'Invalid stage or client state.');
   if(clientStatus!==lead.client_status)return fail(400,'Change client relationship through the audited relationship form.');
   const newOwner=body.assigned_to_user_id===undefined?lead.assigned_to_user_id:(str(body.assigned_to_user_id,80)||null);
   if(newOwner){const target=await db.prepare('SELECT id,team FROM users WHERE id=? AND status=\'active\'').bind(newOwner).first<{id:string;team:string}>();
     if(!target)return fail(400,'Assigned employee not found.');
     if(!admin(a)&&target.team!==a.team)return fail(403,'Cannot assign outside your team.');}
   const updated={full_name:str(body.full_name,130)||String(lead.full_name),phone:str(body.phone,24)||String(lead.phone),
      email:body.email===undefined?lead.email:str(body.email,180),address:body.address===undefined?lead.address:str(body.address,500),
      preferred_countries:body.preferred_countries===undefined?lead.preferred_countries:str(body.preferred_countries,300),
      stage,client_status:clientStatus,assigned_to_user_id:newOwner,notes:body.notes===undefined?lead.notes:str(body.notes,3000),
      next_followup_at:body.next_followup_at===undefined?lead.next_followup_at:(str(body.next_followup_at,10)||null)};
   if(!validPhone(String(updated.phone))||!validEmail(String(updated.email||''))||updated.next_followup_at&&!dateOk(String(updated.next_followup_at)))return fail(400,'Invalid phone, email or follow-up date.');
   if(updated.next_followup_at!==lead.next_followup_at&&str(body.change_reason,500).length<5)return fail(400,'Changing a scheduled contact date requires a written reason.');
   try {await db.prepare(`UPDATE crm_leads SET full_name=?,phone=?,phone_normalized=?,email=?,address=?,preferred_countries=?,stage=?,client_status=?,assigned_to_user_id=?,notes=?,next_followup_at=?,updated_at=? WHERE id=?`)
     .bind(updated.full_name,updated.phone,normalizePhone(String(updated.phone)),updated.email,updated.address,updated.preferred_countries,stage,clientStatus,newOwner,updated.notes,updated.next_followup_at,now,id).run();}
   catch{return fail(409,'Another lead uses that phone number.');}
   if(clientStatus!==lead.client_status){
     const profile=await db.prepare('SELECT relationship_status FROM crm_lead_profiles WHERE lead_id=?').bind(id).first<{relationship_status:string}>();
     const nextStatus=clientStatus==='archived'?'closed':clientStatus==='lead'?'lead':'active_client';
     if(profile)await db.prepare('UPDATE crm_lead_profiles SET relationship_status=?,updated_at=?,last_reviewed_by=? WHERE lead_id=?').bind(nextStatus,now,a.id,id).run();
   }
   await trail(db,id,a,'updated',{stage:lead.stage,client_status:lead.client_status,assigned_to_user_id:lead.assigned_to_user_id,next_followup_at:lead.next_followup_at},
     {stage,client_status:clientStatus,assigned_to_user_id:newOwner,next_followup_at:updated.next_followup_at},str(body.change_reason,500));
   return success({success:true});
 }
 if(path==='/api/crm/followups'&&verb==='POST'){
   const leadId=str(body.lead_id,80),lead=await db.prepare('SELECT * FROM crm_leads WHERE id=?').bind(leadId).first<Dict>();
   if(!lead)return fail(404,'Lead not found.');
   if(!(await canManageLead(db,a,lead)))return fail(403,'Only authorized case managers can log follow-ups.');
   if(lead.referral_status!=='approved')return fail(409,'Approve the referral before following up.');
   if(!Number(lead.consent_confirmed_at))return fail(409,'Verify contact permission before recording outreach.');
   const profile=await db.prepare('SELECT relationship_status FROM crm_lead_profiles WHERE lead_id=?').bind(leadId).first<{relationship_status:string}>();
   if(!['lead','active_client'].includes(String(profile?.relationship_status)))return fail(409,'Paused or closed students are not in the routine follow-up cycle.');
   const channel=str(body.channel,20),notes=str(body.notes,3000),outcome=str(body.contact_outcome,20)||'connected';
   if(!['call','whatsapp','email','meeting','other'].includes(channel)||!['connected','no_answer','rescheduled'].includes(outcome)||notes.length<2)return fail(400,'Valid contact method, outcome and notes required.');
   const contactedAt=Number(body.contacted_at)||now;
   if(!Number.isFinite(contactedAt)||contactedAt>now+60000||contactedAt<946684800000)return fail(400,'Invalid contact time.');
   const explicit=body.next_followup_at?str(body.next_followup_at,10):'';
   if(explicit&&!dateOk(explicit))return fail(400,'Invalid next follow-up date.');
   if(outcome==='rescheduled'&&!explicit)return fail(400,'Choose a new date when rescheduling.');
   const next=explicit||daysAfterDhaka(contactedAt,outcome==='connected'?3:1);
   await db.batch([
     db.prepare('INSERT INTO crm_lead_followups(id,lead_id,channel,notes,contacted_at,next_followup_at,created_by_type,created_by_id,created_at,contact_outcome) VALUES(?,?,?,?,?,?,?,?,?,?)')
       .bind(uuid(),leadId,channel,notes,contactedAt,next,a.kind,a.id,now,outcome),
     db.prepare('UPDATE crm_leads SET last_contacted_at=CASE WHEN ?=\'connected\' THEN ? ELSE last_contacted_at END,next_followup_at=?,updated_at=? WHERE id=?')
       .bind(outcome,contactedAt,next,now,leadId)
   ]);
   await trail(db,leadId,a,'followup_'+outcome,undefined,{channel,contacted_at:contactedAt,next_followup_at:next},notes.slice(0,200));
   return success({success:true,next_followup_at:next});
 }
 if(path==='/api/crm/tasks'&&verb==='POST'){
   const rights=await delegated(db,a);if(!rights.agents)return fail(403,'Only AGN managers can assign tasks.');
   const agentId=str(body.agent_id,80),title=str(body.title,180),details=str(body.details,3000),due=str(body.due_date,10);
   if(title.length<3||due&&!dateOk(due))return fail(400,'Task title and valid deadline required.');
   const agent=await db.prepare("SELECT id FROM crm_commission_agents WHERE id=? AND status='active'").bind(agentId).first();
   if(!agent)return fail(404,'Active agent not found.');
   await db.prepare(`INSERT INTO crm_agent_tasks(id,agent_id,title,details,due_date,status,assigned_by,created_at,updated_at)
      VALUES(?,?,?,?,?,'assigned',?,?,?)`).bind(uuid(),agentId,title,details,due||null,a.id,now,now).run();return success({success:true});
 }
 if(path==='/api/crm/tasks/edit'&&verb==='PUT'){
   const rights=await delegated(db,a);if(!rights.agents)return fail(403,'Manager role required.');
   const id=str(body.id,80),current=await db.prepare('SELECT * FROM crm_agent_tasks WHERE id=?').bind(id).first<Dict>();
   if(!current)return fail(404,'Task not found.');
   if(current.status!=='assigned')return fail(409,'Only unstarted tasks can be edited. Cancel and recreate if work has begun.');
   const title=str(body.title,180),details=str(body.details,3000),due=str(body.due_date,10);
   if(title.length<3||due&&!dateOk(due))return fail(400,'Valid task title and deadline required.');
   await db.batch([
     db.prepare('UPDATE crm_agent_tasks SET title=?,details=?,due_date=?,updated_at=? WHERE id=?').bind(title,details,due||null,now,id),
     db.prepare('INSERT INTO crm_agent_task_history(id,task_id,from_status,to_status,details,actor_type,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(uuid(),id,String(current.status),String(current.status),'Edited task details',a.kind,a.id,now)
   ]);return success({success:true});
 }
 if(path==='/api/crm/tasks/update'&&verb==='PUT'){
   const id=str(body.id,80),task=await db.prepare('SELECT * FROM crm_agent_tasks WHERE id=?').bind(id).first<Dict>();
   if(!task)return fail(404,'Task not found.');
   const rights=await delegated(db,a),isOwner=a.kind==='commission'&&task.agent_id===a.id;
   if(!rights.agents&&!isOwner)return fail(403,'Not allowed to edit this task.');
   const status=str(body.status,30);
   if(isOwner){if(str(body.proof_url,1500)&&!/^https:\/\/[^\s]+$/.test(str(body.proof_url,1500)))return fail(400,'Work proof must be a secure https:// link.');
     if(!['in_progress','submitted'].includes(status)||!['assigned','in_progress','revision_requested'].includes(String(task.status)))return fail(403,'Agent may only progress or submit assigned work.');
     await db.prepare('UPDATE crm_agent_tasks SET status=?,proof_url=?,agent_note=?,updated_at=? WHERE id=?')
       .bind(status,str(body.proof_url,1500)||null,str(body.agent_note,2000),now,id).run();}
   else{if(!['assigned','in_progress','submitted','approved','revision_requested','cancelled'].includes(status))return fail(400,'Invalid task status.');
     if(status==='approved'&&task.status!=='submitted')return fail(409,'Agent must submit work before approval.');
     if(status==='revision_requested'&&task.status!=='submitted')return fail(409,'Revisions require a submitted task.');
     if(task.status==='approved'&&status!=='approved')return fail(409,'Approved work is locked to preserve history.');
     await db.prepare('UPDATE crm_agent_tasks SET status=?,reviewer_note=?,updated_at=? WHERE id=?')
       .bind(status,str(body.reviewer_note,1500),now,id).run();}
   await db.prepare('INSERT INTO crm_agent_task_history(id,task_id,from_status,to_status,details,actor_type,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(uuid(),id,String(task.status),status,isOwner?str(body.agent_note,250):str(body.reviewer_note,250),a.kind,a.id,now).run();
   return success({success:true});
 }
 return fail(404,'CRM route not found.');
}
