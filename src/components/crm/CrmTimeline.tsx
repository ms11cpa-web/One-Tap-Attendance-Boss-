import React,{useEffect,useState} from 'react';
import {apiRequest} from '../../api/client';
type Entry={id:string;channel?:string;notes?:string;note?:string;action?:string;new_value?:string;created_at?:number;contacted_at?:number};
type Page={followups:Entry[];history:Entry[];followups_total:number;history_total:number;page:number};
const time=(n?:number)=>n?new Date(n).toLocaleString('en-BD',{timeZone:'Asia/Dhaka'}):'—';
export const CrmTimeline:React.FC<{leadId:string}>=({leadId})=>{
 const [page,setPage]=useState(1),[data,setData]=useState<Page|null>(null),[err,setErr]=useState('');
 useEffect(()=>{setPage(1);},[leadId]);
 useEffect(()=>{let active=true;void apiRequest<Page>(`/api/crm/timeline?lead_id=${encodeURIComponent(leadId)}&page=${page}`)
  .then(d=>{if(active){setData(d);setErr('');}}).catch(e=>{if(active)setErr(e instanceof Error?e.message:'History unavailable');});return()=>{active=false;};},[leadId,page]);
 return <section className="space-y-2"><h4 className="font-semibold">Complete follow-up & audit history</h4>
  {err&&<p role="alert" className="text-rose-700 dark:text-rose-300 text-sm">{err}</p>}
  <div className="grid gap-3 sm:grid-cols-2">
   <div className="space-y-2"><h5 className="text-sm font-semibold">Contact activity ({data?.followups_total??0})</h5>
    {data?.followups.map(e=><article key={e.id} className="rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600"><span className="text-xs text-slate-600 dark:text-slate-300">{e.channel} · {time(e.contacted_at)}</span><p className="whitespace-pre-wrap break-words" dir="auto">{e.notes}</p></article>)}
   </div>
   <div className="space-y-2"><h5 className="text-sm font-semibold">Status and edits ({data?.history_total??0})</h5>
    {data?.history.map(e=><article key={e.id} className="rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600"><span className="text-xs text-slate-600 dark:text-slate-300">{e.action} · {time(e.created_at)}</span><p className="whitespace-pre-wrap break-words" dir="auto">{e.note}</p>{e.new_value&&<details><summary className="cursor-pointer text-sm text-teal-800 dark:text-teal-200">View recorded change</summary><pre className="whitespace-pre-wrap break-all text-xs">{e.new_value}</pre></details>}</article>)}
   </div>
  </div>
  <div className="flex gap-3 items-center text-sm"><span>Page {page}</span><button type="button" disabled={page===1} className="rounded-lg border border-slate-400 px-3 py-2 disabled:opacity-40" onClick={()=>setPage(x=>Math.max(1,x-1))}>Previous</button><button type="button" disabled={!data||page*50>=Math.max(data.followups_total,data.history_total)} className="rounded-lg border border-slate-400 px-3 py-2 disabled:opacity-40" onClick={()=>setPage(x=>x+1)}>Next</button></div>
 </section>;
};
