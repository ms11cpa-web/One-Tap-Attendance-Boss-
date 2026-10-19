import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../api/client';
import { PasswordInput } from '../auth/PasswordInput';
import { NotificationCenter } from './NotificationCenter';
import { Award, CheckCircle2, GraduationCap, Loader2, RefreshCw, ShieldCheck, Video } from 'lucide-react';

type Campus = { id: string; name: string; city: string };
type Person = { id: string; ambassador_code: string; name: string; email: string; campus_name: string; campus_id: string; status: string; is_lead: number };
type Campaign = { id: string; title: string; due_date: string; points: number; assignments: number; status: string };
type Submission = { id: string; ambassador_name: string; ambassador_email: string; campaign_title: string; proof_url: string; notes: string; status: string; review_note: string; submitted_at: number; points: number };
type Leader = { id: string; name: string; ambassador_code: string; campus_name: string; points: number; approved: number; assigned: number; quality_average: number|null; on_time: number };
type Manager = { id: string; employee_id: string; name: string };
type MonthlyRow = { id:string; name:string; ambassador_code:string; campus_name:string; status:string; eligible:number; approved:number; on_time:number; approved_points:number; quality_average:number|null; active_weeks:number; assigned_weeks:number; completion_pct:number; quality_pct:number; timeliness_pct:number; consistency_pct:number; score:number|null; rating:string };
type MonthlyReport = {month:string;as_of:string;complete:boolean;weights:{completion:number;quality:number;timeliness:number;consistency:number};winner: {id:string;name:string;ambassador_code:string;campus_name:string;score:number}|null;leaderboard:MonthlyRow[]};
type AdminData = { enabled: boolean; is_super_admin: boolean; campuses: Campus[]; people: Person[]; campaigns: Campaign[]; submissions: Submission[]; leaderboard: Leader[]; managers: Manager[] };
type PostPath = 'enable'|'campuses'|'people'|'people/update'|'people/reset-password'|'campaigns'|'reviews'|'managers';
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
  const [tab,setTab] = useState<'overview'|'campuses'|'people'|'campaigns'|'reviews'|'performance'|'access'>('overview');
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
    {error && <div role="alert" className="bg-rose-50 text-rose-800 border border-rose-200 rounded-xl p-3 text-sm">{error}</div>}
    {notice && <div role="status" className="bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl p-3 text-sm">{notice}</div>}
    {!data ? <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="animate-spin" size={18}/> Loading Hub…</div> : <>
      <div className={`rounded-xl p-4 text-sm flex flex-wrap gap-3 items-center justify-between ${data.enabled?'bg-emerald-50 border border-emerald-200':'bg-amber-50 border border-amber-200'}`}>
        <span><strong>Ambassador portal is {data.enabled?'enabled':'disabled'}.</strong> {data.enabled?'Accounts can sign in at /ambassadors.':'Set up campuses, ambassadors and campaigns before enabling sign-in.'}</span>
        {data.is_super_admin && <button disabled={busy} className={actionStyle} onClick={()=>void post('enable',{enabled:!data.enabled},data.enabled?'Portal disabled':'Portal enabled')}>{data.enabled?'Disable ambassador login':'Enable ambassador login'}</button>}
      </div>
      {data.enabled && <NotificationCenter owner="manager" />}
      <nav aria-label="Campus Hub sections" className="flex gap-2 overflow-x-auto pb-1">
        {(['overview','campuses','people','campaigns','reviews','performance',...(data.is_super_admin?['access']:[])] as string[]).map(n=><button key={n} onClick={()=>setTab(n as typeof tab)} className={`capitalize px-3 py-2 text-sm whitespace-nowrap rounded-xl border ${tab===n?'bg-slate-900 text-white border-slate-900':'bg-white border-slate-200'}`}>{n}</button>)}
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
        <div className={panel}><h2 className="font-bold">Registered campuses</h2>{data.campuses.length?data.campuses.map(c=><div className="border-b py-2 text-sm" key={c.id}><strong>{c.name}</strong><span className="block text-slate-500">{c.city}</span></div>):<p className="text-sm text-slate-500">Add your first campus to start.</p>}</div>
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
        <div className={panel}><h2 className="font-bold">Ambassador directory</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b text-slate-500"><th>Name / ID</th><th>Campus</th><th>Access</th></tr></thead><tbody>{data.people.map(p=><tr key={p.id} className="border-b"><td className="py-2"><strong>{p.name}</strong>{p.is_lead===1?' · Lead':''}<span className="block text-xs text-slate-500">{p.ambassador_code}</span></td><td>{p.campus_name}</td><td><button disabled={busy} onClick={()=>void post('people/update',{id:p.id,status:p.status==='active'?'inactive':'active'},'Account status updated')} className="text-teal-700 underline">{p.status==='active'?'Deactivate':'Activate'}</button></td></tr>)}</tbody></table></div></div>
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
        <div className={panel}><h2 className="font-bold">Campaigns</h2>{data.campaigns.map(c=><div key={c.id} className="py-3 border-b flex items-center justify-between gap-2 text-sm"><div><strong>{c.title}</strong><span className="block text-slate-500">Due {c.due_date} · {c.assignments} assignments · {c.points} pts</span></div><span className="bg-slate-100 px-2 py-1 rounded-lg">{c.status}</span></div>)}{!data.campaigns.length&&<p className="text-sm text-slate-500">No campaigns yet.</p>}</div>
      </div>}
      {tab==='reviews' && <div className="space-y-4">
        <h2 className="font-bold text-lg">Pending approvals ({sortedSubmissions.length})</h2>
        {sortedSubmissions.length===0 && <div className={panel}><p className="text-sm text-slate-500">No submissions awaiting review.</p></div>}
        {sortedSubmissions.map(s=><div key={s.id} className={panel}>
          <div className="flex justify-between gap-2"><div><h3 className="font-bold">{s.campaign_title}</h3><p className="text-sm text-slate-500">{s.ambassador_name} · {new Date(s.submitted_at).toLocaleDateString('en-GB')}</p></div><span className="text-xs text-amber-700">Submitted</span></div>
          <a href={s.proof_url} target="_blank" rel="noopener noreferrer" className="block text-teal-700 text-sm break-all underline">Review submission proof ↗</a>
          {s.notes && <p className="text-sm text-slate-700 whitespace-pre-wrap">{s.notes}</p>}
          <div className="grid sm:grid-cols-[1fr_180px] gap-3"><div><label className={labelStyle}>Feedback (required for revision / rejection)</label><textarea className={inputStyle} rows={2} value={reviewNotes[s.id]||''} onChange={e=>setReviewNotes({...reviewNotes,[s.id]:e.target.value})}/></div><div><label className={labelStyle}>Quality score for approval</label><select className={inputStyle} value={scores[s.id]||3} onChange={e=>setScores({...scores,[s.id]:Number(e.target.value)})}>{[1,2,3,4,5].map(i=><option value={i} key={i}>{i} / 5</option>)}</select></div></div>
          <div className="flex gap-2 flex-wrap"><button disabled={busy} className={actionStyle} onClick={()=>void post('reviews',{submission_id:s.id,decision:'approved',review_note:reviewNotes[s.id]||'',quality_score:scores[s.id]||3},'Work approved and points recorded')}>Approve</button>
            <button disabled={busy} className="border border-amber-400 rounded-xl px-3 py-2 text-sm" onClick={()=>void post('reviews',{submission_id:s.id,decision:'revision_requested',review_note:reviewNotes[s.id]||''},'Revision requested')}>Request revision</button>
            <button disabled={busy} className="border border-rose-300 rounded-xl px-3 py-2 text-rose-700 text-sm" onClick={()=>void post('reviews',{submission_id:s.id,decision:'rejected',review_note:reviewNotes[s.id]||''},'Work rejected')}>Reject</button></div>
        </div>)}
        <div className={panel}><h3 className="font-bold">Recent reviews</h3>{data.submissions.filter(s=>s.status!=='submitted').slice(0,15).map(s=><p key={s.id} className="border-b py-2 text-sm">{s.ambassador_name} — {s.campaign_title} · <strong>{s.status}</strong></p>)}</div>
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
          <p className="text-xs text-amber-700">This is a live report, not a locked certificate or payment record. Reviews added later can update historical rankings. The current month is provisional.</p>
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
      {tab==='access' && data.is_super_admin && <div className="grid lg:grid-cols-2 gap-4"><form className={panel} onSubmit={async e=>{e.preventDefault();if(await post('managers',{employee_id:managerCode},'Programme Manager access granted'))setManagerCode('');}}><h2 className="font-bold flex gap-2 items-center"><ShieldCheck size={18}/> Assign programme manager</h2>
        <p className="text-xs text-slate-500">This grants only Campus Hub administration. Office roles and GPS attendance are unchanged. Enter an existing manager/admin Employee ID.</p>
        <div><label className={labelStyle}>Boss Employee ID</label><input required className={inputStyle} value={managerCode} onChange={e=>setManagerCode(e.target.value.toUpperCase())}/></div><button disabled={busy} className={actionStyle}>Grant access</button></form>
        <div className={panel}><h2 className="font-bold">Assigned programme managers</h2>{data.managers.map(m=><div key={m.id} className="flex justify-between items-center gap-2 border-b py-2 text-sm"><span>{m.name} ({m.employee_id})</span><button className="text-rose-700 underline" disabled={busy} onClick={()=>void post('managers',{employee_id:m.employee_id,remove:true},'Programme Manager access revoked')}>Revoke</button></div>)}
          <p className="text-xs text-slate-500">Managers can access the Campus Ambassador Hub tab using their existing Boss sign-in. Super Admin retains access.</p></div></div>}
      <div className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 size={14}/> Separate ambassador accounts never clock into GPS attendance or appear in employee payroll reports.</div>
    </>}
  </section>;
};
