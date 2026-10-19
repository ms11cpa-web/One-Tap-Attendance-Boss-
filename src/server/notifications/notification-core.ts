import type { D1DatabaseLike } from '../db/types.ts';
import { hashRecoveryCode } from '../auth/recovery.ts';
import { getUserFromSession } from '../routes/api-handler.ts';
import { validVapid, validateSubscription, sendWebPush, type PushSecrets } from './web-push.ts';

export type OwnerType='ambassador'|'manager';
type RecordValue=Record<string,unknown>;
type Reply={status:number;data?:unknown};
const fail=(status:number,error:string):Reply=>({status,data:{error}});
const ok=(data:unknown):Reply=>({status:200,data});
const rows=async <T>(db:D1DatabaseLike,sql:string,...params:unknown[]):Promise<T[]> => (await db.prepare(sql).bind(...params).all<T>()).results||[];
const now=()=>Date.now();
const basePrefs={daily_reminder:0,push_enabled:0,sound_enabled:0,task_enabled:1,deadline_enabled:1,review_enabled:1};
const categoryKey={task:'task_enabled',deadline:'deadline_enabled',review:'review_enabled',daily:'daily_reminder'} as const;
type Category=keyof typeof categoryKey;
const safeTitle=(s:string)=>s.slice(0,100);
const safeBody=(s:string)=>s.slice(0,220);
const targetFor=(kind:OwnerType)=>kind==='ambassador'?'/ambassadors':'/?hub=campus';
export const dhakaDate=(epoch:number)=>new Date(epoch+6*3600_000).toISOString().slice(0,10);
export const tomorrowDhaka=(epoch:number)=>dhakaDate(epoch+86_400_000);

