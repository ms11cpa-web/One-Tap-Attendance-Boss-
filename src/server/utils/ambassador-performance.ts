/**
 * AGN monthly performance — read-only calculations based on existing assignments.
 * A task belongs to the month of its due date (Asia/Dhaka business calendar).
 * Only completed deadline days count; today's and future deadlines are excluded.
 * Historic totals are live views: late manager reviews can change past rankings.
 */
export type EligibleTask = {
  due_date: string;
  points: number | null;
  status: string | null;
  quality_score: number | null;
  submitted_at: number | null;
};

export type PerformanceRating = 'Excellent' | 'Good' | 'Satisfactory' | 'Needs Improvement' | 'Not rated';
export type MonthlyPerformance = {
  eligible: number;
  approved: number;
  on_time: number;
  approved_points: number;
  quality_average: number | null;
  active_weeks: number;
  assigned_weeks: number;
  completion_pct: number;
  quality_pct: number;
  timeliness_pct: number;
  consistency_pct: number;
  score: number | null;
  rating: PerformanceRating;
};

const round1 = (v: number) => Math.round((v + Number.EPSILON) * 10) / 10;
const utcDay = (s: string) => new Date(`${s}T00:00:00.000Z`);
const nextDay = (s: string, increment: number) => {
  const d = utcDay(s);
  d.setUTCDate(d.getUTCDate() + increment);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (ymd: string): string => {
  const d = utcDay(ymd);
  const daysFromMonday = (d.getUTCDay() + 6) % 7;
  return nextDay(ymd, -daysFromMonday);
};

export function monthWindow(month: string, todayDhaka: string): { start: string; cutoff: string; complete: boolean } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2000 || Number(month.slice(0, 4)) > 2100) {
    throw new Error('Month must be YYYY-MM (2000–2100).');
  }
  const start = `${month}-01`;
  const next = new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5,7)), 1));
  const end = nextDay(next.toISOString().slice(0,10), -1);
  const yesterday = nextDay(todayDhaka, -1);
  return { start, cutoff: end < yesterday ? end : yesterday, complete: end < todayDhaka };
}

export function performanceRating(score: number | null): PerformanceRating {
  if (score === null) return 'Not rated';
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Satisfactory';
  return 'Needs Improvement';
}

/** Tasks passed here must already have a due date within [start, cutoff]. */
export function calculateMonthlyPerformance(tasks: EligibleTask[]): MonthlyPerformance {
  const approved = tasks.filter(t => t.status === 'approved');
  const eligible = tasks.length;
  const assignedWeeks = new Set(tasks.map(t => mondayOf(t.due_date)));
  const activeWeeks = new Set(approved.map(t => mondayOf(t.due_date)));
  const onTime = approved.filter(t => t.submitted_at !== null && Number.isFinite(t.submitted_at)
    && new Date(Number(t.submitted_at) + 6 * 60 * 60 * 1000).toISOString().slice(0,10) <= t.due_date).length;
  const qualityAverage = approved.length ? approved.reduce((sum,t)=>sum+Number(t.quality_score || 0),0)/approved.length : null;
  const completionPct = eligible ? (approved.length / eligible) * 100 : 0;
  const qualityPct = qualityAverage === null ? 0 : (qualityAverage / 5) * 100;
  const timelinessPct = approved.length ? (onTime / approved.length) * 100 : 0;
  // 'Consistency' means approval in each week in which a deadline fell, not daily logins.
  const consistencyPct = assignedWeeks.size ? (activeWeeks.size / assignedWeeks.size) * 100 : 0;
  const score = eligible ? round1(0.40 * completionPct + 0.30 * qualityPct + 0.15 * timelinessPct + 0.15 * consistencyPct) : null;
  return {
    eligible, approved: approved.length, on_time: onTime,
    approved_points: approved.reduce((sum,t)=>sum + Number(t.points || 0),0),
    quality_average: qualityAverage === null ? null : round1(qualityAverage),
    active_weeks: activeWeeks.size, assigned_weeks: assignedWeeks.size,
    completion_pct: round1(completionPct), quality_pct: round1(qualityPct),
    timeliness_pct: round1(timelinessPct), consistency_pct: round1(consistencyPct),
    score, rating: performanceRating(score),
  };
}

/** A winner must have meaningful verified contributions, not merely one perfect task. */
export const winnerEligible = (r: MonthlyPerformance): boolean => r.eligible >= 2 && r.approved >= 2 && (r.score ?? 0) >= 70;
