import React, {useCallback,useEffect,useRef,useState} from 'react';
import {Bell, BellRing, Volume2, VolumeX, RefreshCw} from 'lucide-react';
import {apiRequest} from '../../api/client';

type Owner='manager'|'member';
type Notice={id:string;category:'task'|'deadline'|'review'|'daily';title:string;body:string;created_at:number;read_at:number|null;target_url:string};
type Pref={daily_reminder:number;push_enabled:number;sound_enabled:number;task_enabled:number;deadline_enabled:number;review_enabled:number};
type Snapshot={preferences:Pref;notifications:Notice[];unread:number;push_available:boolean;vapid_public_key:string|null};
const prefsLabels:[keyof Pref,string][]=[['daily_reminder','Daily 7 PM reminder (only for pending tasks or reviews)'],['task_enabled','Task assignments and submissions'],['deadline_enabled','Deadline approaching'],['review_enabled','Approvals and revision requests'],['sound_enabled','In-app tong sound']];
function decodeKey(key:string):Uint8Array {return Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-key.length%4)%4)),c=>c.charCodeAt(0));}
async function tong(){
  try {const Ctx=window.AudioContext;if(!Ctx)return;const context=new Ctx();await context.resume();const osc=context.createOscillator();const gain=context.createGain();
    osc.type='sine';osc.frequency.setValueAtTime(880,context.currentTime);osc.frequency.exponentialRampToValueAtTime(660,context.currentTime+0.18);
    gain.gain.setValueAtTime(0.001,context.currentTime);gain.gain.exponentialRampToValueAtTime(0.09,context.currentTime+0.02);
    gain.gain.exponentialRampToValueAtTime(0.001,context.currentTime+0.25);osc.connect(gain);gain.connect(context.destination);
    osc.start();osc.stop(context.currentTime+0.27);osc.onended=()=>{void context.close();};
  }catch{ /* Browser sound policy or silent mode takes precedence. */ }
}

