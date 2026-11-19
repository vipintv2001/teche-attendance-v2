import React, { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  History,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Smartphone
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  fetchAttendanceSession,
  fetchMyHistory,
  postCheckIn,
  postCheckOut
} from '../api/client';
import { getCurrentCoordinates, getDeviceSignature } from '../utils/deviceUtils';
import {
  REQUIRED_SHIFT_MINUTES,
  HALF_DAY_SHIFT_MINUTES,
  formatDatePretty,
  formatDuration,
  formatTime12hIST,
  getDaysInMonth,
  getTodayISTClient
} from '../utils/timeUtils';
import TecheLogo from '../components/TecheLogo';
import PushSubscribeButton from '../components/PushSubscribeButton';

export default function EmployeePortal() {
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState('');
  const [employee, setEmployee] = useState(null);
  const [unboundEmployees, setUnboundEmployees] = useState([]);
  const [shift, setShift] = useState(null);
  const [missedShift, setMissedShift] = useState(null);

  // Upgrade 5: Tab toggle (Today vs My Monthly Summary)
  const [activeTab, setActiveTab] = useState('today');
  const [historyMonth, setHistoryMonth] = useState(() => getTodayISTClient().slice(0, 7));
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState(null);
  const [historyError, setHistoryError] = useState('');

  // View 1B input/selector state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [manualIdMode, setManualIdMode] = useState(false);

  // View 3 daily summary
  const [dailyTask, setDailyTask] = useState('');
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [statusNotice, setStatusNotice] = useState('');

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const signature = getDeviceSignature();
      const data = await fetchAttendanceSession(signature);
      setViewState(data.state);
      setEmployee(data.employee || null);
      setShift(data.shift || null);
      setMissedShift(data.missedShift || null);
      setUnboundEmployees(data.unboundEmployees || []);
      if (data.unboundEmployees?.length > 0) {
        setSelectedEmployeeId((prev) => prev || data.unboundEmployees[0].employeeId);
      }
    } catch (err) {
      setError(err.message || 'Unable to connect to TechE Attendance Server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Load employee history for Upgrade 5
  const loadHistory = useCallback(async (month) => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const signature = getDeviceSignature();
      const data = await fetchMyHistory(month, signature);
      setHistoryData(data);
    } catch (err) {
      setHistoryError(err.message || 'Failed to load attendance summary.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'history' && employee) {
      loadHistory(historyMonth);
    }
  }, [activeTab, historyMonth, employee, loadHistory]);

  // Live elapsed timer for View 3 (Currently Working)
  useEffect(() => {
    if (viewState !== 'CURRENTLY_WORKING' || !shift?.checkInTime) {
      return undefined;
    }

    const updateElapsed = () => {
      const startMs = new Date(shift.checkInTime).getTime();
      const mins = Math.max(0, Math.floor((Date.now() - startMs) / 60000));
      setElapsedMinutes(mins);
    };

    updateElapsed();
    const timer = setInterval(updateElapsed, 15000);
    return () => clearInterval(timer);
  }, [viewState, shift]);

  async function executeCheckIn(targetEmployeeId) {
    setSubmitting(true);
    setError('');
    setStatusNotice('');

    const { platform, screenSize } = getDeviceSignature();
    const basePayload = {
      employeeId: targetEmployeeId,
      platform,
      screenSize
    };

    try {
      const data = await postCheckIn(basePayload);
      setViewState(data.state);
      setEmployee(data.employee || null);
      setShift(data.shift || null);
      setMissedShift(null);
    } catch (err) {
      // Fallback to 100m GPS Geofence when not on Wi-Fi
      if (err.status === 403 && err.data?.error?.includes('Wi-Fi')) {
        setStatusNotice(
          'Office Wi-Fi IP not detected. Verifying GPS location within 100m of campus...'
        );
        try {
          const coords = await getCurrentCoordinates();
          const gpsData = await postCheckIn({
            ...basePayload,
            lat: coords.lat,
            lng: coords.lng
          });
          setStatusNotice('');
          setViewState(gpsData.state);
          setEmployee(gpsData.employee || null);
          setShift(gpsData.shift || null);
          setMissedShift(null);
          return;
        } catch (gpsErr) {
          setStatusNotice('');
          setError(gpsErr.message || err.message);
          return;
        }
      }

      if (err.data?.state === 'LOCKED_PENDING_ADMIN_APPROVAL') {
        setViewState('LOCKED_PENDING_ADMIN_APPROVAL');
        setEmployee(err.data.employee || employee);
        setMissedShift(err.data.missedShift || null);
      }
      setError(err.message || 'Check-In failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecognizedCheckIn() {
    if (!employee?.employeeId) return;
    await executeCheckIn(employee.employeeId);
  }

  async function handleFirstTimeCheckIn(e) {
    e.preventDefault();
    const cleanId = selectedEmployeeId.trim().toUpperCase();
    if (!cleanId) {
      setError('Please select or enter your Employee ID.');
      return;
    }
    await executeCheckIn(cleanId);
  }

  async function handleCheckOut(e) {
    e.preventDefault();
    const trimmed = dailyTask.trim();
    if (!trimmed) {
      setError('Please enter your Daily Work Summary before tapping Check-Out.');
      return;
    }

    setSubmitting(true);
    setError('');
    setStatusNotice('');

    const { platform, screenSize } = getDeviceSignature();
    const basePayload = {
      dailyTask: trimmed,
      platform,
      screenSize
    };

    try {
      const data = await postCheckOut(basePayload);
      setViewState(data.state);
      setEmployee(data.employee || employee);
      setShift(data.shift || null);
      setDailyTask('');
    } catch (err) {
      // Fallback to 100m GPS Geofence when not on Wi-Fi
      if (err.status === 403 && err.data?.error?.includes('Wi-Fi')) {
        setStatusNotice(
          'Office Wi-Fi IP not detected. Verifying GPS location within 100m of campus...'
        );
        try {
          const coords = await getCurrentCoordinates();
          const gpsData = await postCheckOut({
            ...basePayload,
            lat: coords.lat,
            lng: coords.lng
          });
          setStatusNotice('');
          setViewState(gpsData.state);
          setEmployee(gpsData.employee || employee);
          setShift(gpsData.shift || null);
          setDailyTask('');
          return;
        } catch (gpsErr) {
          setStatusNotice('');
          setError(gpsErr.message || err.message);
          return;
        }
      }

      setError(err.message || 'Failed to complete Check-Out.');
    } finally {
      setSubmitting(false);
      setStatusNotice('');
    }
  }

  // Days in selected history month
  const historyDays = getDaysInMonth(historyMonth);
  const historyRecordByDate = new Map();
  if (historyData?.records) {
    for (const r of historyData.records) {
      historyRecordByDate.set(r.date, r);
    }
  }
  const historyHolidayByDate = new Map();
  if (historyData?.holidays) {
    for (const h of historyData.holidays) {
      historyHolidayByDate.set(h.date, h);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/70 ring-1 ring-slate-200/80 sm:p-7">
          <div className="mb-5 border-b border-slate-100 pb-4">
            <TecheLogo />
          </div>

          {/* Upgrade 5: Tab Toggle for recognized employees */}
          {employee && viewState !== 'FIRST_TIME_DEVICE_SETUP' && (
            <div className="mb-5 flex rounded-2xl bg-slate-100 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('today')}
                className={`flex-1 rounded-xl py-2 transition ${activeTab === 'today'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                  }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex items-center justify-center gap-1.5 flex-1 rounded-xl py-2 transition ${activeTab === 'history'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                  }`}
              >
                <History className="h-3.5 w-3.5 text-indigo-600" />
                My Monthly Summary
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
              <p className="mt-3 text-sm font-medium text-slate-600">
                Verifying device with MongoDB Registry...
              </p>
            </div>
          ) : activeTab === 'history' ? (
            /* Upgrade 5: My Monthly Summary View */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    My Monthly Attendance
                  </h2>
                  <p className="text-xs text-slate-500">
                    {employee?.name} ({employee?.employeeId})
                  </p>
                </div>

                <input
                  type="month"
                  value={historyMonth}
                  onChange={(e) => {
                    if (e.target.value) setHistoryMonth(e.target.value);
                  }}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                />
              </div>

              {historyError && (
                <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                  {historyError}
                </div>
              )}

              {historyLoading ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
                  <p className="mt-2 text-xs text-slate-500">Loading summary...</p>
                </div>
              ) : (
                <>
                  {/* 4 Compact Stat Cards */}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <div className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                        Present
                      </div>
                      <div className="mt-1 text-lg font-extrabold text-emerald-900">
                        {historyData?.summary?.presentDays ?? 0}
                      </div>
                      <div className="text-[10px] text-emerald-700">Days</div>
                    </div>

                    <div className="rounded-2xl bg-rose-50 p-3 ring-1 ring-rose-200">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                        Absent
                      </div>
                      <div className="mt-1 text-lg font-extrabold text-rose-900">
                        {historyData?.summary?.absentDays ?? 0}
                      </div>
                      <div className="text-[10px] text-rose-700">Days</div>
                    </div>

                    <div className="rounded-2xl bg-indigo-50 p-3 ring-1 ring-indigo-200">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                        Total Hours
                      </div>
                      <div className="mt-1 text-base font-extrabold text-indigo-900">
                        {formatDuration(historyData?.summary?.totalWorkedMinutes ?? 0)}
                      </div>
                      <div className="text-[10px] text-indigo-700">Worked</div>
                    </div>

                    <div className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        Shortfall
                      </div>
                      <div className="mt-1 text-base font-extrabold text-amber-900">
                        {formatDuration(historyData?.summary?.totalShortfallMinutes ?? 0)}
                      </div>
                      <div className="text-[10px] text-amber-700">Needed</div>
                    </div>
                  </div>

                  {/* Day-by-Day Attendance List */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                      <span>DAILY LOGS ({historyDays.length} DAYS)</span>
                      <span className="text-[11px] text-slate-400">
                        Elapsed: {historyData?.summary?.workingDaysElapsed ?? 0} Working Days
                      </span>
                    </div>

                    <div className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                      {historyDays.map((d) => {
                        const record = historyRecordByDate.get(d.dateStr);
                        const holiday = historyHolidayByDate.get(d.dateStr);
                        const isSunday = d.isSunday;
                        const isFullHoliday = holiday?.type === 'HOLIDAY';
                        const isHalfDay = holiday?.type === 'HALF_DAY';
                        const targetMins = isHalfDay ? HALF_DAY_SHIFT_MINUTES : REQUIRED_SHIFT_MINUTES;
                        const isPast = d.dateStr < (historyData?.todayIST || getTodayISTClient());
                        const isToday = d.dateStr === (historyData?.todayIST || getTodayISTClient());

                        return (
                          <div key={d.dateStr} className="p-3 text-xs">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">
                                  Day {d.day} ({d.weekdayShort})
                                </span>
                                {isSunday && (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                    Sunday Holiday
                                  </span>
                                )}
                                {isFullHoliday && (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                    {holiday.title}
                                  </span>
                                )}
                                {isHalfDay && (
                                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                                    Half-Day (3h 45m)
                                  </span>
                                )}
                              </div>

                              <div>
                                {record ? (
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${record.status === 'COMPLETED'
                                        ? record.totalWorkedMinutes >= targetMins
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-rose-100 text-rose-800'
                                        : record.status === 'MISSING_CHECKOUT'
                                          ? 'bg-rose-100 text-rose-800'
                                          : 'bg-indigo-100 text-indigo-800'
                                      }`}
                                  >
                                    {record.status === 'COMPLETED'
                                      ? record.totalWorkedMinutes >= targetMins
                                        ? 'Completed'
                                        : 'Shortfall'
                                      : record.status === 'MISSING_CHECKOUT'
                                        ? 'Missed Check-Out'
                                        : 'Currently Working'}
                                  </span>
                                ) : isSunday || isFullHoliday ? (
                                  <span className="text-[10px] text-slate-400">Off</span>
                                ) : isPast ? (
                                  <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200">
                                    Absent
                                  </span>
                                ) : isToday ? (
                                  <span className="text-[10px] font-semibold text-slate-500">Today</span>
                                ) : (
                                  <span className="text-[10px] text-slate-400">Upcoming</span>
                                )}
                              </div>
                            </div>

                            {record && (
                              <div className="mt-1.5 rounded-xl bg-slate-50 p-2 text-[11px] text-slate-700">
                                <div className="flex flex-wrap items-center justify-between gap-1">
                                  <span>
                                    In: <span className="font-semibold text-slate-900">{formatTime12hIST(record.checkInTime)}</span>
                                  </span>
                                  <span>
                                    Out: <span className="font-semibold text-slate-900">{record.checkOutTime ? formatTime12hIST(record.checkOutTime) : '--'}</span>
                                  </span>
                                  <span>
                                    Worked: <span className="font-bold text-slate-900">{formatDuration(record.totalWorkedMinutes)}</span>
                                  </span>
                                </div>
                                {record.dailyTask && (
                                  <div className="mt-1 border-t border-slate-200/60 pt-1 italic text-slate-600">
                                    &quot;{record.dailyTask}&quot;
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-2xl bg-rose-50 p-3.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                  {error}
                </div>
              )}

              {statusNotice && (
                <div className="mb-4 rounded-2xl bg-indigo-50 p-3.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">
                  {statusNotice}
                </div>
              )}

              {/* VIEW 1A: Recognized Employee Check-In */}
              {viewState === 'RECOGNIZED_READY_FOR_CHECKIN' && employee && (
                <div className="space-y-5">
                  <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 p-5 ring-1 ring-emerald-200">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
                      <ShieldCheck className="h-4 w-4" />
                      Recognized via MongoDB Device Registry
                    </div>
                    <div className="mt-3">
                      <div className="text-xl font-extrabold text-slate-900">
                        {employee.name}
                      </div>
                      <div className="mt-0.5 inline-flex items-center rounded-lg bg-white/80 px-2.5 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
                        {employee.employeeId}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRecognizedCheckIn}
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-60"
                  >
                    <LogIn className="h-5 w-5" />
                    {submitting ? 'Checking In...' : 'Check-In'}
                  </button>

                  <p className="text-center text-xs text-slate-500">
                    Requires TechE Institute Wi-Fi or campus proximity (100m).
                  </p>

                  <PushSubscribeButton
                    initiallySubscribed={employee.hasPushSubscription}
                  />
                </div>
              )}

              {/* VIEW 1B: First-Time Device Setup */}
              {viewState === 'FIRST_TIME_DEVICE_SETUP' && (
                <form onSubmit={handleFirstTimeCheckIn} className="space-y-5">
                  <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700">
                      <Smartphone className="h-4 w-4" />
                      First-Time Device Setup
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                      Bind this phone permanently to your TechE Employee ID. Next
                      time you open this portal, your name will appear
                      automatically.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        EMPLOYEE ID
                      </label>
                      {unboundEmployees.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setManualIdMode((prev) => !prev);
                            if (manualIdMode && unboundEmployees[0]) {
                              setSelectedEmployeeId(unboundEmployees[0].employeeId);
                            } else {
                              setSelectedEmployeeId('');
                            }
                          }}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          {manualIdMode ? 'Choose from list' : 'Enter ID manually'}
                        </button>
                      )}
                    </div>

                    {!manualIdMode && unboundEmployees.length > 0 ? (
                      <select
                        value={selectedEmployeeId}
                        onChange={(e) => setSelectedEmployeeId(e.target.value)}
                        required
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      >
                        {unboundEmployees.map((emp) => (
                          <option key={emp.employeeId} value={emp.employeeId}>
                            {emp.employeeId} — {emp.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={selectedEmployeeId}
                        onChange={(e) => setSelectedEmployeeId(e.target.value)}
                        placeholder="e.g., TECHE1003"
                        required
                        className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm font-semibold uppercase text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-60"
                  >
                    <LogIn className="h-5 w-5" />
                    {submitting
                      ? 'Registering Phone...'
                      : 'Register Phone & Check-In'}
                  </button>
                </form>
              )}

              {/* VIEW 2: Shift Started */}
              {viewState === 'SHIFT_STARTED' && employee && shift && (
                <div className="space-y-5">
                  <div className="text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <CheckCircle2 className="h-9 w-9" />
                    </div>
                    <h1 className="mt-3 text-2xl font-extrabold text-slate-900">
                      Shift Started
                    </h1>
                    <p className="mt-1 text-sm text-slate-600">
                      Welcome to work, <span className="font-bold">{employee.name}</span>! Your start log has been secured.
                    </p>
                  </div>

                  <div className="divide-y divide-slate-100 rounded-2xl bg-slate-50 px-4 ring-1 ring-slate-200">
                    <div className="flex items-center justify-between py-3 text-sm">
                      <span className="text-slate-500">Name</span>
                      <span className="font-bold text-slate-900">{employee.name}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 text-sm">
                      <span className="text-slate-500">Employee ID</span>
                      <span className="font-bold text-slate-900">{employee.employeeId}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 text-sm">
                      <span className="text-slate-500">Clocked In</span>
                      <span className="font-bold text-emerald-700">
                        {formatTime12hIST(shift.checkInTime, true)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-3 text-sm">
                      <span className="text-slate-500">Est. Checkout</span>
                      <span className="font-bold text-indigo-700">
                        {formatTime12hIST(shift.estCheckOutTime, false)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setViewState('CURRENTLY_WORKING')}
                    className="w-full rounded-2xl bg-slate-900 px-6 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-slate-800"
                  >
                    Go to Active Shift Dashboard
                  </button>

                  <PushSubscribeButton
                    initiallySubscribed={employee.hasPushSubscription}
                  />
                </div>
              )}

              {/* VIEW 3: Active Shift & Daily Work Summary */}
              {viewState === 'CURRENTLY_WORKING' && employee && shift && (
                <form onSubmit={handleCheckOut} className="space-y-5">
                  <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-lg font-extrabold text-slate-900">
                          {employee.name}
                        </div>
                        <div className="text-xs font-bold text-slate-500">
                          {employee.employeeId}
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Status: Currently Working
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-slate-200">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <Clock className="h-4 w-4 text-indigo-600" />
                        Elapsed Shift
                      </div>
                      <span
                        className={`rounded-lg px-2.5 py-1 text-xs font-extrabold ${elapsedMinutes >= REQUIRED_SHIFT_MINUTES
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-indigo-50 text-indigo-700'
                          }`}
                      >
                        {formatDuration(elapsedMinutes)} / 7h 30m
                      </span>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="daily-work-summary"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                    >
                      DAILY WORK SUMMARY
                    </label>
                    <textarea
                      id="daily-work-summary"
                      rows={5}
                      required
                      value={dailyTask}
                      onChange={(e) => setDailyTask(e.target.value)}
                      placeholder="What tasks or modules did you work on today?..."
                      className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-6 py-4 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600 active:scale-[0.99] disabled:opacity-60"
                  >
                    <LogOut className="h-5 w-5" />
                    {submitting ? 'Submitting Check-Out...' : 'Check-Out'}
                  </button>

                  <p className="text-center text-xs text-slate-500">
                    Requires TechE Institute Wi-Fi or campus proximity (100m).
                  </p>

                  <PushSubscribeButton
                    initiallySubscribed={employee.hasPushSubscription}
                  />
                </form>
              )}

              {/* VIEW 4: Shift Completed */}
              {viewState === 'SHIFT_COMPLETED' && employee && shift && (
                <div className="space-y-5">
                  {shift.shortfallMinutes > 0 && (
                    <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
                      <div className="text-sm font-extrabold text-rose-800">
                        ⚠️ Incomplete Shift Warning
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-rose-700">
                        You are checking out{' '}
                        <span className="font-bold">
                          {formatDuration(shift.shortfallMinutes)}
                        </span>{' '}
                        before completing your required shift.
                      </p>
                    </div>
                  )}

                  <div className="divide-y divide-slate-100 rounded-2xl bg-slate-50 px-4 ring-1 ring-slate-200">
                    <div className="flex items-center justify-between py-3 text-sm">
                      <span className="text-slate-500">Name</span>
                      <span className="font-bold text-slate-900">{employee.name}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 text-sm">
                      <span className="text-slate-500">Employee ID</span>
                      <span className="font-bold text-slate-900">{employee.employeeId}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 text-sm">
                      <span className="text-slate-500">Checked Out</span>
                      <span className="font-bold text-slate-900">
                        {formatTime12hIST(shift.checkOutTime, true)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-3 text-sm">
                      <span className="text-slate-500">Total Worked</span>
                      <span className="font-bold text-slate-900">
                        {formatDuration(shift.totalWorkedMinutes)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-3 text-sm">
                      <span className="text-slate-500">Time Shortfall</span>
                      <span
                        className={`font-bold ${shift.shortfallMinutes > 0
                            ? 'text-rose-600'
                            : 'text-emerald-700'
                          }`}
                      >
                        {shift.shortfallMinutes > 0
                          ? `${formatDuration(shift.shortfallMinutes)} needed`
                          : '0h 0m'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-3 text-sm">
                      <span className="text-slate-500">Shift Status</span>
                      {shift.shortfallMinutes > 0 ? (
                        <span className="font-bold text-rose-600">
                          -{formatDuration(shift.shortfallMinutes)} Short/Early
                        </span>
                      ) : (
                        <span className="font-bold text-emerald-700">
                          Completed
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      LOGGED ACTIVITY SUMMARY
                    </div>
                    <p className="mt-2 text-sm italic leading-relaxed text-slate-800">
                      &quot;{shift.dailyTask}&quot;
                    </p>
                  </div>

                  <PushSubscribeButton
                    initiallySubscribed={employee.hasPushSubscription}
                  />
                </div>
              )}

              {/* VIEW 5: Check-In Locked: Missed Previous Check-Out */}
              {viewState === 'LOCKED_PENDING_ADMIN_APPROVAL' && (
                <div className="space-y-5">
                  <div className="rounded-2xl bg-rose-50 p-5 ring-1 ring-rose-200">
                    <div className="flex items-center gap-2.5 text-rose-800">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100">
                        <Lock className="h-5 w-5 text-rose-600" />
                      </div>
                      <div>
                        <h2 className="text-base font-extrabold">
                          Check-In Locked
                        </h2>
                        {employee && (
                          <p className="text-xs font-semibold text-rose-700">
                            {employee.name} ({employee.employeeId})
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-relaxed text-rose-900">
                      You checked in on{' '}
                      <span className="font-bold">
                        {formatDatePretty(missedShift?.date)}
                      </span>{' '}
                      at{' '}
                      <span className="font-bold">
                        {formatTime12hIST(missedShift?.checkInTime)}
                      </span>{' '}
                      but forgot to check out. Yesterday&apos;s check-out time can
                      only be added after it is accepted by the Admin. Please see
                      the Admin to approve your previous check-out.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={loadSession}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Check Admin Approval Status
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-4 text-center">
          <Link
            to="/admin"
            className="text-xs font-semibold text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
          >
            Open TechE Master Attendance Ledger (Admin)
          </Link>
        </div>
      </div>
    </div>
  );
}
