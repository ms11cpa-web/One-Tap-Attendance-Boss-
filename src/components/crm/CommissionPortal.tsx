import React,{useEffect,useState} from 'react';
import {apiRequest} from '../../api/client';
import {PasswordInput} from '../auth/PasswordInput';
import {ThemeToggle} from '../layout/ThemeToggle';
import {CrmWorkspace} from './CrmWorkspace';
import {BriefcaseBusiness,LogOut,ArrowLeft} from 'lucide-react';
const field='w-full bg-slate-900 text-white border border-slate-700 rounded-xl px-3 py-2.5';
export const CommissionPortal:React.FC=()=>{
 const [active,setActive]=useState(false),[loading,setLoading]=useState(true),[code,setCode]=useState(''),[password,setPassword]=useState('');
 const [newPassword,setNewPassword]=useState(''),[change,setChange]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const refresh=async()=>{try{await apiRequest('/api/crm/agent/state');setActive(true);setChange(false);}catch(e){setActive(false);if(e instanceof Error && e.message.includes('Change your temporary password')){setActive(true);setChange(true);}}finally{setLoading(false);}};
 useEffect(()=>{void refresh();},[]);
 const login=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{const r=await apiRequest<{must_change_password:boolean}>('/api/crm/login',{method:'POST',body:JSON.stringify({agent_code:code,password})});setActive(true);setChange(r.must_change_password);setPassword('');}catch(e){setError(e instanceof Error?e.message:'Sign-in failed');}finally{setBusy(false);}};
 const changePassword=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{await apiRequest('/api/crm/agent/change-password',{method:'POST',body:JSON.stringify({new_password:newPassword})});setChange(false);setNewPassword('');}catch(e){setError(e instanceof Error?e.message:'Could not update password');}finally{setBusy(false);}};
 const logout=async()=>{await apiRequest('/api/crm/logout',{method:'POST',body:'{}'}).catch(()=>{});setActive(false);setChange(false);};
 return <div className="boss-ambassador min-h-screen bg-slate-950 text-white px-4 py-6"><div className="max-w-5xl mx-auto space-y-5">
  <header className="flex justify-between items-center gap-2 flex-wrap"><div className="flex items-center gap-3"><div className="rounded-xl bg-teal-500 text-slate-950 font-black text-2xl p-3">B</div><div><h1 className="font-black text-xl flex items-center gap-2"><BriefcaseBusiness/> AGN Commission Partner Portal</h1><p className="text-xs text-teal-300">Referrals • Leads • Task assignments — no GPS attendance</p></div></div>
   <div className="flex gap-2 items-center"><ThemeToggle compact/>{active?<button className="border border-slate-600 rounded-xl p-2 text-sm" onClick={()=>void logout()}><LogOut className="inline w-4"/> Sign out</button>:<a href="/" className="text-sm text-teal-300"><ArrowLeft className="inline w-4"/> Employee login</a>}</div></header>
  {error&&<p role="alert" className="p-3 rounded-xl border border-rose-600 text-rose-200">{error}</p>}
  {loading?<p>Checking your account…</p>:!active?<form onSubmit={e=>void login(e)} className="max-w-md mx-auto bg-slate-900 rounded-2xl p-6 border border-slate-700 space-y-4"><h2 className="font-bold">Commission Agent Login</h2>
  <p className="text-sm text-slate-300">Use your AGN Commission ID and the password issued by a programme administrator.</p><label className="block text-xs">Commission ID<input required className={field} autoComplete="username" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/></label><label className="block text-xs">Password<PasswordInput required className={field} value={password} onChange={e=>setPassword(e.target.value)} showLabel="Commission password"/></label><button disabled={busy} className="bg-teal-500 text-slate-950 px-5 py-3 rounded-xl font-bold w-full">Sign in</button></form>:
  change?<form onSubmit={e=>void changePassword(e)} className="max-w-md mx-auto bg-slate-900 rounded-2xl p-6 border border-slate-700 space-y-4"><h2 className="font-bold">Change temporary password</h2><label className="block text-xs">New password (12+ characters)<PasswordInput required minLength={12} autoComplete="new-password" className={field} value={newPassword} onChange={e=>setNewPassword(e.target.value)} showLabel="new password"/></label><button disabled={busy} className="bg-teal-500 text-slate-950 px-5 py-3 rounded-xl font-bold">Save password</button></form>:
  <CrmWorkspace portal="commission"/>}
 </div></div>;
};
