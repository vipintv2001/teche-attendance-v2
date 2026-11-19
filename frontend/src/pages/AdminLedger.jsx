import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Lock,
  LogOut,
  RefreshCw,
  Smartphone,
  Unlink,
  Users,
  Wifi
} from 'lucide-react';
import {
  fetchAdminMe,
  fetchAdminSettings,
  fetchMonthlyLedger,
  postAdminLogin,
  postAdminLogout,
  postUnbindDevice,
  postUpdateOfficeIp
} from '../api/client';
import {
  REQUIRED_SHIFT_MINUTES,
  HALF_DAY_SHIFT_MINUTES,
  formatDuration,
  formatTime24hIST,
  getDaysInMonth,
  getTodayISTClient
} from '../utils/timeUtils';
import {
  generateDailyAttendancePdf,
  generateMonthlySummaryPdf
} from '../utils/pdfGenerators';
import TecheLogo from '../components/TecheLogo';
import ManualOverrideModal from '../components/ManualOverrideModal';
import ManageHolidaysModal from '../components/ManageHolidaysModal';
import ManageStaffModal from '../components/ManageStaffModal';

export default function AdminLedger() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');

  // Login form state
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Ledger state
  const [yearMonth, setYearMonth] = useState(() => getTodayISTClient().slice(0, 7));
  const [todayIST, setTodayIST] = useState(() => getTodayISTClient());
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [holidays, setHolidays] = useState([]);

  // Office Network Settings
  const [officeSettings, setOfficeSettings] = useState({
    savedOfficeIp: '',
    currentRequestIp: ''
  });
  const [ipUpdating, setIpUpdating] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Modals
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState({
    employeeId: '',
    date: ''
  });
  const [showHolidaysModal, setShowHolidaysModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);

  // Check auth status on initial load
  const checkAuth = useCallback(async () => {
    try {
      const data = await fetchAdminMe();
      if (data?.authenticated) {
        setAuthenticated(true);
        setAdminUsername(data.username || 'Admin');
      } else {
        setAuthenticated(false);
      }
    } catch {
      setAuthenticated(false);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Load ledger & settings once authenticated
  const loadLedger = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    setError('');
    try {
      const [ledgerData, settingsData] = await Promise.all([
        fetchMonthlyLedger(yearMonth),
        fetchAdminSettings().catch(() => null)
      ]);

      setEmployees(ledgerData.employees || []);
      setRecords(ledgerData.records || []);
      setPendingApprovals(ledgerData.pendingApprovals || []);
      setHolidays(ledgerData.holidays || []);
      if (ledgerData.todayIST) {
        setTodayIST(ledgerData.todayIST);
      }
      if (settingsData) {
        setOfficeSettings({
          savedOfficeIp: settingsData.savedOfficeIp || '',
          currentRequestIp: settingsData.currentRequestIp || ''
        });
      }
    } catch (err) {
      if (err.status === 401) {
        setAuthenticated(false);
        return;
      }
      setError(err.message || 'Failed to load Master Attendance Ledger.');
    } finally {
      setLoading(false);
    }
  }, [authenticated, yearMonth]);

  useEffect(() => {
    if (authenticated) {
      loadLedger();
    }
  }, [authenticated, loadLedger]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginSubmitting(true);
    setLoginError('');
    try {
      const res = await postAdminLogin({
        username: loginUser,
        password: loginPass
      });
      setLoginUser('');
      setLoginPass('');
      setAdminUsername(res?.username || 'Admin');
      setAuthenticated(true);
    } catch (err) {
      setLoginError(err.message || 'Invalid Admin credentials.');
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await postAdminLogout();
    } finally {
      setAuthenticated(false);
      setAdminUsername('');
      setEmployees([]);
      setRecords([]);
      setToast('Signed out of Admin Panel.');
    }
  }

  async function handleUpdateOfficeIp(targetIp) {
    setIpUpdating(true);
    try {
      const res = await postUpdateOfficeIp(targetIp);
      setOfficeSettings((prev) => ({
        ...prev,
        savedOfficeIp: res.officePublicIp
      }));
      setToast(`Office Wi-Fi IP updated to ${res.officePublicIp}`);
    } catch (err) {
      setError(err.message || 'Failed to update office public IP.');
    } finally {
      setIpUpdating(false);
    }
  }

  async function handleUnbind(empId) {
    try {
      await postUnbindDevice(empId);
      setToast(`Device unbound for ${empId}.`);
      await loadLedger();
    } catch (err) {
      setError(err.message || 'Failed to unbind device.');
    }
  }

  const days = useMemo(() => getDaysInMonth(yearMonth), [yearMonth]);

  const holidayByDate = useMemo(() => {
    const map = new Map();
    for (const h of holidays) {
      map.set(h.date, h);
    }
    return map;
  }, [holidays]);

  const recordsByKey = useMemo(() => {
    const map = new Map();
    for (const r of records) {
      map.set(`${r.employeeId}__${r.date}`, r);
    }
    for (const p of pendingApprovals) {
      const key = `${p.employeeId}__${p.date}`;
      if (!map.has(key)) {
        map.set(key, p);
      }
    }
    return map;
  }, [records, pendingApprovals]);

  const activeExistingRecord =
    overrideTarget.employeeId && overrideTarget.date
      ? recordsByKey.get(`${overrideTarget.employeeId}__${overrideTarget.date}`)
      : null;

  // View Gate: Loading Initial Auth Check
  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // View Gate: Admin Login Card (Upgrade 1)
  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 via-slate-50 to-white p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl shadow-slate-200/80 ring-1 ring-slate-200">
          <div className="mb-6 border-b border-slate-100 pb-5">
            <TecheLogo />
          </div>

          <div className="mb-5 flex items-center gap-2.5 rounded-2xl bg-indigo-50 p-3.5 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-200">
            <Lock className="h-4 w-4 shrink-0 text-indigo-600" />
            <span>Master Attendance Ledger is protected. Please sign in as Admin.</span>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Admin Username
              </label>
              <input
                type="text"
                required
                autoComplete="username"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="Enter admin username"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Admin Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="Enter admin password"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {loginError && (
              <div className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginSubmitting}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-60"
            >
              <Lock className="h-4 w-4" />
              {loginSubmitting ? 'Authenticating...' : 'Sign In to Master Ledger'}
            </button>
          </form>

          <div className="mt-5 text-center">
            <Link
              to="/"
              className="text-xs font-semibold text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
            >
              Return to Employee Attendance Portal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // View: Authenticated Master Ledger View
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Top Toolbar */}
      <header className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3.5">
            <Link to="/" title="TechE Education">
              <img
                src="/teche_logo.png"
                alt="TechE Education"
                className="h-10 max-w-[150px] object-contain"
              />
            </Link>
            <div className="hidden h-8 w-[1px] bg-slate-200 sm:block" />
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
                  📊 TechE Master Attendance Ledger
                </h1>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  Unified Month Matrix View
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Logged in as <span className="font-bold text-slate-800">{adminUsername}</span> • IST (Asia/Kolkata) •{' '}
                <Link
                  to="/"
                  className="font-semibold text-indigo-600 hover:underline"
                >
                  Employee Portal (/)
                </Link>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Target Period Month Picker */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
              <label
                htmlFor="ledger-month-picker"
                className="text-xs font-bold uppercase tracking-wider text-slate-600"
              >
                Target Ledger Period
              </label>
              <input
                id="ledger-month-picker"
                type="month"
                value={yearMonth}
                onChange={(e) => {
                  if (e.target.value) setYearMonth(e.target.value);
                }}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500"
              />
            </div>

            {/* Upgrade 3: Manage Holidays */}
            <button
              type="button"
              onClick={() => setShowHolidaysModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 shadow-sm transition hover:bg-amber-100"
            >
              <Calendar className="h-4 w-4 text-amber-700" />
              Holidays ({holidays.length})
            </button>

            {/* Upgrade 4: Manage Staff */}
            <button
              type="button"
              onClick={() => setShowStaffModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-900 shadow-sm transition hover:bg-indigo-100"
            >
              <Users className="h-4 w-4 text-indigo-700" />
              Manage Staff ({employees.length})
            </button>

            {/* PDF Exports */}
            <button
              type="button"
              onClick={() =>
                generateMonthlySummaryPdf({
                  yearMonth,
                  todayIST,
                  employees,
                  recordsByKey,
                  holidayMap: holidayByDate
                })
              }
              disabled={employees.length === 0}
              className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              📄 Download Monthly Report PDF
            </button>

            {/* Manual Override Button */}
            <button
              type="button"
              onClick={() => {
                setOverrideTarget({
                  employeeId: employees[0]?.employeeId || '',
                  date: todayIST
                });
                setShowOverrideModal(true);
              }}
              className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"
            >
              ⚙️ Admin Manual Entry / Edit
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={loadLedger}
              title="Refresh ledger"
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Upgrade 1: Logout */}
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </div>

        {/* Upgrade 2: 1-Click Office Wi-Fi IP Network Widget */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-700">
              <Wifi className="h-4 w-4 text-indigo-600" />
              <span>Office Wi-Fi IP:</span>
              <span className="rounded bg-white px-2 py-0.5 font-mono text-slate-900 ring-1 ring-slate-200">
                {officeSettings.savedOfficeIp || 'Not configured'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 font-medium text-slate-500">
              <span>Your Current Public IP:</span>
              <span className="rounded bg-white px-2 py-0.5 font-mono text-slate-800 ring-1 ring-slate-200">
                {officeSettings.currentRequestIp || 'Resolving...'}
              </span>
            </div>
          </div>

          {officeSettings.currentRequestIp &&
            officeSettings.currentRequestIp !== officeSettings.savedOfficeIp && (
              <button
                type="button"
                onClick={() => handleUpdateOfficeIp(officeSettings.currentRequestIp)}
                disabled={ipUpdating}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {ipUpdating ? 'Updating IP...' : 'Use Current Wi-Fi as Office IP'}
              </button>
            )}
        </div>

        {/* Pending Missed Check-out Approvals Banner */}
        {pendingApprovals.length > 0 && (
          <div className="mt-3.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-extrabold text-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                {pendingApprovals.length} Missed Check-Out(s) Awaiting Admin Approval (Devices Locked):
              </div>
              <div className="flex flex-wrap gap-2">
                {pendingApprovals.map((item) => (
                  <button
                    key={`${item.employeeId}-${item.date}`}
                    type="button"
                    onClick={() => {
                      setOverrideTarget({
                        employeeId: item.employeeId,
                        date: item.date
                      });
                      setShowOverrideModal(true);
                    }}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-amber-900 shadow-sm ring-1 ring-amber-300 hover:bg-amber-100"
                  >
                    Approve {item.name} ({item.employeeId}) — {item.date}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
            {toast}
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-xl bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
            {error}
          </div>
        )}
      </header>

      {/* Matrix Grid Table */}
      <main className="p-4 sm:p-6">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                {/* Day Header Row */}
                <tr className="border-b border-slate-200 bg-slate-900 text-white">
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-20 min-w-[240px] border-r border-slate-700 bg-slate-900 px-4 py-3 text-left align-middle"
                  >
                    <div className="text-xs font-extrabold uppercase tracking-wider">
                      Employee Metadata
                    </div>
                    <div className="mt-0.5 text-[11px] font-normal text-slate-300">
                      Name • Emp ID • Phone Registry
                    </div>
                  </th>

                  {days.map((d) => {
                    const holiday = holidayByDate.get(d.dateStr);
                    const isFullHoliday = holiday?.type === 'HOLIDAY';
                    const isHalfDay = holiday?.type === 'HALF_DAY';

                    if (d.isSunday || isFullHoliday) {
                      return (
                        <th
                          key={d.dateStr}
                          rowSpan={2}
                          className="min-w-[58px] border-r border-slate-700 bg-amber-950/70 px-2 py-2 text-center align-middle"
                        >
                          <div className="font-bold text-amber-200">
                            Day {d.day}
                          </div>
                          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                            {d.isSunday ? 'Sun' : holiday?.title || 'Holiday'}
                          </div>
                        </th>
                      );
                    }

                    return (
                      <th
                        key={d.dateStr}
                        colSpan={3}
                        className={`border-r border-slate-700 px-2 py-2 text-center ${
                          isHalfDay ? 'bg-indigo-950/70' : ''
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="font-bold">
                            Day {d.day} ({d.weekdayShort})
                          </span>
                          {isHalfDay && (
                            <span className="rounded bg-indigo-800 px-1 py-0.2 text-[9px] font-extrabold text-indigo-200">
                              3h 45m
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              generateDailyAttendancePdf({
                                dateStr: d.dateStr,
                                todayIST,
                                employees,
                                recordsByKey,
                                holiday
                              })
                            }
                            className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-white transition hover:bg-emerald-600"
                            title={`Download Daily PDF for ${d.dateStr}`}
                          >
                            📄 PDF
                          </button>
                        </div>
                      </th>
                    );
                  })}
                </tr>

                {/* Sub-columns Row (In | Out | Work) */}
                <tr className="border-b border-slate-200 bg-slate-800 text-[11px] font-semibold text-slate-200">
                  {days.map((d) => {
                    const isFullHoliday = holidayByDate.get(d.dateStr)?.type === 'HOLIDAY';
                    if (d.isSunday || isFullHoliday) return null;
                    return (
                      <React.Fragment key={`${d.dateStr}-sub`}>
                        <th className="min-w-[52px] border-r border-slate-700 px-1.5 py-1.5 text-center">
                          In
                        </th>
                        <th className="min-w-[52px] border-r border-slate-700 px-1.5 py-1.5 text-center">
                          Out
                        </th>
                        <th className="min-w-[76px] border-r border-slate-600 px-1.5 py-1.5 text-center">
                          Work
                        </th>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {employees.map((emp) => (
                  <tr
                    key={emp.employeeId}
                    className={`group hover:bg-slate-50/70 ${
                      !emp.isActive ? 'bg-slate-50/60 opacity-80' : ''
                    }`}
                  >
                    {/* Sticky Left Column: Employee Metadata */}
                    <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3 align-middle group-hover:bg-slate-50">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{emp.name}</span>
                        {!emp.isActive && (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                            ARCHIVED
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700">
                          {emp.employeeId}
                        </span>
                        {emp.isDeviceBound ? (
                          <button
                            type="button"
                            onClick={() => handleUnbind(emp.employeeId)}
                            className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
                            title="Unbind Phone so employee can register a new device"
                          >
                            <Unlink className="h-3 w-3" />
                            Unbind Phone
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400">
                            <Smartphone className="h-3 w-3" />
                            Unbound
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Calendar Cells */}
                    {days.map((d) => {
                      const holiday = holidayByDate.get(d.dateStr);
                      const isFullHoliday = holiday?.type === 'HOLIDAY';
                      const isHalfDay = holiday?.type === 'HALF_DAY';
                      const targetMinutes = isHalfDay ? HALF_DAY_SHIFT_MINUTES : REQUIRED_SHIFT_MINUTES;

                      if (d.isSunday || isFullHoliday) {
                        return (
                          <td
                            key={`${emp.employeeId}-${d.dateStr}`}
                            className="border-r border-slate-200 bg-amber-50/70 px-1 py-2 text-center align-middle text-[10px] font-extrabold tracking-widest text-amber-700"
                            title={holiday ? `${holiday.type}: ${holiday.title}` : 'Sunday Holiday'}
                          >
                            HOLIDAY
                          </td>
                        );
                      }

                      const record = recordsByKey.get(
                        `${emp.employeeId}__${d.dateStr}`
                      );
                      const isPastWorkingDay = d.dateStr < todayIST;

                      if (!record && isPastWorkingDay) {
                        return (
                          <td
                            key={`${emp.employeeId}-${d.dateStr}`}
                            colSpan={3}
                            onClick={() => {
                              setOverrideTarget({
                                employeeId: emp.employeeId,
                                date: d.dateStr
                              });
                              setShowOverrideModal(true);
                            }}
                            className="cursor-pointer border-r border-slate-200 bg-rose-50 px-2 py-2.5 text-center font-extrabold text-rose-700 transition hover:bg-rose-100"
                            title="Click to enter manual attendance"
                          >
                            ABSENT (A)
                          </td>
                        );
                      }

                      if (!record) {
                        return (
                          <React.Fragment key={`${emp.employeeId}-${d.dateStr}`}>
                            <td
                              onClick={() => {
                                setOverrideTarget({
                                  employeeId: emp.employeeId,
                                  date: d.dateStr
                                });
                                setShowOverrideModal(true);
                              }}
                              className="cursor-pointer border-r border-slate-100 px-1.5 py-2.5 text-center text-slate-400 hover:bg-indigo-50"
                            >
                              --
                            </td>
                            <td
                              onClick={() => {
                                setOverrideTarget({
                                  employeeId: emp.employeeId,
                                  date: d.dateStr
                                });
                                setShowOverrideModal(true);
                              }}
                              className="cursor-pointer border-r border-slate-100 px-1.5 py-2.5 text-center text-slate-400 hover:bg-indigo-50"
                            >
                              --
                            </td>
                            <td
                              onClick={() => {
                                setOverrideTarget({
                                  employeeId: emp.employeeId,
                                  date: d.dateStr
                                });
                                setShowOverrideModal(true);
                              }}
                              className="cursor-pointer border-r border-slate-200 px-1.5 py-2.5 text-center text-slate-400 hover:bg-indigo-50"
                            >
                              --
                            </td>
                          </React.Fragment>
                        );
                      }

                      const isCompleted = record.status === 'COMPLETED';
                      const isMissing = record.status === 'MISSING_CHECKOUT';
                      const workedMinutes = Number(record.totalWorkedMinutes) || 0;
                      const metTarget = isCompleted && workedMinutes >= targetMinutes;
                      const shortfall = Math.max(0, targetMinutes - workedMinutes);

                      return (
                        <React.Fragment key={`${emp.employeeId}-${d.dateStr}`}>
                          <td
                            onClick={() => {
                              setOverrideTarget({
                                employeeId: emp.employeeId,
                                date: d.dateStr
                              });
                              setShowOverrideModal(true);
                            }}
                            className="cursor-pointer border-r border-slate-100 px-1.5 py-2.5 text-center font-medium text-slate-700 hover:bg-indigo-50"
                            title={record.dailyTask || ''}
                          >
                            {formatTime24hIST(record.checkInTime)}
                          </td>

                          <td
                            onClick={() => {
                              setOverrideTarget({
                                employeeId: emp.employeeId,
                                date: d.dateStr
                              });
                              setShowOverrideModal(true);
                            }}
                            className="cursor-pointer border-r border-slate-100 px-1.5 py-2.5 text-center font-medium hover:bg-indigo-50"
                            title={record.dailyTask || ''}
                          >
                            {record.checkOutTime ? (
                              <span className="text-slate-700">
                                {formatTime24hIST(record.checkOutTime)}
                              </span>
                            ) : isMissing ? (
                              <span className="rounded bg-rose-100 px-1 py-0.5 text-[10px] font-bold text-rose-700">
                                MISSED
                              </span>
                            ) : (
                              <span className="rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-bold text-emerald-700">
                                LIVE
                              </span>
                            )}
                          </td>

                          <td
                            onClick={() => {
                              setOverrideTarget({
                                employeeId: emp.employeeId,
                                date: d.dateStr
                              });
                              setShowOverrideModal(true);
                            }}
                            className={`cursor-pointer border-r border-slate-200 px-1.5 py-2.5 text-center font-bold hover:opacity-90 ${
                              isCompleted
                                ? metTarget
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-rose-50 text-rose-700'
                                : isMissing
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-indigo-50 text-indigo-700'
                            }`}
                            title={record.dailyTask || ''}
                          >
                            {isCompleted ? (
                              <div>
                                <div>{formatDuration(workedMinutes)}</div>
                                {shortfall > 0 && (
                                  <div className="text-[10px] font-semibold text-rose-600">
                                    -{formatDuration(shortfall)}
                                  </div>
                                )}
                              </div>
                            ) : isMissing ? (
                              'LOCKED'
                            ) : (
                              'ACTIVE'
                            )}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}

                {!loading && employees.length === 0 && (
                  <tr>
                    <td
                      colSpan={days.length * 3 + 1}
                      className="px-6 py-10 text-center text-sm text-slate-500"
                    >
                      No employees found. Click &quot;Manage Staff&quot; to add employees.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Manual Override Modal */}
      <ManualOverrideModal
        isOpen={showOverrideModal}
        onClose={() => setShowOverrideModal(false)}
        employees={employees}
        initialEmployeeId={overrideTarget.employeeId}
        initialDate={overrideTarget.date}
        existingRecord={activeExistingRecord}
        onSaved={async () => {
          setShowOverrideModal(false);
          setToast('Manual attendance record saved and ledger updated.');
          await loadLedger();
        }}
        onAuthExpired={() => {
          setAuthenticated(false);
          setShowOverrideModal(false);
        }}
      />

      {/* Manage Holidays Modal (Upgrade 3) */}
      <ManageHolidaysModal
        isOpen={showHolidaysModal}
        onClose={() => setShowHolidaysModal(false)}
        holidays={holidays}
        yearMonth={yearMonth}
        onUpdated={async () => {
          setToast('Holidays updated.');
          await loadLedger();
        }}
      />

      {/* Manage Staff Modal (Upgrade 4) */}
      <ManageStaffModal
        isOpen={showStaffModal}
        onClose={() => setShowStaffModal(false)}
        employees={employees}
        onUpdated={async () => {
          await loadLedger();
        }}
      />
    </div>
  );
}
