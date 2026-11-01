// Node 22.16+/24 built-in SQLite; no Python or external test library needed.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
function dbBefore(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;');
  for(let n=1;n<=6;n++){const f=fs.readdirSync(path.join(root,'migrations')).find(x=>x.startsWith(`000${n}_`));assert.ok(f,`missing 000${n}`);db.exec(fs.readFileSync(path.join(root,'migrations',f),'utf8'));}
  return db;}
function seed(db){const now=Date.now();db.prepare('INSERT INTO users(id,employee_id,name,role,team,joining_date,password_hash) VALUES(?,?,?,?,?,?,?)').run('u1','EMP1','AG N Manager','super_admin','Management','2026-01-01','hash');
  db.prepare('INSERT INTO users(id,employee_id,name,role,team,joining_date,password_hash) VALUES(?,?,?,?,?,?,?)').run('u2','EMP2','Office Referrer','employee','General','2026-01-01','hash');
  db.prepare("INSERT INTO attendance_records(id,user_id,attendance_date,work_mode,in_time,out_time,in_timestamp,out_timestamp,in_verified,out_verified,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run('a1','u2','2026-10-28','office','11:05','19:00',1000,2000,1,1,'present');return now;}
const install=(db)=>db.exec(fs.readFileSync(path.join(root,'migrations','0007_crm_leads_commission.sql'),'utf8'));
test('migration 0007 is additive and preserves existing employee attendance',()=>{const db=dbBefore();seed(db);const before=db.prepare('SELECT * FROM attendance_records WHERE id=?').get('a1');install(db);
  assert.deepEqual(db.prepare('SELECT * FROM attendance_records WHERE id=?').get('a1'),before);
  for(const t of ['crm_leads','crm_lead_followups','crm_lead_history','crm_commission_agents','crm_commission_sessions','crm_delegations','crm_agent_tasks','crm_agent_task_history'])assert.ok(db.prepare('SELECT name FROM sqlite_master WHERE name=?').get(t));db.close();});
test('lead retains exact source and requires approval before becoming a client',()=>{const db=dbBefore();seed(db);install(db);const now=Date.now();
  db.prepare('INSERT INTO crm_commission_agents(id,agent_code,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('c1','COM1','Referral Agent','hash',now,now);
  db.prepare(`INSERT INTO crm_leads(id,full_name,phone,phone_normalized,referrer_type,referrer_id,referrer_display,created_by_type,created_by_id,consent_confirmed_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run('lead1','Client One','+880 170 001 001','880170001001','commission','c1','Referral Agent (COM1)','commission','c1',now,now,now);
  assert.equal(db.prepare('SELECT referral_status FROM crm_leads WHERE id=?').get('lead1').referral_status,'pending');
  db.prepare("UPDATE crm_leads SET referral_status='approved',referral_reviewed_by=?,referral_reviewed_at=?,assigned_to_user_id=? WHERE id=?").run('u1',now,'u1','lead1');
  db.prepare("UPDATE crm_leads SET stage=?,client_status='client' WHERE id=?").run('Offer Letter Received','lead1');
  const ref=db.prepare('SELECT referrer_type,referrer_id,referrer_display,client_status,stage FROM crm_leads').get();
  assert.equal(ref.referrer_type,'commission');assert.equal(ref.referrer_id,'c1');assert.equal(ref.client_status,'client');
  db.prepare(`INSERT INTO crm_lead_followups(id,lead_id,channel,notes,contacted_at,created_by_type,created_by_id,created_at) VALUES(?,?,?,?,?,?,?,?)`).run('f1','lead1','call','Followed up with client',now,'office','u1',now);
  assert.equal(db.prepare('SELECT count(*) n FROM crm_lead_followups WHERE lead_id=?').get('lead1').n,1);
  assert.throws(()=>db.prepare(`INSERT INTO crm_leads(id,full_name,phone,phone_normalized,referrer_type,referrer_display,created_by_type,created_by_id,consent_confirmed_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run('lead2','Duplicate','+880170001001','880170001001','third_party','External','office','u1',now,now,now),/UNIQUE/);
  assert.throws(()=>db.prepare("UPDATE crm_leads SET referral_status='invented' WHERE id='lead1'").run(),/CHECK/);db.close();});
test('commission agent tasks and review history are separate from attendance',()=>{const db=dbBefore();seed(db);install(db);const now=Date.now();
  db.prepare('INSERT INTO crm_commission_agents(id,agent_code,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('c1','COM1','Agent','hash',now,now);
  db.prepare('INSERT INTO crm_agent_tasks(id,agent_id,title,assigned_by,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('t1','c1','Call university representative','u1',now,now);
  db.prepare("UPDATE crm_agent_tasks SET status='submitted',proof_url=? WHERE id=?").run('https://example.org/record','t1');
  db.prepare('INSERT INTO crm_agent_task_history(id,task_id,from_status,to_status,actor_type,actor_id,created_at) VALUES(?,?,?,?,?,?,?)').run('h1','t1','assigned','submitted','commission','c1',now);
  assert.equal(db.prepare('SELECT status FROM crm_agent_tasks WHERE id=?').get('t1').status,'submitted');
  assert.equal(db.prepare('SELECT count(*) n FROM attendance_records').get().n,1);db.close();});
test('source guards one-sided IN/OUT requests and separates CRM portals',()=>{const api=fs.readFileSync(path.join(root,'src/server/routes/api-handler.ts'),'utf8');
  assert.match(api,/changeIn=kind==='in_time'/);assert.match(api,/changeOut=kind==='out_time'/);
  assert.match(api,/if\(changeOut&&!newIn\)/);assert.match(api,/newOut=changeOut\?String\(corr\.requested_out_time/);
  assert.match(api,/in_verified=CASE WHEN \?=1/);assert.match(api,/out_verified=CASE WHEN \?=1/);
  const worker=fs.readFileSync(path.join(root,'src/worker/index.ts'),'utf8');assert.match(worker,/handleCrmRequest/);
  const router=fs.readFileSync(path.join(root,'src/server/crm/router.ts'),'utf8');
  assert.match(router,/ctx\.ambassadorToken/);assert.match(router,/ctx\.commissionToken/);assert.match(router,/canManageLead/);assert.match(router,/consent_confirmed/);assert.match(router,/crm_delegations/);
  assert.match(router,/referral_status==='pending'/);
});
test('IN-only correction preserves existing OUT timestamp, GPS and verification',()=>{
  const db=dbBefore();seed(db);install(db);
  db.prepare('UPDATE attendance_records SET out_latitude=23.8,out_longitude=90.4,in_latitude=23.7,in_longitude=90.3 WHERE id=?').run('a1');
  const before=db.prepare('SELECT out_time,out_timestamp,out_latitude,out_longitude,out_verified FROM attendance_records WHERE id=?').get('a1');
  const api=fs.readFileSync(path.join(root,'src/server/routes/api-handler.ts'),'utf8');
  const fragment=api.slice(api.indexOf('// Only the requested side can be modified.'));
  const match=fragment.match(/await db\.prepare\(`(UPDATE attendance_records SET[\s\S]*?)`\)\s*\.bind\(/);
  assert.ok(match,'Expected to find correction update statement');
  db.prepare(match[1]).run('11:10','19:00',1,1793520000000,0,1793540000000,
    1,0,...Array(4).fill(1),...Array(4).fill(0),470,0,0,'present',Date.now(),'a1');
  const after=db.prepare('SELECT in_time,in_verified,out_time,out_timestamp,out_latitude,out_longitude,out_verified FROM attendance_records WHERE id=?').get('a1');
  assert.equal(after.in_time,'11:10');assert.equal(after.in_verified,0);
  for(const key of Object.keys(before))assert.equal(after[key],before[key],`unchanged OUT field ${key}`);
  db.close();
});
test('OUT-only correction preserves existing IN timestamp, GPS and verification',()=>{
  const db=dbBefore();seed(db);install(db);
  db.prepare('UPDATE attendance_records SET out_latitude=23.8,out_longitude=90.4,in_latitude=23.7,in_longitude=90.3 WHERE id=?').run('a1');
  const before=db.prepare('SELECT in_time,in_timestamp,in_latitude,in_longitude,in_verified FROM attendance_records WHERE id=?').get('a1');
  const api=fs.readFileSync(path.join(root,'src/server/routes/api-handler.ts'),'utf8');
  const fragment=api.slice(api.indexOf('// Only the requested side can be modified.'));
  const match=fragment.match(/await db\.prepare\(`(UPDATE attendance_records SET[\s\S]*?)`\)\s*\.bind\(/);
  db.prepare(match[1]).run('11:05','19:10',0,1793520000000,1,1793540000000,
    0,1,...Array(4).fill(0),...Array(4).fill(1),485,0,10,'present',Date.now(),'a1');
  const after=db.prepare('SELECT in_time,in_timestamp,in_latitude,in_longitude,in_verified,out_time,out_verified FROM attendance_records WHERE id=?').get('a1');
  assert.equal(after.out_time,'19:10');assert.equal(after.out_verified,0);
  for(const key of Object.keys(before))assert.equal(after[key],before[key],`unchanged IN field ${key}`);
  db.close();
});
