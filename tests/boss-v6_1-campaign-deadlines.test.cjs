/** Source-backed API regression test using in-memory SQLite and mocked external auth/push.
 * Tests deadline enforcement at 23:59 Asia/Dhaka without modifying live data. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const base = path.resolve(__dirname, '..');
const campaignSource = fs.readFileSync(path.join(base, 'src/utils/campaign-deadline.ts'), 'utf8');
const helperModule = {exports:{}};
vm.runInNewContext(stripTypeScriptTypes(campaignSource).replace(/^export\s+/gm,'')+ '\nmodule.exports={dhakaCalendarDate,effectiveCampaignStatus,campaignAcceptsWork};',
  { module:helperModule, Intl, Date, Object });
const {dhakaCalendarDate,effectiveCampaignStatus,campaignAcceptsWork} = helperModule.exports;

test('Asia/Dhaka due date closes precisely after midnight, not at UTC midnight', () => {
  assert.equal(dhakaCalendarDate(new Date('2026-11-01T17:59:59Z')), '2026-11-01');
  assert.equal(dhakaCalendarDate(new Date('2026-11-01T18:00:00Z')), '2026-11-02');
  assert.equal(effectiveCampaignStatus('active','2026-11-01','2026-11-01'),'active');
  assert.equal(effectiveCampaignStatus('active','2026-11-01','2026-11-02'),'expired');
  assert.equal(effectiveCampaignStatus('archived','2026-12-01','2026-11-01'),'archived');
  assert.equal(campaignAcceptsWork('active','2026-11-01','2026-11-01'),true);
  assert.equal(campaignAcceptsWork('active','2026-11-01','2026-11-02'),false);
});

const insert=(db,sql,...args)=>db.prepare(sql).run(...args);
function harness() {
 const db=new DatabaseSync(':memory:');
 for(const file of ['0001_initial.sql','0002_account_security.sql','0003_holiday_date_ranges.sql','0004_campus_ambassadors.sql','0005_ambassador_notifications.sql','0006_boss_security_hardening.sql','0007_crm_leads_commission.sql']) {
   db.exec(fs.readFileSync(path.join(base,'migrations',file),'utf8'));
 }
 const q={
   prepare(sql) {return {bind(...params){this.params=params;return this}, first(){return Promise.resolve(db.prepare(sql).get(...(this.params||[]))||null)}, all(){return Promise.resolve({results:db.prepare(sql).all(...(this.params||[]))})},run(){const r=db.prepare(sql).run(...(this.params||[]));return Promise.resolve({meta:{changes:Number(r.changes)}})} };},
   async batch(stmts){db.exec('BEGIN');try{const r=[];for(const stmt of stmts)r.push(await stmt.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
 };
 insert(db,"INSERT INTO users(id,employee_id,name,role,team,designation,joining_date,password_hash) VALUES('u1','ADMIN','Admin','super_admin','Management','Admin','2026-01-01','hash')");
 insert(db,"UPDATE amb_module_settings SET enabled=1 WHERE id='default'");
 insert(db,"INSERT INTO amb_campuses(id,name,city,created_at) VALUES('c1','University A','Dhaka',1)");
 for (const [id,code] of [['p1','AGN1'],['p2','AGN2']]) {
   insert(db,'INSERT INTO amb_people(id,ambassador_code,name,campus_id,password_hash,joined_at,updated_at,must_change_password) VALUES(?,?,?,?,?,0,0,0)',id,code,'Member '+code,'c1','hash');
 }
 for(const [id,due,status] of [['old','2026-10-31','active'],['today','2026-11-01','active'],['archive','2026-10-31','archived']]) {
  insert(db,'INSERT INTO amb_campaigns(id,title,instructions,content_type,target_scope,points,due_date,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,'Campaign '+id,'Make a short AGN video content','video','all',20,due,status,'u1',1);
  insert(db,'INSERT INTO amb_assignments(id,campaign_id,ambassador_id,assigned_at) VALUES(?,?,?,?)','as-'+id,id,'p1',1);
 }
 insert(db,"INSERT INTO amb_sessions(id,ambassador_id,expires_at,created_at) VALUES('hash:member','p1',9999999999999,1)");
 // This old proof existed before the cutoff; it must stay reviewable.
 insert(db,"INSERT INTO amb_submissions(id,assignment_id,proof_url,notes,submitted_at,status) VALUES('s-old','as-old','https://example.com/old','Before cutoff',1,'submitted')");
 const src=fs.readFileSync(path.join(base,'src/server/routes/ambassadors.ts'),'utf8');
 let js;
 try {js=require('esbuild').transformSync(src,{loader:'ts',format:'cjs',target:'es2022'}).code;}
 catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;const ts=require('typescript');if(!ts.transpileModule||!ts.ScriptTarget)throw new Error('Install esbuild to run the API integration test.');js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;}
 const o={exports:{}};
 const stub=(request)=>{
   if(request.includes('api-handler'))return {getUserFromSession:async(_db,token)=>token==='admin'?{id:'u1',employee_id:'ADMIN',name:'Admin',email:'admin@example.com',role:'super_admin',status:'active'}:null,logAudit:async()=>{}};
   if(request.includes('auth/crypto'))return {hashPassword:async x=>x,verifyPassword:async(a,b)=>a===b,generateSessionToken:()=> 'tok'};
   if(request.includes('auth/recovery'))return {hashRecoveryCode:async x=>'hash:'+x};
   if(request.includes('utils/time'))return {getDhakaDateString:()=>'2026-11-01'};
   if(request.includes('utils/campaign-deadline'))return {campaignAcceptsWork};
   if(request.includes('utils/ambassador-performance'))return {calculateMonthlyPerformance:()=>({score:null}),monthWindow:()=>({start:'2026-11-01',cutoff:'2026-10-31',complete:false}),winnerEligible:()=>false};
   if(request.includes('notifications/notification-core'))return {queueManagers:async()=>{},queueAmbassadors:async()=>{}};
   throw Error('Unexpected dependency: '+request);
 };
 vm.runInNewContext(js,{require:stub,module:o,exports:o.exports,crypto:globalThis.crypto,URL,Date,console,Intl,Set,Map,Number,String,Math},{filename:'ambassadors.ts'});
 return {db,q,route:o.exports.handleAmbassadorRequest};
}

test('real Campus Hub routes reject expired submissions, allow due-today proof, and preserve past reviews',async()=>{
 const {db,q,route}=harness(),member={ambassadorToken:'member',ip:'127.0.0.1'},admin={token:'admin',ip:'127.0.0.1'};
 let r=await route('GET','/api/ambassadors/tasks',{},member,q);
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(r.data.tasks.find(x=>x.title==='Campaign old').campaign_status,'expired');
 assert.equal(r.data.tasks.find(x=>x.title==='Campaign today').campaign_status,'active');
 r=await route('POST','/api/ambassadors/submit',{assignment_id:'as-old',proof_url:'https://example.com/late',edit_pending:true},member,q);
 assert.equal(r.status,409,JSON.stringify(r));
 assert.equal(db.prepare("SELECT proof_url FROM amb_submissions WHERE id='s-old'").get().proof_url,'https://example.com/old');
 r=await route('POST','/api/ambassadors/submit',{assignment_id:'as-today',proof_url:'https://example.com/current'},member,q);
 assert.equal(r.status,200,JSON.stringify(r));
 r=await route('POST','/api/ambassadors/admin/assignments/add',{campaign_id:'old',ambassador_id:'p2'},admin,q);
 assert.equal(r.status,409);
 r=await route('POST','/api/ambassadors/admin/assignments/reassign',{id:'as-old',ambassador_id:'p2'},admin,q);
 assert.equal(r.status,409);
 r=await route('POST','/api/ambassadors/admin/campaigns/archive',{id:'archive',status:'active'},admin,q);
 assert.equal(r.status,409);
 r=await route('POST','/api/ambassadors/admin/campaigns',{title:'Outdated Campaign',instructions:'Create original video content',content_type:'video',target_scope:'all',points:20,due_date:'2026-10-31'},admin,q);
 assert.equal(r.status,400);
 r=await route('POST','/api/ambassadors/admin/reviews',{submission_id:'s-old',decision:'approved',quality_score:4},admin,q);
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(db.prepare("SELECT status FROM amb_submissions WHERE id='s-old'").get().status,'approved');
 r=await route('GET','/api/ambassadors/admin/state',{},admin,q);
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(r.data.campaigns.find(x=>x.id==='old').effective_status,'expired');
 assert.equal(r.data.campaigns.find(x=>x.id==='archive').effective_status,'archived');
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM amb_assignments WHERE campaign_id='old'").get().n,1);
});

test('notification daily reminder excludes expired campaign assignments',()=>{
 const source=fs.readFileSync(path.join(base,'src/server/notifications/notification-core.ts'),'utf8');
 assert.match(source,/c\.status='active' AND c\.due_date>=\?/);
});

test('calendar entry hidden while attendance history and lead navigation remain accessible',()=>{
 const side=fs.readFileSync(path.join(base,'src/components/layout/Sidebar.tsx'),'utf8');
 const mob=fs.readFileSync(path.join(base,'src/components/layout/MobileNav.tsx'),'utf8');
 assert.doesNotMatch(side,/label: 'Monthly Calendar'/);
 assert.doesNotMatch(mob,/<span>Calendar<\/span>/);
 assert.match(mob,/handleSelect\('crm'\)/);
 assert.match(side,/label: 'Attendance History'/);
});

test('UI prevents expired campaign submission and identifies overdue assignments',()=>{
 const portal=fs.readFileSync(path.join(base,'src/components/ambassadors/AmbassadorPortal.tsx'),'utf8');
 const admin=fs.readFileSync(path.join(base,'src/components/ambassadors/AmbassadorAdminView.tsx'),'utf8');
 assert.match(portal,/campaignAcceptsWork\(t\.campaign_status,t\.due_date,dhakaDay\)/);
 assert.match(portal,/Deadline passed\. New submissions and edits are closed/);
 assert.match(admin,/boss-campaign-status--\$\{state\}/);
 assert.match(admin,/Overdue — no submission/);
 assert.match(admin,/c\.due_date>=dhakaDay/);
});

test('new campaign buttons have readable WCAG AA theme color pairs',()=>{
 function l(hex){const c=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
 function ratio(a,b){return (Math.max(l(a),l(b))+.05)/(Math.min(l(a),l(b))+.05);}
 for(const [foreground,background] of [['#0f172a','#f8fafc'],['#475569','#f8fafc'],['#115e59','#f0fdfa'],['#9f1239','#fff1f2'],['#f8fafc','#19273b'],['#cbd5e1','#19273b'],['#99f6e4','#123b3c'],['#fecdd3','#4c1d30'],['#fde68a','#422c14']])
  assert.ok(ratio(foreground,background)>=4.5,`${foreground} on ${background} ratio ${ratio(foreground,background)}`);
 const css=fs.readFileSync(path.join(base,'src/theme/boss-theme.css'),'utf8');
 assert.match(css,/\.boss-campaign-action:focus-visible/);
});
