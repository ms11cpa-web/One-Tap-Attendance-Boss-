import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../api/client';
import { formatTime12FromHHMM, formatMinutesToHumanDuration } from '../../server/utils/time';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Building,
  Laptop,
  Palmtree,
  RefreshCw,
  X,
} from 'lucide-react';

interface CalendarDay {
  date: string;
  dayNumber: number;
  dayName: string;
  status:
    | 'present'
    | 'late'
    | 'remote'
    | 'half_day'
    | 'leave'
    | 'holiday'
    | 'weekly_off'
    | 'missing_out'
    | 'absent'
    | 'future'
    | 'not_employed';
  title: string;
  attendance?: any;
  holiday?: any;
  leave?: any;
}

interface CalendarResponse {
  month: string;
  employee: { id: string; name: string; employee_id: string };
  days: CalendarDay[];
}

export const CalendarView: React.FC = () => {
  const { user } = useAuth();
  const [currentMonthStr, setCurrentMonthStr] = useState<string>('2026-10');
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [employeesList, setEmployeesList] = useState<Array<{ id: string; name: string; employee_id: string }>>([]);
  const [calendarData, setCalendarData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);

  const isAdminOrManager = user?.role !== 'employee';

  // Load employee list for filter if admin
  useEffect(() => {
    if (isAdminOrManager) {
      apiRequest<{ employees: any[] }>('/api/employees')
        .then(res => {
          setEmployeesList(res.employees || []);
        })
        .catch(console.error);
    }
  }, [isAdminOrManager]);

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('month', currentMonthStr);
      if (targetUserId) params.set('userId', targetUserId);

      const res = await apiRequest<CalendarResponse>(`/api/attendance/calendar?${params.toString()}`);
      setCalendarData(res);
    } catch (err) {
      console.error('Failed to load calendar:', err);
    } finally {
      setLoading(false);
    }
  }, [currentMonthStr, targetUserId]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  const handlePrevMonth = () => {
    const [y, m] = currentMonthStr.split('-').map(Number);
    let newYear = y;
    let newMonth = m - 1;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    setCurrentMonthStr(`${newYear}-${String(newMonth).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = currentMonthStr.split('-').map(Number);
    let newYear = y;
    let newMonth = m + 1;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    setCurrentMonthStr(`${newYear}-${String(newMonth).padStart(2, '0')}`);
  };

  const getStatusColor = (status: CalendarDay['status']) => {
    switch (status) {
      case 'present':
        return 'bg-emerald-500 text-white border-emerald-600';
      case 'late':
        return 'bg-amber-500 text-slate-950 border-amber-600';
      case 'remote':
        return 'bg-cyan-500 text-white border-cyan-600';
      case 'half_day':
        return 'bg-purple-500 text-white border-purple-600';
      case 'leave':
        return 'bg-indigo-500 text-white border-indigo-600';
      case 'holiday':
        return 'bg-blue-600 text-white border-blue-700';
      case 'weekly_off':
        return 'bg-slate-200 text-slate-700 border-slate-300';
      case 'missing_out':
        return 'bg-orange-500 text-white border-orange-600';
      case 'absent':
        return 'bg-rose-500 text-white border-rose-600';
      case 'not_employed':
        return 'bg-slate-100 text-slate-400 border-dashed border-slate-300';
      default:
        return 'bg-white text-slate-800 border-slate-200 hover:border-teal-400';
    }
  };

  const formatMonthTitle = (str: string) => {
    const [y, m] = str.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const weekHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Offset empty days before 1st of month
  const firstDayName = calendarData?.days[0]?.dayName;
  const dayIndexMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const leadingOffset = firstDayName ? dayIndexMap[firstDayName] || 0 : 0;

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Workforce Calendar
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Monthly attendance breakdown, official public holidays, and scheduled off-days.
          </p>
        </div>

        {/* Month Navigator & Employee filter */}
        <div className="flex flex-wrap items-center gap-2">
          {isAdminOrManager && (
            <select
              value={targetUserId}
              onChange={e => setTargetUserId(e.target.value)}
              className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-teal-500"
            >
              <option value="">{user?.name} (You)</option>
              {employeesList.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.employee_id})
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-slate-200 shadow-xs">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-bold text-slate-900 min-w-[120px] text-center">
              {formatMonthTitle(currentMonthStr)}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-600">
        <span className="text-xs font-bold text-slate-900 uppercase tracking-wider mr-1">Legend:</span>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-emerald-500" />
          <span>Present</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-amber-500" />
          <span>Late</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-cyan-500" />
          <span>Remote</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-purple-500" />
          <span>Half Day</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-indigo-500" />
          <span>Leave</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-blue-600" />
          <span>Holiday</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-slate-200" />
          <span>Weekly Off</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-orange-500" />
          <span>Missing OUT</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-rose-500" />
          <span>Absent</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-6 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin text-teal-600 mx-auto mb-2" />
            <p className="text-xs">Computing monthly attendance matrix...</p>
          </div>
        ) : (
          <div>
            {/* Week Headers */}
            <div className="grid grid-cols-7 gap-2 mb-2 text-center">
              {weekHeaders.map(w => (
                <div key={w} className="text-xs font-bold uppercase tracking-wider text-slate-400 py-1">
                  {w}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
              {/* Empty leading offset */}
              {Array.from({ length: leadingOffset }).map((_, idx) => (
                <div key={`empty-${idx}`} className="h-20 sm:h-24 rounded-2xl bg-slate-50/50" />
              ))}

              {calendarData?.days.map(day => {
                const colorClass = getStatusColor(day.status);
                const isSelected = selectedDay?.date === day.date;

                return (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDay(day)}
                    className={`h-20 sm:h-24 rounded-2xl border p-2 flex flex-col justify-between text-left transition relative cursor-pointer group ${colorClass} ${
                      isSelected ? 'ring-2 ring-slate-900 ring-offset-2' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-extrabold">{day.dayNumber}</span>
                      <span className="text-[9px] uppercase font-bold opacity-80 truncate max-w-[50px] hidden sm:inline">
                        {day.dayName.substring(0, 3)}
                      </span>
                    </div>

                    <div className="mt-auto">
                      <p className="text-[10px] font-bold truncate leading-tight">
                        {day.title || day.status}
                      </p>
                      {day.attendance && day.attendance.in_time && (
                        <p className="text-[9px] opacity-90 font-mono mt-0.5 hidden sm:block">
                          {formatTime12FromHHMM(day.attendance.in_time)}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Date Inspection Modal */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">{selectedDay.date}</h3>
                <p className="text-xs text-slate-500">{selectedDay.dayName}</p>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50">
                <span className="font-semibold text-slate-500">Day Classification:</span>
                <span className="font-bold text-slate-900 capitalize">{selectedDay.status.replace('_', ' ')}</span>
              </div>

              {selectedDay.attendance && (
                <div className="p-3 rounded-2xl bg-teal-50 border border-teal-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-teal-800">Clock IN:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatTime12FromHHMM(selectedDay.attendance.in_time)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-teal-800">Clock OUT:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatTime12FromHHMM(selectedDay.attendance.out_time)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-teal-800">Duration:</span>
                    <span className="font-bold text-slate-900">
                      {formatMinutesToHumanDuration(selectedDay.attendance.total_duration_minutes || 0)}
                    </span>
                  </div>
                  {selectedDay.attendance.late_minutes > 0 && (
                    <div className="flex items-center justify-between text-rose-600">
                      <span className="font-semibold">Late Minutes:</span>
                      <span className="font-bold">{selectedDay.attendance.late_minutes}m</span>
                    </div>
                  )}
                  {selectedDay.attendance.work_mode === 'office' && (
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-teal-100">
                      <span>GPS Distance:</span>
                      <span className="font-mono">{selectedDay.attendance.in_distance_meters || 0}m</span>
                    </div>
                  )}
                </div>
              )}

              {selectedDay.holiday && (
                <div className="p-3 rounded-2xl bg-blue-50 border border-blue-100">
                  <span className="font-bold text-blue-900 block mb-1">Company Holiday</span>
                  <p className="text-blue-800 font-semibold">{selectedDay.holiday.name}</p>
                  {selectedDay.holiday.description && (
                    <p className="text-blue-700/80 text-[11px] mt-1">{selectedDay.holiday.description}</p>
                  )}
                </div>
              )}

              {selectedDay.leave && (
                <div className="p-3 rounded-2xl bg-purple-50 border border-purple-100">
                  <span className="font-bold text-purple-900 block mb-1">Approved Leave</span>
                  <p className="text-purple-800 font-semibold">{selectedDay.leave.category_name}</p>
                  <p className="text-purple-700 text-[11px] mt-1">Reason: {selectedDay.leave.reason || 'None'}</p>
                </div>
              )}

              {selectedDay.status === 'absent' && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-100 text-rose-800">
                  <p className="font-semibold">Unexcused Absence</p>
                  <p className="text-[11px] text-rose-700/80 mt-1">
                    Scheduled regular workday without recorded attendance or approved leave.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedDay(null)}
                className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
