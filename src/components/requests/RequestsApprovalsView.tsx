import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../api/client';
import { LeaveRequest, RemoteRequest, AttendanceCorrection } from '../../types';
import { formatTime12FromHHMM } from '../../server/utils/time';
import {
  FileCheck2,
  Palmtree,
  Laptop,
  AlertCircle,
  Check,
  X,
  Clock,
  Filter,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface RequestsApprovalsViewProps {
  initialSubTab?: 'leave' | 'remote' | 'corrections';
  onOpenLeaveModal?: () => void;
  onOpenRemoteModal?: () => void;
  onOpenCorrectionModal?: () => void;
}

export const RequestsApprovalsView: React.FC<RequestsApprovalsViewProps> = ({
  initialSubTab = 'leave',
  onOpenLeaveModal,
  onOpenRemoteModal,
  onOpenCorrectionModal,
}) => {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<'leave' | 'remote' | 'corrections'>(initialSubTab);
  const [loading, setLoading] = useState(true);

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [remoteRequests, setRemoteRequests] = useState<RemoteRequest[]>([]);
  const [corrections, setCorrections] = useState<AttendanceCorrection[]>([]);

  // Action modal
  const [selectedActionItem, setSelectedActionItem] = useState<{
    type: 'leave' | 'remote' | 'corrections';
    id: string;
    action: 'approved' | 'rejected';
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const isAdminOrManager = user?.role !== 'employee';

  const fetchAllRequests = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes, rRes, cRes] = await Promise.all([
        apiRequest<{ requests: LeaveRequest[] }>('/api/leaves/requests'),
        apiRequest<{ requests: RemoteRequest[] }>('/api/remote-work'),
        apiRequest<{ corrections: AttendanceCorrection[] }>('/api/corrections'),
      ]);
      setLeaveRequests(lRes.requests || []);
      setRemoteRequests(rRes.requests || []);
      setCorrections(cRes.corrections || []);
    } catch (err) {
      console.error('Failed to load requests:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllRequests();
  }, [fetchAllRequests]);

  const handleExecuteAction = async () => {
    if (!selectedActionItem || actionLoading) return;
    setActionLoading(true);

    try {
      const { type, id, action } = selectedActionItem;
      let endpoint = '';
      if (type === 'leave') endpoint = `/api/leaves/requests/${id}/action`;
      if (type === 'remote') endpoint = `/api/remote-work/${id}/action`;
      if (type === 'corrections') endpoint = `/api/corrections/${id}/action`;

      await apiRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify({
          status: action,
          action_reason: actionReason,
        }),
      });

      setSelectedActionItem(null);
      setActionReason('');
      await fetchAllRequests();
    } catch (err: unknown) {
      console.error('Action error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const pendingLeaves = leaveRequests.filter(r => r.status === 'pending').length;
  const pendingRemotes = remoteRequests.filter(r => r.status === 'pending').length;
  const pendingCorrections = corrections.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Requests & Approvals
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {isAdminOrManager
              ? 'Review and authorize employee leave, remote work days, and punch corrections.'
              : 'Submit and track the status of your workforce applications.'}
          </p>
        </div>

        {/* Quick New Request triggers */}
        <div className="flex items-center gap-2">
          {subTab === 'leave' && (
            <button
              onClick={onOpenLeaveModal}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Apply for Leave</span>
            </button>
          )}

          {subTab === 'remote' && (
            <button
              onClick={onOpenRemoteModal}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Request Remote Date</span>
            </button>
          )}

          {subTab === 'corrections' && (
            <button
              onClick={onOpenCorrectionModal}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Request Correction</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-tab Navigation Pills */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-200/60 rounded-2xl w-fit">
        <button
          onClick={() => setSubTab('leave')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            subTab === 'leave'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Palmtree className="w-4 h-4 text-teal-600" />
          <span>Leave Requests</span>
          {isAdminOrManager && pendingLeaves > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white">
              {pendingLeaves}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubTab('remote')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            subTab === 'remote'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Laptop className="w-4 h-4 text-cyan-600" />
          <span>Remote Work</span>
          {isAdminOrManager && pendingRemotes > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white">
              {pendingRemotes}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubTab('corrections')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            subTab === 'corrections'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <AlertCircle className="w-4 h-4 text-purple-600" />
          <span>Attendance Corrections</span>
          {isAdminOrManager && pendingCorrections > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white">
              {pendingCorrections}
            </span>
          )}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin text-teal-600 mx-auto mb-2" />
            <p className="text-xs">Loading requests...</p>
          </div>
        ) : (
          <>
            {/* 1. LEAVE REQUESTS TABLE */}
            {subTab === 'leave' && (
              <div className="overflow-x-auto">
                {leaveRequests.length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    <Palmtree className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-semibold text-slate-700">No leave requests found</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                        {isAdminOrManager && <th className="py-3.5 px-4">Employee</th>}
                        <th className="py-3.5 px-4">Category</th>
                        <th className="py-3.5 px-4">Period</th>
                        <th className="py-3.5 px-4">Duration</th>
                        <th className="py-3.5 px-4">Reason</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4">Approved By</th>
                        {isAdminOrManager && <th className="py-3.5 px-4 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leaveRequests.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition">
                          {isAdminOrManager && (
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900">{item.employee_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {item.employee_id} • {item.team}
                              </div>
                            </td>
                          )}

                          <td className="py-3.5 px-4 font-semibold text-slate-800">
                            {item.category_name}
                          </td>

                          <td className="py-3.5 px-4 font-mono font-medium text-slate-700 whitespace-nowrap">
                            {item.start_date === item.end_date
                              ? item.start_date
                              : `${item.start_date} to ${item.end_date}`}
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="font-bold text-slate-900">{item.days_count} day(s)</span>
                            {item.is_half_day ? (
                              <span className="block text-[10px] text-amber-600 font-semibold">
                                Half Day ({item.half_day_type === 'first_half' ? 'Morning' : 'Afternoon'})
                              </span>
                            ) : null}
                          </td>

                          <td className="py-3.5 px-4 max-w-xs text-slate-600 truncate">
                            {item.reason || <span className="text-slate-400 italic">None</span>}
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${
                                item.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.status === 'rejected'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                            {item.approved_by || '—'}
                          </td>

                          {isAdminOrManager && (
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              {item.status === 'pending' ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() =>
                                      setSelectedActionItem({
                                        type: 'leave',
                                        id: item.id,
                                        action: 'approved',
                                      })
                                    }
                                    className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition cursor-pointer"
                                    title="Approve Leave"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setSelectedActionItem({
                                        type: 'leave',
                                        id: item.id,
                                        action: 'rejected',
                                      })
                                    }
                                    className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                                    title="Reject Leave"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* 2. REMOTE WORK REQUESTS TABLE */}
            {subTab === 'remote' && (
              <div className="overflow-x-auto">
                {remoteRequests.length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    <Laptop className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-semibold text-slate-700">No remote work requests</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                        {isAdminOrManager && <th className="py-3.5 px-4">Employee</th>}
                        <th className="py-3.5 px-4">Requested Date</th>
                        <th className="py-3.5 px-4">Reason / Notes</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4">Reviewer</th>
                        {isAdminOrManager && <th className="py-3.5 px-4 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {remoteRequests.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition">
                          {isAdminOrManager && (
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900">{item.employee_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {item.employee_id} • {item.team}
                              </div>
                            </td>
                          )}

                          <td className="py-3.5 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                            {item.request_date}
                          </td>

                          <td className="py-3.5 px-4 max-w-xs text-slate-600 truncate">
                            {item.reason || <span className="text-slate-400 italic">None</span>}
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${
                                item.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.status === 'rejected'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                            {item.approved_by || '—'}
                          </td>

                          {isAdminOrManager && (
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              {item.status === 'pending' ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() =>
                                      setSelectedActionItem({
                                        type: 'remote',
                                        id: item.id,
                                        action: 'approved',
                                      })
                                    }
                                    className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition cursor-pointer"
                                    title="Approve Remote Date"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setSelectedActionItem({
                                        type: 'remote',
                                        id: item.id,
                                        action: 'rejected',
                                      })
                                    }
                                    className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                                    title="Reject Remote Date"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* 3. ATTENDANCE CORRECTIONS TABLE */}
            {subTab === 'corrections' && (
              <div className="overflow-x-auto">
                {corrections.length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-semibold text-slate-700">No correction requests</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                        {isAdminOrManager && <th className="py-3.5 px-4">Employee</th>}
                        <th className="py-3.5 px-4">Attendance Date</th>
                        <th className="py-3.5 px-4">Original Recorded</th>
                        <th className="py-3.5 px-4">Requested Punch</th>
                        <th className="py-3.5 px-4">Explanation</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4">Reviewed By</th>
                        {isAdminOrManager && <th className="py-3.5 px-4 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {corrections.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition">
                          {isAdminOrManager && (
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900">{item.employee_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {item.employee_id} • {item.team}
                              </div>
                            </td>
                          )}

                          <td className="py-3.5 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                            {item.attendance_date}
                          </td>

                          <td className="py-3.5 px-4 text-slate-500 font-mono whitespace-nowrap">
                            {formatTime12FromHHMM(item.original_in_time)} - {formatTime12FromHHMM(item.original_out_time)}
                          </td>

                          <td className="py-3.5 px-4 font-bold text-teal-800 font-mono whitespace-nowrap">
                            {item.requested_in_time ? formatTime12FromHHMM(item.requested_in_time) : '—'} -{' '}
                            {item.requested_out_time ? formatTime12FromHHMM(item.requested_out_time) : '—'}
                          </td>

                          <td className="py-3.5 px-4 max-w-xs text-slate-600 truncate">
                            {item.explanation}
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${
                                item.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.status === 'rejected'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                            {item.approved_by || '—'}
                          </td>

                          {isAdminOrManager && (
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              {item.status === 'pending' ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() =>
                                      setSelectedActionItem({
                                        type: 'corrections',
                                        id: item.id,
                                        action: 'approved',
                                      })
                                    }
                                    className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition cursor-pointer"
                                    title="Approve Correction"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setSelectedActionItem({
                                        type: 'corrections',
                                        id: item.id,
                                        action: 'rejected',
                                      })
                                    }
                                    className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                                    title="Reject Correction"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Action Confirmation Modal */}
      {selectedActionItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <h3 className="text-base font-bold text-slate-900 mb-2 capitalize">
              {selectedActionItem.action} Request
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Are you sure you want to mark this request as{' '}
              <strong className="text-slate-900">{selectedActionItem.action}</strong>?
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Remarks / Reason (Optional)
              </label>
              <textarea
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="Add optional notes for the audit trail..."
                rows={3}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedActionItem(null)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAction}
                disabled={actionLoading}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-sm transition cursor-pointer disabled:opacity-50 ${
                  selectedActionItem.action === 'approved'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {actionLoading ? 'Processing...' : `Confirm ${selectedActionItem.action}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
