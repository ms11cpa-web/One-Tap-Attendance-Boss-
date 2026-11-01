import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';
import type { User, AttendanceRecord } from '../../types';
import { X, ShieldCheck } from 'lucide-react';

interface Props { onClose: () => void; onSaved: () => void }
const dhakaToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());

export const SuperAdminAttendanceAdjust: React.FC<Props> = ({onClose,onSaved}) => {
  const [employees,setEmployees]=useState<User[]>([]);
  const [employeeId,setEmployeeId]=useState('');
  const [date,setDate]=useState(dhakaToday());
  const [inTime,setInTime]=useState('');
  const [outTime,setOutTime]=useState('');
  const [reason,setReason]=useState('');
  const [loaded,setLoaded]=useState<AttendanceRecord|null>(null);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [confirmed,setConfirmed]=useState(false);

  useEffect(()=>{
    let alive=true;
    apiRequest<{employees:User[]}>('/api/employees').then(r=>{
      if(alive) setEmployees((r.employees||[]).filter(e=>e.role!=='super_admin').sort((a,b)=>a.employee_id.localeCompare(b.employee_id,undefined,{numeric:true})));
    }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Could not load employees.');});
    return ()=>{alive=false};
  },[]);
  useEffect(()=>{
    setInTime('');setOutTime('');setReason('');setConfirmed(false);setLoaded(null);setError('');
    if(!employeeId||!date)return;
    let alive=true;setLoading(true);
    apiRequest<{record:AttendanceRecord|null}>(`/api/admin/attendance/record?employee_id=${encodeURIComponent(employeeId)}&date=${encodeURIComponent(date)}`)
      .then(r=>{if(alive){setLoaded(r.record);setInTime(r.record?.in_time||'');setOutTime(r.record?.out_time||'');}})
      .catch(e=>{if(alive)setError(e instanceof Error?e.message:'Could not load attendance record.')})
      .finally(()=>{if(alive)setLoading(false)});
    return ()=>{alive=false};
  },[employeeId,date]);

  const save = async(event:React.FormEvent)=>{
    event.preventDefault();if(saving||loading||!confirmed)return;
    setSaving(true);setError('');
    try{
      await apiRequest('/api/admin/attendance/adjust',{method:'PUT',body:JSON.stringify({
        employee_id:employeeId,attendance_date:date,in_time:inTime,out_time:outTime||null,reason
      })});
      onSaved();onClose();
    }catch(e){setError(e instanceof Error?e.message:'Adjustment failed.')}finally{setSaving(false)}
  };
  return <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="admin-adjust-title">
    <div className="w-full max-w-lg rounded-2xl bg-white p-5 text-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between gap-3 items-center mb-4">
        <h2 id="admin-adjust-title" className="flex items-center gap-2 text-base font-bold"><ShieldCheck className="w-5 h-5 text-teal-700"/> Super Admin — Adjust Attendance</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-slate-100"><X className="w-5 h-5"/></button>
      </div>
      <p className="mb-4 text-xs text-slate-600">Restore a forgotten IN or OUT, or correct an earlier date. Changes are logged. Adjusted times are not GPS-verified.</p>
      {error && <p role="alert" className="mb-3 rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800">{error}</p>}
      <form onSubmit={save} className="space-y-3 text-sm">
        <label className="block font-semibold">Employee
          <select required value={employeeId} onChange={e=>setEmployeeId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-slate-900">
            <option value="">Select employee ID</option>
            {employees.map(e=><option key={e.id} value={e.employee_id}>{e.employee_id} — {e.name}</option>)}
          </select>
        </label>
        <label className="block font-semibold">Attendance date
          <input type="date" required max={dhakaToday()} value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"/>
        </label>
        {loading ? <p className="text-slate-500">Loading existing record…</p> : <div className="rounded-xl bg-slate-100 p-3 text-xs text-slate-700">
          {loaded ? `Existing record: IN ${loaded.in_time||'Missing'} / OUT ${loaded.out_time||'Missing'} / ${loaded.status}` : 'No record for this employee and date.'}
        </div>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block font-semibold">Correct IN
            <input required type="time" value={inTime} onChange={e=>setInTime(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5" />
          </label>
          <label className="block font-semibold">Correct OUT (optional)
            <input type="time" value={outTime} onChange={e=>setOutTime(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5" />
          </label>
        </div>
        <p className="text-xs text-slate-600">Leave OUT blank only when it is genuinely missing. Boss will keep that day marked Missing OUT until corrected.</p>
        <label className="block font-semibold">Reason for adjustment (required)
          <textarea required minLength={10} maxLength={2000} rows={3} value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5" placeholder="Explain the evidence and reason for this manual correction" />
        </label>
        <label className="flex gap-2 items-start text-xs text-slate-700"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-0.5"/>
          I confirm these times have been verified. Changes will be recorded in the audit log.</label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2">Cancel</button>
          <button type="submit" disabled={saving||loading||!employeeId||!inTime||!confirmed||reason.trim().length<10} className="rounded-xl bg-teal-700 px-4 py-2 font-bold text-white disabled:opacity-50">{saving?'Saving…':'Save Adjustment'}</button>
        </div>
      </form>
    </div>
  </div>;
};
