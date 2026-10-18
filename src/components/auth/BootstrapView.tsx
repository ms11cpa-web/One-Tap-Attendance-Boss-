import React, { useState } from 'react';
import { apiRequest } from '../../api/client';
import { ShieldCheck, MapPin } from 'lucide-react';

export const BootstrapView: React.FC<{ onSuccess: (employeeId: string) => void }> = ({ onSuccess }) => {
  const [id, setId] = useState('ADMIN');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');
  const [office, setOffice] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [radius, setRadius] = useState('300');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const useLocation = () => {
    if (!navigator.geolocation) { setError('This device does not support geolocation. Enter coordinates manually.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(pos => {
      setLat(String(pos.coords.latitude));
      setLon(String(pos.coords.longitude));
      setLocating(false);
    }, () => { setError('Location unavailable. You may enter coordinates manually.'); setLocating(false); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      await apiRequest('/api/bootstrap/create', { method: 'POST', body: JSON.stringify({
        setup_secret: secret, employee_id: id, name, password, office_name: office,
        office_latitude: Number(lat), office_longitude: Number(lon), radius: Number(radius),
      }) });
      setSecret(''); setPassword(''); onSuccess(id.toUpperCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Initial setup failed');
    } finally { setBusy(false); }
  };
  const input = 'w-full rounded-xl bg-slate-950 text-slate-100 border border-slate-700 px-3 py-2.5 outline-none focus:border-teal-400';
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-4">
        <ShieldCheck className="text-teal-400 w-9 h-9" />
        <h1 className="text-2xl font-extrabold">Set up Boss</h1>
        <p className="text-sm text-slate-300">Create the first Super Admin securely. This form closes after the first administrator is created.</p>
        <p className="text-xs text-amber-300">First set a strong Cloudflare Worker secret named <strong>BOSS_BOOTSTRAP_SECRET</strong> (at least 24 random characters). Use that exact value below. Don't put the secret in GitHub.</p>
        {error && <p role="alert" className="text-sm text-rose-300 bg-rose-950/40 p-3 rounded-lg">{error}</p>}
        <label className="block text-sm">Super Admin Employee ID<input className={input} value={id} onChange={e=>setId(e.target.value)} required /></label>
        <label className="block text-sm">Your full name<input className={input} value={name} onChange={e=>setName(e.target.value)} required /></label>
        <label className="block text-sm">New admin password (12+ characters)<input className={input} type="password" autoComplete="new-password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} required /></label>
        <label className="block text-sm">Private setup secret<input className={input} type="password" autoComplete="off" value={secret} onChange={e=>setSecret(e.target.value)} required /></label>
        <div className="border-t border-slate-700 pt-3"><h2 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-teal-400"/> Office location</h2><p className="text-xs text-slate-400 mt-1">For accurate GPS attendance, capture location while physically at your office, or enter its coordinates.</p></div>
        <label className="block text-sm">Office name<input className={input} value={office} onChange={e=>setOffice(e.target.value)} placeholder="e.g., Main Office" required /></label>
        <button type="button" className="bg-slate-700 py-2 px-4 rounded-xl text-sm hover:bg-slate-600" disabled={locating} onClick={useLocation}>{locating?'Locating…':'Use this device location'}</button>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm">Latitude<input className={input} value={lat} onChange={e=>setLat(e.target.value)} type="number" step="any" required /></label><label className="text-sm">Longitude<input className={input} value={lon} onChange={e=>setLon(e.target.value)} type="number" step="any" required /></label></div>
        <label className="block text-sm">Attendance radius (metres)<input className={input} type="number" min={50} max={1500} value={radius} onChange={e=>setRadius(e.target.value)} required /></label>
        <p className="text-xs text-slate-400">Default hours: 11:00 AM to 7:00 PM (8 hours). You can adjust them later under Office Settings.</p>
        <button disabled={busy} className="w-full py-3 rounded-xl font-bold bg-teal-500 text-slate-950 disabled:opacity-50">{busy ? 'Creating…' : 'Create Super Admin and finish setup'}</button>
      </form>
    </div>
  );
};
