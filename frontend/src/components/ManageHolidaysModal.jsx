import React, { useState } from 'react';
import { Calendar, Trash2, X } from 'lucide-react';
import { deleteHoliday, postSaveHoliday } from '../api/client';
import { formatDatePretty } from '../utils/timeUtils';

export default function ManageHolidaysModal({
  isOpen,
  onClose,
  holidays = [],
  yearMonth,
  onUpdated
}) {
  const [date, setDate] = useState(() => `${yearMonth}-01`);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('HOLIDAY');
  const [submitting, setSubmitting] = useState(false);
  const [deletingDate, setDeletingDate] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await postSaveHoliday({ date, title, type });
      setTitle('');
      onUpdated();
    } catch (err) {
      setError(err.message || 'Failed to save holiday.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(delDate) {
    setError('');
    setDeletingDate(delDate);
    try {
      await deleteHoliday(delDate);
      onUpdated();
    } catch (err) {
      setError(err.message || 'Failed to delete holiday.');
    } finally {
      setDeletingDate('');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Custom Public Holidays & Half-Days
              </h2>
              <p className="text-xs text-slate-500">
                Exclude holidays from absent counts or set 3h 45m target for half-days
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
            {error}
          </div>
        )}

        {/* Add Holiday Form */}
        <form onSubmit={handleAdd} className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Add or Update Day
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Date (YYYY-MM-DD)
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500"
              >
                <option value="HOLIDAY">Full Public Holiday (No Shift)</option>
                <option value="HALF_DAY">Half-Day (3h 45m Shift)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600">
              Title / Occasion
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Onam Holiday, Vishu, Annual Day"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Save Holiday / Half-Day'}
            </button>
          </div>
        </form>

        {/* Existing Holidays List */}
        <div className="mt-5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Holidays in {yearMonth} ({holidays.length})
          </div>

          {holidays.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400 italic">
              No custom holidays or half-days configured for this month.
            </p>
          ) : (
            <div className="mt-2 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {holidays.map((h) => (
                <div
                  key={h.date}
                  className="flex items-center justify-between p-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{h.title}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          h.type === 'HALF_DAY'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {h.type === 'HALF_DAY' ? 'Half-Day (3h 45m)' : 'Full Holiday'}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {formatDatePretty(h.date)} ({h.date})
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(h.date)}
                    disabled={deletingDate === h.date}
                    className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    title="Remove Holiday"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
