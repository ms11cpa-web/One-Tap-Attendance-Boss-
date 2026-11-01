const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/server/crm/router.ts'),'utf8');
// Use the project's esbuild on Windows (TypeScript 7 removed several old compiler enums).
// The fallback allows this source test to run in constrained build environments.
let js;
try { js=require('esbuild').transformSync(source,{loader:'ts',format:'cjs',target:'es2022'}).code; }
catch { const ts=require('typescript');js=ts.transpileModule(source,{fileName:'router.ts',compilerOptions:{target:9,module:1}}).outputText; }
const people={admin:{id:'u1',employee_id:'ADMIN',name:'Admin',role:'super_admin',status:'active',team:'Management'},manager:{id:'u2',employee_id:'TL1',name:'Team Lead',role:'team_manager',status:'active',team:'Marketing'},employee:{id:'u3',employee_id:'EMP3',name:'Employee',role:'employee',status:'active',team:'Marketing'}};
const mod={exports:{}};
const secure=(s)=>'H:'+s;
const fakeRequire=(x)=>{
 if(x.endsWith('/api-handler.ts'))return {getUserFromSession:async(_db,t)=>people[t]||null};
 if(x.endsWith('/crypto.ts'))return {hashPassword:async(pass)=>'PW:'+pass,verifyPassword:async(pass,hash)=>hash==='PW:'+pass,generateSessionToken:()=> 'test-session-token'};
 if(x.endsWith('/recovery.ts'))return {hashRecoveryCode:async(s)=>secure(s)};
 throw Error('Unexpected test dependency '+x);
};
vm.runInNewContext(js,{module:mod,exports:mod.exports,require:fakeRequire,console,crypto:globalThis.crypto,Date,URL,TextEncoder});
const handle=mod.exports.handleCrmRequest;
function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON;');
 for(let n=1;n<=7;n++){let f=fs.readdirSync(path.join(root,'migrations')).find(x=>x.startsWith('000'+n+'_'));sqlite.exec(fs.readFileSync(path.join(root,'migrations',f),'utf8'));}
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
 assert.equal(state.data.leads.some(x=>x.id===id),true,'team manager can see unassigned pending referral');
 assert.equal((await put(db,'/api/crm/leads/review',{id,referral_status:'approved'},office('manager'))).status,200);
 assert.equal((await put(db,'/api/crm/leads/review',{id,referral_status:'approved'},office('manager'))).status,409);
 assert.equal((await put(db,'/api/crm/leads/update',{id,stage:'Offer Letter Received',client_status:'client'},office('manager'))).status,200);
 assert.equal((await post(db,'/api/crm/followups',{lead_id:id,channel:'call',notes:'Discussed client documents',next_followup_at:'2026-11-18'},office('manager'))).status,200);
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