export const NotificationCenter:React.FC<{owner:Owner;dark?:boolean}>=({owner,dark=false})=>{
  const base=`/api/ambassadors/notifications/${owner}/`;
  const [data,setData]=useState<Snapshot|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const previous=useRef<string|null>(null),settings=useRef<Pref|null>(null);
  const refresh=useCallback(async()=>{
    try{const next=await apiRequest<Snapshot>(base+'state');
      const latest=next.notifications[0]?.id||'';
      if(previous.current!==null&&latest&&latest!==previous.current&&Number(settings.current?.sound_enabled))void tong();
      previous.current=latest;settings.current=next.preferences;setData(next);
    }catch{ /* No permission or disabled hub: quietly hide notification features. */ }
  },[base]);
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>void refresh(),60000);return()=>window.clearInterval(timer);},[refresh]);
  const update=async(change:Partial<Pref>)=>{
    if(!data)return;
    setBusy(true);setMessage('');
    try{const payload={...data.preferences,...change};await apiRequest(base+'preferences',{method:'POST',body:JSON.stringify(Object.fromEntries(Object.entries(payload).map(([key,value])=>[key,Boolean(value)])))});
      setData(prev=>prev?{...prev,preferences:payload}:prev);settings.current=payload;
      if(change.sound_enabled===1)await tong();
    }catch(e){setMessage(e instanceof Error?e.message:'Could not update notification preferences');}
    finally{setBusy(false);}
  };
  const enablePush=async()=>{
    if(!data||!data.vapid_public_key)return;
    setBusy(true);setMessage('');
    try{
      if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw new Error('This browser does not support web push.');
      const permission=await Notification.requestPermission();
      if(permission!=='granted')throw new Error('Notifications blocked by device or browser permissions.');
      const registration=await navigator.serviceWorker.ready;
      let subscription=await registration.pushManager.getSubscription();
      if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(data.vapid_public_key) as unknown as BufferSource});
      await apiRequest(base+'preferences',{method:'POST',body:JSON.stringify({push_enabled:true})});
      const json=subscription.toJSON();
      await apiRequest(base+'subscribe',{method:'POST',body:JSON.stringify({subscription:{endpoint:json.endpoint,p256dh:json.keys?.p256dh,auth:json.keys?.auth}})});
      setMessage('Phone notifications are enabled on this device.');await refresh();
    }catch(e){
      await apiRequest(base+'preferences',{method:'POST',body:JSON.stringify({push_enabled:false})}).catch(()=>{});
      setMessage(e instanceof Error?e.message:'Could not enable push notifications');await refresh();
    }finally{setBusy(false);}
  };
  const disablePush=async()=>{
    setBusy(true);setMessage('');
    try{
      const reg=('serviceWorker' in navigator)?await navigator.serviceWorker.ready:null;
      const sub=await reg?.pushManager.getSubscription();
      if(sub){await apiRequest(base+'unsubscribe',{method:'POST',body:JSON.stringify({endpoint:sub.endpoint})});await sub.unsubscribe();}
      await apiRequest(base+'preferences',{method:'POST',body:JSON.stringify({push_enabled:false})});await refresh();
    }catch(e){setMessage(e instanceof Error?e.message:'Could not disable push');}
    finally{setBusy(false);}
  };
  const read=async(id:string)=>{await apiRequest(base+'read',{method:'POST',body:JSON.stringify({id})});await refresh();};
  if(!data)return null;
  const surface=dark?'bg-slate-900 border-slate-700 text-slate-100':'bg-white border-slate-200 text-slate-900';
  return <section className={`border rounded-2xl p-4 space-y-3 ${surface}`} aria-label="AGN notifications">
    <div className="flex flex-wrap gap-3 items-center justify-between"><button type="button" onClick={()=>setOpen(o=>!o)} className="flex items-center gap-2 font-semibold text-sm">
      {data.unread?<BellRing size={19} className="text-teal-500"/>:<Bell size={19}/>} Notifications {data.unread>0&&<span className="rounded-full bg-teal-500 text-slate-950 text-xs px-2 py-0.5">{data.unread}</span>}
    </button><div className="flex items-center gap-2"><button type="button" onClick={()=>void refresh()} aria-label="Refresh notifications" className="p-1"><RefreshCw size={16}/></button><button type="button" onClick={()=>setOpen(o=>!o)} className="text-xs underline">{open?'Close':'View & preferences'}</button></div></div>
    {open&&<div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">{prefsLabels.map(([key,label])=><label key={key} className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" className="accent-teal-500 mt-1" disabled={busy} checked={Boolean(data.preferences[key])} onChange={e=>void update({[key]:e.target.checked?1:0})}/>{label}</label>)}</div>
      <div className="flex flex-wrap gap-2 items-center">{data.push_available ?
        <button type="button" disabled={busy} onClick={()=>void (Number(data.preferences.push_enabled)?disablePush():enablePush())} className="rounded-lg px-3 py-2 text-xs bg-teal-600 text-white">{Number(data.preferences.push_enabled)?'Disable phone push':'Enable phone push on this device'}</button>:
        <p className="text-xs opacity-70">Phone push will be available after the administrator configures VAPID keys. In-app notifications still work.</p>}
        <button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await apiRequest(base+'test',{method:'POST',body:'{}'});setMessage('Test queued. If phone push is enabled, it should arrive shortly.');await refresh();}catch(e){setMessage(e instanceof Error?e.message:'Test failed');}finally{setBusy(false);}}} className="text-xs underline">Send test notification</button>
        <button type="button" onClick={()=>void tong()} className="text-xs flex gap-1 items-center underline">{Number(data.preferences.sound_enabled)?<Volume2 size={14}/>:<VolumeX size={14}/>} Test tong sound</button>
      </div>
      <p className="text-xs opacity-70">Android and supported browsers can display push outside Boss. On iPhone, add Boss to the Home Screen first. Device settings control external notification sounds. Quiet hours: no automatic reminders overnight.</p>
      {message&&<p role="status" className="text-xs text-teal-500">{message}</p>}
      <div className="flex gap-2 items-center justify-between"><strong className="text-sm">Recent notifications</strong><button type="button" onClick={async()=>{await apiRequest(base+'read-all',{method:'POST',body:'{}'});await refresh();}} className="underline text-xs">Mark all read</button></div>
      {data.notifications.length===0&&<p className="text-xs opacity-60">No notifications yet.</p>}
      <div className="max-h-80 overflow-y-auto space-y-2">{data.notifications.map(n=><div key={n.id} className={`border rounded-lg px-3 py-2 text-xs ${dark?'border-slate-700':'border-slate-200'} ${n.read_at?'opacity-70':''}`}>
        <div className="flex justify-between gap-2"><strong>{n.title}</strong><span className="opacity-60 whitespace-nowrap">{new Date(n.created_at).toLocaleDateString('en-GB',{timeZone:'Asia/Dhaka'})}</span></div>
        <p className="mt-1">{n.body}</p>{!n.read_at&&<button type="button" className="text-teal-500 underline mt-1" onClick={()=>void read(n.id)}>Mark read</button>}
      </div>)}</div>
    </div>}
  </section>;
};
