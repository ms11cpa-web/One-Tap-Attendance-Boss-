import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../api/client';
import { AttendanceRecord, OfficeSettings } from '../../types';
import { formatTime12FromHHMM, formatMinutesToHumanDuration } from '../../server/utils/time';
import {
  MapPin,
  Clock,
  Compass,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Laptop,
  Building,
  ArrowRight,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  History,
  FilePlus,
  Info,
} from 'lucide-react';

interface TodayAttendanceData {
  date: string;
  dayName: string;
  isRemoteApproved: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  isWeeklyOff: boolean;
  attendance: AttendanceRecord | null;
  settings: Partial<OfficeSettings>;
}

interface OneTapAttendanceProps {
  onNavigateTab: (tab: any) => void;
  onOpenLeaveModal?: () => void;
  onOpenRemoteModal?: () => void;
  onOpenCorrectionModal?: () => void;
}

export const OneTapAttendance: React.FC<OneTapAttendanceProps> = ({
  onNavigateTab,
  onOpenLeaveModal,
  onOpenRemoteModal,
  onOpenCorrectionModal,
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TodayAttendanceData | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string; distance?: number } | null>(null);

  // GPS state
  const [coords, setCoords] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [estimatedDistance, setEstimatedDistance] = useState<number | null>(null);

  // Fetch today's status
  const fetchTodayStatus = useCallback(async () => {
    try {
      const res = await apiRequest<TodayAttendanceData>('/api/attendance/today');
      setData(res);
    } catch (err: unknown) {
      console.error('Failed to load today attendance:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Request GPS position
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude, accuracy } = pos.coords;
        setCoords({ latitude, longitude, accuracy });
        setGpsLoading(false);

        // Approximate client-side preview distance for instant user feedback
        if (data?.settings?.office_latitude && data?.settings?.office_longitude) {
          const R = 6371000;
          const toRad = (n: number) => (n * Math.PI) / 180;
          const dLat = toRad(data.settings.office_latitude - latitude);
          const dLon = toRad(data.settings.office_longitude - longitude);
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(latitude)) *
              Math.cos(toRad(data.settings.office_latitude)) *
              Math.sin(dLon / 2) *
              Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          setEstimatedDistance(Math.round(R * c));
        }
      },
      err => {
        setGpsLoading(false);
        if (err.code === 1) {
          setGpsError('Location access was denied. Please allow GPS permission in your browser or device settings.');
        } else if (err.code === 2) {
          setGpsError('GPS location unavailable. Please move to an open area.');
        } else {
          setGpsError('GPS request timed out. Please retry.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }, [data?.settings?.office_latitude, data?.settings?.office_longitude]);

  useEffect(() => {
    fetchTodayStatus();
  }, [fetchTodayStatus]);

  useEffect(() => {
    if (data && !data.isRemoteApproved) {
      requestLocation();
    }
  }, [data?.isRemoteApproved, requestLocation]);

  const handlePunchIn = async () => {
    if (actionLoading) return;
    setFeedback(null);
    setActionLoading(true);

    const isRemote = data?.isRemoteApproved;

    // For office mode, ensure coordinates
    let lat = coords?.latitude;
    let lon = coords?.longitude;
    let acc = coords?.accuracy;

    if (!isRemote && (!lat || !lon)) {
      // Try immediate location fetch
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
          });
        });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
        acc = pos.coords.accuracy;
        setCoords({ latitude: lat, longitude: lon, accuracy: acc });
      } catch (e: any) {
        setActionLoading(false);
        setFeedback({
          type: 'error',
          message: 'Unable to retrieve your GPS location. Please ensure location services are enabled and tap Retry.',
        });
        return;
      }
    }

    try {
      const res = await apiRequest<{
        success: boolean;
        message: string;
        inTime: string;
        distanceMeters?: number;
      }>('/api/attendance/punch-in', {
        method: 'POST',
        body: JSON.stringify({
          work_mode: isRemote ? 'remote' : 'office',
          latitude: lat,
          longitude: lon,
          accuracy: acc,
        }),
      });

      setFeedback({
        type: 'success',
        message: res.message,
        distance: res.distanceMeters,
      });

      await fetchTodayStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Attendance punch-in failed';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(false);
    }
  };

  const handlePunchOut = async () => {
    if (actionLoading) return;
    setFeedback(null);
    setActionLoading(true);

    const isRemote = data?.isRemoteApproved || data?.attendance?.work_mode === 'remote';

    let lat = coords?.latitude;
    let lon = coords?.longitude;
    let acc = coords?.accuracy;

    if (!isRemote && (!lat || !lon)) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
          });
        });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
        acc = pos.coords.accuracy;
      } catch {
        // Proceed or warn
      }
    }

    try {
      const res = await apiRequest<{
        success: boolean;
        message: string;
        outTime: string;
        totalDurationMinutes: number;
      }>('/api/attendance/punch-out', {
        method: 'POST',
        body: JSON.stringify({
          latitude: lat,
          longitude: lon,
          accuracy: acc,
        }),
      });

      setFeedback({
        type: 'success',
        message: res.message,
      });

      await fetchTodayStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Attendance punch-out failed';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin text-teal-600 mb-3" />
        <p className="text-sm font-medium">Checking attendance status...</p>
      </div>
    );
  }

  const attendance = data?.attendance;
  const hasIn = !!attendance?.in_time;
  const hasOut = !!attendance?.out_time;
  const isRemote = !!data?.isRemoteApproved;
  const maxRadius = data?.settings?.permitted_radius_meters || 300;

  const isInsideRadius = estimatedDistance !== null ? estimatedDistance <= maxRadius : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Top Banner / Today's State */}
      <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between relative z-10 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">
              {data?.dayName}, {data?.date}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isRemote ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                <Laptop className="w-3.5 h-3.5" />
                Remote Work Approved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                <Building className="w-3.5 h-3.5 text-teal-400" />
                Office Mode
              </span>
            )}
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
          Hello, {user?.name}
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm">
          {hasOut
            ? "You have completed today's attendance."
            : hasIn
            ? `You clocked IN at ${formatTime12FromHHMM(attendance.in_time)}. Remember to punch OUT when leaving.`
            : isRemote
            ? 'You are authorized for Remote Work today. Tap Remote IN below.'
            : 'Tap Office IN below to record your attendance at Dhaka Headquarters.'}
        </p>

        {/* Holiday / Weekend Notice if applicable */}
        {data?.isHoliday && (
          <div className="mt-4 p-3 rounded-2xl bg-indigo-950/60 border border-indigo-700/40 text-indigo-200 text-xs flex items-center gap-2.5">
            <Calendar className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span>
              <strong>Company Holiday:</strong> {data.holidayName}. Attendance is optional.
            </span>
          </div>
        )}

        {data?.isWeeklyOff && !data?.isHoliday && (
          <div className="mt-4 p-3 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-300 text-xs flex items-center gap-2.5">
            <Info className="w-4 h-4 text-teal-400 flex-shrink-0" />
            <span>
              <strong>Weekly Off Day ({data.dayName}):</strong> Weekend rest day.
            </span>
          </div>
        )}
      </div>

      {/* Geolocation Card (for Office Attendance) */}
      {!isRemote && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <Compass className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  GPS Geofencing Verification
                </h3>
                <p className="text-[11px] text-slate-500">
                  {data?.settings?.office_name || 'Dhaka Headquarters'} (Max: {maxRadius}m)
                </p>
              </div>
            </div>

            <button
              onClick={requestLocation}
              disabled={gpsLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin' : ''}`} />
              <span>Retry GPS</span>
            </button>
          </div>

          {/* GPS Status Indicators */}
          {gpsError ? (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Location Access Needed</p>
                <p className="text-[11px] leading-relaxed">{gpsError}</p>
              </div>
            </div>
          ) : coords ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Office Distance</div>
                <div className="text-base font-extrabold text-slate-900 flex items-baseline gap-1">
                  {estimatedDistance !== null ? `${estimatedDistance}m` : 'Calculating...'}
                  <span className="text-[10px] font-normal text-slate-500">away</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">GPS Accuracy</div>
                <div className="text-base font-extrabold text-slate-900 flex items-baseline gap-1">
                  ±{Math.round(coords.accuracy)}m
                  <span className="text-[10px] font-normal text-slate-500">margin</span>
                </div>
              </div>

              <div className="col-span-2 sm:col-span-1 p-3 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-center">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Geofence Status</div>
                {isInsideRadius === true ? (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Inside Boundary</span>
                  </div>
                ) : isInsideRadius === false ? (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Outside ({estimatedDistance}m &gt; {maxRadius}m)</span>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">Verifying...</div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-slate-500 text-xs flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
              <span>Acquiring high-accuracy GPS coordinates...</span>
            </div>
          )}
        </div>
      )}

      {/* Action Feedback Message */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs sm:text-sm font-medium flex items-start gap-3 animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : feedback.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5">
            <p className="font-bold">{feedback.message}</p>
            {feedback.distance !== undefined && (
              <p className="text-xs text-emerald-700">
                Verified Distance: {feedback.distance} meters from office center.
              </p>
            )}
          </div>
        </div>
      )}

      {/* The Two Main Action Buttons (Office IN & Office OUT) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* PUNCH IN BUTTON */}
        <button
          onClick={handlePunchIn}
          disabled={actionLoading || hasIn}
          className={`group relative flex flex-col items-center justify-center p-6 sm:p-8 rounded-3xl transition duration-200 border cursor-pointer select-none ${
            hasIn
              ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed text-slate-400'
              : 'bg-gradient-to-br from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white border-teal-500/30 shadow-lg hover:shadow-teal-500/25 active:scale-[0.98]'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mb-3 group-hover:scale-105 transition">
            <Clock className="w-8 h-8 text-white" />
          </div>
          <span className="text-xl sm:text-2xl font-black tracking-tight">
            {isRemote ? 'Remote IN' : 'Office IN'}
          </span>
          <span className="text-xs text-white/80 mt-1 font-medium">
            {hasIn ? `Clocked IN at ${formatTime12FromHHMM(attendance?.in_time)}` : 'Tap to Clock IN'}
          </span>
          {hasIn && (
            <div className="mt-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Completed</span>
            </div>
          )}
        </button>

        {/* PUNCH OUT BUTTON */}
        <button
          onClick={handlePunchOut}
          disabled={actionLoading || !hasIn || hasOut}
          className={`group relative flex flex-col items-center justify-center p-6 sm:p-8 rounded-3xl transition duration-200 border cursor-pointer select-none ${
            !hasIn
              ? 'bg-slate-100 border-slate-200 opacity-50 cursor-not-allowed text-slate-400'
              : hasOut
              ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed text-slate-400'
              : 'bg-gradient-to-br from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white border-slate-700 shadow-lg active:scale-[0.98]'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mb-3 group-hover:scale-105 transition">
            <ArrowRight className="w-8 h-8 text-white" />
          </div>
          <span className="text-xl sm:text-2xl font-black tracking-tight">
            {isRemote ? 'Remote OUT' : 'Office OUT'}
          </span>
          <span className="text-xs text-white/80 mt-1 font-medium">
            {hasOut
              ? `Clocked OUT at ${formatTime12FromHHMM(attendance?.out_time)}`
              : hasIn
              ? 'Tap to Clock OUT'
              : 'Punch IN required first'}
          </span>
          {hasOut && (
            <div className="mt-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 text-teal-800 font-bold text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Day Finished</span>
            </div>
          )}
        </button>
      </div>

      {/* Today's Working Hours Summary Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-teal-600" />
            <h2 className="text-sm font-bold text-slate-900">Today's Attendance Breakdown</h2>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            Schedule: {data?.settings?.work_start_time || '11:00'} - {data?.settings?.work_end_time || '19:00'} (8h)
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3 rounded-2xl bg-slate-50">
            <p className="text-[10px] font-bold uppercase text-slate-500 mb-0.5">Actual IN</p>
            <p className="text-base font-extrabold text-slate-900 font-mono">
              {formatTime12FromHHMM(attendance?.in_time)}
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50">
            <p className="text-[10px] font-bold uppercase text-slate-500 mb-0.5">Actual OUT</p>
            <p className="text-base font-extrabold text-slate-900 font-mono">
              {formatTime12FromHHMM(attendance?.out_time)}
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50">
            <p className="text-[10px] font-bold uppercase text-slate-500 mb-0.5">Total Duration</p>
            <p className="text-base font-extrabold text-teal-700">
              {formatMinutesToHumanDuration(attendance?.total_duration_minutes || 0)}
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50">
            <p className="text-[10px] font-bold uppercase text-slate-500 mb-0.5">Late / Extra</p>
            <div className="text-xs font-bold">
              {attendance?.late_minutes && attendance.late_minutes > 0 ? (
                <span className="text-rose-600">Late: {attendance.late_minutes}m</span>
              ) : (
                <span className="text-emerald-600">On Time</span>
              )}
              {attendance?.extra_minutes && attendance.extra_minutes > 0 && (
                <span className="text-blue-600 block text-[10px]">
                  +{attendance.extra_minutes}m extra
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Current status pill */}
        <div className="pt-2 flex items-center justify-between text-xs text-slate-500">
          <span>Attendance Status:</span>
          {attendance ? (
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${
                attendance.status === 'present'
                  ? 'bg-emerald-100 text-emerald-800'
                  : attendance.status === 'late'
                  ? 'bg-amber-100 text-amber-800'
                  : attendance.status === 'half_day'
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {attendance.status.replace('_', ' ')}
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold text-xs">
              Not Clocked In Yet
            </span>
          )}
        </div>
      </div>

      {/* Quick Action Shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={onOpenLeaveModal}
          className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-teal-500 text-left transition shadow-xs hover:shadow-sm cursor-pointer group"
        >
          <FilePlus className="w-5 h-5 text-teal-600 mb-2 group-hover:scale-110 transition" />
          <h4 className="text-xs font-bold text-slate-900">Request Leave</h4>
          <p className="text-[10px] text-slate-500">Casual or Sick</p>
        </button>

        <button
          onClick={onOpenRemoteModal}
          className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-teal-500 text-left transition shadow-xs hover:shadow-sm cursor-pointer group"
        >
          <Laptop className="w-5 h-5 text-teal-600 mb-2 group-hover:scale-110 transition" />
          <h4 className="text-xs font-bold text-slate-900">Remote Work</h4>
          <p className="text-[10px] text-slate-500">Apply for date</p>
        </button>

        <button
          onClick={onOpenCorrectionModal}
          className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-teal-500 text-left transition shadow-xs hover:shadow-sm cursor-pointer group"
        >
          <AlertCircle className="w-5 h-5 text-teal-600 mb-2 group-hover:scale-110 transition" />
          <h4 className="text-xs font-bold text-slate-900">Correction</h4>
          <p className="text-[10px] text-slate-500">Fix punch time</p>
        </button>

        <button
          onClick={() => onNavigateTab('history')}
          className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-teal-500 text-left transition shadow-xs hover:shadow-sm cursor-pointer group"
        >
          <History className="w-5 h-5 text-teal-600 mb-2 group-hover:scale-110 transition" />
          <h4 className="text-xs font-bold text-slate-900">My History</h4>
          <p className="text-[10px] text-slate-500">All attendance</p>
        </button>
      </div>
    </div>
  );
};
