import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../api/client';
import { OfficeSettings, Holiday } from '../../types';
import {
  Settings,
  MapPin,
  Clock,
  Calendar,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Office settings
  const [companyName, setCompanyName] = useState('Boss Technologies Ltd');
  const [officeName, setOfficeName] = useState('Dhaka Headquarters — Gulshan 2');
  const [latitude, setLatitude] = useState(23.7925);
  const [longitude, setLongitude] = useState(90.4078);
  const [permittedRadius, setPermittedRadius] = useState(300);
  const [maxAccuracy, setMaxAccuracy] = useState(100);
  const [workStartTime, setWorkStartTime] = useState('11:00');
  const [workEndTime, setWorkEndTime] = useState('19:00');
  const [gracePeriod, setGracePeriod] = useState(15);
  const [weeklyHolidays, setWeeklyHolidays] = useState<string[]>(['Friday', 'Saturday']);

  // Holidays
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newHolName, setNewHolName] = useState('');
  const [newHolDate, setNewHolDate] = useState('');
  const [newHolDesc, setNewHolDesc] = useState('');
  const [addingHol, setAddingHol] = useState(false);

  const fetchSettingsAndHolidays = async () => {
    setLoading(true);
    try {
      const [sRes, hRes] = await Promise.all([
        apiRequest<{ settings: OfficeSettings }>('/api/settings'),
        apiRequest<{ holidays: Holiday[] }>('/api/holidays'),
      ]);

      if (sRes.settings) {
        setCompanyName(sRes.settings.company_name);
        setOfficeName(sRes.settings.office_name);
        setLatitude(sRes.settings.office_latitude);
        setLongitude(sRes.settings.office_longitude);
        setPermittedRadius(sRes.settings.permitted_radius_meters);
        setMaxAccuracy(sRes.settings.max_gps_accuracy_meters);
        setWorkStartTime(sRes.settings.work_start_time);
        setWorkEndTime(sRes.settings.work_end_time);
        setGracePeriod(sRes.settings.grace_period_minutes);
        try {
          const arr = JSON.parse(sRes.settings.weekly_holidays);
          if (Array.isArray(arr)) setWeeklyHolidays(arr);
        } catch {
          // fallback
        }
      }

      setHolidays(hRes.holidays || []);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsAndHolidays();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);

    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          company_name: companyName,
          office_name: officeName,
          office_latitude: latitude,
          office_longitude: longitude,
          permitted_radius_meters: permittedRadius,
          max_gps_accuracy_meters: maxAccuracy,
          work_start_time: workStartTime,
          work_end_time: workEndTime,
          grace_period_minutes: gracePeriod,
          weekly_holidays: weeklyHolidays,
        }),
      });

      setStatusMsg({ type: 'success', text: 'Office policies and geofencing settings saved successfully.' });
    } catch (err: unknown) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: string) => {
    if (weeklyHolidays.includes(day)) {
      setWeeklyHolidays(weeklyHolidays.filter(d => d !== day));
    } else {
      setWeeklyHolidays([...weeklyHolidays, day]);
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolName || !newHolDate) return;
    setAddingHol(true);
    try {
      await apiRequest('/api/holidays', {
        method: 'POST',
        body: JSON.stringify({
          name: newHolName,
          date: newHolDate,
          description: newHolDesc,
        }),
      });
      setNewHolName('');
      setNewHolDate('');
      setNewHolDesc('');
      await fetchSettingsAndHolidays();
    } catch (err) {
      console.error('Failed to add holiday:', err);
    } finally {
      setAddingHol(false);
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    try {
      await apiRequest(`/api/holidays/${id}`, { method: 'DELETE' });
      await fetchSettingsAndHolidays();
    } catch (err) {
      console.error('Delete holiday failed:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin text-teal-600 mb-3" />
        <p className="text-sm font-medium">Loading office policies...</p>
      </div>
    );
  }

  const allDays = ['Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
  const radiusPresets = [100, 150, 250, 300, 500];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
          Office Policies & Geofencing Settings
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Super Admin configuration for GPS radius, working schedules, grace time, and weekly holidays.
        </p>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-2xl text-xs font-semibold flex items-center gap-2.5 ${
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
          <span>{statusMsg.text}</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Section 1: Office & Geofencing */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-teal-600" />
            </div>
            <h2 className="text-sm font-bold text-slate-900">Office Location & GPS Geofence</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Company Legal Name</label>
              <input
                type="text"
                required
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Office Name / Branch</label>
              <input
                type="text"
                required
                value={officeName}
                onChange={e => setOfficeName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Office Latitude</label>
              <input
                type="number"
                step="any"
                required
                value={latitude}
                onChange={e => setLatitude(parseFloat(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">e.g. 23.7925 (Gulshan 2, Dhaka)</span>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Office Longitude</label>
              <input
                type="number"
                step="any"
                required
                value={longitude}
                onChange={e => setLongitude(parseFloat(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">e.g. 90.4078</span>
            </div>
          </div>

          {/* Permitted Radius Presets */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Permitted Attendance Radius: <span className="text-teal-700 font-bold">{permittedRadius} metres</span>
            </label>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {radiusPresets.map(preset => (
                <button
                  type="button"
                  key={preset}
                  onClick={() => setPermittedRadius(preset)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    permittedRadius === preset
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {preset} m
                </button>
              ))}
            </div>
            <input
              type="range"
              min="50"
              max="1000"
              step="25"
              value={permittedRadius}
              onChange={e => setPermittedRadius(parseInt(e.target.value, 10))}
              className="w-full accent-teal-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Max Permitted Device GPS Accuracy: <span className="text-teal-700 font-bold">±{maxAccuracy} metres</span>
            </label>
            <input
              type="number"
              min="20"
              max="300"
              value={maxAccuracy}
              onChange={e => setMaxAccuracy(parseInt(e.target.value, 10))}
              className="w-36 px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Punches with accuracy margin worse than this threshold will be rejected to prevent spoofing.
            </span>
          </div>
        </div>

        {/* Section 2: Working Hours & Grace Period */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Clock className="w-4 h-4 text-teal-600" />
            </div>
            <h2 className="text-sm font-bold text-slate-900">Working Hours & Lateness Calculation</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Office Start Time</label>
              <input
                type="time"
                required
                value={workStartTime}
                onChange={e => setWorkStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">Default: 11:00 AM</span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Office End Time</label>
              <input
                type="time"
                required
                value={workEndTime}
                onChange={e => setWorkEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">Default: 07:00 PM (8 hours)</span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Grace Period (Minutes)</label>
              <input
                type="number"
                min="0"
                max="60"
                required
                value={gracePeriod}
                onChange={e => setGracePeriod(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Arrival up to {gracePeriod} mins past start is not late
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Weekly Holidays (Weekends) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Weekly Off Days (Non-Working Days)</h2>
              <p className="text-xs text-slate-500">Days selected below will never be marked as absences.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {allDays.map(day => {
              const active = weeklyHolidays.includes(day);
              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm shadow-md transition cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Office Settings'}</span>
          </button>
        </div>
      </form>

      {/* Section 4: Public & Company Holidays Manager */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Public & Company Holidays (2026)</h2>
            <p className="text-xs text-slate-500">Official scheduled holidays excluded from absence counts.</p>
          </div>
        </div>

        {/* Add Holiday Form */}
        <form onSubmit={handleAddHoliday} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Holiday Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Shab-e-Barat"
              value={newHolName}
              onChange={e => setNewHolName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 bg-white"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Date</label>
            <input
              type="date"
              required
              value={newHolDate}
              onChange={e => setNewHolDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 bg-white"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Description (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Religious festival"
              value={newHolDesc}
              onChange={e => setNewHolDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 bg-white"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={addingHol}
              className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer"
            >
              {addingHol ? 'Adding...' : '+ Add Holiday'}
            </button>
          </div>
        </form>

        {/* Holidays List */}
        <div className="divide-y divide-slate-100 text-xs">
          {holidays.map(h => (
            <div key={h.id} className="py-2.5 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900">{h.name}</span>
                <span className="text-slate-400 font-mono text-[11px] ml-2">({h.date})</span>
                {h.description && <span className="text-slate-500 text-[11px] ml-2">• {h.description}</span>}
              </div>
              <button
                onClick={() => handleDeleteHoliday(h.id)}
                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 transition cursor-pointer"
                title="Remove Holiday"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
