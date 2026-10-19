import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { ThemeToggle } from '../layout/ThemeToggle';
import { Lock, User, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { BootstrapView } from './BootstrapView';
import { apiRequest } from '../../api/client';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState('');
  const [error, setError] = useState('');
  const [setupState, setSetupState] = useState<'loading'|'migrate'|'bootstrap'|'login'>('loading');
  useEffect(() => {
    fetch('/api/bootstrap/status', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Cannot check database setup status.');
        return response.json();
      })
      .then((status) => setSetupState(!status.database_ready ? 'migrate' : status.needs_setup ? 'bootstrap' : 'login'))
      .catch(() => setSetupState('migrate'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await login(employeeId, password, rememberDevice);
      if (!res.success) {
        setError(res.error || 'Invalid credentials');
        setLoading(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please retry.');
      setLoading(false);
    }
  };

  const submitRecovery = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/recovery/reset', { method: 'POST', body: JSON.stringify({ employee_id: employeeId, recovery_code: recoveryCode, new_password: recoveryPassword }) });
      setRecoverySuccess(res.message); setRecoveryPassword(''); setRecoveryCode(''); setRecoveryMode(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Recovery failed'); }
    finally { setLoading(false); }
  };

  if (setupState === 'loading') return <div className="min-h-screen bg-slate-950 text-teal-300 flex items-center justify-center">Checking database…</div>;
  if (setupState === 'migrate') return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md p-7 bg-slate-900 border border-slate-800 rounded-2xl">
        <h1 className="text-xl font-bold text-white mb-3">Boss needs database setup</h1>
        <p className="text-slate-300 text-sm">Apply the existing D1 SQL migrations to boss-production-db, then refresh this page. Employee data will not be deleted.</p>
        <code className="block mt-4 break-words text-teal-300 text-xs">npx wrangler d1 migrations apply DB --remote</code>
      </div>
    </div>
  );
  if (setupState === 'bootstrap') return <BootstrapView onSuccess={(id) => { setEmployeeId(id); setSetupState('login'); }} />;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 sm:px-6 relative overflow-hidden select-none">
      {/* Background Ambient Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Floating PWA Install button in header */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ThemeToggle compact />
        <PWAInstallButton />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-teal-400 to-emerald-600 text-slate-950 font-black text-3xl shadow-xl shadow-teal-500/20 mb-4 ring-4 ring-slate-800/80">
            B
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Boss</h1>
          <p className="text-teal-400 font-semibold text-xs tracking-wider uppercase mt-1">
            Smart Workforce Management
          </p>
          <p className="text-slate-400 text-xs mt-2 max-w-xs mx-auto">
            One-tap GPS attendance, leave administration, and workforce governance.
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/90 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl">
          {error && (
            <div className="mb-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {recoverySuccess && <p className="text-emerald-300 text-xs mb-3">{recoverySuccess}</p>}
          <form onSubmit={recoveryMode ? submitRecovery : handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Employee ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. EMP001"
                  value={employeeId}
                  onChange={e => setEmployeeId(e.target.value.toUpperCase())}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs font-mono font-bold text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition"
                />
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              </div>
            </div>

            {!recoveryMode && <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(visible => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded-md cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>}

            {recoveryMode && <>
              <label className="block text-xs text-slate-300">One-time admin recovery code<input required value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value)} className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2.5 text-white" /></label>
              <div>
                <label htmlFor="boss-recovery-password" className="block text-xs text-slate-300 mb-1">New password (12+ characters)</label>
                <div className="relative">
                  <input
                    id="boss-recovery-password"
                    required
                    type={showRecoveryPassword ? 'text' : 'password'}
                    minLength={12}
                    autoComplete="new-password"
                    value={recoveryPassword}
                    onChange={e => setRecoveryPassword(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 pr-12 py-2.5 text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRecoveryPassword(visible => !visible)}
                    aria-label={showRecoveryPassword ? 'Hide recovery password' : 'Show recovery password'}
                    aria-pressed={showRecoveryPassword}
                    title={showRecoveryPassword ? 'Hide recovery password' : 'Show recovery password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded-md cursor-pointer"
                  >
                    {showRecoveryPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>}
            {!recoveryMode && <label className="flex gap-2 items-center text-xs text-slate-300 cursor-pointer"><input type="checkbox" checked={rememberDevice} onChange={e=>setRememberDevice(e.target.checked)} /> Remember this device (logout after 20 days of inactivity)</label>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-teal-500/20 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              <span>{loading ? 'Working...' : recoveryMode ? 'Reset Admin Password' : 'Sign In to Boss'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button type="button" onClick={()=>{setRecoveryMode(v=>!v);setError('');setRecoverySuccess('');}} className="text-teal-300 text-xs hover:underline block mx-auto">{recoveryMode ? 'Back to login' : 'Forgot admin password? Use recovery code'}</button>
          </form>

        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-[11px] text-slate-500">
          Boss Workforce System • Asia/Dhaka Timezone • Cloudflare D1
        </div>
      </div>
    </div>
  );
};
