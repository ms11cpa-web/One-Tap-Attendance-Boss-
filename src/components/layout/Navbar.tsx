import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { ThemeToggle } from './ThemeToggle';
import { Clock, User as UserIcon, LogOut, KeyRound, Shield, Check, X, Building2 } from 'lucide-react';
import { PasswordInput } from '../auth/PasswordInput';
import { apiRequest } from '../../api/client';

export const Navbar: React.FC<{ onOpenMobileMenu?: () => void }> = () => {
  const { user, settings, logout } = useAuth();
  const [dhakaTime, setDhakaTime] = useState<string>('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      try {
        const timeStr = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Dhaka',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }).format(new Date());
        setDhakaTime(timeStr);
      } catch {
        setDhakaTime(new Date().toLocaleTimeString());
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');

    if (newPassword !== confirmPassword) {
      setPwdError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPwdError('Password must be at least 6 characters.');
      return;
    }

    setPwdLoading(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setPwdSuccess('Password changed successfully.');
      setTimeout(() => {
        setShowPasswordModal(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPwdSuccess('');
      }, 1500);
    } catch (err: unknown) {
      setPwdError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPwdLoading(false);
    }
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'super_admin':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">Super Admin</span>;
      case 'hr_admin':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">HR Admin</span>;
      case 'team_manager':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Manager</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">Employee</span>;
    }
  };

  return (
    <>
      <header className="boss-chrome sticky top-0 z-40 h-16 bg-slate-900 border-b border-slate-800 text-white flex items-center justify-between px-4 sm:px-6 shadow-sm">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-slate-950 font-black text-lg shadow-sm">
            B
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-white">Boss</span>
              <span className="hidden sm:inline-block text-[11px] font-medium text-teal-400/90 tracking-wide uppercase px-1.5 py-0.5 rounded bg-teal-950/60 border border-teal-800/40">
                Workforce
              </span>
            </div>
            <p className="hidden md:block text-[10px] text-slate-400 leading-none">
              {settings?.company_name || 'Boss Technologies Ltd'}
            </p>
          </div>
        </div>

        {/* Live Dhaka Clock & Office Info */}
        <div className="hidden lg:flex items-center gap-4 text-xs text-slate-300">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/70 border border-slate-700/60">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium text-slate-300">{settings?.office_name || 'Dhaka HQ'}</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/70 border border-slate-700/60">
            <Clock className="w-3.5 h-3.5 text-teal-400" />
            <span className="font-mono font-medium text-white tracking-wide">{dhakaTime || '11:00:00 AM'}</span>
            <span className="text-[10px] text-slate-400">Dhaka (BST)</span>
          </div>
        </div>

        {/* Right actions: PWA Install + Profile */}
        <div className="flex items-center gap-3">
          <PWAInstallButton />
          <ThemeToggle compact />

          {/* User profile dropdown button */}
          <div className="relative">
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center gap-2.5 p-1 sm:px-2.5 sm:py-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer border border-transparent hover:border-slate-700"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-teal-400 font-bold text-xs">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-semibold text-white leading-tight flex items-center gap-1.5">
                  {user?.name}
                  {getRoleBadge(user?.role)}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {user?.employee_id} • {user?.team}
                </div>
              </div>
            </button>

            {/* Dropdown Menu */}
            {showUserDropdown && (
              <div
                className="absolute right-0 mt-2 w-56 rounded-2xl bg-white text-slate-800 shadow-2xl border border-slate-100 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                onClick={() => setShowUserDropdown(false)}
              >
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-900">{user?.name}</p>
                  <p className="text-[11px] text-slate-500 font-mono">{user?.employee_id}</p>
                  <p className="text-[11px] text-teal-700 font-medium mt-0.5">{user?.designation}</p>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => setShowPasswordModal(true)}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition cursor-pointer text-left"
                  >
                    <KeyRound className="w-4 h-4 text-slate-400" />
                    <span>Change Password</span>
                  </button>
                </div>

                <div className="border-t border-slate-100 py-1">
                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 transition cursor-pointer text-left font-medium"
                  >
                    <LogOut className="w-4 h-4 text-rose-500" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Change Password</h3>
              </div>
              <button
                onClick={() => setShowPasswordModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {pwdError && (
              <div className="mb-3 p-2.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-medium">
                {pwdError}
              </div>
            )}

            {pwdSuccess && (
              <div className="mb-3 p-2.5 rounded-lg bg-teal-50 text-teal-700 text-xs font-medium flex items-center gap-1.5">
                <Check className="w-4 h-4 text-teal-600" />
                {pwdSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Current Password
                </label>
                <PasswordInput

                  required
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password
                </label>
                <PasswordInput

                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  placeholder="Minimum 6 characters"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <PasswordInput

                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  placeholder="Repeat new password"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {pwdLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