async function pref(db:D1DatabaseLike,kind:OwnerType,id:string):Promise<typeof basePrefs> {
  const found=await db.prepare('SELECT * FROM amb_notification_preferences WHERE owner_type=? AND owner_id=?').bind(kind,id).first<RecordValue>();
  return {...basePrefs,...(found||{})};
}
export async function queueNotification(db:D1DatabaseLike,kind:OwnerType,id:string,category:Category,subjectId:string,title:string,body:string):Promise<void> {
  const setting=await db.prepare("SELECT enabled FROM amb_module_settings WHERE id='default'").first<{enabled:number}>();
  if(!Number(setting?.enabled))return;
  const preference=await pref(db,kind,id);
  if(!Number(preference[categoryKey[category]]))return;
  const key=`${category}:${subjectId}:${kind}:${id}`;
  const inserted=await db.prepare(`INSERT OR IGNORE INTO amb_notifications
    (id,owner_type,owner_id,category,title,body,target_url,dedupe_key,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),kind,id,category,safeTitle(title),safeBody(body),targetFor(kind),key,now()).run();
  if(Number(inserted.meta?.changes)===0)return;
  // Persist per-device delivery; retry status is not shared across devices.
  await db.prepare(`INSERT OR IGNORE INTO amb_notification_deliveries (notification_id,subscription_id)
    SELECT n.id,s.id FROM amb_notifications n JOIN amb_push_subscriptions s
    ON s.owner_type=n.owner_type AND s.owner_id=n.owner_id
    WHERE n.dedupe_key=? AND ?=1`).bind(key,Number(preference.push_enabled)).run();
}
export async function queueManagers(db:D1DatabaseLike,category:Category,subject:string,title:string,body:string):Promise<void>{
  const managers=await rows<{id:string}>(db,`SELECT m.user_id AS id FROM amb_program_managers m JOIN users u ON u.id=m.user_id WHERE u.status='active' UNION SELECT id FROM users WHERE role='super_admin' AND status='active'`);
  for(const mgr of managers)await queueNotification(db,'manager',mgr.id,category,subject,title,body);
}
export async function queueAmbassadors(db:D1DatabaseLike,ids:string[],category:Category,subject:string,title:string,body:string):Promise<void>{
  for(const id of new Set(ids))await queueNotification(db,'ambassador',id,category,subject,title,body);
}

export async function notificationApi(method:string,path:string,body:RecordValue,ctx:{token?:string;ambassadorToken?:string},db:D1DatabaseLike,secrets:PushSecrets):Promise<Reply> {
  const enabled=await db.prepare("SELECT enabled FROM amb_module_settings WHERE id='default'").first<{enabled:number}>();
  if(!enabled||!Number(enabled.enabled))return fail(403,'Campus Hub is disabled.');
  let owner: {kind:OwnerType;id:string}|null=null;
  if(ctx.ambassadorToken){
    const h=await hashRecoveryCode(ctx.ambassadorToken);
    const person=await db.prepare(`SELECT p.id FROM amb_sessions s JOIN amb_people p ON p.id=s.ambassador_id
      WHERE s.id=? AND s.expires_at>? AND p.status='active' AND p.must_change_password=0`).bind(h,now()).first<{id:string}>();
    if(person)owner={kind:'ambassador',id:person.id};
  }
  // Manager API path is distinct; bearer office tokens cannot grant ambassador access.
  if(path.startsWith('/api/ambassadors/notifications/manager/')){
    owner=null;
    const staff=await getUserFromSession(db,ctx.token);
    if(staff){
      const delegated=await db.prepare('SELECT user_id FROM amb_program_managers WHERE user_id=?').bind(staff.id).first();
      if(staff.role==='super_admin'||delegated)owner={kind:'manager',id:String(staff.id)};
    }
  }else if(path.startsWith('/api/ambassadors/notifications/member/')){
    if(owner?.kind!=='ambassador')owner=null;
  }else return fail(404,'Unknown notifications endpoint.');
  if(!owner)return fail(401,'Sign in with an authorised Campus Hub account.');
  const prefix=`/api/ambassadors/notifications/${owner.kind==='manager'?'manager':'member'}/`;
  const action=path.slice(prefix.length);
  if(action==='state'&&method==='GET'){
    const preferences=await pref(db,owner.kind,owner.id);
    const notifications=await rows<RecordValue>(db,`SELECT id,category,title,body,target_url,created_at,read_at
      FROM amb_notifications WHERE owner_type=? AND owner_id=? ORDER BY created_at DESC LIMIT 60`,owner.kind,owner.id);
    const unread=await db.prepare('SELECT COUNT(*) AS n FROM amb_notifications WHERE owner_type=? AND owner_id=? AND read_at IS NULL').bind(owner.kind,owner.id).first<{n:number}>();
    return ok({preferences,notifications,unread:Number(unread?.n||0),push_available:validVapid(secrets),vapid_public_key:validVapid(secrets)?secrets.VAPID_PUBLIC_KEY:null});
  }
  if(action==='preferences'&&method==='POST'){
    const current=await pref(db,owner.kind,owner.id);
    const next:Record<string,number>={};
    for(const key of Object.keys(basePrefs) as (keyof typeof basePrefs)[])next[key]=typeof body[key]==='boolean'?(body[key]?1:0):Number(current[key]);
    await db.prepare(`INSERT INTO amb_notification_preferences (owner_type,owner_id,daily_reminder,push_enabled,sound_enabled,task_enabled,deadline_enabled,review_enabled,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_type,owner_id) DO UPDATE SET
      daily_reminder=excluded.daily_reminder,push_enabled=excluded.push_enabled,sound_enabled=excluded.sound_enabled,
      task_enabled=excluded.task_enabled,deadline_enabled=excluded.deadline_enabled,review_enabled=excluded.review_enabled,updated_at=excluded.updated_at`)
      .bind(owner.kind,owner.id,next.daily_reminder,next.push_enabled,next.sound_enabled,next.task_enabled,next.deadline_enabled,next.review_enabled,now()).run();
    if(!next.push_enabled){
      await db.prepare('DELETE FROM amb_push_subscriptions WHERE owner_type=? AND owner_id=?').bind(owner.kind,owner.id).run();
    }
    return ok({preferences:next});
  }
  if(action==='subscribe'&&method==='POST'){
    if(!validVapid(secrets))return fail(503,'Push notifications are not configured by the administrator.');
    const prefs=await pref(db,owner.kind,owner.id);
    if(!Number(prefs.push_enabled))return fail(403,'Enable push notifications in preferences first.');
    if(!validateSubscription(body.subscription))return fail(400,'Invalid or unsupported push subscription.');
    const sub=body.subscription as {endpoint:string;p256dh:string;auth:string};
    // A subscription endpoint is unique to a browser profile. A new signed-in owner can reclaim it.
    await db.prepare(`INSERT INTO amb_push_subscriptions(id,owner_type,owner_id,endpoint,p256dh,auth,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET owner_type=excluded.owner_type,owner_id=excluded.owner_id,
      p256dh=excluded.p256dh,auth=excluded.auth,updated_at=excluded.updated_at`)
      .bind(crypto.randomUUID(),owner.kind,owner.id,sub.endpoint,sub.p256dh,sub.auth,now(),now()).run();
    return ok({success:true});
  }
  if(action==='unsubscribe'&&method==='POST'){
    const endpoint=String(body.endpoint||'').slice(0,2100);
    await db.prepare('DELETE FROM amb_push_subscriptions WHERE owner_type=? AND owner_id=? AND endpoint=?').bind(owner.kind,owner.id,endpoint).run();
    return ok({success:true});
  }
  if(action==='test'&&method==='POST'){
    const recent=await db.prepare(`SELECT id FROM amb_notifications WHERE owner_type=? AND owner_id=? AND title='AGN test notification' AND created_at>? LIMIT 1`)
      .bind(owner.kind,owner.id,now()-60_000).first();
    if(recent)return fail(429,'Please wait one minute before sending another test.');
    await queueNotification(db,owner.kind,owner.id,'task',`test:${now()}`,'AGN test notification','If push is enabled on this device, this should appear in your phone notification bar.');
    return ok({success:true});
  }
  if(action==='read'&&method==='POST'){
    const id=String(body.id||'');
    if(id.length>100)return fail(400,'Invalid notification');
    await db.prepare('UPDATE amb_notifications SET read_at=? WHERE id=? AND owner_type=? AND owner_id=? AND read_at IS NULL')
      .bind(now(),id,owner.kind,owner.id).run();
    return ok({success:true});
  }
  if(action==='read-all'&&method==='POST'){
    await db.prepare('UPDATE amb_notifications SET read_at=? WHERE owner_type=? AND owner_id=? AND read_at IS NULL').bind(now(),owner.kind,owner.id).run();
    return ok({success:true});
  }
  return fail(404,'Unknown notifications action.');
}

/** Runs at 07:00 and 19:00 Asia/Dhaka (01:00 and 13:00 UTC). Only opt-in daily reminders.
 * Deadline alerts run at 07:00 the day before due date. No client-side background timers.
 */
export async function scheduledNotificationJobs(db:D1DatabaseLike,epoch:number):Promise<{created:number}> {
  const active=await db.prepare("SELECT enabled FROM amb_module_settings WHERE id='default'").first<{enabled:number}>();
  if(!Number(active?.enabled))return {created:0};
  const day=dhakaDate(epoch),hour=new Date(epoch).getUTCHours(); let created=0;
  if(hour===1){
    // 90-day retention limits personal notification history and endpoint metadata.
    await db.prepare('DELETE FROM amb_notification_deliveries WHERE notification_id IN (SELECT id FROM amb_notifications WHERE created_at<?)').bind(epoch-90*86_400_000).run();
    await db.prepare('DELETE FROM amb_notifications WHERE created_at<?').bind(epoch-90*86_400_000).run();
  }
  if(hour===1){
    const due=await rows<{ambassador_id:string;assignment_id:string;title:string}>(db,`SELECT a.ambassador_id,a.id AS assignment_id,c.title FROM amb_assignments a
      JOIN amb_people p ON p.id=a.ambassador_id JOIN amb_campaigns c ON c.id=a.campaign_id
      LEFT JOIN amb_submissions s ON s.assignment_id=a.id
      WHERE c.due_date=? AND c.status='active' AND p.status='active'
      AND (s.id IS NULL OR s.status='revision_requested') LIMIT 1500`,tomorrowDhaka(epoch));
    for(const t of due){await queueNotification(db,'ambassador',t.ambassador_id,'deadline',`due:${t.assignment_id}:${day}`,'AGN deadline tomorrow',`Please complete: ${t.title}`);created++;}
  }
  if(hour===13){
    const due=await rows<{id:string;n:number}>(db,`SELECT p.id,COUNT(*) AS n FROM amb_people p
      JOIN amb_assignments a ON a.ambassador_id=p.id JOIN amb_campaigns c ON c.id=a.campaign_id
      LEFT JOIN amb_submissions s ON s.assignment_id=a.id
      WHERE p.status='active' AND c.status='active' AND (s.id IS NULL OR s.status='revision_requested')
      GROUP BY p.id LIMIT 1500`);
    for(const p of due){await queueNotification(db,'ambassador',p.id,'daily',`daily:${day}`,'AGN daily reminder',`You have ${p.n} pending campaign task${Number(p.n)===1?'':'s'}.`);created++;}
    const count=await db.prepare("SELECT COUNT(*) AS n FROM amb_submissions WHERE status='submitted'").first<{n:number}>();
    if(Number(count?.n)){
      const managers=await rows<{id:string}>(db,"SELECT m.user_id AS id FROM amb_program_managers m JOIN users u ON u.id=m.user_id WHERE u.status='active' UNION SELECT id FROM users WHERE role='super_admin' AND status='active'");
      for(const mgr of managers){await queueNotification(db,'manager',mgr.id,'daily',`manager-daily:${day}`,'AGN approvals waiting',`${count!.n} submissions awaiting review.`);created++;}
    }
  }
  return {created};
}

/** At-most-one concurrent claimed send per subscription, with limited retry. */
export async function deliverPendingPush(db:D1DatabaseLike,secrets:PushSecrets,limit=60,fetcher:typeof fetch=fetch):Promise<{sent:number;failed:number}> {
  if(!validVapid(secrets))return {sent:0,failed:0};
  const enabled=await db.prepare("SELECT enabled FROM amb_module_settings WHERE id='default'").first<{enabled:number}>();
  if(!Number(enabled?.enabled))return {sent:0,failed:0};
  const epoch=now();let sent=0,failed=0;
  // Recover claims abandoned by a terminated Worker (hourly cron fallback).
  await db.prepare("UPDATE amb_notification_deliveries SET status='retry' WHERE status='sending' AND next_attempt_at<?").bind(epoch).run();
  const work=await rows<{notification_id:string;subscription_id:string;endpoint:string;p256dh:string;auth:string;title:string;body:string;target_url:string}>(db,`
    SELECT d.notification_id,d.subscription_id,s.endpoint,s.p256dh,s.auth,n.title,n.body,n.target_url FROM amb_notification_deliveries d
    JOIN amb_notifications n ON n.id=d.notification_id JOIN amb_push_subscriptions s ON s.id=d.subscription_id
    JOIN amb_notification_preferences p ON p.owner_type=n.owner_type AND p.owner_id=n.owner_id
    WHERE d.status IN ('pending','retry') AND d.next_attempt_at<=? AND p.push_enabled=1 AND n.created_at>?
    AND ((n.owner_type='ambassador' AND EXISTS (SELECT 1 FROM amb_people ap WHERE ap.id=n.owner_id AND ap.status='active'))
    OR (n.owner_type='manager' AND EXISTS (SELECT 1 FROM users u WHERE u.id=n.owner_id AND u.status='active'
        AND (u.role='super_admin' OR EXISTS (SELECT 1 FROM amb_program_managers m WHERE m.user_id=u.id)))))
    ORDER BY n.created_at LIMIT ?`,epoch,epoch-48*3600_000,Math.min(80,Math.max(1,limit)));
  const sendOne=async(item:typeof work[number])=>{
    const claimed=await db.prepare(`UPDATE amb_notification_deliveries SET status='sending',attempts=attempts+1,next_attempt_at=?
      WHERE notification_id=? AND subscription_id=? AND status IN ('pending','retry')`)
      .bind(epoch+10*60_000,item.notification_id,item.subscription_id).run();
    if(Number(claimed.meta?.changes)!==1)return;
    let status=0;
    try {status=await sendWebPush({endpoint:item.endpoint,p256dh:item.p256dh,auth:item.auth},
      {title:item.title,body:item.body,url:item.target_url,tag:item.notification_id},secrets,fetcher);}catch(e){console.warn('[AGN push] Delivery retryable error',e instanceof Error?e.message:'unknown');}
    if(status>=200&&status<300){
      sent++;await db.prepare("UPDATE amb_notification_deliveries SET status='sent' WHERE notification_id=? AND subscription_id=?")
        .bind(item.notification_id,item.subscription_id).run();
    }else if(status===404||status===410){
      failed++;await db.prepare('DELETE FROM amb_push_subscriptions WHERE id=?').bind(item.subscription_id).run();
    }else{
      failed++;await db.prepare(`UPDATE amb_notification_deliveries SET status=CASE WHEN attempts>=4 THEN 'failed' ELSE 'retry' END,next_attempt_at=?
        WHERE notification_id=? AND subscription_id=?`).bind(epoch+15*60_000,item.notification_id,item.subscription_id).run();
    }
  };
  // Bound parallel network calls to limit slow push provider round-trips.
  for(let index=0;index<work.length;index+=4)await Promise.all(work.slice(index,index+4).map(sendOne));
  return {sent,failed};
}
