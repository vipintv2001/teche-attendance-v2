import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { postManualOverride } from '../api/client';
import { formatTime24hIST, getTodayISTClient } from '../utils/timeUtils';

export default function ManualOverrideModal({
  isOpen,
  onClose,
  employees,
  initialEmployeeId,
  initialDate,
  existingRecord,
  onSaved,
  onAuthExpired
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState('');
  const [checkInHHMM, setCheckInHHMM] = useState('09:30');
  const [checkOutHHMM, setCheckOutHHMM] = useState('17:00');
  const [status, setStatus] = useState('COMPLETED');
  const [dailyTask, setDailyTask] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setEmployeeId(initialEmployeeId || employees[0]?.employeeId || '');
    setDate(initialDate || getTodayISTClient());

    if (existingRecord) {
      const inHHMM = existingRecord.checkInTime
        ? formatTime24hIST(existingRecord.checkInTime)
        : '09:30';
      setCheckInHHMM(inHHMM);

      const outHHMM = existingRecord.checkOutTime
        ? formatTime24hIST(existingRecord.checkOutTime)
        : existingRecord.estCheckOutTime
          ? formatTime24hIST(existingRecord.estCheckOutTime)
          : '17:00';
      setCheckOutHHMM(outHHMM);

      setStatus(
        existingRecord.status === 'CURRENTLY_WORKING'
          ? 'CURRENTLY_WORKING'
          : 'COMPLETED'
      );
      setDailyTask(existingRecord.dailyTask || '');
    } else {
      setCheckInHHMM('09:30');
      setCheckOutHHMM('17:00');
      setStatus('COMPLETED');
      setDailyTask('');
    }
  }, [isOpen, initialEmployeeId, initialDate, existingRecord, employees]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await postManualOverride({
        employeeId,
        date,
        checkInHHMM,
        checkOutHHMM,
        status,
        dailyTask
      });
      onSaved();
    } catch (err) {
      if (err.status === 401) {
        onAuthExpired();
        return;
      }
      setError(err.message || 'Failed to save manual attendance record.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              ⚙️ Admin Manual Attendance Override
            </h2>
            <p className="text-xs text-slate-500">
              Approve missed check-outs, edit shift timings, or mark absent (IST)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {existingRecord && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-xs ring-1 ring-slate-200">
            <span className="font-semibold text-slate-600">Verification:</span>
            <span className="rounded bg-white px-2 py-0.5 text-slate-700 ring-1 ring-slate-200">
              In: {existingRecord.checkInMethod || 'N/A'}
            </span>
            <span
              className={`rounded px-2 py-0.5 ring-1 ${
                existingRecord.checkOutMethod === 'REMOTE_CHECKOUT'
                  ? 'bg-rose-50 font-bold text-rose-700 ring-rose-200'
                  : 'bg-white text-slate-700 ring-slate-200'
              }`}
            >
              Out: {existingRecord.checkOutMethod || 'Not checked out'}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                SELECT EMPLOYEE
              </label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              >
                {employees.map((emp) => (
                  <option key={emp.employeeId} value={emp.employeeId}>
                    {emp.name} ({emp.employeeId})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                TARGET DATE
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              STATUS SELECTION
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="COMPLETED">Completed</option>
              <option value="CURRENTLY_WORKING">Currently Working</option>
              <option value="ABSENT">Absent</option>
            </select>
          </div>

          {status !== 'ABSENT' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  CHECK-IN TIME (IST)
                </label>
                <input
                  type="time"
                  required
                  value={checkInHHMM}
                  onChange={(e) => setCheckInHHMM(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {status === 'COMPLETED' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    CHECK-OUT TIME (IST)
                  </label>
                  <input
                    type="time"
                    required
                    value={checkOutHHMM}
                    onChange={(e) => setCheckOutHHMM(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              )}
            </div>
          )}

          {status !== 'ABSENT' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                WORK SUMMARY / OVERRIDE NOTES
              </label>
              <textarea
                rows={3}
                value={dailyTask}
                onChange={(e) => setDailyTask(e.target.value)}
                placeholder="Enter daily activity summary or admin approval notes..."
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Save Manual Attendance Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

