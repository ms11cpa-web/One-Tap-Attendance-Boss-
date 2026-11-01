const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
const productionSource=fs.readFileSync(path.join(root,'src/server/crm/router.ts'),'utf8');
// The production Worker loads xlsx lazily with import('xlsx'). This test runs
// that route inside a CommonJS VM with a fake xlsx workbook; Node's VM has no
// dynamic-import callback. Replace only this one import in the TEST COPY of
// the router, leaving the production code and its lazy loading unchanged.
const lazyXlsxImport=/\bawait\s+import\s*\(\s*(['"])xlsx\1\s*\)/g;
assert.equal([...productionSource.matchAll(lazyXlsxImport)].length,1,'Expected a single lazy xlsx import in the CRM router');
const source=productionSource.replace(lazyXlsxImport,"await Promise.resolve(require('xlsx'))");
// Use the project's esbuild on Windows (TypeScript 7 removed several old compiler enums).
// The fallback allows this source test to run in constrained build environments.
let js;
try { js=require('esbuild').transformSync(source,{loader:'ts',format:'cjs',target:'es2022'}).code; }
catch { const ts=require('typescript');js=ts.transpileModule(source,{fileName:'router.ts',compilerOptions:{target:9,module:1}}).outputText; }
const people={admin:{id:'u1',employee_id:'ADMIN',name:'Admin',role:'super_admin',status:'active',team:'Management'},manager:{id:'u2',employee_id:'TL1',name:'Team Lead',role:'team_manager',status:'active',team:'Marketing'},employee:{id:'u3',employee_id:'EMP3',name:'Employee',role:'employee',status:'active',team:'Marketing'}};
const mod={exports:{}};
const secure=(s)=>'H:'+s;
let lastWorkbook=null;
const fakeXlsx={utils:{book_new(){lastWorkbook={sheets:[]};return lastWorkbook;},aoa_to_sheet(rows){return {rows};},book_append_sheet(wb,ws,name){wb.sheets.push({name,rows:ws.rows});}},write(){return new Uint8Array([80,75,3,4]);}};
const fakeRequire=(x)=>{
 if(x==='xlsx')return fakeXlsx;
 if(x.endsWith('/time.ts'))return {getDhakaDateString:()=>new Date().toISOString().slice(0,10)};
 if(x.endsWith('/api-handler.ts'))return {getUserFromSession:async(_db,t)=>people[t]||null};
 if(x.endsWith('/crypto.ts'))return {hashPassword:async(pass)=>'PW:'+pass,verifyPassword:async(pass,hash)=>hash==='PW:'+pass,generateSessionToken:()=> 'test-session-token'};
 if(x.endsWith('/recovery.ts'))return {hashRecoveryCode:async(s)=>secure(s)};
 throw Error('Unexpected test dependency '+x);
};
vm.runInNewContext(js,{module:mod,exports:mod.exports,require:fakeRequire,console,crypto:globalThis.crypto,Date,URL,TextEncoder});
const handle=mod.exports.handleCrmRequest;
function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON;');
 for(let n=1;n<=9;n++){let f=fs.readdirSync(path.join(root,'migrations')).find(x=>x.startsWith('000'+n+'_'));sqlite.exec(fs.readFileSync(path.join(root,'migrations',f),'utf8'));}
 let now=Date.now();for(const u of Object.values(people))sqlite.prepare('INSERT INTO users(id,employee_id,name,role,team,joining_date,password_hash) VALUES(?,?,?,?,?,?,?)').run(u.id,u.employee_id,u.name,u.role,u.team,'2026-01-01','PW:pass');
 sqlite.prepare('INSERT INTO amb_campuses(id,name,created_at) VALUES(?,?,?)').run('campus1','Campus',now);
 sqlite.prepare('INSERT INTO amb_people(id,ambassador_code,name,campus_id,password_hash,must_change_password,joined_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('amb1','AGN1','Ambassador','campus1','PW:pass',0,now,now);
 sqlite.prepare('INSERT INTO amb_sessions(id,ambassador_id,expires_at,created_at) VALUES(?,?,?,?)').run(secure('ambsession'),'amb1',now+3600000,now);
 const adapted={prepare(sql){let bound=[];return {bind(...a){bound=a;return this;},async first(){return sqlite.prepare(sql).get(...bound)??null;},async all(){return {success:true,results:sqlite.prepare(sql).all(...bound)};},async run(){const r=sqlite.prepare(sql).run(...bound);return {success:true,meta:{changes:r.changes}};}}},async batch(items){sqlite.exec('BEGIN');try{let rows=[];for(const i of items)rows.push(await i.run());sqlite.exec('COMMIT');return rows;}catch(e){sqlite.exec('ROLLBACK');throw e;}},async exec(sql){sqlite.exec(sql);return {count:1,duration:0};}};
 return {sqlite,db:adapted};}
const office=(key)=>({officeToken:key});
const ambassador={ambassadorToken:'ambsession'};
const post=(db,path,body,ctx)=>handle('POST',path,body,ctx,db);
const put=(db,path,body,ctx)=>handle('PUT',path,body,ctx,db);
const get=(db,path,ctx)=>handle('GET',path,{},ctx,db);
test('CRM rejects anonymous access, agent onboarding, referral owner approvals and task reviews',async()=>{
 const {db,sqlite}=database();
 assert.equal((await get(db,'/api/crm/state',{})).status,401);
 assert.equal((await post(db,'/api/crm/agents',{agent_code:'COM1',name:'Agent One',initial_password:'long-password-123'},office('admin'))).status,200);
 const login=await post(db,'/api/crm/login',{agent_code:'COM1',password:'long-password-123'},{});assert.equal(login.status,200);
 assert.equal(login.data.must_change_password,true);
 const ctx={commissionToken:'test-session-token'};
 assert.equal((await get(db,'/api/crm/state',ctx)).status,403);
 assert.equal((await post(db,'/api/crm/change-password',{new_password:'even-longer-password'},ctx)).status,200);
 assert.equal((await get(db,'/api/crm/state',ctx)).status,200);
 const created=await post(db,'/api/crm/leads',{full_name:'Client A',phone:'+8801711111111',preferred_countries:'Canada',consent_confirmed:true},ctx);
 assert.equal(created.status,200,JSON.stringify(created.data));const id=created.data.id;
 assert.equal((await put(db,'/api/crm/leads/update',{id,stage:'Embassy Waiting'},ctx)).status,403);
 assert.equal((await get(db,'/api/crm/state',ctx)).data.leads.length,1);
 assert.equal((await post(db,'/api/crm/leads',{full_name:'Repeat phone',phone:'01711111111',consent_confirmed:true},ctx)).status,409,'Bangladesh local phone and +880 country code must refer to one lead');
 assert.equal((await get(db,'/api/crm/state',office('employee'))).data.leads.length,0);
 const state=await get(db,'/api/crm/state',office('manager'));
 assert.equal(state.data.leads.some(x=>x.id===id),false,'team manager cannot view unassigned referrals from outside own team');
 assert.equal((await put(db,'/api/crm/leads/review',{id,referral_status:'approved'},office('manager'))).status,403);
 assert.equal((await put(db,'/api/crm/leads/review',{id,referral_status:'approved'},office('admin'))).status,200);
 assert.equal((await put(db,'/api/crm/leads/review',{id,referral_status:'approved'},office('admin'))).status,409);
 assert.equal((await put(db,'/api/crm/leads/update',{id,stage:'Offer Letter Received'},office('admin'))).status,200);
 assert.equal((await put(db,'/api/crm/profiles',{lead_id:id,relationship_status:'active_client'},office('admin'))).status,200);
 assert.equal((await post(db,'/api/crm/followups',{lead_id:id,channel:'call',notes:'Discussed client documents',next_followup_at:'2026-11-18'},office('admin'))).status,200);
 const commState=await get(db,'/api/crm/state',ctx);
 assert.equal(commState.data.leads[0].stage,'Offer Letter Received');assert.equal(commState.data.followups.length,0,'internal followups never returned to external referrer');
 const agentId=sqlite.prepare('SELECT id FROM crm_commission_agents').get().id;
 assert.equal((await post(db,'/api/crm/tasks',{agent_id:agentId,title:'Call students'},office('admin'))).status,200);
 const task=sqlite.prepare('SELECT id FROM crm_agent_tasks').get();
 assert.equal((await put(db,'/api/crm/tasks/update',{id:task.id,status:'approved'},office('admin'))).status,409);
 assert.equal((await put(db,'/api/crm/tasks/update',{id:task.id,status:'submitted',agent_note:'Spoke to 3 students'},ctx)).status,200);
 assert.equal((await put(db,'/api/crm/tasks/update',{id:task.id,status:'approved'},office('admin'))).status,200);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM crm_agent_task_history').get().n,2);
 sqlite.close();
});
test('ambassador and office employee referral attribution is self-only',async()=>{
 const {db,sqlite}=database();
 const ref=await post(db,'/api/crm/leads',{full_name:'Amb Referral',phone:'01711110001',consent_confirmed:true,referrer_type:'third_party',referrer_display:'Spoofed'},ambassador);
 assert.equal(ref.status,200,JSON.stringify(ref.data));
 const lead=sqlite.prepare('SELECT referrer_type,referrer_id FROM crm_leads WHERE id=?').get(ref.data.id);
 assert.equal(lead.referrer_type,'ambassador');assert.equal(lead.referrer_id,'amb1');
 const staff=await post(db,'/api/crm/leads',{full_name:'Office Referral',phone:'01711110002',consent_confirmed:true,referrer_type:'commission',referrer_id:'forged'},office('employee'));
 assert.equal(staff.status,200);
 const source=sqlite.prepare('SELECT referrer_type,referrer_id FROM crm_leads WHERE id=?').get(staff.data.id);
 assert.equal(source.referrer_type,'office');assert.equal(source.referrer_id,'u3');
 assert.equal((await put(db,'/api/crm/leads/review',{id:staff.data.id,referral_status:'approved'},office('employee'))).status,403);
 sqlite.close();
});
test('v7 protects client identity, keeps multiple application outcomes, and paginates office CRM',async()=>{
 const {db,sqlite}=database(), t=Date.now();
 // Employee owns the referral; team lead can review because source employee belongs to same team.
 const lead=await post(db,'/api/crm/leads',{full_name:'Student One',phone:'01791919191',consent_confirmed:true},office('employee'));
 assert.equal(lead.status,200,JSON.stringify(lead.data));const id=lead.data.id;
 assert.equal((await put(db,'/api/crm/leads/review',{id,referral_status:'approved'},office('manager'))).status,200);
 const p=await get(db,'/api/crm/leads/page',{...office('manager'),query:{filter:'leads',page:'1'}});
 assert.equal(p.status,200);assert.equal(p.data.total,1);
 assert.equal((await put(db,'/api/crm/leads/update',{id,client_status:'archived'},office('manager'))).status,400,'cannot silently close student without reason');
 assert.equal((await put(db,'/api/crm/profiles',{lead_id:id,relationship_status:'lost',closed_reason:''},office('manager'))).status,400);
 assert.equal((await put(db,'/api/crm/profiles',{lead_id:id,relationship_status:'active_client',education_level:'HSC',target_intake:'2027'},office('manager'))).status,200);
 const c=await post(db,'/api/crm/applications',{lead_id:id,destination_country:'Canada',institution:'University A',programme:'BSc'},office('manager'));
 assert.equal(c.status,200,JSON.stringify(c.data));
 assert.equal((await put(db,'/api/crm/applications',{id:c.data.id,application_status:'rejected',visa_status:'refused',outcome_note:''},office('manager'))).status,400);
 assert.equal((await put(db,'/api/crm/applications',{id:c.data.id,application_status:'rejected',visa_status:'refused',outcome_note:'Official refusal notice reviewed'},office('manager'))).status,200);
 const another=await post(db,'/api/crm/applications',{lead_id:id,destination_country:'Australia',programme:'Business'},office('manager'));
 assert.equal(another.status,200);
 const items=await get(db,'/api/crm/applications',{...office('manager'),query:{lead_id:id}});
 assert.equal(items.data.applications.length,2);
 assert.equal((await put(db,'/api/crm/profiles',{lead_id:id,relationship_status:'lost',closed_reason:'Student will not continue this intake'},office('manager'))).status,200);
 assert.equal((await get(db,'/api/crm/leads/page',{...office('manager'),query:{filter:'closed',page:'1'}})).data.total,1);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM crm_applications WHERE lead_id=?').get(id).n,2,'closed student retains all application attempts');
 assert.equal((await put(db,'/api/crm/profiles',{lead_id:id,relationship_status:'active_client'},office('manager'))).status,200,'student can reopen without losing original attribution');
 assert.equal(sqlite.prepare('SELECT referrer_type FROM crm_leads WHERE id=?').get(id).referrer_type,'office');
 assert.equal((await get(db,'/api/crm/applications',{...office('employee'),query:{lead_id:id}})).status,403,'referrer not allowed to see private application details');
 assert.equal((await get(db,'/api/crm/timeline',{...office('employee'),query:{lead_id:id}})).status,403,'referrer cannot read confidential counselling trail');
 const timeline=await get(db,'/api/crm/timeline',{...office('manager'),query:{lead_id:id}});
 assert.equal(timeline.status,200);assert.ok(timeline.data.history_total>=3);
 const metrics=await get(db,'/api/crm/metrics',office('manager'));
 assert.equal(metrics.status,200);assert.equal(metrics.data.clients,1);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM crm_application_history').get().n,3,'all case changes audited');
 // Additional students exceed a 50-row page: no silent truncation.
 const insert=sqlite.prepare("INSERT INTO crm_leads(id,full_name,phone,phone_normalized,referrer_type,referrer_id,referrer_display,created_by_type,created_by_id,consent_confirmed_at,assigned_to_user_id,referral_status,stage,client_status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
 const prof=sqlite.prepare("INSERT INTO crm_lead_profiles(lead_id,relationship_status,updated_at) VALUES(?,'lead',?)");
 for(let i=0;i<60;i++){const x='lead-'+i;insert.run(x,i===0?'=HYPERLINK(\"https://invalid.example\",\"Click\")':'Test Student '+i,'011'+String(i).padStart(9,'0'),'011'+String(i).padStart(9,'0'),'office','u2','Manager','office','u2',t,'u2','approved','New','lead','',t+i,t+i);prof.run(x,t+i);}
 const first=await get(db,'/api/crm/leads/page',{...office('manager'),query:{filter:'all',page:'1'}});
 const second=await get(db,'/api/crm/leads/page',{...office('manager'),query:{filter:'all',page:'2'}});
 assert.equal(first.data.rows.length,50);assert.equal(second.data.rows.length,11);assert.equal(first.data.total,61);
 assert.equal((await get(db,'/api/crm/leads/page',{...office('employee'),query:{filter:'all'}})).data.total,1,'ordinary employee cannot read other team member case lists');
 assert.equal((await get(db,'/api/crm/export-xlsx',office('employee'))).status,403,'ordinary staff cannot export CRM contact lists');
 const exportResult=await get(db,'/api/crm/export-xlsx',office('manager'));
 assert.equal(exportResult.status,200,JSON.stringify(exportResult.data));
 assert.ok(ArrayBuffer.isView(exportResult.binary));
 assert.equal(lastWorkbook.sheets.find(x=>x.name==='All Students').rows.length,62,'export includes all authorized rows and header');
 assert.ok(lastWorkbook.sheets.find(x=>x.name==='All Students').rows.some(row=>String(row[1]).startsWith("'=HYPERLINK")),'dangerous spreadsheet content must be literal text');
 sqlite.close();
});
test('v7.1 import, contact permission, and automatic follow-up queue are enforced server-side', async()=>{
 const {db,sqlite}=database();
 const payload={filename:'historic-AGN.csv',rows:[{full_name:'Imported Student',phone:'01712340099',email:'student@example.com',preferred_countries:'South Korea',referrer_display:'Old Facebook campaign',notes:'Old sheet'}]};
 assert.equal((await post(db,'/api/crm/import',{...payload,commit:false},office('employee'))).status,403,'ordinary employees cannot import');
 const preview=await post(db,'/api/crm/import',{...payload,commit:false},office('admin'));
 assert.equal(preview.status,200,JSON.stringify(preview.data));assert.equal(preview.data.accepted,1);
 const saved=await post(db,'/api/crm/import',{...payload,commit:true},office('admin'));
 assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.imported,1);
 const dbrow=sqlite.prepare("SELECT * FROM crm_leads WHERE phone_normalized='8801712340099'").get();
 assert.equal(dbrow.consent_confirmed_at,0,'imported unknown consent never assumed');
 assert.equal(dbrow.referrer_display,'Old Facebook campaign');
 assert.equal(dbrow.import_batch_id,saved.data.batch_id);
 assert.equal(dbrow.next_followup_at,null,'do not call imported students without consent');
 assert.equal((await post(db,'/api/crm/import',{...payload,commit:false},office('admin'))).data.issues.length,1,'same phone never duplicated');
 assert.equal((await post(db,'/api/crm/import',{...payload,commit:true},office('admin'))).status,409,'duplicate batch aborts');
 assert.equal((await put(db,'/api/crm/leads/review',{id:dbrow.id,referral_status:'approved'},office('admin'))).status,200);
 assert.equal(sqlite.prepare('SELECT next_followup_at FROM crm_leads WHERE id=?').get(dbrow.id).next_followup_at,null,'approval without consent does not schedule outreach');
 assert.equal((await post(db,'/api/crm/followups',{lead_id:dbrow.id,channel:'call',notes:'Contacted',contact_outcome:'connected'},office('admin'))).status,409);
 assert.equal((await put(db,'/api/crm/leads/consent',{id:dbrow.id,confirmed:true,evidence:'Consent verified from signup form'},office('admin'))).status,200);
 const due=sqlite.prepare('SELECT next_followup_at FROM crm_leads WHERE id=?').get(dbrow.id).next_followup_at;
 assert.ok(/^\d{4}-\d\d-\d\d$/.test(due));
 const before=await get(db,'/api/crm/leads/page',{...office('admin'),query:{filter:'followups',page:'1'}});
 assert.equal(before.data.total,0,'future calls are not incorrectly in due queue');
 sqlite.prepare("UPDATE crm_leads SET next_followup_at='2024-01-01' WHERE id=?").run(dbrow.id);
 assert.equal((await get(db,'/api/crm/leads/page',{...office('admin'),query:{filter:'followups',page:'1'}})).data.total,1,'overdue contact automatically enters action queue');
 const now=Date.now();
 const result=await post(db,'/api/crm/followups',{lead_id:dbrow.id,channel:'whatsapp',notes:'Discussed university choices',contact_outcome:'connected'},office('admin'));
 assert.equal(result.status,200,JSON.stringify(result.data));
 const inDays=(days)=>{const d=new Date(new Date().toISOString().slice(0,10)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
 assert.equal(result.data.next_followup_at,inDays(3),'successful contact is scheduled three calendar days later');
 assert.equal((await get(db,'/api/crm/leads/page',{...office('admin'),query:{filter:'followups',page:'1'}})).data.total,0,'documented contact automatically removes student from due queue');
 assert.equal(sqlite.prepare('SELECT last_contacted_at FROM crm_leads WHERE id=?').get(dbrow.id).last_contacted_at>=now,true);
 assert.equal(sqlite.prepare('SELECT contact_outcome FROM crm_lead_followups LIMIT 1').get().contact_outcome,'connected');
 const connectedTimestamp=sqlite.prepare('SELECT last_contacted_at FROM crm_leads WHERE id=?').get(dbrow.id).last_contacted_at;
 const attempt=await post(db,'/api/crm/followups',{lead_id:dbrow.id,channel:'call',notes:'No response',contact_outcome:'no_answer'},office('admin'));
 assert.equal(attempt.status,200,JSON.stringify(attempt.data));
 assert.equal(attempt.data.next_followup_at,inDays(1),'no answer is retried the next calendar day');
 assert.equal(sqlite.prepare('SELECT last_contacted_at FROM crm_leads WHERE id=?').get(dbrow.id).last_contacted_at,connectedTimestamp,'no answer is not a successful contact');
 assert.equal((await get(db,'/api/crm/leads/page',{...office('admin'),query:{filter:'upcoming',page:'1'}})).data.total,1,'upcoming queue includes next call');
 assert.equal((await put(db,'/api/crm/leads/update',{id:dbrow.id,next_followup_at:'2030-01-01'},office('admin'))).status,400,'staff cannot silently postpone due dates without a reason');
 assert.equal((await put(db,'/api/crm/leads/update',{id:dbrow.id,next_followup_at:'2030-01-01',change_reason:'Student requested extension until January'},office('admin'))).status,200,'explicit rescheduling reason is audited');
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='CRM_IMPORT'").get().n,1);
 sqlite.close();
});
