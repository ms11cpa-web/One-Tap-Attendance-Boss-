import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, KeyRound, Copy, LogOut } from 'lucide-react';

export const AccountSecurity: React.FC = () => {
  const { logout } = useAuth();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => apiRequest<{remaining: number}>('/api/auth/recovery/status')
    .then(d => setRemaining(d.remaining)).catch(() => setNotice('Could not check recovery-code status.'));
  useEffect(() => { refresh(); }, []);

  const generate = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setNotice('');
    try {
      const data = await apiRequest<{codes: string[]}>('/api/auth/recovery/generate', {
        method: 'POST', body: JSON.stringify({ current_password: password }),
      });
      setCodes(data.codes); setPassword(''); setRemaining(data.codes.length);
      setNotice('Save these codes in a password manager. Each code works once and will not be shown again. Generating new codes invalidates old ones.');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Recovery code generation failed'); }
    finally { setBusy(false); }
  };

  const logoutAll = async () => {
    if (!window.confirm('Log out every device, including this one?')) return;
    try { await apiRequest('/api/auth/logout-all', { method: 'POST', body: '{}' }); }
    finally { await logout(); }
  };

  return <section className="rounded-3xl border border-teal-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
    <div className="flex items-center gap-2 text-slate-900 font-bold"><ShieldCheck className="w-5 h-5 text-teal-600"/> Admin Account Recovery & Devices</div>
    <p className="text-sm text-slate-600">One-time recovery codes let you reset your admin password without email. {remaining === null ? 'Checking recovery codes…' : `${remaining} unused code(s) available.`}</p>
    {notice && <p role="status" className="text-xs rounded-lg bg-teal-50 p-3 text-slate-800">{notice}</p>}
    <form onSubmit={generate} className="flex flex-col sm:flex-row gap-2">
      <input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Confirm current password" className="flex-1 rounded-xl border border-slate-300 p-2.5 text-sm" />
      <button disabled={busy} type="submit" className="rounded-xl bg-teal-700 text-white px-4 py-2.5 text-xs font-semibold disabled:opacity-50"><KeyRound className="w-4 h-4 inline mr-1"/>{busy ? 'Generating…' : 'Generate 10 recovery codes'}</button>
    </form>
    {codes.length > 0 && <div className="rounded-xl bg-slate-50 p-4 border border-amber-300 space-y-2">
      <p className="font-bold text-xs text-amber-900">Copy these now; Boss cannot display them later.</p>
      <div className="grid sm:grid-cols-2 gap-2">{codes.map(code=><code key={code} className="text-xs break-all text-slate-900">{code}</code>)}</div>
      <button className="text-xs font-semibold text-teal-800 underline" onClick={()=>navigator.clipboard.writeText(codes.join('\n'))}><Copy className="w-3 h-3 inline"/> Copy all codes</button>
      <button className="text-xs block text-slate-600 underline" onClick={()=>setCodes([])}>I've saved my codes — hide them</button>
    </div>}
    <p className="text-xs text-slate-600">Remembered devices stay logged in while used, and expire after 20 consecutive days without activity. Normal sessions last 12 hours. A password reset revokes all sessions.</p>
    <button type="button" onClick={logoutAll} className="inline-flex items-center gap-2 border border-rose-300 px-3 py-2 rounded-xl text-rose-700 text-xs font-semibold"><LogOut className="w-4 h-4"/> Log out all my devices</button>
  </section>;
};
