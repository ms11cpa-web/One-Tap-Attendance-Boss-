import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';
import { PasswordInput } from '../auth/PasswordInput';
import { NotificationCenter } from './NotificationCenter';
import { ThemeToggle } from '../layout/ThemeToggle';
import { ArrowLeft, Award, CheckCircle2, GraduationCap, LogOut, Send, ShieldCheck } from 'lucide-react';

type Member = { id:string; ambassador_code:string; name:string; email:string; department:string; campus_name:string; is_lead:number; must_change_password:number };
type Task = { assignment_id:string; title:string; instructions:string; content_type:string; points:number; due_date:string; campaign_status:string; submission_id:string|null; submission_status:string|null; proof_url:string|null; review_note:string|null; quality_score:number|null; submitted_at:number|null };
type PersonalPerformance = { month:string;eligible:number;approved:number;score:number|null;rating:string;completion_pct:number;quality_average:number|null;timeliness_pct:number;consistency_pct:number };
type TasksData = { tasks:Task[]; today:string; campus_progress:{assigned:number;approved:number}|null; monthly_performance?: PersonalPerformance };
const inp='w-full bg-slate-950 text-white rounded-xl border border-slate-700 px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500';
const btn='rounded-xl bg-teal-500 text-slate-950 font-bold px-4 py-2.5 text-sm disabled:opacity-40';
const card='bg-slate-900 border border-slate-800 rounded-2xl p-5';

