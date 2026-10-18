import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { Lock, User, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await login(employeeId, password);
      if (!res.success) {
        setError(res.error || 'Invalid credentials');
        setLoading(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please retry.');
      setLoading(false);
    }
  };

  const handleDemoFill = (id: string) => {
    setEmployeeId(id);
    setPassword('Password@123');
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 sm:px-6 relative overflow-hidden select-none">
      {/* Background Ambient Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Floating PWA Install button in header */}
      <div className="absolute top-4 right-4">
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

          <form onSubmit={handleSubmit} className="space-y-4">
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

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-teal-500/20 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              <span>{loading ? 'Authenticating...' : 'Sign In to Boss'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Demo Access Bar */}
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center mb-2.5">
              Instant Role Sign-in (Demo Data)
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => handleDemoFill('EMP001')}
                className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition text-left cursor-pointer"
              >
                <span className="font-bold block text-amber-400">Super Admin</span>
                <span className="text-[10px] font-mono text-slate-500">EMP001</span>
              </button>

              <button
                type="button"
                onClick={() => handleDemoFill('EMP002')}
                className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition text-left cursor-pointer"
              >
                <span className="font-bold block text-purple-400">HR Admin</span>
                <span className="text-[10px] font-mono text-slate-500">EMP002</span>
              </button>

              <button
                type="button"
                onClick={() => handleDemoFill('EMP003')}
                className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition text-left cursor-pointer"
              >
                <span className="font-bold block text-blue-400">Manager</span>
                <span className="text-[10px] font-mono text-slate-500">EMP003</span>
              </button>

              <button
                type="button"
                onClick={() => handleDemoFill('EMP004')}
                className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition text-left cursor-pointer"
              >
                <span className="font-bold block text-teal-400">Employee</span>
                <span className="text-[10px] font-mono text-slate-500">EMP004</span>
              </button>
            </div>
            <p className="text-[10px] text-center text-slate-500 mt-2 font-mono">
              Default password: <span className="text-slate-400">Password@123</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-[11px] text-slate-500">
          Boss Workforce System • Asia/Dhaka Timezone • Cloudflare D1
        </div>
      </div>
    </div>
  );
};
