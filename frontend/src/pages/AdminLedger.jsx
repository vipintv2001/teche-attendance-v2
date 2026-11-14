import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  LogOut,
  RefreshCw,
  Smartphone,
  Unlink
} from 'lucide-react';
import {
  fetchMonthlyLedger,
  postAdminLogout,
  postUnbindDevice
} from '../api/client';
import {
  REQUIRED_SHIFT_MINUTES,
  formatDuration,
  formatTime24hIST,
  getDaysInMonth,
  getTodayISTClient
} from '../utils/timeUtils';
import {
  generateDailyAttendancePdf,
  generateMonthlySummaryPdf
} from '../utils/pdfGenerators';
import AdminLoginModal from '../components/AdminLoginModal';
import ManualOverrideModal from '../components/ManualOverrideModal';

export default function AdminLedger() {
  const [yearMonth, setYearMonth] = useState(() => getTodayISTClient().slice(0, 7));
  const [todayIST, setTodayIST] = useState(() => getTodayISTClient());
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [authenticated, setAuthenticated] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Modal orchestration
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState({
    employeeId: '',
    date: ''
  });
  const [pendingAction, setPendingAction] = useState(null);

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchMonthlyLedger(yearMonth);
      setEmployees(data.employees || []);
      setRecords(data.records || []);
      setPendingApprovals(data.pendingApprovals || []);
      setAuthenticated(Boolean(data.authenticated));
      if (data.todayIST) {
        setTodayIST(data.todayIST);
      }
    } catch (err) {
      setError(err.message || 'Failed to load Master Attendance Ledger.');
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const days = useMemo(() => getDaysInMonth(yearMonth), [yearMonth]);

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

  async function runProtectedAction(action) {
    if (!authenticated) {
      setPendingAction(action);
      setShowLoginModal(true);
      return;
    }

    if (action.type === 'override') {
      setOverrideTarget({
        employeeId: action.employeeId || employees[0]?.employeeId || '',
        date: action.date || todayIST
      });
      setShowOverrideModal(true);
      return;
    }

    if (action.type === 'unbind') {
      try {
        await postUnbindDevice(action.employeeId);
        setToast(`Device unbound for ${action.employeeId}.`);
        await loadLedger();
      } catch (err) {
        if (err.status === 401) {
          setAuthenticated(false);
          setPendingAction(action);
          setShowLoginModal(true);
          return;
        }
        setError(err.message || 'Failed to unbind device.');
      }
    }
  }

  async function handleLoginSuccess() {
    setAuthenticated(true);
    setShowLoginModal(false);
    const nextAction = pendingAction;
    setPendingAction(null);
    if (nextAction) {
      if (nextAction.type === 'override') {
        setOverrideTarget({
          employeeId: nextAction.employeeId || employees[0]?.employeeId || '',
          date: nextAction.date || todayIST
        });
        setShowOverrideModal(true);
      } else if (nextAction.type === 'unbind') {
        try {
          await postUnbindDevice(nextAction.employeeId);
          setToast(`Device unbound for ${nextAction.employeeId}.`);
          await loadLedger();
        } catch (err) {
          setError(err.message || 'Failed to unbind device.');
        }
      }
    }
  }

  async function handleLogout() {
    try {
      await postAdminLogout();
      setAuthenticated(false);
      setToast('Admin signed out.');
    } catch (err) {
      setError(err.message || 'Failed to sign out.');
    }
  }

  const activeExistingRecord =
    overrideTarget.employeeId && overrideTarget.date
      ? recordsByKey.get(`${overrideTarget.employeeId}__${overrideTarget.date}`)
      : null;

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
                <div className="hidden sm:block h-8 w-[1px] bg-slate-200" />
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
                      📊 TechE Master Attendance Ledger
                    </h1>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      Unified Month Calendar Matrix Grid View
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Standard Shift: 7h 30m (450 mins) • All timestamps in IST
                    (Asia/Kolkata) •{' '}
                    <Link
                      to="/"
                      className="font-semibold text-indigo-600 hover:underline"
                    >
                      Employee Portal (/)
                    </Link>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
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

                <button
                  type="button"
                  onClick={() =>
                    generateMonthlySummaryPdf({
                      yearMonth,
                      todayIST,
                      employees,
                      recordsByKey
                    })
                  }
                  disabled={employees.length === 0}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  📄 Download Monthly Report PDF
                </button>

                <button
                  type="button"
                  onClick={() =>
                    runProtectedAction({
                      type: 'override',
                      employeeId: employees[0]?.employeeId || '',
                      date: todayIST
                    })
                  }
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700"
                >
                  ⚙️ Admin Manual Entry / Edit
                </button>

                <button
                  type="button"
                  onClick={loadLedger}
                  title="Refresh ledger"
                  className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>

                {authenticated && (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Admin Logout
                  </button>
                )}
              </div>
            </div>

            {/* Pending Missed Check-out Approvals Banner */}
            {pendingApprovals.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
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
                        onClick={() =>
                          runProtectedAction({
                            type: 'override',
                            employeeId: item.employeeId,
                            date: item.date
                          })
                        }
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
                        className="sticky left-0 z-20 min-w-[230px] border-r border-slate-700 bg-slate-900 px-4 py-3 text-left align-middle"
                      >
                        <div className="text-xs font-extrabold uppercase tracking-wider">
                          Employee Metadata
                        </div>
                        <div className="mt-0.5 text-[11px] font-normal text-slate-300">
                          Name • Emp ID • Phone Registry
                        </div>
                      </th>

                      {days.map((d) =>
                        d.isSunday ? (
                          <th
                            key={d.dateStr}
                            rowSpan={2}
                            className="min-w-[54px] border-r border-slate-700 bg-amber-950/60 px-2 py-2 text-center align-middle"
                          >
                            <div className="font-bold text-amber-200">
                              Day {d.day}
                            </div>
                            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                              Sun
                            </div>
                          </th>
                        ) : (
                          <th
                            key={d.dateStr}
                            colSpan={3}
                            className="border-r border-slate-700 px-2 py-2 text-center"
                          >
                            <div className="flex items-center justify-center gap-2">
                              <span className="font-bold">
                                Day {d.day} ({d.weekdayShort})
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  generateDailyAttendancePdf({
                                    dateStr: d.dateStr,
                                    todayIST,
                                    employees,
                                    recordsByKey
                                  })
                                }
                                className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-white transition hover:bg-emerald-600"
                                title={`Download Daily PDF for ${d.dateStr}`}
                              >
                                📄 PDF
                              </button>
                            </div>
                          </th>
                        )
                      )}
                    </tr>

                    {/* Sub-columns Row (In | Out | Work) */}
                    <tr className="border-b border-slate-200 bg-slate-800 text-[11px] font-semibold text-slate-200">
                      {days.map((d) =>
                        d.isSunday ? null : (
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
                        )
                      )}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200">
                    {employees.map((emp) => (
                      <tr key={emp.employeeId} className="group hover:bg-slate-50/70">
                        {/* Sticky Left Column: Employee Metadata */}
                        <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3 align-middle group-hover:bg-slate-50">
                          <div className="font-bold text-slate-900">{emp.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700">
                              {emp.employeeId}
                            </span>
                            {emp.isDeviceBound ? (
                              <button
                                type="button"
                                onClick={() =>
                                  runProtectedAction({
                                    type: 'unbind',
                                    employeeId: emp.employeeId
                                  })
                                }
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
                          if (d.isSunday) {
                            return (
                              <td
                                key={`${emp.employeeId}-${d.dateStr}`}
                                className="border-r border-slate-200 bg-amber-50/70 px-1 py-2 text-center align-middle text-[10px] font-extrabold tracking-widest text-amber-700"
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
                                onClick={() =>
                                  runProtectedAction({
                                    type: 'override',
                                    employeeId: emp.employeeId,
                                    date: d.dateStr
                                  })
                                }
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
                                  onClick={() =>
                                    runProtectedAction({
                                      type: 'override',
                                      employeeId: emp.employeeId,
                                      date: d.dateStr
                                    })
                                  }
                                  className="cursor-pointer border-r border-slate-100 px-1.5 py-2.5 text-center text-slate-400 hover:bg-indigo-50"
                                >
                                  --
                                </td>
                                <td
                                  onClick={() =>
                                    runProtectedAction({
                                      type: 'override',
                                      employeeId: emp.employeeId,
                                      date: d.dateStr
                                    })
                                  }
                                  className="cursor-pointer border-r border-slate-100 px-1.5 py-2.5 text-center text-slate-400 hover:bg-indigo-50"
                                >
                                  --
                                </td>
                                <td
                                  onClick={() =>
                                    runProtectedAction({
                                      type: 'override',
                                      employeeId: emp.employeeId,
                                      date: d.dateStr
                                    })
                                  }
                                  className="cursor-pointer border-r border-slate-200 px-1.5 py-2.5 text-center text-slate-400 hover:bg-indigo-50"
                                >
                                  --
                                </td>
                              </React.Fragment>
                            );
                          }

                          const isCompleted = record.status === 'COMPLETED';
                          const isMissing = record.status === 'MISSING_CHECKOUT';
                          const metTarget =
                            isCompleted &&
                            record.totalWorkedMinutes >= REQUIRED_SHIFT_MINUTES;

                          return (
                            <React.Fragment key={`${emp.employeeId}-${d.dateStr}`}>
                              <td
                                onClick={() =>
                                  runProtectedAction({
                                    type: 'override',
                                    employeeId: emp.employeeId,
                                    date: d.dateStr
                                  })
                                }
                                className="cursor-pointer border-r border-slate-100 px-1.5 py-2.5 text-center font-medium text-slate-700 hover:bg-indigo-50"
                                title={record.dailyTask || ''}
                              >
                                {formatTime24hIST(record.checkInTime)}
                              </td>

                              <td
                                onClick={() =>
                                  runProtectedAction({
                                    type: 'override',
                                    employeeId: emp.employeeId,
                                    date: d.dateStr
                                  })
                                }
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
                                onClick={() =>
                                  runProtectedAction({
                                    type: 'override',
                                    employeeId: emp.employeeId,
                                    date: d.dateStr
                                  })
                                }
                                className={`cursor-pointer border-r border-slate-200 px-1.5 py-2.5 text-center font-bold hover:opacity-90 ${isCompleted
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
                                    <div>{formatDuration(record.totalWorkedMinutes)}</div>
                                    {record.shortfallMinutes > 0 && (
                                      <div className="text-[10px] font-semibold text-rose-600">
                                        -{formatDuration(record.shortfallMinutes)}
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
                          No employees found in MongoDB. Run the seed script or check
                          database connection.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </main>

          <AdminLoginModal
            isOpen={showLoginModal}
            onClose={() => {
              setShowLoginModal(false);
              setPendingAction(null);
            }}
            onSuccess={handleLoginSuccess}
          />

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
              setShowLoginModal(true);
            }}
          />
        </div>
        );
}

