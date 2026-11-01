import React, {useEffect,useState} from 'react';
import {apiRequest} from '../../api/client';

// Individual visa attempts stay separate from the student's permanent CRM identity.
type CaseRecord={id:string;destination_country:string;institution:string;programme:string;intake:string;application_status:string;visa_status:string;outcome_note:string};
type Life={relationship_status?:string;closed_reason?:string;education_level?:string;study_subject?:string;target_intake?:string;budget_band?:string;preferred_contact?:string};
const field='w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-950 focus:ring-2 focus:ring-teal-500 dark:border-slate-500 dark:bg-slate-950 dark:text-white';
const btn='rounded-lg bg-teal-700 px-3 py-2 font-semibold text-white hover:bg-teal-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300 text-sm disabled:opacity-50';
const appStatuses=['researching','preparing','submitted','under_review','conditional_offer','unconditional_offer','accepted','rejected','withdrawn'];
const visaStatuses=['not_started','documents_preparing','lodged','biometrics_pending','appointment_waiting','decision_pending','approved','refused','withdrawn','not_applicable'];
const label=(s:string)=>s.replaceAll('_',' ');
export const CrmCaseManager:React.FC<{leadId:string;profile:Life;onSaved:()=>Promise<void>|void}>=({leadId,profile,onSaved})=>{
 const [values,setValues]=useState({relationship_status:'lead',closed_reason:'',education_level:'',study_subject:'',target_intake:'',budget_band:'',preferred_contact:''});
 const [cases,setCases]=useState<CaseRecord[]>([]);
 const [draft,setDraft]=useState({destination_country:'',institution:'',programme:'',intake:''});
 const [msg,setMsg]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{setValues({relationship_status:profile.relationship_status||'lead',closed_reason:profile.closed_reason||'',education_level:profile.education_level||'',study_subject:profile.study_subject||'',target_intake:profile.target_intake||'',budget_band:profile.budget_band||'',preferred_contact:profile.preferred_contact||''});},[leadId,profile.relationship_status,profile.closed_reason,profile.education_level,profile.study_subject,profile.target_intake,profile.budget_band,profile.preferred_contact]);
 const load=async()=>{try{const x=await apiRequest<{applications:CaseRecord[]}>(`/api/crm/applications?lead_id=${encodeURIComponent(leadId)}`);setCases(x.applications);setError('');}catch(e){setError(e instanceof Error?e.message:'Unable to load applications');}};
 useEffect(()=>{void load();},[leadId]);
 const send=async(path:string,method:'PUT'|'POST',payload:unknown,success?:()=>void)=>{setBusy(true);setError('');setMsg('');try{await apiRequest('/api/crm/'+path,{method,body:JSON.stringify(payload)});setMsg('Saved.');success?.();await load();await onSaved();}catch(e){setError(e instanceof Error?e.message:'Unable to save');}finally{setBusy(false);}};
 return <section className="mt-4 border-t border-slate-300 pt-4 space-y-4 dark:border-slate-600">
  <h4 className="text-lg font-bold">Student relationship & application cases</h4>
  <p className="text-xs text-slate-600 dark:text-slate-300">One permanent lead ID; separate university and visa attempts. Closing a case never deletes its history or referrer.</p>
  {error&&<p role="alert" className="rounded-lg bg-rose-100 p-2 text-rose-900 dark:bg-rose-950 dark:text-rose-100">{error}</p>}{msg&&<p role="status" className="rounded-lg bg-teal-100 p-2 text-teal-950 dark:bg-teal-950 dark:text-teal-100">{msg}</p>}
  <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void send('profiles','PUT',{lead_id:leadId,...values});}}>
   <label className="text-xs font-semibold">Relationship
    <select className={field} value={values.relationship_status} onChange={e=>setValues(x=>({...x,relationship_status:e.target.value}))}>
     <option value="lead">Lead / nurturing</option><option value="active_client">Active client</option><option value="on_hold">Client on hold</option><option value="completed">Services completed</option><option value="lost">Lost / withdrawn</option><option value="closed">Closed</option>
    </select></label>
   {['lost','closed'].includes(values.relationship_status)&&<label className="text-xs font-semibold">Closure reason (required)<textarea className={field} required minLength={5} rows={2} value={values.closed_reason} onChange={e=>setValues(x=>({...x,closed_reason:e.target.value}))} placeholder="Not interested, financial constraints, visa refusal, etc."/></label>}
   {([['education_level','Highest qualification'],['study_subject','Subject / target course'],['target_intake','Target intake'],['budget_band','Estimated study budget'],['preferred_contact','Preferred contact method']] as const).map(([key,title])=><label key={key} className="text-xs font-semibold">{title}<input className={field} value={values[key]} onChange={e=>setValues(x=>({...x,[key]:e.target.value}))}/></label>)}
   <div className="flex items-end"><button className={btn} disabled={busy}>Save relationship & preferences</button></div>
  </form>
  <div className="space-y-2"><h5 className="font-bold">Applications & visa attempts</h5><p className="text-xs text-slate-600 dark:text-slate-300">A rejected university application or visa refusal affects this attempt, not the student's overall relationship. Record a reason when refused.</p>
   {cases.length===0?<p className="rounded-lg border border-slate-300 p-3 text-sm dark:border-slate-600">No application cases yet.</p>:cases.map(c=><CaseRow key={c.id} item={c} busy={busy} onSave={payload=>send('applications','PUT',{id:c.id,...payload})}/>)}
   {values.relationship_status!=='lead'&&values.relationship_status!=='lost'&&values.relationship_status!=='closed'&&<form className="grid gap-2 rounded-xl border border-slate-300 p-3 sm:grid-cols-2 dark:border-slate-600" onSubmit={e=>{e.preventDefault();void send('applications','POST',{lead_id:leadId,...draft},()=>setDraft({destination_country:'',institution:'',programme:'',intake:''}));}}>
    <h6 className="font-semibold sm:col-span-2">Open another university / visa case</h6>
    {([['destination_country','Country *'],['institution','University / institution'],['programme','Programme'],['intake','Intake']] as const).map(([key,title])=><label className="text-xs" key={key}>{title}<input className={field} required={key==='destination_country'} value={draft[key]} onChange={e=>setDraft(x=>({...x,[key]:e.target.value}))}/></label>)}
    <div><button disabled={busy} className={btn}>Add application case</button></div>
   </form>}
  </div>
 </section>;
};
const CaseRow:React.FC<{item:CaseRecord;busy:boolean;onSave:(payload:{application_status:string;visa_status:string;outcome_note:string})=>Promise<void>}>=({item,busy,onSave})=>{
 const [a,setA]=useState(item.application_status),[v,setV]=useState(item.visa_status),[note,setNote]=useState(item.outcome_note||'');
 useEffect(()=>{setA(item.application_status);setV(item.visa_status);setNote(item.outcome_note||'');},[item.id,item.application_status,item.visa_status,item.outcome_note]);
 return <form onSubmit={e=>{e.preventDefault();void onSave({application_status:a,visa_status:v,outcome_note:note});}} className="grid gap-2 rounded-xl border border-slate-300 p-3 sm:grid-cols-2 dark:border-slate-600">
  <p className="sm:col-span-2 font-semibold">{item.destination_country} · {item.institution||'Institution TBD'} · {item.programme||'Programme TBD'} · {item.intake||'Intake TBD'}</p>
  <label className="text-xs">University application<select className={field} value={a} onChange={e=>setA(e.target.value)}>{appStatuses.map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label>
  <label className="text-xs">Visa / immigration<select className={field} value={v} onChange={e=>setV(e.target.value)}>{visaStatuses.map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label>
  <label className="text-xs sm:col-span-2">Decision/outcome notes<textarea className={field} rows={2} required={a==='rejected'||v==='refused'} minLength={a==='rejected'||v==='refused'?5:undefined} value={note} onChange={e=>setNote(e.target.value)} placeholder="Explain rejection, refusal, or next steps"/></label>
  <div><button disabled={busy} className={btn}>Save case progress</button></div>
 </form>;
};
