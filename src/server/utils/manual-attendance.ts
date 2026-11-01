import type { D1DatabaseLike } from '../db/types.ts';
import { calculateLateness, calculateExtraMinutes } from './time.ts';
import type { UserSession } from '../routes/api-handler.ts';

export interface ManualAttendanceInput {
  inTime: string;
  outTime: string | null;
  reason: string;
}

const VALID_CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;
const dhakaTimestamp = (date: string, time: string) => Date.parse(`${date}T${time}:00+06:00`);

export function validateAttendanceAdjustment(date: string, today: string, input: ManualAttendanceInput, requireReason = true): string | null {
  if (!VALID_DATE.test(date) || Number.isNaN(Date.parse(date)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date || date > today)
    return 'Select a valid attendance date, not in the future.';
  if (!VALID_CLOCK.test(input.inTime)) return 'A valid IN time (HH:mm) is required.';
  if (input.outTime !== null && (!VALID_CLOCK.test(input.outTime) || input.outTime === input.inTime))
    return 'OUT time must be valid and different from IN.';
  if (requireReason && (input.reason.trim().length < 10 || input.reason.length > 2000))
    return 'Provide a reason between 10 and 2000 characters.';
  const inStamp = dhakaTimestamp(date,input.inTime);
  const outStamp = input.outTime ? dhakaTimestamp(date,input.outTime)+(input.outTime < input.inTime ? 86_400_000:0) : null;
  if (!Number.isFinite(inStamp) || (outStamp !== null && (outStamp-inStamp<=0 || outStamp-inStamp > 24*3600_000)))
    return 'The attendance times must form a valid shift no longer than 24 hours.';
  return null;
}

export async function applyManualAttendanceUpdate(db: D1DatabaseLike, args: {
  targetUserId:string; date:string; input:ManualAttendanceInput; actor:UserSession; ip:string;
  scheduledStart:string; scheduledEnd:string; graceMinutes:number; scheduledMinutes:number;
}): Promise<string> {
  const {targetUserId,date,input,actor,ip,scheduledStart,scheduledEnd,graceMinutes,scheduledMinutes}=args;
  const existing = await db.prepare('SELECT * FROM attendance_records WHERE user_id=? AND attendance_date=?')
    .bind(targetUserId,date).first<Record<string,unknown>>();
  const now = Date.now();
  const inTimestamp=dhakaTimestamp(date,input.inTime);
  const outTimestamp=input.outTime ? dhakaTimestamp(date,input.outTime)+(input.outTime<input.inTime?86_400_000:0):null;
  const minutes=outTimestamp===null ? 0 : Math.floor((outTimestamp-inTimestamp)/60_000);
  const late=calculateLateness(input.inTime,scheduledStart,graceMinutes);
  const extra=outTimestamp===null ? 0 : (input.outTime! < input.inTime
    ? Math.max(0,minutes-scheduledMinutes) : calculateExtraMinutes(input.outTime!,scheduledEnd));
  const shortfall=outTimestamp===null ? 0 : Math.max(0,scheduledMinutes-minutes);
  const status=outTimestamp===null?'missing_out':minutes<240?'half_day':late>0?'late':'present';
  const recordId=existing ? String(existing.id) : 'att_'+targetUserId+'_'+date.replace(/-/g,'');
  const previous = existing ? {
    in_time:existing.in_time, out_time:existing.out_time,
    in_timestamp:existing.in_timestamp, out_timestamp:existing.out_timestamp,
    status:existing.status
  } : null;
  const note={date,targetUserId,reason:input.reason,previous,updated:{in_time:input.inTime,out_time:input.outTime,status}};
  const statements = existing ? [
    db.prepare(`UPDATE attendance_records SET in_time=?,out_time=?,in_timestamp=?,out_timestamp=?,
      in_verified=0,out_verified=0,in_latitude=NULL,in_longitude=NULL,out_latitude=NULL,out_longitude=NULL,
      in_accuracy_meters=NULL,out_accuracy_meters=NULL,in_distance_meters=NULL,out_distance_meters=NULL,
      total_duration_minutes=?,late_minutes=?,extra_minutes=?,shortfall_minutes=?,status=?,updated_at=? WHERE id=?`)
      .bind(input.inTime,input.outTime,inTimestamp,outTimestamp,minutes,late,extra,shortfall,status,now,recordId)
  ] : [
    db.prepare(`INSERT INTO attendance_records
      (id,user_id,attendance_date,work_mode,in_time,out_time,in_timestamp,out_timestamp,
      in_verified,out_verified,total_duration_minutes,late_minutes,extra_minutes,shortfall_minutes,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,0,0,?,?,?,?,?,?,?)`)
      .bind(recordId,targetUserId,date,'office',input.inTime,input.outTime,inTimestamp,outTimestamp,minutes,late,extra,shortfall,status,now,now)
  ];
  statements.push(db.prepare(`INSERT INTO audit_logs
    (id,user_id,user_name,action,resource_type,resource_id,details,ip_address,timestamp)
    VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind('aud_'+crypto.randomUUID(),actor.id,actor.name,'SUPER_ADMIN_ATTENDANCE_ADJUST','attendance',recordId,JSON.stringify(note),ip,now));
  await db.batch(statements);
  return recordId;
}
