import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const api = read('src/server/routes/api-handler.ts');
const amb = read('src/server/routes/ambassadors.ts');
const excel = read('src/server/reports/excel.ts');
const admin = read('src/components/ambassadors/AmbassadorAdminView.tsx');
const mobile = read('src/components/layout/MobileNav.tsx');
const sidebar = read('src/components/layout/Sidebar.tsx');
const portal = read('src/components/ambassadors/AmbassadorPortal.tsx');

test('security and rewards migration is additive and idempotent',()=>{
 const db = new DatabaseSync(':memory:');
 db.exec("CREATE TABLE users (id TEXT PRIMARY KEY); CREATE TABLE attendance_records (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('existing'); INSERT INTO attendance_records VALUES ('old');");
 const sql=read('migrations/0006_boss_security_hardening.sql');
 db.exec(sql);db.exec(sql);
 assert.equal(db.prepare('SELECT id FROM users').get().id,'existing');
 assert.equal(db.prepare('SELECT id FROM attendance_records').get().id,'old');
 for(const name of ['office_login_attempts','amb_recognition_awards']) assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name=?").get(name).n,1);
 db.close();
});
test('employee report filters apply to all private worksheets',()=>{
 assert.match(api,/role === 'team_manager' && query\.userId/);
 assert.match(api,/Reports are limited to your own team/);
 assert.match(excel,/visibleIds\.has\(String\(r\.user_id\)\)/);
 assert.match(excel,/summary\.leaveDays \+=/);
 assert.match(excel,/work_start_time, work_end_time/);
});
test('approvals require pending state and manager team ownership',()=>{
 assert.match(api,/Managers can approve other employees in their own team only/);
 assert.match(api,/Managers can review other members of their own team only/);
 assert.match(api,/Invalid leave decision/);
 assert.match(api,/AND status = 'pending'/);
});
test('ambassador tasks, edits and rewards have protected transitions',()=>{
 for(const segment of ['people/edit','people/delete','campaigns/edit','campaigns/archive','campaigns/delete','assignments/reassign','assignments/delete','reviews/correct','awards/update','awards/revoke'])
   assert.ok(amb.includes(`/api/ambassadors/admin/${segment}`),segment);
 assert.match(amb,/Cannot reassign a task after submission/);
 assert.match(amb,/Only Super Admin may correct a completed review/);
 assert.match(amb,/Only Super Admin can revoke published recognition/);
 assert.match(amb,/ambassador_code COLLATE NOCASE/);
 assert.match(admin,/Reassign task/);
 assert.match(admin,/Correct final review/);
 assert.match(admin,/Non-monetary Recognition/);
 assert.match(portal,/Your recognition & certificates/);
});
test('Super Admin cannot punch and staff see attendance by ID',()=>{
 assert.match(api,/Super Admin accounts manage attendance but do not punch in/);
 assert.match(sidebar,/show: !isSuperAdmin/);
 assert.match(mobile,/!isSuperAdmin && <button/);
 assert.match(api,/ORDER BY employee_id ASC/);
 assert.match(api,/WHERE status = 'active' AND role <> 'super_admin'/);
 assert.match(api,/ar.attendance_date = \? AND u.role <> 'super_admin'/);
});