export const AmbassadorPortal:React.FC = () => {
  const [member,setMember]=useState<Member|null>(null);const [loading,setLoading]=useState(true);
  const [error,setError]=useState(''); const [notice,setNotice]=useState(''); const [busy,setBusy]=useState(false);
  const [code,setCode]=useState('');const [password,setPassword]=useState('');
  const [currentPassword,setCurrentPassword]=useState('');const [newPassword,setNewPassword]=useState('');
  const [data,setData]=useState<TasksData|null>(null);
  const [links,setLinks]=useState<Record<string,string>>({}); const [notes,setNotes]=useState<Record<string,string>>({});
  const refresh = useCallback(async()=>{
    try {const result=await apiRequest<{member:Member}>('/api/ambassadors/me');setMember(result.member);
      if(!Number(result.member.must_change_password)) setData(await apiRequest<TasksData>('/api/ambassadors/tasks'));
      setError('');
    } catch(e) {setMember(null);setData(null);if(e instanceof Error && !e.message.includes('Sign in'))setError('');}
    finally {setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const submitLogin=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');
    try {await apiRequest('/api/ambassadors/login',{method:'POST',body:JSON.stringify({ambassador_code:code,password})});setPassword('');await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Sign-in failed');}finally{setBusy(false);}};
  const logout=async()=>{await apiRequest('/api/ambassadors/logout',{method:'POST',body:'{}'}).catch(()=>{});setMember(null);setData(null);setPassword('');setNotice('');};
  const changePassword=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');
    try {await apiRequest('/api/ambassadors/change-password',{method:'POST',body:JSON.stringify({current_password:currentPassword,new_password:newPassword})});
      setCurrentPassword('');setNewPassword('');setNotice('Password changed successfully.');await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Password change failed');}finally{setBusy(false);}};
  const submitTask=async(e:React.FormEvent,t:Task)=>{e.preventDefault();setBusy(true);setError('');setNotice('');
    try {await apiRequest('/api/ambassadors/submit',{method:'POST',body:JSON.stringify({assignment_id:t.assignment_id,proof_url:links[t.assignment_id]||'',notes:notes[t.assignment_id]||''})});
      setNotice('Work submitted for review.'); setLinks(x=>({...x,[t.assignment_id]:''}));setNotes(x=>({...x,[t.assignment_id]:''}));setData(await apiRequest<TasksData>('/api/ambassadors/tasks'));}
    catch(e){setError(e instanceof Error?e.message:'Submission failed');}finally{setBusy(false);}};
  const completed=data?.tasks.filter(t=>t.submission_status==='approved')||[];
  const points=completed.reduce((sum,t)=>sum+Number(t.points||0),0);
  return <div className="boss-ambassador min-h-screen bg-slate-950 text-white px-4 py-7 sm:px-8">
    <div className="max-w-4xl mx-auto space-y-5">
      <header className="flex flex-wrap gap-3 items-center justify-between"><div className="flex gap-3 items-center"><div className="bg-teal-500 text-slate-950 w-11 h-11 rounded-xl flex items-center justify-center font-black text-2xl">B</div>
        <div><h1 className="text-xl font-black">AGN Campus Ambassador Hub</h1><p className="text-xs text-teal-300">Powered by Boss · Avarian Global Network</p></div></div>
        <div className="flex items-center gap-2"><ThemeToggle compact />
          {member?<button className="flex items-center gap-2 text-sm text-slate-300 border border-slate-700 px-3 py-2 rounded-xl" onClick={()=>void logout()}><LogOut size={16}/> Sign out</button>
          :<a className="flex items-center gap-2 text-sm text-slate-300" href="/"><ArrowLeft size={16}/> Office login</a>}
        </div>
      </header>
      {error&&<p role="alert" className="rounded-xl border border-rose-900 bg-rose-950/50 text-rose-200 p-3 text-sm">{error}</p>}
      {notice&&<p role="status" className="rounded-xl border border-teal-700 bg-teal-950 text-teal-200 p-3 text-sm">{notice}</p>}
      {loading?<p className="text-slate-400 text-sm">Checking your ambassador account…</p>:
      !member?<form onSubmit={e=>void submitLogin(e)} className={`${card} max-w-md mx-auto space-y-4`}>
        <div className="flex items-center gap-2"><GraduationCap className="text-teal-400"/><h2 className="text-lg font-bold">Ambassador sign-in</h2></div>
        <p className="text-xs text-slate-400">Use the AGN Ambassador ID and temporary password provided by your programme manager.</p>
        <div><label className="block text-xs text-slate-300 mb-1">Ambassador ID</label><input className={inp} value={code} required autoComplete="username" onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="AGN001" /></div>
        <div><label className="block text-xs text-slate-300 mb-1">Password</label><PasswordInput className={inp} showLabel="ambassador password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></div>
        <button disabled={busy} className={`${btn} w-full`}>Sign in</button>
        <p className="text-xs text-slate-400">Cannot sign in? Contact your AGN programme manager. Ambassador accounts are separate from office employees.</p>
      </form>:
      <>
        <div className={card}><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Hello, {member.name}</h2><p className="text-sm text-slate-400">{member.ambassador_code} · {member.campus_name} {Number(member.is_lead)?'· Campus Lead':''}</p></div><ShieldCheck className="text-teal-400"/></div></div>
        {Number(member.must_change_password) ? <form onSubmit={e=>void changePassword(e)} className={`${card} space-y-4`}>
          <h3 className="font-bold text-amber-300">Change your temporary password</h3><p className="text-sm text-slate-400">Before submitting tasks, create your own password of at least 12 characters.</p>
          <div><label className="text-xs text-slate-300">Current temporary password</label><PasswordInput className={inp} required showLabel="temporary password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></div>
          <div><label className="text-xs text-slate-300">New password (12+ characters)</label><PasswordInput className={inp} required minLength={12} autoComplete="new-password" showLabel="new password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></div>
          <button disabled={busy} className={btn}>Save new password</button>
        </form>:
        <>
          <NotificationCenter owner="member" dark />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3"><div className={card}><p className="text-xs text-slate-400">Assigned tasks</p><p className="text-3xl font-black mt-1">{data?.tasks.length||0}</p></div>
            <div className={card}><p className="text-xs text-slate-400">Approved contributions</p><p className="text-3xl font-black mt-1">{completed.length}</p></div>
            <div className={`${card} col-span-2 sm:col-span-1`}><p className="text-xs text-slate-400">Recognition points</p><p className="text-3xl font-black text-teal-400 mt-1">{points}</p></div></div>
          {data?.monthly_performance&&<div className={card}>
            <h2 className="font-bold text-base flex gap-2 items-center"><Award size={17} className="text-teal-400"/> Your monthly performance — {data.monthly_performance.month}</h2>
            <div className="flex flex-wrap gap-4 items-end mt-3"><p className="text-3xl font-black text-teal-300">{data.monthly_performance.score===null?'Not rated':`${data.monthly_performance.score}/100`}</p>
              <p className="text-sm text-slate-300">{data.monthly_performance.rating}</p></div>
            <p className="text-xs text-slate-400 mt-2">{data.monthly_performance.approved}/{data.monthly_performance.eligible} eligible tasks approved · Quality {data.monthly_performance.quality_average??'—'}/5 · On-time {data.monthly_performance.timeliness_pct}% · Consistency {data.monthly_performance.consistency_pct}%</p>
            <p className="text-xs text-slate-500 mt-2">Provisional: counts deadline days before today in Dhaka, and may change when managers review work. No assigned tasks due yet means Not rated.</p>
          </div>}
          {Number(member.is_lead)===1&&data?.campus_progress&&<div className={card}><p className="font-semibold text-sm">Campus coordination progress</p><p className="text-xs text-slate-400">Campus-wide aggregate: {data.campus_progress.approved} approved of {data.campus_progress.assigned} assigned. No private submissions are shared.</p></div>}
          <h2 className="text-lg font-bold flex gap-2 items-center"><Award className="text-teal-400"/> Your assignments</h2>
          {data?.tasks.length===0&&<div className={card}><p className="text-slate-400 text-sm">No tasks assigned yet. Check back after your programme manager publishes a campaign.</p></div>}
          {data?.tasks.map(t=><article key={t.assignment_id} className={`${card} space-y-3`}>
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-lg">{t.title}</h3><p className="text-xs text-slate-400">{t.content_type.toUpperCase()} · Due {t.due_date} · {t.points} points</p></div>
              <span className={`text-xs px-2.5 py-1 rounded-lg ${t.submission_status==='approved'?'bg-emerald-950 text-emerald-300':t.submission_status==='revision_requested'?'bg-amber-950 text-amber-300':'bg-slate-800 text-slate-300'}`}>{t.submission_status||'Assigned'}</span></div>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{t.instructions}</p>
            {t.submission_status==='approved'?<p className="text-sm text-emerald-300 flex gap-2 items-center"><CheckCircle2 size={17}/> Approved {t.quality_score?`· Quality ${t.quality_score}/5`:''}</p>:null}
            {t.review_note&&<div className="bg-slate-800 rounded-lg p-3"><strong className="text-xs text-teal-300">Manager feedback</strong><p className="text-sm text-slate-200">{t.review_note}</p></div>}
            {t.proof_url&&<a className="text-sm text-teal-300 underline break-words block" href={t.proof_url} target="_blank" rel="noopener noreferrer">View your submitted proof ↗</a>}
            {(!t.submission_status||t.submission_status==='revision_requested') && t.campaign_status==='active'&& <form className="space-y-3 pt-2 border-t border-slate-800" onSubmit={e=>void submitTask(e,t)}>
              <div><label className="block text-xs text-slate-300 mb-1">Public post or Google Drive link (HTTPS)</label><input required type="url" placeholder="https://..." className={inp} value={links[t.assignment_id]||''} onChange={e=>setLinks({...links,[t.assignment_id]:e.target.value})}/></div>
              <div><label className="block text-xs text-slate-300 mb-1">Short description (optional)</label><textarea rows={2} className={inp} value={notes[t.assignment_id]||''} onChange={e=>setNotes({...notes,[t.assignment_id]:e.target.value})}/></div>
              <button disabled={busy} className={`${btn} flex gap-2 items-center`}><Send size={15}/>{t.submission_status==='revision_requested'?'Resubmit corrected work':'Submit for review'}</button>
            </form>}
            {t.submission_status==='submitted'&&<p className="text-sm text-slate-400">Your work is waiting for programme manager review.</p>}
            {t.submission_status==='rejected'&&<p className="text-sm text-rose-300">This submission was rejected. Contact your programme manager for a new assignment.</p>}
          </article>)}
          <p className="text-xs text-slate-500">Point totals include approved tasks only. You are not expected to clock in or share GPS location.</p>
        </>}
      </>}
    </div>
  </div>;
};
