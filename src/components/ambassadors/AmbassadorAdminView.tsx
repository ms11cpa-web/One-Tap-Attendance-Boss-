import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../api/client';
import { PasswordInput } from '../auth/PasswordInput';
import { NotificationCenter } from './NotificationCenter';
import { Award, CheckCircle2, GraduationCap, Loader2, RefreshCw, ShieldCheck, Video } from 'lucide-react';

type Campus = { id: string; name: string; city: string; status: string };
type Person = { id: string; ambassador_code: string; name: string; email: string; department:string; campus_name: string; campus_id: string; status: string; is_lead: number };
type Campaign = { id: string; title: string; instructions:string; content_type:string; due_date: string; points: number; assignments: number; status: string };
type Assignment = {id:string; campaign_id:string; ambassador_id:string; ambassador_code:string; ambassador_name:string; submission_status:string|null};
type Submission = { id: string; ambassador_name: string; ambassador_email: string; campaign_title: string; proof_url: string; notes: string; status: string; review_note: string; submitted_at: number; points: number; quality_score:number|null };
type Leader = { id: string; name: string; ambassador_code: string; campus_name: string; points: number; approved: number; assigned: number; quality_average: number|null; on_time: number };
type Recognition = {id:string; ambassador_id:string; ambassador_code:string; ambassador_name:string; title:string; description:string; award_month:string; status:string; awarded_at:number};
type Manager = { id: string; employee_id: string; name: string };
type MonthlyRow = { id:string; name:string; ambassador_code:string; campus_name:string; status:string; eligible:number; approved:number; on_time:number; approved_points:number; quality_average:number|null; active_weeks:number; assigned_weeks:number; completion_pct:number; quality_pct:number; timeliness_pct:number; consistency_pct:number; score:number|null; rating:string };
type MonthlyReport = {month:string;as_of:string;complete:boolean;weights:{completion:number;quality:number;timeliness:number;consistency:number};winner: {id:string;name:string;ambassador_code:string;campus_name:string;score:number}|null;leaderboard:MonthlyRow[]};
type AdminData = { enabled: boolean; is_super_admin: boolean; campuses: Campus[]; people: Person[]; campaigns: Campaign[]; assignments:Assignment[]; submissions: Submission[]; leaderboard: Leader[]; awards:Recognition[]; managers: Manager[] };
type PostPath = 'enable'|'campuses'|'campuses/edit'|'campuses/delete'|'people'|'people/edit'|'people/delete'|'people/update'|'people/reset-password'|'campaigns'|'campaigns/edit'|'campaigns/archive'|'campaigns/delete'|'assignments/add'|'assignments/reassign'|'assignments/delete'|'reviews'|'reviews/correct'|'awards'|'awards/update'|'awards/revoke'|'managers';
const today = () => new Intl.DateTimeFormat('en-CA', { year:'numeric', month:'2-digit', day:'2-digit', timeZone:'Asia/Dhaka' }).format(new Date());
const inputStyle = 'w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-teal-500';
const labelStyle = 'text-xs font-semibold text-slate-600 block mb-1';
const actionStyle = 'rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold px-4 py-2.5 text-sm disabled:opacity-50';
const panel = 'bg-white border border-slate-200 shadow-sm rounded-2xl p-5 space-y-4';
const roleOptions = ['share','post','video','outreach','event','other'];

