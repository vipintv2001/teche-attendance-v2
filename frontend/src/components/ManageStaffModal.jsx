import React, { useState } from 'react';
import { Archive, CheckCircle, Smartphone, Unlink, UserPlus, Users, X } from 'lucide-react';
import { patchUpdateEmployee, postCreateEmployee, postUnbindDevice } from '../api/client';

export default function ManageStaffModal({
  isOpen,
  onClose,
  employees = [],
  onUpdated
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingName, setEditingName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  async function handleAddEmployee(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await postCreateEmployee({ employeeId, name });
      setSuccess(`Employee ${employeeId.trim().toUpperCase()} added successfully.`);
      setEmployeeId('');
      setName('');
      onUpdated();
    } catch (err) {
      setError(err.message || 'Failed to add employee.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(emp) {
    setError('');
    setSuccess('');
    setActionLoading(`active-${emp.employeeId}`);
    try {
      await patchUpdateEmployee(emp.employeeId, { isActive: !emp.isActive });
      setSuccess(`Employee ${emp.employeeId} ${emp.isActive ? 'archived' : 'restored'}.`);
      onUpdated();
    } catch (err) {
      setError(err.message || 'Failed to update employee status.');
    } finally {
      setActionLoading('');
    }
  }

  async function handleUnbind(empId) {
    setError('');
    setSuccess('');
    setActionLoading(`unbind-${empId}`);
    try {
      await postUnbindDevice(empId);
      setSuccess(`Phone unbound for ${empId}.`);
      onUpdated();
    } catch (err) {
      setError(err.message || 'Failed to unbind device.');
    } finally {
      setActionLoading('');
    }
  }

  async function handleSaveName(empId) {
    if (!editingName.trim()) return;
    setError('');
    setSuccess('');
    setActionLoading(`name-${empId}`);
    try {
      await patchUpdateEmployee(empId, { name: editingName.trim() });
      setEditingId('');
      setEditingName('');
      setSuccess(`Name updated for ${empId}.`);
      onUpdated();
    } catch (err) {
      setError(err.message || 'Failed to update employee name.');
    } finally {
      setActionLoading('');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Staff Management
              </h2>
              <p className="text-xs text-slate-500">
                Add new staff, edit names, unbind phones, or archive inactive members
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
          <div className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-3 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
            {success}
          </div>
        )}

        {/* Add Employee Form */}
        <form onSubmit={handleAddEmployee} className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
            <UserPlus className="h-4 w-4 text-indigo-600" />
            Add New Employee
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Employee ID
              </label>
              <input
                type="text"
                required
                placeholder="e.g. TECHE1022"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold uppercase text-slate-900 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Full Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? 'Adding...' : 'Add Employee'}
            </button>
          </div>
        </form>

        {/* Staff Directory Table */}
        <div className="mt-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Current Directory ({employees.length})
          </div>

          <div className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {employees.map((emp) => (
              <div
                key={emp.employeeId}
                className={`flex flex-col gap-2 p-3 text-xs sm:flex-row sm:items-center sm:justify-between ${
                  !emp.isActive ? 'bg-slate-50/60 opacity-75' : ''
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{emp.employeeId}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                        emp.isActive
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {emp.isActive ? 'ACTIVE' : 'ARCHIVED'}
                    </span>
                    {emp.isDeviceBound && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500">
                        <Smartphone className="h-3 w-3" />
                        Phone Bound
                      </span>
                    )}
                  </div>

                  {editingId === emp.employeeId ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="rounded-lg border border-indigo-400 px-2 py-1 text-xs text-slate-900 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveName(emp.employeeId)}
                        disabled={actionLoading === `name-${emp.employeeId}`}
                        className="rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId('');
                          setEditingName('');
                        }}
                        className="text-[11px] text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="mt-0.5 font-medium text-slate-700">
                      {emp.name}{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(emp.employeeId);
                          setEditingName(emp.name);
                        }}
                        className="ml-1.5 text-[10px] text-indigo-600 hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {emp.isDeviceBound && (
                    <button
                      type="button"
                      onClick={() => handleUnbind(emp.employeeId)}
                      disabled={actionLoading === `unbind-${emp.employeeId}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                      title="Unbind phone so employee can register new phone"
                    >
                      <Unlink className="h-3 w-3" />
                      Unbind Phone
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleToggleActive(emp)}
                    disabled={actionLoading === `active-${emp.employeeId}`}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                      emp.isActive
                        ? 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                        : 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    {emp.isActive ? (
                      <>
                        <Archive className="h-3 w-3" />
                        Archive
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-3 w-3" />
                        Restore
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end border-t border-slate-100 pt-3">
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
