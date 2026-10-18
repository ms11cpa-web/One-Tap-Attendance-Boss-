import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client';
import { LeaveCategory, LeaveBalance } from '../../types';
import { Palmtree, X, Check, AlertCircle } from 'lucide-react';

interface ApplyLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ApplyLeaveModal: React.FC<ApplyLeaveModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [categories, setCategories] = useState<LeaveCategory[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [selectedCat, setSelectedCat] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDayType, setHalfDayType] = useState<'first_half' | 'second_half'>('first_half');
  const [reason, setReason] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (isOpen) {
      apiRequest<{ categories: LeaveCategory[] }>('/api/leaves/categories')
        .then(res => {
          setCategories(res.categories || []);
          if (res.categories && res.categories.length > 0 && !selectedCat) {
            setSelectedCat(res.categories[0].id);
          }
        })
        .catch(console.error);

      apiRequest<{ balances: LeaveBalance[] }>('/api/leaves/balances')
        .then(res => setBalances(res.balances || []))
        .catch(console.error);

      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      setEndDate(today);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentBalance = balances.find(b => b.category_id === selectedCat);
  const remainingDays = currentBalance
    ? Math.max(0, currentBalance.allocated_days - currentBalance.used_days - currentBalance.pending_days)
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await apiRequest('/api/leaves/requests', {
        method: 'POST',
        body: JSON.stringify({
          category_id: selectedCat,
          start_date: startDate,
          end_date: isHalfDay ? startDate : endDate,
          is_half_day: isHalfDay,
          half_day_type: isHalfDay ? halfDayType : null,
          reason,
        }),
      });

      setSuccess('Leave request submitted successfully.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit leave request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Palmtree className="w-4 h-4 text-teal-600" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Apply for Leave</h3>
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

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Category */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">Leave Category</label>
              {remainingDays !== null && (
                <span className="text-[11px] font-bold text-teal-700">
                  {remainingDays} days remaining
                </span>
              )}
            </div>
            <select
              value={selectedCat}
              onChange={e => setSelectedCat(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 font-medium"
            >
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.default_days_per_year}d/yr)
                </option>
              ))}
            </select>
          </div>

          {/* Half day toggle */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={isHalfDay}
                onChange={e => setIsHalfDay(e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
              />
              <span>Apply for Half-Day (0.5 day deduction)</span>
            </label>

            {isHalfDay && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setHalfDayType('first_half')}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    halfDayType === 'first_half'
                      ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  First Half (Morning)
                </button>
                <button
                  type="button"
                  onClick={() => setHalfDayType('second_half')}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    halfDayType === 'second_half'
                      ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  Second Half (Afternoon)
                </button>
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {isHalfDay ? 'Date' : 'Start Date'}
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  if (isHalfDay || endDate < e.target.value) {
                    setEndDate(e.target.value);
                  }
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
              />
            </div>

            {!isHalfDay && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">End Date</label>
                <input
                  type="date"
                  required
                  value={endDate}
                  min={startDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Reason / Notes</label>
            <textarea
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Brief explanation for records..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
            />
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
              className="px-5 py-2 rounded-xl font-bold text-white bg-teal-600 hover:bg-teal-700 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
