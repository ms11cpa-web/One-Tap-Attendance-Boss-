import type { D1DatabaseLike } from '../db/types.ts';

/**
 * Mark unfinished shifts from earlier Dhaka calendar dates as Missing OUT.
 * This does NOT set a fictional checkout time or delete any historical records.
 * Idempotent, safe for hourly cron and on-demand attendance reads.
 */
export async function closePreviousOpenShifts(db: D1DatabaseLike, todayDhaka: string, userId?: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayDhaka)) throw new Error('Invalid Dhaka date');
  const sql = `UPDATE attendance_records SET status='missing_out', updated_at=?
    WHERE attendance_date < ? AND in_time IS NOT NULL AND out_time IS NULL
      AND status <> 'missing_out' ${userId ? 'AND user_id=?' : ''}`;
  await db.prepare(sql).bind(Date.now(), todayDhaka, ...(userId ? [userId] : [])).run();
}
