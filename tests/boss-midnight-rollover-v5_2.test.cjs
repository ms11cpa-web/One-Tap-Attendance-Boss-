const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const base = path.resolve(__dirname,'..');

function loadFunctions(file, names, injected={}) {
  let code = stripTypeScriptTypes(fs.readFileSync(path.join(base,file),'utf8'));
  code = code.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'');
  const sandbox = { Date, console, crypto: require('node:crypto').webcrypto, ...injected };
  vm.runInNewContext(`${code}\n;globalResult = {${names.join(',')}};`,sandbox,{filename:file});
  return sandbox.globalResult;
}

test('past-date open shifts are marked missing OUT without inventing timestamps',async()=>{
  const {closePreviousOpenShifts}=loadFunctions('src/server/utils/attendance-rollover.ts',['closePreviousOpenShifts']);
  let query='',args=[];
  const db={prepare(sql){query=sql;return {bind(...p){args=p;return this},async run(){return {success:true}}}}};
  await closePreviousOpenShifts(db,'2026-11-01','emp1');
  assert.match(query,/status='missing_out'/);
  assert.match(query,/attendance_date < \?/);
  assert.match(query,/out_time IS NULL/);
  assert.doesNotMatch(query,/out_time\s*=/);
  assert.deepEqual(args.slice(1),['2026-11-01','emp1']);
});

test('manual adjustments enforce date, clock, explanation, and future-date limits',()=>{
  const {validateAttendanceAdjustment}=loadFunctions('src/server/utils/manual-attendance.ts',['validateAttendanceAdjustment'],{
    calculateLateness:()=>0,calculateExtraMinutes:()=>0
  });
  const ok={inTime:'11:00',outTime:'19:00',reason:'Evidence verified by the Super Admin'};
  assert.equal(validateAttendanceAdjustment('2026-10-28','2026-11-01',ok),null);
  assert.equal(validateAttendanceAdjustment('2026-10-28','2026-11-01',{...ok,outTime:null}),null);
  assert.ok(validateAttendanceAdjustment('2026-11-03','2026-11-01',ok));
  assert.ok(validateAttendanceAdjustment('2026-10-28','2026-11-01',{...ok,inTime:'50:00'}));
  assert.ok(validateAttendanceAdjustment('2026-10-28','2026-11-01',{...ok,reason:'hi'}));
  assert.ok(validateAttendanceAdjustment('2026-10-28','2026-11-01',{...ok,outTime:'11:00'}));
});

test('Super Admin adjustment is atomic with an audit log and zero GPS verification',async()=>{
  const {applyManualAttendanceUpdate}=loadFunctions('src/server/utils/manual-attendance.ts',['applyManualAttendanceUpdate'],{
    calculateLateness:(a,b,g)=>0,calculateExtraMinutes:()=>0
  });
  let batch=[];
  const db={prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this},async first(){return null}}},async batch(stmts){batch=stmts;for(const s of stmts){assert.equal((s.sql.match(/\?/g)||[]).length,s.args.length)}return [{success:true},{success:true}];}};
  const result=await applyManualAttendanceUpdate(db,{targetUserId:'user1',date:'2026-10-28',input:{inTime:'11:00',outTime:null,reason:'Forgot my checkout'},actor:{id:'admin1',name:'Admin'},ip:'127.0.0.1',scheduledStart:'11:00',scheduledEnd:'19:00',graceMinutes:15,scheduledMinutes:480});
  assert.match(result,/att_user1_/);
  assert.equal(batch.length,2);
  assert.match(batch[0].sql,/in_verified,out_verified/);
  assert.match(batch[1].sql,/audit_logs/);
  assert.equal(batch[0].args.includes('missing_out'),true);
});

test('attendance UI keeps current day separate from former shifts',()=>{
  const api=fs.readFileSync(path.join(base,'src/server/routes/api-handler.ts'),'utf8');
  const ui=fs.readFileSync(path.join(base,'src/components/attendance/OneTapAttendance.tsx'),'utf8');
  assert.match(api,/attendance: attendance \|\| null/);
  assert.match(api,/previousMissingOutDate:/);
  assert.doesNotMatch(api,/An earlier shift .*still open\. Clock OUT or request a correction before punching IN again/);
  assert.match(ui,/Previous attendance .* is missing an OUT time/);
  assert.match(ui,/setInterval\(checkNewDay, 30_000\)/);
});

test('manual adjustments are Super Admin-only and changes are audited',()=>{
  const api=fs.readFileSync(path.join(base,'src/server/routes/api-handler.ts'),'utf8');
  assert.match(api,/api\/admin\/attendance\/adjust/);
  assert.match(api,/Only Super Admin can directly adjust attendance/);
  assert.match(api,/applyManualAttendanceUpdate/);
  assert.match(fs.readFileSync(path.join(base,'src/server/utils/manual-attendance.ts'),'utf8'),/SUPER_ADMIN_ATTENDANCE_ADJUST/);
});
