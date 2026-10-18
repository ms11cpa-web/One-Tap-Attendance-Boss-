import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../api/client';
import { formatMinutesToHumanDuration, formatTime12FromHHMM } from '../../server/utils/time';
import {
  Users,
  UserCheck,
  Building,
  Laptop,
  Palmtree,
  UserX,
  Clock,
  AlertCircle,
  FileCheck2,
  CalendarCheck2,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

interface DashboardData {
  personal: {
    officeDays: number;
    remoteDays: number;
    lateDays: number;
    totalMinutes: number;
    leaveBalances: Array<{
      name: string;
      allocated_days: number;
      used_days: number;
      pending_days: number;
      color: string;
    }>;
  };
  company?: {
    totalEmployees: number;
    presentToday: number;
    officeAttendees: number;
    remoteAttendees: number;
    lateArrivals: number;
    onLeave: number;
    absentToday: number;
    missingCheckouts: number;
    pendingApprovals: {
      leave: number;
      remote: number;
      corrections: number;
      total: number;
    };
  };
}

interface DashboardViewProps {
  onNavigateTab: (tab: any) => void;
  onOpenLeaveModal?: () => void;
  onOpenRemoteModal?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateTab,
  onOpenLeaveModal,
  onOpenRemoteModal,
}) => {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    try {
      const res = await apiRequest<DashboardData>('/api/dashboard/summary');
      setData(res);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin text-teal-600 mb-3" />
        <p className="text-sm font-medium">Loading workforce dashboard...</p>
      </div>
    );
  }

  const isAdminOrManager = user?.role !== 'employee';
  const company = data?.company;
  const personal = data?.personal;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 text-teal-400 text-xs font-bold border border-teal-500/20 mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Smart Workforce Management</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome back, {user?.name}
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-xl">
              {isAdminOrManager
                ? `Operational overview for ${user?.team}. Real-time attendance, geofenced validations, and pending staff requests.`
                : `Logged in as ${user?.designation} (${user?.employee_id}). Your monthly working summary and quick actions.`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigateTab('attendance')}
              className="px-5 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-teal-600/30 transition cursor-pointer flex items-center gap-2"
            >
              <Clock className="w-4 h-4" />
              <span>One-Tap Attendance</span>
            </button>
          </div>
        </div>
      </div>

      {/* Admin / Manager KPI Summary Cards */}
      {isAdminOrManager && company && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Company-wide Overview (Today)
            </h2>
            <button
              onClick={fetchDashboard}
              className="text-xs text-slate-500 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
            {/* Active Employees */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-semibold">Active Staff</span>
                <Users className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl font-black text-slate-900">{company.totalEmployees}</div>
              <p className="text-[10px] text-slate-400 mt-1">Total active headcount</p>
            </div>

            {/* Present Today */}
            <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs">
              <div className="flex items-center justify-between text-emerald-700 mb-2">
                <span className="text-[11px] font-semibold">Present Today</span>
                <UserCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-emerald-600">{company.presentToday}</div>
              <p className="text-[10px] text-emerald-700/80 mt-1">
                {company.totalEmployees > 0
                  ? `${Math.round((company.presentToday / company.totalEmployees) * 100)}% attendance rate`
                  : '0%'}
              </p>
            </div>

            {/* Office Attendees */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-semibold">Office Attendees</span>
                <Building className="w-4 h-4 text-teal-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{company.officeAttendees}</div>
              <p className="text-[10px] text-teal-600 font-medium mt-1">GPS Verified Geofence</p>
            </div>

            {/* Remote Attendees */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-semibold">Remote Attendees</span>
                <Laptop className="w-4 h-4 text-cyan-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{company.remoteAttendees}</div>
              <p className="text-[10px] text-cyan-600 font-medium mt-1">Approved remote dates</p>
            </div>

            {/* On Leave Today */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-semibold">On Leave</span>
                <Palmtree className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{company.onLeave}</div>
              <p className="text-[10px] text-purple-600 font-medium mt-1">Approved leave records</p>
            </div>

            {/* Absent Today */}
            <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-xs">
              <div className="flex items-center justify-between text-rose-700 mb-2">
                <span className="text-[11px] font-semibold">Absent Today</span>
                <UserX className="w-4 h-4 text-rose-500" />
              </div>
              <div className="text-2xl font-black text-rose-600">{company.absentToday}</div>
              <p className="text-[10px] text-rose-500/80 mt-1">Unexcused workdays</p>
            </div>

            {/* Late Arrivals */}
            <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-xs">
              <div className="flex items-center justify-between text-amber-700 mb-2">
                <span className="text-[11px] font-semibold">Late Arrivals</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-black text-amber-600">{company.lateArrivals}</div>
              <p className="text-[10px] text-amber-700/80 mt-1">Arrived past 11:15 AM</p>
            </div>

            {/* Missing Checkouts */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-semibold">Missing OUT</span>
                <AlertCircle className="w-4 h-4 text-orange-500" />
              </div>
              <div className="text-2xl font-black text-orange-600">{company.missingCheckouts}</div>
              <p className="text-[10px] text-slate-400 mt-1">Currently clocked in</p>
            </div>

            {/* Pending Approvals */}
            <button
              onClick={() => onNavigateTab('requests')}
              className="bg-teal-50 p-4 rounded-2xl border border-teal-200 text-left hover:bg-teal-100/70 transition cursor-pointer shadow-xs col-span-2 sm:col-span-1"
            >
              <div className="flex items-center justify-between text-teal-800 mb-2">
                <span className="text-[11px] font-bold">Pending Approvals</span>
                <FileCheck2 className="w-4 h-4 text-teal-700" />
              </div>
              <div className="text-2xl font-black text-teal-900">
                {company.pendingApprovals.total}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-teal-700 font-semibold mt-1">
                <span>{company.pendingApprovals.leave} leave</span> •
                <span>{company.pendingApprovals.remote} remote</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Employee Personal Monthly Summary */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {isAdminOrManager ? 'Your Personal Monthly Summary' : 'Your Attendance Summary'}
            </h2>
            <p className="text-xs text-slate-500">October 2026 performance</p>
          </div>
          <button
            onClick={() => onNavigateTab('calendar')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 cursor-pointer"
          >
            <span>View Calendar</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
              Office Days
            </span>
            <span className="text-2xl font-black text-slate-900">{personal?.officeDays || 0}</span>
            <span className="text-[11px] text-teal-700 block mt-1 font-medium">On-site attendance</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
              Remote Days
            </span>
            <span className="text-2xl font-black text-slate-900">{personal?.remoteDays || 0}</span>
            <span className="text-[11px] text-cyan-600 block mt-1 font-medium">Approved remote</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
              Late Days
            </span>
            <span className="text-2xl font-black text-amber-600">{personal?.lateDays || 0}</span>
            <span className="text-[11px] text-amber-700/80 block mt-1 font-medium">Past grace period</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
              Total Hours
            </span>
            <span className="text-2xl font-black text-teal-800">
              {formatMinutesToHumanDuration(personal?.totalMinutes || 0)}
            </span>
            <span className="text-[11px] text-slate-400 block mt-1 font-medium">Logged presence</span>
          </div>
        </div>

        {/* Leave Balances Quota Pills */}
        {personal?.leaveBalances && personal.leaveBalances.length > 0 && (
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Leave Allowances (2026)
              </span>
              <button
                onClick={onOpenLeaveModal}
                className="text-xs font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
              >
                + Apply Leave
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {personal.leaveBalances.map(b => {
                const remaining = Math.max(0, b.allocated_days - b.used_days - b.pending_days);
                return (
                  <div key={b.name} className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[11px] font-bold text-slate-700 truncate">{b.name}</p>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-lg font-black text-slate-900">{remaining}</span>
                      <span className="text-[10px] text-slate-400">/ {b.allocated_days}d left</span>
                    </div>
                    {b.pending_days > 0 && (
                      <span className="text-[10px] text-amber-600 block mt-0.5">
                        {b.pending_days}d pending approval
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
