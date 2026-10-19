import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMonthlyPerformance as score, monthWindow, winnerEligible, performanceRating, type EligibleTask } from '../src/server/utils/ambassador-performance.ts';
const task = (due_date: string, status: string | null = 'approved', quality_score: number | null = 5, submitted_at: number | null = Date.parse(`${due_date}T12:00:00+06:00`), points = 30): EligibleTask => ({due_date,status,quality_score,submitted_at,points});

test('Not rated with no eligible assignments',()=>{
  const r=score([]); assert.equal(r.score,null); assert.equal(r.rating,'Not rated'); assert.equal(winnerEligible(r),false);
});
test('perfect verified tasks in two different weeks yield 100 and qualify for winner',()=>{
  const r=score([task('2026-10-05'),task('2026-10-12')]);
  assert.equal(r.score,100); assert.equal(r.rating,'Excellent'); assert.equal(r.assigned_weeks,2);
  assert.equal(r.active_weeks,2); assert.equal(winnerEligible(r),true);
});
test('a perfect single task does not qualify for the monthly award',()=>{
  const r=score([task('2026-10-05')]); assert.equal(r.score,100); assert.equal(winnerEligible(r),false);
});
test('one approved out of two deadlines in separate weeks scores 72.5, Good',()=>{
  const r=score([task('2026-10-05'),task('2026-10-12',null,null,null)]);
  assert.equal(r.completion_pct,50);assert.equal(r.consistency_pct,50);
  assert.equal(r.timeliness_pct,100);assert.equal(r.score,72.5); assert.equal(r.rating,'Good');
});
test('one-star quality and no on-time approval are counted correctly',()=>{
  const r=score([task('2026-10-05','approved',1,Date.parse('2026-10-07T00:00:00+06:00'))]);
  assert.equal(r.quality_average,1); assert.equal(r.quality_pct,20);
  assert.equal(r.timeliness_pct,0); assert.equal(r.score,61);assert.equal(r.rating,'Satisfactory');
});
test('submissions after Dhaka midnight are late, including UTC timezone conversion',()=>{
  const r=score([task('2026-10-05','approved',5,Date.parse('2026-10-05T18:30:00Z'))]);
  assert.equal(r.on_time,0); assert.equal(r.score,85);
});
test('weekday group starts Monday even around year boundary',()=>{
  const r=score([task('2025-12-29'),task('2026-01-04')]);
  assert.equal(r.assigned_weeks,1); assert.equal(r.active_weeks,1);
});
test('month window excludes today and future deadlines in Dhaka',()=>{
  assert.deepEqual(monthWindow('2026-10','2026-10-19'),{start:'2026-10-01',cutoff:'2026-10-18',complete:false});
  assert.deepEqual(monthWindow('2026-09','2026-10-19'),{start:'2026-09-01',cutoff:'2026-09-30',complete:true});
  assert.deepEqual(monthWindow('2026-11','2026-10-19'),{start:'2026-11-01',cutoff:'2026-10-18',complete:false});
});
test('month boundary supports leap years',()=>{
  assert.equal(monthWindow('2028-02','2028-03-03').cutoff,'2028-02-29');
  assert.equal(monthWindow('2027-02','2027-03-03').cutoff,'2027-02-28');
});
test('invalid report months are rejected',()=>{
  for(const m of ['2026-00','2026-13','26-10','2099-1','1900-12','abcd-ef'])assert.throws(()=>monthWindow(m,'2026-10-19'));
});
test('score thresholds',()=>{
  assert.equal(performanceRating(84.9),'Good');assert.equal(performanceRating(85),'Excellent');
  assert.equal(performanceRating(70),'Good');assert.equal(performanceRating(69.9),'Satisfactory');
  assert.equal(performanceRating(49.9),'Needs Improvement');
});
