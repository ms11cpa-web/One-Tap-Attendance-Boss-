import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, downloadExcelReport } from '../../api/client';
import { AttendanceRecord } from '../../types';
import { formatTime12FromHHMM, formatMinutesToHumanDuration } from '../../server/utils/time';
import {
  FileSpreadsheet,
  Search,
  Filter,
  Calendar,
  Building,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
} from 'lucide-react';

export const AttendanceHistoryView: React.FC = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [searchEmp, setSearchEmp] = useState('');

  const isAdminOrManager = user?.role !== 'employee';

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (selectedTeam) params.set('team', selectedTeam);
      if (selectedStatus) params.set('status', selectedStatus);

      const res = await apiRequest<{ records: AttendanceRecord[] }>(
        `/api/attendance/history?${params.toString()}`
      );
      setRecords(res.records || []);
    } catch (err) {
      console.error('Failed to fetch attendance records:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedTeam, selectedStatus]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      await downloadExcelReport({
        startDate,
        endDate,
        team: selectedTeam,
        status: selectedStatus,
      });
    } catch (err: unknown) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  const filteredRecords = records.filter(r => {
    if (!searchEmp) return true;
    const term = searchEmp.toLowerCase();
    const nameMatch = r.employee_name?.toLowerCase().includes(term);
    const idMatch = r.employee_id?.toLowerCase().includes(term);
    return nameMatch || idMatch;
  });

  return (
    <div className="space-y-6">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Attendance History
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {isAdminOrManager
              ? 'Comprehensive company attendance log with GPS geofence audit details.'
              : 'Your complete personal check-in and check-out history.'}
          </p>
        </div>

        <button
          onClick={handleExportExcel}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition cursor-pointer disabled:opacity-50"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>{exporting ? 'Generating Excel...' : 'Export Excel (.xlsx)'}</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5 text-teal-600" />
          <span>Filters</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Team Filter (Admin only) */}
          {isAdminOrManager && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Team</label>
              <select
                value={selectedTeam}
                onChange={e => setSelectedTeam(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
              >
                <option value="">All Teams</option>
                <option value="Software Engineering">Software Engineering</option>
                <option value="Product & Design">Product & Design</option>
                <option value="Human Resources">Human Resources</option>
                <option value="Executive Leadership">Executive Leadership</option>
              </select>
            </div>
          )}

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Status</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
            >
              <option value="">All Statuses</option>
              <option value="present">Present (On-time)</option>
              <option value="late">Late Arrival</option>
              <option value="half_day">Half Day</option>
              <option value="missing_out">Missing OUT</option>
            </select>
          </div>

          {/* Search by Name / ID */}
          {isAdminOrManager && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Search Staff</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Name or ID..."
                  value={searchEmp}
                  onChange={e => setSearchEmp(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin text-teal-600 mx-auto mb-2" />
            <p className="text-xs">Loading attendance records...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-slate-700">No attendance records found</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting the filter dates or parameters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4">Date</th>
                  {isAdminOrManager && <th className="py-3.5 px-4">Employee</th>}
                  <th className="py-3.5 px-4">Mode</th>
                  <th className="py-3.5 px-4">Actual IN</th>
                  <th className="py-3.5 px-4">Actual OUT</th>
                  <th className="py-3.5 px-4">Duration</th>
                  <th className="py-3.5 px-4">Late / Extra</th>
                  <th className="py-3.5 px-4">GPS Verification</th>
                  <th className="py-3.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map(rec => {
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {rec.attendance_date}
                      </td>

                      {isAdminOrManager && (
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{rec.employee_name || 'Staff'}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {rec.employee_id} • {rec.team}
                          </div>
                        </td>
                      )}

                      <td className="py-3.5 px-4">
                        {rec.work_mode === 'remote' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
                            <Laptop className="w-3 h-3" />
                            Remote
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            <Building className="w-3 h-3 text-teal-600" />
                            Office
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {formatTime12FromHHMM(rec.in_time)}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {formatTime12FromHHMM(rec.out_time)}
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-teal-800 whitespace-nowrap">
                        {formatMinutesToHumanDuration(rec.total_duration_minutes || 0)}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {rec.late_minutes > 0 ? (
                          <span className="text-rose-600 font-bold block">{rec.late_minutes}m Late</span>
                        ) : (
                          <span className="text-emerald-600 font-medium">On-time</span>
                        )}
                        {rec.extra_minutes > 0 && (
                          <span className="text-blue-600 text-[10px] block">+{rec.extra_minutes}m Extra</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {rec.work_mode === 'office' ? (
                          rec.in_verified ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Verified ({rec.in_distance_meters || 0}m)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Unverified</span>
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400 text-[11px]">N/A (Remote)</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${
                            rec.status === 'present'
                              ? 'bg-emerald-100 text-emerald-800'
                              : rec.status === 'late'
                              ? 'bg-amber-100 text-amber-800'
                              : rec.status === 'half_day'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {rec.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
