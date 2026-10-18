import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { downloadExcelReport } from '../../api/client';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileText,
  BarChart3,
  Layers,
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState('2026-10-01');
  const [endDate, setEndDate] = useState('2026-10-31');
  const [team, setTeam] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isAdminOrManager = user?.role !== 'employee';

  const handleDownload = async () => {
    setDownloading(true);
    setStatusMsg(null);
    try {
      await downloadExcelReport({
        startDate,
        endDate,
        team,
      });
      setStatusMsg({
        type: 'success',
        message: 'Boss Excel attendance workbook generated and downloaded successfully.',
      });
    } catch (err: unknown) {
      setStatusMsg({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to export report.',
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
          Executive Reports & Excel Export
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Generate production-grade multi-sheet Excel (.xlsx) workbooks for payroll, attendance audits, and leave records.
        </p>
      </div>

      {/* Main Download Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Custom Attendance Workbook (.xlsx)</h2>
            <p className="text-xs text-slate-500">
              Includes 6 sheets: Daily Attendance, Monthly Summary, Leave Applications, Remote Work, Corrections, and Holidays.
            </p>
          </div>
        </div>

        {/* Filter inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>

          {isAdminOrManager && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
              <select
                value={team}
                onChange={e => setTeam(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
              >
                <option value="">All Departments</option>
                <option value="Software Engineering">Software Engineering</option>
                <option value="Product & Design">Product & Design</option>
                <option value="Human Resources">Human Resources</option>
                <option value="Executive Leadership">Executive Leadership</option>
              </select>
            </div>
          )}
        </div>

        {statusMsg && (
          <div
            className={`p-4 rounded-2xl text-xs font-medium flex items-center gap-2.5 ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <span>{statusMsg.message}</span>
          </div>
        )}

        <div className="pt-2">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg transition cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? 'Processing & Compiling XLSX...' : 'Download Official Excel Report (.xlsx)'}</span>
          </button>
        </div>
      </div>

      {/* Report Features Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
            <Layers className="w-4 h-4" />
            <span>Real Native XLSX Format</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Outputs authentic binary Excel XML spreadsheets compatible with Microsoft Excel, Apple Numbers, and Google Sheets, never fake CSV renames.
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-teal-700 font-bold text-xs">
            <BarChart3 className="w-4 h-4" />
            <span>Accurate Absence Logic</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Strictly respects joining dates, weekends, public holidays, and half days. Zero false absence inflation or duplicate date counts.
          </p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-purple-700 font-bold text-xs">
            <FileText className="w-4 h-4" />
            <span>Payroll-Ready Hours</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Automatically calculates raw extra time, shortfall, late arrival minutes, and verified elapsed presence in human and numerical formats.
          </p>
        </div>
      </div>
    </div>
  );
};
