// Integration-style test: executes the actual Campus Hub route using in-memory SQLite.
// Auth/token hashing and notification delivery are explicitly stubbed; this is not a live browser/security audit.
const fs=require('fs'),vm=require('vm'),path=require('path');
const assert=require('node:assert/strict');
const { DatabaseSync }=require('node:sqlite');
const base=path.resolve(__dirname,'..');
const db=new DatabaseSync(':memory:');
for(const file of ['0001_initial.sql','0002_account_security.sql','0003_holiday_date_ranges.sql','0004_campus_ambassadors.sql','0005_ambassador_notifications.sql','0006_boss_security_hardening.sql'])db.exec(fs.readFileSync(path.join(base,'migrations',file),'utf8'));
const q={
 prepare(sql){ return { bind(...params){this.params=params; return this}, first(){return Promise.resolve(db.prepare(sql).get(...(this.params||[]))||null)},all(){return Promise.resolve({success:true,results:db.prepare(sql).all(...(this.params||[]))})},run(){const r=db.prepare(sql).run(...(this.params||[]));return Promise.resolve({success:true,meta:{changes:Number(r.changes)}})} }; },
 async batch(stmts){db.exec('BEGIN');try{const r=[]; for(const st of stmts)r.push(await st.run());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e;}},
 async exec(sql){db.exec(sql);return {count:1,duration:0}}
};
const insert=(sql,...args)=>db.prepare(sql).run(...args);
insert("INSERT INTO users(id,employee_id,name,role,team,designation,joining_date,password_hash) VALUES('u1','ADMIN','Admin','super_admin','Management','Admin','2026-01-01','hash')");
insert("UPDATE amb_module_settings SET enabled=1 WHERE id='default'");
insert("INSERT INTO amb_campuses(id,name,city,created_at) VALUES('c1','University A','Dhaka',1)");
for(const [id,code] of [['p1','AGN2'],['p2','AGN10']]) insert('INSERT INTO amb_people(id,ambassador_code,name,campus_id,password_hash,joined_at,updated_at,must_change_password) VALUES(?,?,?,?,?,0,0,0)',id,code,'Ambassador '+code,'c1','hash');
insert("INSERT INTO amb_campaigns(id,title,instructions,content_type,target_scope,points,due_date,created_by,created_at) VALUES('cmp1','Make an AGN video','Create meaningful AGN content','video','all',30,'2026-11-01','u1',1)");
insert("INSERT INTO amb_assignments(id,campaign_id,ambassador_id,assigned_at) VALUES('as1','cmp1','p1',1)");
insert("INSERT INTO amb_assignments(id,campaign_id,ambassador_id,assigned_at) VALUES('as2','cmp1','p2',1)");
insert("INSERT INTO amb_sessions(id,ambassador_id,expires_at,created_at) VALUES('hash:member-token','p1',9999999999999,1)");
// Import the actual route source, transpiled in-memory; mocked dependencies do not change its handlers.
const src=fs.readFileSync(path.join(base,'src/server/routes/ambassadors.ts'),'utf8');
// TypeScript 7 does not provide the legacy transpileModule / ScriptTarget API.
// esbuild is already a dependency of Boss and supports CJS output for this VM test.
let js;
try {
  js=require('esbuild').transformSync(src,{loader:'ts',format:'cjs',target:'es2022',sourcefile:'ambassadors.ts'}).code;
} catch (err) {
  // Local source reviewers may only have a legacy TypeScript compiler installed.
  // Keep that fallback isolated; Boss installations use the installed esbuild package.
  if (err.code!=='MODULE_NOT_FOUND') throw err;
  let ts;
  try { ts=require('typescript'); } catch { /* handled below */ }
  if (!ts || typeof ts.transpileModule!=='function' || !ts.ScriptTarget || !ts.ModuleKind) {
    throw new Error('Runtime test requires esbuild. From the Boss project run: npm install (or restore the existing node_modules).');
  }
  js=ts.transpileModule(src,{fileName:'ambassadors.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
}
const moduleObject={exports:{}};
const stub=(request)=>{
 if(request.includes('api-handler'))return {getUserFromSession:async(_db,token)=>token==='boss-admin'?{id:'u1',employee_id:'ADMIN',name:'Admin',role:'super_admin',status:'active'}:null,logAudit:async()=>{}};
 if(request.includes('auth/crypto'))return {hashPassword:async x=>x,verifyPassword:async(a,b)=>a===b,generateSessionToken:()=> 'new-token'};
 if(request.includes('auth/recovery'))return {hashRecoveryCode:async x=>'hash:'+x};
 if(request.includes('utils/time'))return {getDhakaDateString:()=>'2026-10-28'};
 if(request.includes('utils/ambassador-performance'))return {calculateMonthlyPerformance:()=>({score:0}),monthWindow:()=>({start:'2026-10-01',cutoff:'2026-10-27',complete:false}),winnerEligible:()=>false};
 if(request.includes('notifications/notification-core'))return {queueManagers:async()=>{},queueAmbassadors:async()=>{}};
 throw Error('Unexpected module '+request)
};
vm.runInNewContext(js,{require:stub,module:moduleObject,exports:moduleObject.exports,crypto:globalThis.crypto,URL,Date,console,Intl,Set,Map,Number,String,Math}, {filename:'ambassadors.ts'});
const route=moduleObject.exports.handleAmbassadorRequest;
(async()=>{
 const member={ambassadorToken:'member-token',ip:'1.2.3.4'};let r;
 r=await route('POST','/api/ambassadors/submit',{assignment_id:'as1',proof_url:'https://drive.google.com/first',notes:'original'},member,q);assert.equal(r.status,200,JSON.stringify(r));
 r=await route('POST','/api/ambassadors/submit',{assignment_id:'as1',proof_url:'https://drive.google.com/edited',notes:'new',edit_pending:true},member,q);assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(db.prepare("SELECT notes FROM amb_submissions WHERE assignment_id='as1'").get().notes,'new');
 r=await route('POST','/api/ambassadors/withdraw',{assignment_id:'as1'},member,q);assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM amb_submissions WHERE assignment_id='as1'").get().n,0);
 r=await route('POST','/api/ambassadors/submit',{assignment_id:'as1',proof_url:'https://drive.google.com/retry',notes:'retry'},member,q);assert.equal(r.status,200);
 const sub=db.prepare("SELECT id FROM amb_submissions WHERE assignment_id='as1'").get().id;
 insert("UPDATE amb_submissions SET status='revision_requested',revisions=1 WHERE id=?",sub);
 insert("INSERT INTO amb_review_events(id,submission_id,reviewer_id,decision,note,recorded_at) VALUES ('ev1',?,'u1','revision_requested','revisions',1)",sub);
 r=await route('POST','/api/ambassadors/submit',{assignment_id:'as1',proof_url:'https://drive.google.com/revision'},member,q);assert.equal(r.status,200);
 r=await route('POST','/api/ambassadors/withdraw',{assignment_id:'as1'},member,q);assert.equal(r.status,409);
 r=await route('POST','/api/ambassadors/submit',{assignment_id:'as1',proof_url:'https://drive.google.com/another',edit_pending:true},member,q);assert.equal(r.status,200);
 // Actual manager reviewing the submission prevents subsequent alteration.
 r=await route('POST','/api/ambassadors/admin/reviews',{submission_id:sub,decision:'approved',quality_score:5}, {token:'boss-admin',ip:'1.2.3.4'},q);
 assert.equal(r.status,200,JSON.stringify(r));
 r=await route('POST','/api/ambassadors/submit',{assignment_id:'as1',proof_url:'https://drive.google.com/after',edit_pending:true},member,q);assert.equal(r.status,409);
 r=await route('POST','/api/ambassadors/withdraw',{assignment_id:'as1'},member,q);assert.equal(r.status,409);
 r=await route('GET','/api/ambassadors/admin/state',{}, {token:'boss-admin'},q);assert.equal(r.status,200);assert.deepEqual(r.data.people.map(x=>x.ambassador_code),['AGN2','AGN10']);
 r=await route('POST','/api/ambassadors/admin/campaigns',{title:'Campaign New',instructions:'Create approved content for AGN',content_type:'video',target_scope:'all',points:30,due_date:'2026-11-15'}, {token:'boss-admin'},q);
 assert.equal(r.status,200,JSON.stringify(r)); assert.equal(r.data.assignments,2);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM amb_assignments WHERE campaign_id=?').get(r.data.id).n,2);
 console.log('PASS: real ambassador route exercised with in-memory D1: initial submit, pending edit, withdrawal, historical revision protection, final approval protection, natural ID sorting, transactional 2-member campaign publication');
})();
