import React,{useMemo,useState} from 'react';
import {FileUp,AlertTriangle,CheckCircle2} from 'lucide-react';
import {apiRequest} from '../../api/client';

type Field = 'full_name'|'phone'|'email'|'preferred_countries'|'referrer_display'|'notes';
type StudentRow=Record<Field,string>;
type Preview={accepted:number;total:number;issues:{row:number;reason:string}[]};
const fields:Record<Field,string>={full_name:'Student full name *',phone:'Phone / WhatsApp *',email:'Email',preferred_countries:'Preferred countries',referrer_display:'Source / referrer',notes:'Existing notes'};
const aliases:Record<Field,string[]>={
 full_name:['name','studentname','fullname','leadname','applicantname'],phone:['phone','mobilenumber','mobile','contactnumber','whatsapp','phonewhatsapp'],
 email:['email','emailaddress'],preferred_countries:['country','preferredcountry','destination','interestedcountry','countrychoice'],
 referrer_display:['source','referrer','leadsource','referredby','campaign'],notes:['notes','remark','remarks','comment','followupnotes']
};
const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const cls='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100';
function parseCsv(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){
  if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;
 }else if(c===','&&!quoted){row.push(value);value='';}
 else if((c==='\n'||c==='\r')&&!quoted){row.push(value);value='';if(row.some(x=>x.trim()))rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}
 else value+=c;}
 if(quoted)throw Error('CSV contains an unclosed quoted value.');
 row.push(value);if(row.some(x=>x.trim()))rows.push(row);
 return rows;
}
export function CrmImportPanel({onImported}:{onImported:()=>Promise<void>}){
 const [filename,setFilename]=useState(''),[table,setTable]=useState<string[][]>([]),[mapping,setMapping]=useState<Record<Field,number>>({full_name:-1,phone:-1,email:-1,preferred_countries:-1,referrer_display:-1,notes:-1});
 const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState('');
 const header=table[0]||[],rows=useMemo<StudentRow[]>(()=>table.slice(1).filter(r=>r.some(x=>x.trim())).map(r=>Object.fromEntries((Object.keys(fields) as Field[]).map(f=>[f,mapping[f]<0?'':(r[mapping[f]]||'').trim()])) as StudentRow),[table,mapping]);
 const load=async(file?:File)=>{setError('');setProgress('');setTable([]);if(!file)return;
  if(file.size>2*1024*1024){setError('Use files smaller than 2 MB. Split larger sheets into batches.');return;}
  try{let cells:string[][]=[];
   if(/\.csv$/i.test(file.name))cells=parseCsv((await file.text()).replace(/^\uFEFF/,''));
   else if(/\.xlsx$/i.test(file.name)){
    const XLSX=await import('xlsx');const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellFormula:false,cellHTML:false,bookVBA:false});
    cells=XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[0]],{header:1,raw:false,defval:''}).map(row=>row.map(c=>String(c??'')));
   }else throw Error('Choose a .csv or .xlsx file.');
   if(cells.length<2||cells.length>2001)throw Error('Use a header row and up to 2,000 student rows per file.');
   const head=cells[0].map(x=>x.trim());setFilename(file.name);setTable([head,...cells.slice(1)]);
   setMapping(Object.fromEntries((Object.keys(fields) as Field[]).map(f=>[f,head.findIndex(x=>aliases[f].includes(norm(x)))])) as Record<Field,number>);
  }catch(e){setError(e instanceof Error?e.message:'Could not read the spreadsheet');}
 };
 const importRows=async()=>{
  if(mapping.full_name<0||mapping.phone<0){setError('Map the student name and phone columns first.');return;}
  if(!rows.length){setError('No student rows to import.');return;}
  if(!window.confirm(`Preview and import up to ${rows.length} students? Existing phones will NOT be overwritten. Contact consent is ${consent?'confirmed for every row':'unverified for every row'}.`))return;
  setBusy(true);setError('');setProgress('Validating…');let count=0,skipped=0;const issues:string[]=[];
  try{for(let i=0;i<rows.length;i+=50){const batch=rows.slice(i,i+50);
   const pre=await apiRequest<Preview>('/api/crm/import',{method:'POST',body:JSON.stringify({rows:batch,filename,commit:false})});
   const bad=new Set(pre.issues.map(x=>x.row-1));
   pre.issues.forEach(x=>issues.push(`Sheet row ${i+x.row+1}: ${x.reason}`));skipped+=bad.size;
   const valid=batch.filter((_,ix)=>!bad.has(ix));
   if(valid.length){const done=await apiRequest<{imported:number}>('/api/crm/import',{method:'POST',body:JSON.stringify({rows:valid,filename,commit:true,consent_confirmed:consent})});count+=done.imported;}
   setProgress(`Imported ${count} · Skipped ${skipped} · Processed ${Math.min(rows.length,i+50)} / ${rows.length}`);
  }
  setProgress(`Complete: ${count} imported, ${skipped} skipped. ${consent?'First follow-ups begin after approval.':'Contact permission must be verified before outreach.'}`);
  if(issues.length)setError(`Rows requiring review (first 8): ${issues.slice(0,8).join(' | ')}`);
  await onImported();
  }catch(e){setError((e instanceof Error?e.message:'Import failed')+'. Previously completed batches may already be saved; retry skips existing phones.');}
  finally{setBusy(false);}
 };
 return <div className="rounded-2xl border-2 border-teal-500/50 bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-slate-100 space-y-3" aria-label="Import historical lead sheet">
  <h3 className="flex items-center gap-2 text-base font-bold"><FileUp size={18}/> Import historical AGN leads</h3>
  <p className="text-sm text-slate-700 dark:text-slate-300">Super Admin / HR only. Map existing columns; Boss previews duplicates and skips them without overwriting students. Only the first sheet of an Excel file is read. Maximum 2 MB / 2,000 rows per file.</p>
  <label className="block text-sm font-semibold">Choose CSV or Excel file <input type="file" accept=".csv,.xlsx" className={`${cls} mt-1`} disabled={busy} onChange={e=>void load(e.target.files?.[0])}/></label>
  {table.length>0&&<><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{(Object.keys(fields) as Field[]).map(f=><label key={f} className="text-sm font-medium">{fields[f]}<select className={`${cls} mt-1`} value={mapping[f]} disabled={busy} onChange={e=>setMapping(m=>({...m,[f]:Number(e.target.value)}))}><option value={-1}>Do not import</option>{header.map((h,i)=><option value={i} key={i}>{h||`Column ${i+1}`}</option>)}</select></label>)}</div>
  <p className="text-sm">{rows.length} student rows found. Preview:</p>
  <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b border-slate-300 dark:border-slate-600"><th className="p-2 text-left">Student</th><th className="p-2 text-left">Phone</th><th className="p-2 text-left">Country</th><th className="p-2 text-left">Referral</th></tr></thead><tbody>{rows.slice(0,5).map((r,i)=><tr key={i} className="border-b border-slate-200 dark:border-slate-700"><td className="p-2">{r.full_name||'Missing'}</td><td className="p-2">{r.phone||'Missing'}</td><td className="p-2">{r.preferred_countries||'—'}</td><td className="p-2">{r.referrer_display||'Historical sheet'}</td></tr>)}</tbody></table></div>
  <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={busy} className="mt-1"/><span><strong>Confirmed contact permission:</strong> I have verified that <em>every row</em> in this import has lawful permission to be contacted, with evidence available. Leave unticked if unsure; records will be imported but withheld from follow-up until consent is verified individually.</span></label>
  <button disabled={busy||mapping.full_name<0||mapping.phone<0} type="button" className="rounded-xl bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50 dark:bg-teal-400 dark:text-slate-950" onClick={()=>void importRows()}>{busy?'Importing…':'Preview duplicates & import'}</button></>}
  {progress&&<p className="flex gap-2 items-center text-sm" role="status"><CheckCircle2 size={16}/>{progress}</p>}
  {error&&<p className="flex gap-2 items-start text-sm text-rose-800 dark:text-rose-300" role="alert"><AlertTriangle size={16}/>{error}</p>}
 </div>;
}
