import React, { useState } from 'react';
import { apiRequest } from '../../api/client';
import { AlertCircle, X, Check } from 'lucide-react';

interface ApplyCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ApplyCorrectionModal: React.FC<ApplyCorrectionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [attendanceDate, setAttendanceDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [correctionType, setCorrectionType] = useState<
    'in_time' | 'out_time' | 'both'
  >('both');
  const [requestedInTime, setRequestedInTime] = useState('11:00');
  const [requestedOutTime, setRequestedOutTime] = useState('19:00');
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await apiRequest('/api/corrections', {
        method: 'POST',
        body: JSON.stringify({
          attendance_date: attendanceDate,
          correction_type: correctionType,
          requested_in_time:
            correctionType === 'out_time' ? null : requestedInTime,
          requested_out_time:
            correctionType === 'in_time' ? null : requestedOutTime,
          explanation,
        }),
      });

      setSuccess('Correction request submitted for administrative audit.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to submit correction'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-slate-100">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-purple-600" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Attendance Correction
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-3 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-medium flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Attendance Date
            </label>
            <input
              type="date"
              required
              value={attendanceDate}
              onChange={e => setAttendanceDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Correction Field
            </label>
            <select
              value={correctionType}
              onChange={e => setCorrectionType(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 font-medium"
            >
              <option value="both">Both Clock IN & OUT</option>
              <option value="in_time">Clock IN only</option>
              <option value="out_time">Clock OUT only</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {correctionType !== 'out_time' && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Requested IN Time
                </label>
                <input
                  type="time"
                  required
                  value={requestedInTime}
                  onChange={e => setRequestedInTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>
            )}

            {correctionType !== 'in_time' && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Requested OUT Time
                </label>
                <input
                  type="time"
                  required
                  value={requestedOutTime}
                  onChange={e => setRequestedOutTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Explanation for Exception *
            </label>
            <textarea
              required
              rows={3}
              value={explanation}
              onChange={e => setExplanation(e.target.value)}
              placeholder="e.g. Device battery died at 11:00 AM, marked manually upon power restore..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-[11px] text-slate-500 leading-relaxed">
            <strong>Security Notice:</strong> Administrators review original
            timestamps against requested values before approval.
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl font-bold text-white bg-purple-600 hover:bg-purple-700 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Submit Correction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