export const AmbassadorAdminView: React.FC = () => {
  const [data,setData] = useState<AdminData | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [tab,setTab] = useState<'overview'|'campuses'|'people'|'campaigns'|'reviews'|'performance'|'rewards'|'access'>('overview');
  const [campusName,setCampusName] = useState(''); const [campusCity,setCampusCity] = useState('');
  const [person,setPerson] = useState({ ambassador_code:'',name:'',email:'',department:'',campus_id:'',initial_password:'',is_lead:false });
  const [campaign,setCampaign] = useState({ title:'',instructions:'',content_type:'share',target_scope:'all',target_id:'',points:5,due_date:today() });
  const [reviewNotes,setReviewNotes] = useState<Record<string,string>>({});
  const [scores,setScores] = useState<Record<string,number>>({});
  const [performanceMonth,setPerformanceMonth] = useState(today().slice(0,7));
  const [performance,setPerformance] = useState<MonthlyReport|null>(null);
  const [performanceBusy,setPerformanceBusy] = useState(false);
  const [performanceError,setPerformanceError] = useState('');
  const [managerCode,setManagerCode] = useState('');
  const [editingCampus,setEditingCampus] = useState<Campus|null>(null);
  const [editingPerson,setEditingPerson] = useState<Person|null>(null);
  const [editingCampaign,setEditingCampaign] = useState<Campaign|null>(null);
  const [reassign,setReassign] = useState<Assignment|null>(null);
  const [reassignTo,setReassignTo] = useState('');
  const [addTaskTo,setAddTaskTo] = useState({campaign_id:'',ambassador_id:''});
  const [reviewCorrection,setReviewCorrection] = useState({id:'',action:'rerate',quality_score:3,reason:''});
  const [fullText,setFullText] = useState<{title:string;text:string}|null>(null);
  const [award,setAward] = useState({ambassador_id:'',title:'',description:'',award_month:today().slice(0,7)});
  const [editingAward,setEditingAward] = useState<Recognition|null>(null);
  const [resetPersonId,setResetPersonId] = useState(''); const [resetPassword,setResetPassword] = useState('');

  const refresh = useCallback(async () => {
    try { setData(await apiRequest<AdminData>('/api/ambassadors/admin/state')); setError(''); }
    catch(e) { setError(e instanceof Error ? e.message:'Could not load Campus Hub'); }
  },[]);
  useEffect(()=>{ void refresh(); },[refresh]);
  const refreshPerformance=useCallback(async()=>{
    setPerformanceBusy(true);setPerformanceError('');
    try {setPerformance(await apiRequest<MonthlyReport>(`/api/ambassadors/admin/performance?month=${encodeURIComponent(performanceMonth)}`));}
    catch(e) {setPerformance(null);setPerformanceError(e instanceof Error?e.message:'Cannot load monthly ratings');}
    finally {setPerformanceBusy(false);}
  },[performanceMonth]);
  useEffect(()=>{if(tab==='performance') void refreshPerformance();},[tab,refreshPerformance]);
  const post = async (endpoint:PostPath, payload: Record<string,unknown>, success:string) => {
    setBusy(true);setError('');setNotice('');
    try {
      await apiRequest(`/api/ambassadors/admin/${endpoint}`,{method:'POST',body:JSON.stringify(payload)});
      setNotice(success); await refresh();return true;
    } catch(e) {setError(e instanceof Error ? e.message:'Request failed');return false;}
    finally {setBusy(false);}
  };
  const remove = async (endpoint:PostPath,payload:Record<string,unknown>,success:string) => {
    // Never trust a generic confirm click for destructive actions.
    if(!window.confirm('This change may affect assignments or access. Continue?'))return;
    await post(endpoint,payload,success);
  };
  const approved = data?.submissions.filter(s=>s.status==='approved').length || 0;
  const pending = data?.submissions.filter(s=>s.status==='submitted').length || 0;
  const totalAssignments = data?.campaigns.reduce((a,c)=>a+Number(c.assignments||0),0) || 0;
  const sortedSubmissions = useMemo(()=>data?.submissions.filter(s=>s.status==='submitted') || [],[data]);
  return <section className="space-y-5 max-w-7xl mx-auto pb-8">
    <div className="flex flex-wrap justify-between gap-3 items-center">
      <div><div className="flex gap-2 items-center text-teal-700"><GraduationCap size={24}/><h1 className="text-2xl font-black text-slate-900">AGN Campus Ambassador Hub</h1></div>
        <p className="text-sm text-slate-500 mt-1">Campus profiles, campaigns, approved contributions and recognition. Separate from office attendance.</p></div>
      <button className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm bg-white" onClick={()=>{void refresh();if(tab==='performance')void refreshPerformance();}}><RefreshCw size={16}/> Refresh</button>
    </div>
    {fullText && <div className="fixed inset-0 z-[100] bg-slate-950/70 flex items-center justify-center p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setFullText(null);}}>
      <div role="dialog" aria-modal="true" aria-label={fullText.title} className="bg-white text-slate-900 w-full max-w-xl rounded-2xl border border-slate-300 shadow-2xl p-5">
        <div className="flex justify-between items-start gap-2"><h2 className="font-bold text-lg">{fullText.title}</h2><button type="button" aria-label="Close full text" onClick={()=>setFullText(null)} className="rounded-lg border px-3 py-1 text-sm">Close</button></div>
        <div dir="auto" className="mt-4 max-h-[65vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{fullText.text}</div>
      </div></div>}
    {error && <div role="alert" className="bg-rose-50 text-rose-800 border border-rose-200 rounded-xl p-3 text-sm">{error}</div>}
    {notice && <div role="status" className="bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl p-3 text-sm">{notice}</div>}
    {!data ? <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="animate-spin" size={18}/> Loading Hub…</div> : <>
      <div className={`rounded-xl p-4 text-sm flex flex-wrap gap-3 items-center justify-between ${data.enabled?'bg-emerald-50 border border-emerald-200':'bg-amber-50 border border-amber-200'}`}>
        <span><strong>Ambassador portal is {data.enabled?'enabled':'disabled'}.</strong> {data.enabled?'Accounts can sign in at /ambassadors.':'Set up campuses, ambassadors and campaigns before enabling sign-in.'}</span>
        {data.is_super_admin && <button disabled={busy} className={actionStyle} onClick={()=>void post('enable',{enabled:!data.enabled},data.enabled?'Portal disabled':'Portal enabled')}>{data.enabled?'Disable ambassador login':'Enable ambassador login'}</button>}
      </div>
      {data.enabled && <NotificationCenter owner="manager" />}
      <nav aria-label="Campus Hub sections" className="flex gap-2 overflow-x-auto pb-1">
        {(['overview','campuses','people','campaigns','reviews','performance','rewards',...(data.is_super_admin?['access']:[])] as string[]).map(n=><button key={n} onClick={()=>setTab(n as typeof tab)} className={`capitalize px-3 py-2 text-sm whitespace-nowrap rounded-xl border ${tab===n?'bg-slate-900 text-white border-slate-900':'bg-white border-slate-200'}`}>{n}</button>)}
      </nav>
      {tab==='overview' && <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[
          ['Active ambassadors',data.people.filter(p=>p.status==='active').length],['Campuses',data.campuses.length],['Approved tasks',approved],['Awaiting review',pending]
        ].map(([label,value])=><div key={label} className={panel}><p className="text-sm text-slate-500">{label}</p><p className="text-3xl font-bold">{value}</p></div>)}</div>
        <div className={panel}><h2 className="font-bold text-lg flex gap-2 items-center"><Award size={18}/> Approved contributions leaderboard</h2>
          <p className="text-xs text-slate-500">Points are awarded only for approved submissions. Points are not payments.</p>
          {data.leaderboard.length===0?<p className="text-sm text-slate-500">No ambassadors yet.</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="py-2">Ambassador</th><th>Campus</th><th>Approved / Assigned</th><th>On time</th><th>Avg. quality</th><th>Points</th></tr></thead><tbody>{data.leaderboard.map(p=><tr key={p.id} className="border-b"><td className="py-2">{p.name}<span className="block text-xs text-slate-400">{p.ambassador_code}</span></td><td>{p.campus_name}</td><td>{p.approved} / {p.assigned}</td><td>{p.on_time}</td><td>{p.quality_average??"—"} / 5</td><td className="font-bold">{p.points}</td></tr>)}</tbody></table></div>}
        </div><p className="text-xs text-slate-500">Assigned tasks: {totalAssignments}. Campus leads see aggregated progress, not private submissions.</p>
      </div>}
      {tab==='campuses' && <div className="grid lg:grid-cols-2 gap-4">
        <form className={panel} onSubmit={async e=>{e.preventDefault();if(await post('campuses',{name:campusName,city:campusCity},'Campus created')){setCampusName('');setCampusCity('');}}}>
          <h2 className="font-bold">Add university or campus</h2><div><label className={labelStyle}>University / campus name</label><input required minLength={3} className={inputStyle} value={campusName} onChange={e=>setCampusName(e.target.value)} /></div>
          <div><label className={labelStyle}>City (optional)</label><input className={inputStyle} value={campusCity} onChange={e=>setCampusCity(e.target.value)} /></div><button disabled={busy} className={actionStyle}>Add campus</button>
        </form>
        <div className={panel}><h2 className="font-bold">Registered campuses</h2>{data.campuses.length?data.campuses.map(c=><div className="border-b py-2 text-sm flex justify-between gap-3" key={c.id}><div><strong>{c.name}</strong><span className="block text-slate-500">{c.city} · {c.status}</span></div><div className="flex gap-2"><button className="text-teal-700 underline" onClick={()=>setEditingCampus({...c})}>Edit</button>{data.is_super_admin&&<button className="text-rose-700 underline" onClick={()=>{const value=window.prompt('Type exact campus name to permanently delete (only empty campuses):');if(value===c.name)void remove('campuses/delete',{id:c.id,confirm_name:value},'Empty campus deleted');}}>Delete</button>}</div></div>):<p className="text-sm text-slate-500">Add your first campus to start.</p>}
        {editingCampus&&<form className="bg-teal-50 rounded-xl border border-teal-200 p-3 space-y-2" onSubmit={async e=>{e.preventDefault();if(await post('campuses/edit',editingCampus,'Campus updated'))setEditingCampus(null);}}><h3 className="font-bold text-teal-900">Edit campus</h3><label className={labelStyle}>Name<input required minLength={3} className={inputStyle} value={editingCampus.name} onChange={e=>setEditingCampus({...editingCampus,name:e.target.value})}/></label><label className={labelStyle}>City<input className={inputStyle} value={editingCampus.city} onChange={e=>setEditingCampus({...editingCampus,city:e.target.value})}/></label><label className={labelStyle}>Status<select className={inputStyle} value={editingCampus.status} onChange={e=>setEditingCampus({...editingCampus,status:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><button disabled={busy} className={actionStyle}>Save changes</button> <button type="button" className="underline text-sm" onClick={()=>setEditingCampus(null)}>Cancel</button></form>}
        </div>
      </div>}
      {tab==='people' && <div className="space-y-5">
        <form className={panel} onSubmit={async e=>{e.preventDefault();if(await post('people',person,'Ambassador account created; share the temporary password privately'))setPerson({ambassador_code:'',name:'',email:'',department:'',campus_id:'',initial_password:'',is_lead:false});}}>
          <h2 className="font-bold">Create Campus Ambassador login</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div><label className={labelStyle}>Ambassador ID</label><input className={inputStyle} required minLength={3} placeholder="AGN001" value={person.ambassador_code} onChange={e=>setPerson({...person,ambassador_code:e.target.value.toUpperCase()})}/></div>
            <div><label className={labelStyle}>Full name</label><input className={inputStyle} required value={person.name} onChange={e=>setPerson({...person,name:e.target.value})}/></div>
            <div><label className={labelStyle}>Email</label><input className={inputStyle} type="email" value={person.email} onChange={e=>setPerson({...person,email:e.target.value})}/></div>
            <div><label className={labelStyle}>Department</label><input className={inputStyle} value={person.department} onChange={e=>setPerson({...person,department:e.target.value})}/></div>
            <div><label className={labelStyle}>Campus</label><select required className={inputStyle} value={person.campus_id} onChange={e=>setPerson({...person,campus_id:e.target.value})}><option value="">Select campus</option>{data.campuses.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></div>
            <div><label className={labelStyle}>Temporary password (12+ characters)</label><PasswordInput required minLength={12} showLabel="initial password" autoComplete="new-password" className={inputStyle} value={person.initial_password} onChange={e=>setPerson({...person,initial_password:e.target.value})}/></div>
          </div><label className="text-sm flex items-center gap-2"><input type="checkbox" checked={person.is_lead} onChange={e=>setPerson({...person,is_lead:e.target.checked})}/> Campus Lead (campus-level totals only)</label>
          <p className="text-xs text-slate-500">Ambassadors must change the temporary password at their first login. Credentials are not emailed or stored in plain text.</p>
          <button className={actionStyle} disabled={busy||data.campuses.length===0}>Create ambassador</button>
        </form>
        <div className={panel}><h2 className="font-bold">Ambassador directory</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b text-slate-500"><th>Ambassador ID / Name</th><th>Campus</th><th>Actions</th></tr></thead><tbody>{data.people.map(p=><tr key={p.id} className="border-b"><td className="py-2"><strong>{p.ambassador_code}</strong><span className="block text-xs text-slate-500">{p.name}{p.is_lead===1?' · Campus Lead':''}</span></td><td>{p.campus_name}</td><td><div className="flex flex-wrap gap-3"><button className="text-teal-700 underline" onClick={()=>setEditingPerson({...p})}>Edit</button><button disabled={busy} onClick={()=>void post('people/update',{id:p.id,status:p.status==='active'?'inactive':'active'},'Account status updated')} className="text-teal-700 underline">{p.status==='active'?'Deactivate':'Activate'}</button>{data.is_super_admin&&<button className="text-rose-700 underline" onClick={()=>{const code=window.prompt('Permanent deletion is allowed only when the account has no task history. Enter exact Ambassador ID:');if(code===p.ambassador_code)void remove('people/delete',{id:p.id,confirm_code:code},'Unused ambassador deleted');}}>Delete</button>}</div></td></tr>)}</tbody></table></div></div>
        {editingPerson&&<form className={panel} onSubmit={async e=>{e.preventDefault();if(await post('people/edit',{...editingPerson,is_lead:editingPerson.is_lead===1},'Ambassador information updated'))setEditingPerson(null);}}>
          <h2 className="font-bold">Edit Ambassador — {editingPerson.ambassador_code}</h2>
          <p className="text-xs text-slate-500">IDs are permanent to protect task history. Use Deactivate rather than Delete when work exists.</p>
          <div className="grid sm:grid-cols-2 gap-3"><label className={labelStyle}>Full name<input required className={inputStyle} value={editingPerson.name} onChange={e=>setEditingPerson({...editingPerson,name:e.target.value})}/></label><label className={labelStyle}>Email<input type="email" className={inputStyle} value={editingPerson.email} onChange={e=>setEditingPerson({...editingPerson,email:e.target.value})}/></label><label className={labelStyle}>Department<input className={inputStyle} value={editingPerson.department||''} onChange={e=>setEditingPerson({...editingPerson,department:e.target.value})}/></label><label className={labelStyle}>Campus<select className={inputStyle} value={editingPerson.campus_id} onChange={e=>setEditingPerson({...editingPerson,campus_id:e.target.value})}>{data.campuses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
          <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={editingPerson.is_lead===1} onChange={e=>setEditingPerson({...editingPerson,is_lead:e.target.checked?1:0})}/> Campus lead</label>
          <div className="flex gap-3"><button disabled={busy} className={actionStyle}>Save changes</button><button type="button" onClick={()=>setEditingPerson(null)} className="text-sm underline">Cancel</button></div>
        </form>}
        <form className={panel} onSubmit={async e=>{e.preventDefault();if(await post('people/reset-password',{id:resetPersonId,new_password:resetPassword},'Temporary password reset; old sessions revoked')){setResetPersonId('');setResetPassword('');}}}>
          <h2 className="font-bold">Reset an ambassador password</h2><div className="grid sm:grid-cols-2 gap-3">
          <div><label className={labelStyle}>Ambassador</label><select className={inputStyle} required value={resetPersonId} onChange={e=>setResetPersonId(e.target.value)}><option value="">Select account</option>{data.people.map(p=><option value={p.id} key={p.id}>{p.name} ({p.ambassador_code})</option>)}</select></div>
          <div><label className={labelStyle}>New temporary password</label><PasswordInput required minLength={12} showLabel="temporary password" className={inputStyle} value={resetPassword} onChange={e=>setResetPassword(e.target.value)}/></div></div>
          <button disabled={busy} className={actionStyle}>Reset password</button>
        </form>
      </div>}
      {tab==='campaigns' && <div className="space-y-5">
        <form className={panel} onSubmit={async e=>{e.preventDefault();if(await post('campaigns',campaign,'Campaign created and tasks assigned'))setCampaign({title:'',instructions:'',content_type:'share',target_scope:'all',target_id:'',points:5,due_date:today()});}}>
          <h2 className="font-bold flex gap-2 items-center"><Video size={18}/> Assign a campaign task</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={labelStyle}>Task title</label><input className={inputStyle} required minLength={5} value={campaign.title} onChange={e=>setCampaign({...campaign,title:e.target.value})}/></div>
            <div><label className={labelStyle}>Deliverable type</label><select className={inputStyle} value={campaign.content_type} onChange={e=>setCampaign({...campaign,content_type:e.target.value})}>{roleOptions.map(x=><option value={x} key={x}>{x}</option>)}</select></div>
            <div><label className={labelStyle}>Due date</label><input className={inputStyle} type="date" required value={campaign.due_date} onChange={e=>setCampaign({...campaign,due_date:e.target.value})}/></div>
            <div><label className={labelStyle}>Points for approved work (0–100)</label><input type="number" min={0} max={100} required className={inputStyle} value={campaign.points} onChange={e=>setCampaign({...campaign,points:Number(e.target.value)})}/></div>
            <div><label className={labelStyle}>Assign to</label><select className={inputStyle} value={campaign.target_scope} onChange={e=>setCampaign({...campaign,target_scope:e.target.value,target_id:''})}><option value="all">All active ambassadors</option><option value="campus">One campus</option><option value="individual">One ambassador</option></select></div>
            {campaign.target_scope!=='all' && <div><label className={labelStyle}>Target</label><select required className={inputStyle} value={campaign.target_id} onChange={e=>setCampaign({...campaign,target_id:e.target.value})}><option value="">Select target</option>{campaign.target_scope==='campus'?data.campuses.map(c=><option value={c.id} key={c.id}>{c.name}</option>):data.people.filter(p=>p.status==='active').map(p=><option value={p.id} key={p.id}>{p.name} — {p.ambassador_code}</option>)}</select></div>}
          </div><div><label className={labelStyle}>Instructions, branding and review criteria</label><textarea rows={4} required minLength={12} className={inputStyle} value={campaign.instructions} onChange={e=>setCampaign({...campaign,instructions:e.target.value})}/></div>
          <p className="text-xs text-slate-500">Tasks are assigned to matching active ambassadors at creation time. Later joiners do not receive old assignments automatically.</p>
          <button disabled={busy||data.people.length===0} className={actionStyle}>Publish and assign</button>
        </form>
        <div className={panel}><h2 className="font-bold">Campaigns and rewards</h2><p className="text-xs text-slate-500">Points are earned only from approved submissions. Campaign changes are blocked after proof is submitted to protect history.</p>
        {data.campaigns.map(c=><div key={c.id} className="py-3 border-b text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><strong>{c.title}</strong><span className="block text-slate-500">Due {c.due_date} · {c.assignments} assignments · {c.points} points · {c.status}</span></div>
          <div className="flex gap-3 flex-wrap"><button className="text-teal-700 underline" onClick={()=>setFullText({title:c.title,text:c.instructions})}>View full instructions</button><button className="text-teal-700 underline" onClick={()=>setEditingCampaign({...c})}>Edit</button><button className="underline" onClick={()=>void post('campaigns/archive',{id:c.id,status:c.status==='active'?'archived':'active'},'Campaign status updated')}>{c.status==='active'?'Archive':'Restore'}</button>{data.is_super_admin&&<button className="text-rose-700 underline" onClick={()=>{const title=window.prompt('Type exact campaign title to delete a campaign with no submissions:');if(title===c.title)void remove('campaigns/delete',{id:c.id,confirm_title:title},'Unused campaign deleted');}}>Delete</button>}</div></div>
          {data.assignments.filter(a=>a.campaign_id===c.id).map(a=><div key={a.id} className="ml-2 py-1 flex items-center justify-between gap-2 text-xs border-b border-slate-100"><span>{a.ambassador_code} — {a.ambassador_name} · {a.submission_status||'Not submitted'}</span>{!a.submission_status&&<div className="flex gap-2"><button className="text-teal-700 underline" onClick={()=>{setReassign(a);setReassignTo(a.ambassador_id);}}>Reassign</button><button className="text-rose-700 underline" onClick={()=>{const code=window.prompt('Type assigned Ambassador ID to remove this task:');if(code===a.ambassador_code)void remove('assignments/delete',{id:a.id,confirm_code:code},'Assignment removed');}}>Remove</button></div>}</div>)}
        </div>)}{!data.campaigns.length&&<p className="text-sm text-slate-500">No campaigns yet.</p>}
        {editingCampaign&&<form className="bg-teal-50 p-4 rounded-xl border border-teal-200 space-y-3" onSubmit={async e=>{e.preventDefault();if(await post('campaigns/edit',editingCampaign,'Campaign updated'))setEditingCampaign(null);}}><h3 className="font-bold text-teal-900">Edit task details</h3><label className={labelStyle}>Title<input required minLength={5} className={inputStyle} value={editingCampaign.title} onChange={e=>setEditingCampaign({...editingCampaign,title:e.target.value})}/></label><label className={labelStyle}>Instructions<textarea rows={4} required className={inputStyle} value={editingCampaign.instructions} onChange={e=>setEditingCampaign({...editingCampaign,instructions:e.target.value})}/></label><div className="grid sm:grid-cols-3 gap-2"><label className={labelStyle}>Type<select className={inputStyle} value={editingCampaign.content_type} onChange={e=>setEditingCampaign({...editingCampaign,content_type:e.target.value})}>{roleOptions.map(t=><option key={t} value={t}>{t}</option>)}</select></label><label className={labelStyle}>Due date<input type="date" required className={inputStyle} value={editingCampaign.due_date} onChange={e=>setEditingCampaign({...editingCampaign,due_date:e.target.value})}/></label><label className={labelStyle}>Reward points<input type="number" min={0} max={100} required className={inputStyle} value={editingCampaign.points} onChange={e=>setEditingCampaign({...editingCampaign,points:Number(e.target.value)})}/></label></div><button className={actionStyle} disabled={busy}>Save changes</button> <button type="button" className="text-sm underline" onClick={()=>setEditingCampaign(null)}>Cancel</button></form>}
        {reassign&&<form className="bg-teal-50 border border-teal-200 rounded-xl p-3 space-y-2" onSubmit={async e=>{e.preventDefault();if(await post('assignments/reassign',{id:reassign.id,ambassador_id:reassignTo},'Task reassigned')){setReassign(null);setReassignTo('');}}}><h3 className="font-bold">Reassign task from {reassign.ambassador_code}</h3><label className={labelStyle}>New ambassador<select required className={inputStyle} value={reassignTo} onChange={e=>setReassignTo(e.target.value)}>{data.people.filter(p=>p.status==='active').map(p=><option value={p.id} key={p.id}>{p.ambassador_code} — {p.name}</option>)}</select></label><p className="text-xs text-slate-500">Only tasks with no submission can be reassigned. Completed rewards remain protected.</p><button disabled={busy} className={actionStyle}>Save reassignment</button> <button type="button" onClick={()=>setReassign(null)} className="underline text-sm">Cancel</button></form>}
        <form className="rounded-xl border border-slate-200 p-3 space-y-2" onSubmit={async e=>{e.preventDefault();if(await post('assignments/add',addTaskTo,'Assignment created'))setAddTaskTo({campaign_id:'',ambassador_id:''});}}><h3 className="font-bold">Allocate an existing task to another ambassador</h3><div className="grid sm:grid-cols-2 gap-2"><label className={labelStyle}>Campaign<select required className={inputStyle} value={addTaskTo.campaign_id} onChange={e=>setAddTaskTo({...addTaskTo,campaign_id:e.target.value})}><option value="">Choose campaign</option>{data.campaigns.filter(c=>c.status==='active').map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><label className={labelStyle}>Ambassador (ID order)<select required className={inputStyle} value={addTaskTo.ambassador_id} onChange={e=>setAddTaskTo({...addTaskTo,ambassador_id:e.target.value})}><option value="">Choose ambassador</option>{data.people.filter(p=>p.status==='active').map(p=><option key={p.id} value={p.id}>{p.ambassador_code} — {p.name}</option>)}</select></label></div><button disabled={busy} className={actionStyle}>Assign task</button></form>
        </div>
      </div>}
      {tab==='reviews' && <div className="space-y-4">
        <h2 className="font-bold text-lg">Pending approvals ({sortedSubmissions.length})</h2>
        {sortedSubmissions.length===0 && <div className={panel}><p className="text-sm text-slate-500">No submissions awaiting review.</p></div>}
        {sortedSubmissions.map(s=><div key={s.id} className={panel}>
          <div className="flex justify-between gap-2"><div><h3 className="font-bold">{s.campaign_title}</h3><p className="text-sm text-slate-500">{s.ambassador_name} · {new Date(s.submitted_at).toLocaleDateString('en-GB')}</p></div><span className="text-xs text-amber-700">Submitted</span></div>
          <a href={s.proof_url} target="_blank" rel="noopener noreferrer" className="block text-teal-700 text-sm break-all underline">Review submission proof ↗</a>
          {s.notes && <div className="flex items-center gap-3"><p className="text-sm text-slate-700 truncate max-w-lg">{s.notes}</p><button className="text-teal-700 underline text-sm shrink-0" onClick={()=>setFullText({title:`Notes — ${s.campaign_title}`,text:s.notes})}>View</button></div>}
          <div className="grid sm:grid-cols-[1fr_180px] gap-3"><div><label className={labelStyle}>Feedback (required for revision / rejection)</label><textarea className={inputStyle} rows={2} value={reviewNotes[s.id]||''} onChange={e=>setReviewNotes({...reviewNotes,[s.id]:e.target.value})}/></div><div><label className={labelStyle}>Quality score for approval</label><select className={inputStyle} value={scores[s.id]||3} onChange={e=>setScores({...scores,[s.id]:Number(e.target.value)})}>{[1,2,3,4,5].map(i=><option value={i} key={i}>{i} / 5</option>)}</select></div></div>
          <div className="flex gap-2 flex-wrap"><button disabled={busy} className={actionStyle} onClick={()=>void post('reviews',{submission_id:s.id,decision:'approved',review_note:reviewNotes[s.id]||'',quality_score:scores[s.id]||3},'Work approved and points recorded')}>Approve</button>
            <button disabled={busy} className="border border-amber-400 rounded-xl px-3 py-2 text-sm" onClick={()=>void post('reviews',{submission_id:s.id,decision:'revision_requested',review_note:reviewNotes[s.id]||''},'Revision requested')}>Request revision</button>
            <button disabled={busy} className="border border-rose-300 rounded-xl px-3 py-2 text-rose-700 text-sm" onClick={()=>void post('reviews',{submission_id:s.id,decision:'rejected',review_note:reviewNotes[s.id]||''},'Work rejected')}>Reject</button></div>
        </div>)}
        <div className={panel}><h3 className="font-bold">Reviews and reward corrections</h3><p className="text-xs text-slate-500">Approved submissions receive points automatically. Only Super Admin may correct a final quality rating or revoke approval; all changes are audited. Derived monthly ratings cannot be directly edited.</p>
          {data.submissions.filter(s=>s.status!=='submitted').slice(0,30).map(s=><div key={s.id} className="border-b py-2 text-sm flex flex-wrap justify-between gap-2"><div><strong>{s.ambassador_name}</strong> — {s.campaign_title}<span className="block text-xs text-slate-500">{s.status} · Quality: {s.quality_score??'—'}/5 {s.review_note?'· Feedback recorded':''}</span></div><div className="flex gap-3"><button className="underline text-teal-700" onClick={()=>setFullText({title:`Review — ${s.campaign_title}`,text:`Submission notes:\n${s.notes||'None'}\n\nManager feedback:\n${s.review_note||'None'}`})}>View full</button>{data.is_super_admin&&s.status==='approved'&&<button className="underline text-amber-800" onClick={()=>setReviewCorrection({id:s.id,action:'rerate',quality_score:s.quality_score??3,reason:''})}>Correct review</button>}</div></div>)}
          {reviewCorrection.id&&<form className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2" onSubmit={async e=>{e.preventDefault();if(await post('reviews/correct',{submission_id:reviewCorrection.id,...reviewCorrection},'Review corrected; ranking recalculated')){setReviewCorrection({id:'',action:'rerate',quality_score:3,reason:''});await refreshPerformance();}}}><h4 className="font-bold text-amber-950">Correct final review (Super Admin only)</h4><label className={labelStyle}>Action<select className={inputStyle} value={reviewCorrection.action} onChange={e=>setReviewCorrection({...reviewCorrection,action:e.target.value})}><option value="rerate">Correct 1–5 quality rating</option><option value="revoke">Revoke approval and points</option></select></label>{reviewCorrection.action==='rerate'&&<label className={labelStyle}>Corrected quality<select className={inputStyle} value={reviewCorrection.quality_score} onChange={e=>setReviewCorrection({...reviewCorrection,quality_score:Number(e.target.value)})}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}/5</option>)}</select></label>}<label className={labelStyle}>Audit reason (12+ characters)<textarea required minLength={12} rows={3} className={inputStyle} value={reviewCorrection.reason} onChange={e=>setReviewCorrection({...reviewCorrection,reason:e.target.value})}/></label><div className="flex gap-2"><button disabled={busy} className={actionStyle}>Save correction</button><button type="button" className="underline" onClick={()=>setReviewCorrection({id:'',action:'rerate',quality_score:3,reason:''})}>Cancel</button></div></form>}
        </div>
      </div>}
      {tab==='performance' && <div className="space-y-4">
        <div className={panel}>
          <div className="flex flex-wrap gap-3 items-end justify-between">
            <div><h2 className="font-bold text-lg flex items-center gap-2"><Award size={18}/> Monthly Performance Ratings</h2>
              <p className="text-sm text-slate-500 mt-1">Server-calculated results based on deadlines in the selected month, with dates passed before today (Dhaka time).</p></div>
            <label className={labelStyle}>Report month
              <input type="month" min="2000-01" max={today().slice(0,7)} className={`${inputStyle} mt-1`} value={performanceMonth} onChange={e=>setPerformanceMonth(e.target.value)}/>
            </label>
          </div>
          <p className="text-xs text-slate-500">Completion 40% · Content quality 30% · On-time delivery 15% · Weekly consistency 15%. Quality is average approved rating / 5. Consistency counts weeks with approved work among weeks with due tasks.</p>
          <p className="text-xs text-slate-500">Ratings: Excellent ≥85 · Good ≥70 · Satisfactory ≥50 · Needs Improvement &lt;50. No eligible assignments means Not rated.</p>
          <p className="text-xs text-amber-700">This is a live report, not a locked certificate or payment record. Reviews added later can update historical rankings. The current month is provisional. To correct scores, use Reviews → Correct review. Rankings are calculated and cannot be deleted manually.</p>
          {performanceError&&<p role="alert" className="text-rose-700 text-sm">{performanceError}</p>}
          {performanceBusy?<p className="text-sm text-slate-500 flex gap-2 items-center"><Loader2 size={16} className="animate-spin"/> Loading monthly ratings…</p>:performance&&<>
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-teal-900">{performance.complete?'Ambassador of the Month — top eligible performer':'Current frontrunner — provisional'}</p>
              {performance.winner?<p className="mt-1 font-bold text-lg">{performance.winner.name} <span className="text-sm font-normal text-teal-800">({performance.winner.campus_name}) · {performance.winner.score}/100</span></p>
                :<p className="text-sm text-teal-800 mt-1">No eligible winner yet. Requires at least two approved tasks, two eligible assignments, and a score of 70 or higher.</p>}
            </div>
            <p className="text-xs text-slate-500">Reporting through: {performance.as_of}. {performance.complete?'Selected month has ended.':'Current period has not finished.'} All ambassador account types use the same rating rules; points remain non-monetary.</p>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-600"><tr className="border-b">
              <th className="py-2 pr-3">Rank / Ambassador</th><th className="pr-3">Campus</th><th className="pr-3">Approved / Eligible</th><th className="pr-3">Quality</th><th className="pr-3">On time</th><th className="pr-3">Consistent weeks</th><th className="pr-3">Score</th><th>Rating</th>
              </tr></thead><tbody>{performance.leaderboard.map((p,i)=><tr key={p.id} className="border-b">
                <td className="py-2 pr-3"><strong>{p.score===null?'—':i+1}. {p.name}</strong><span className="block text-xs text-slate-500">{p.ambassador_code}</span></td>
                <td className="pr-3">{p.campus_name}</td><td className="pr-3">{p.approved} / {p.eligible}</td><td className="pr-3">{p.quality_average??'—'} / 5</td><td className="pr-3">{p.on_time}</td>
                <td className="pr-3">{p.active_weeks}/{p.assigned_weeks}</td><td className="font-bold pr-3">{p.score===null?'—':`${p.score}/100`}</td><td>{p.rating}</td>
              </tr>)}</tbody></table></div>
            {!performance.leaderboard.length&&<p className="text-slate-500 text-sm">No ambassador profiles found.</p>}
          </>}
        </div>
      </div>}
      {tab==='rewards' && <div className="grid lg:grid-cols-2 gap-4">
        <form className={panel} onSubmit={async e=>{e.preventDefault();if(await post('awards',award,'Recognition saved'))setAward({ambassador_id:'',title:'',description:'',award_month:today().slice(0,7)});}}>
          <h2 className="font-bold text-lg flex gap-2 items-center"><Award size={18}/> Non-monetary Recognition</h2><p className="text-xs text-slate-500">Certificates and recognition are separate from automatic points and monthly ratings. Awards may be revised; revocation preserves audit history.</p>
          <label className={labelStyle}>Ambassador<select required className={inputStyle} value={award.ambassador_id} onChange={e=>setAward({...award,ambassador_id:e.target.value})}><option value="">Select ID</option>{data.people.map(p=><option key={p.id} value={p.id}>{p.ambassador_code} — {p.name}</option>)}</select></label>
          <label className={labelStyle}>Award title<input required minLength={4} className={inputStyle} value={award.title} onChange={e=>setAward({...award,title:e.target.value})} placeholder="Outstanding Content Creator"/></label>
          <label className={labelStyle}>Award month<input type="month" min="2000-01" className={inputStyle} required value={award.award_month} onChange={e=>setAward({...award,award_month:e.target.value})}/></label>
          <label className={labelStyle}>Description / recognition criteria<textarea rows={3} className={inputStyle} value={award.description} onChange={e=>setAward({...award,description:e.target.value})}/></label>
          <button disabled={busy} className={actionStyle}>Add recognition</button>
        </form>
        <div className={panel}><h2 className="font-bold">Recognition history</h2>
          {data.awards.map(w=><div key={w.id} className="border-b py-2 text-sm"><div className="flex justify-between gap-2"><div><strong>{w.ambassador_code} — {w.title}</strong><p className="text-xs text-slate-500">{w.ambassador_name} · {w.award_month} · {w.status}</p></div><div className="flex gap-2">{w.status==='active'&&<button onClick={()=>setEditingAward({...w})} className="underline text-teal-700">Edit</button>}{data.is_super_admin&&w.status==='active'&&<button className="underline text-rose-700" onClick={()=>{const reason=window.prompt('Reason for revoking award (at least 12 characters):');if(reason&&reason.length>=12)void remove('awards/revoke',{id:w.id,reason},'Recognition revoked');}}>Revoke</button>}</div></div>
            <p className="text-xs text-slate-600 truncate">{w.description}</p>{w.description&&<button className="underline text-teal-700 text-xs" onClick={()=>setFullText({title:w.title,text:w.description})}>View full description</button>}</div>)}
          {!data.awards.length&&<p className="text-sm text-slate-500">No recognition awards created yet.</p>}
          {editingAward&&<form className="bg-teal-50 border border-teal-200 p-3 rounded-xl space-y-2" onSubmit={async e=>{e.preventDefault();if(await post('awards/update',editingAward,'Recognition updated'))setEditingAward(null);}}><h3 className="font-bold">Edit recognition</h3><label className={labelStyle}>Title<input className={inputStyle} required minLength={4} value={editingAward.title} onChange={e=>setEditingAward({...editingAward,title:e.target.value})}/></label><label className={labelStyle}>Month<input type="month" className={inputStyle} value={editingAward.award_month} onChange={e=>setEditingAward({...editingAward,award_month:e.target.value})}/></label><label className={labelStyle}>Description<textarea rows={3} className={inputStyle} value={editingAward.description} onChange={e=>setEditingAward({...editingAward,description:e.target.value})}/></label><button disabled={busy} className={actionStyle}>Save recognition</button> <button className="underline text-sm" type="button" onClick={()=>setEditingAward(null)}>Cancel</button></form>}
        </div>
      </div>}
      {tab==='access' && data.is_super_admin && <div className="grid lg:grid-cols-2 gap-4"><form className={panel} onSubmit={async e=>{e.preventDefault();if(await post('managers',{employee_id:managerCode},'Programme Manager access granted'))setManagerCode('');}}><h2 className="font-bold flex gap-2 items-center"><ShieldCheck size={18}/> Assign programme manager</h2>
        <p className="text-xs text-slate-500">This grants only Campus Hub administration. Office roles and GPS attendance are unchanged. Enter an existing manager/admin Employee ID.</p>
        <div><label className={labelStyle}>Boss Employee ID</label><input required className={inputStyle} value={managerCode} onChange={e=>setManagerCode(e.target.value.toUpperCase())}/></div><button disabled={busy} className={actionStyle}>Grant access</button></form>
        <div className={panel}><h2 className="font-bold">Assigned programme managers</h2>{data.managers.map(m=><div key={m.id} className="flex justify-between items-center gap-2 border-b py-2 text-sm"><span>{m.name} ({m.employee_id})</span><button className="text-rose-700 underline" disabled={busy} onClick={()=>void post('managers',{employee_id:m.employee_id,remove:true},'Programme Manager access revoked')}>Revoke</button></div>)}
          <p className="text-xs text-slate-500">Managers can access the Campus Ambassador Hub tab using their existing Boss sign-in. Super Admin retains access.</p></div></div>}
      <div className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 size={14}/> Separate ambassador accounts never clock into GPS attendance or appear in employee payroll reports.</div>
    </>}
  </section>;
};
