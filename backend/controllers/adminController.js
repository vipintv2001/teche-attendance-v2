const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const {
  REQUIRED_SHIFT_MINUTES,
  getTodayIST,
  parseISTDateTime,
  calculateShiftDurations
} = require('../utils/istTime');
const {
  ONE_DAY_MS,
  getCookieOptions,
  createAdminToken,
  verifyAdminToken
} = require('../utils/cookieUtils');
const { extractAdminToken } = require('../middleware/verifyAdminAuth');

function normalizeHHMM(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hNum = Number(match[1]);
  const mNum = Number(match[2]);
  if (hNum < 0 || hNum > 23 || mNum < 0 || mNum > 59) return null;
  return `${String(hNum).padStart(2, '0')}:${String(mNum).padStart(2, '0')}`;
}

/**
 * POST /api/admin/login
 */
function adminLogin(req, res) {
  const { username, password } = req.body || {};
  const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
  const expectedPassword = process.env.ADMIN_PASSWORD || '';

  if (!expectedPassword) {
    return res.status(500).json({
      error: 'ADMIN_PASSWORD is not configured on the server.'
    });
  }

  if (username !== expectedUsername || password !== expectedPassword) {
    return res.status(401).json({
      authenticated: false,
      error: 'Invalid Admin username or password.'
    });
  }

  const token = createAdminToken(expectedUsername);
  res.cookie('adminToken', token, getCookieOptions(req, ONE_DAY_MS * 7));

  return res.json({ authenticated: true, token });
}

/**
 * POST /api/admin/logout
 */
function adminLogout(req, res) {
  res.clearCookie('adminToken', { path: '/' });
  return res.json({ authenticated: false });
}

/**
 * GET /api/admin/status
 */
function getAdminStatus(req, res) {
  const token = extractAdminToken(req);
  const authenticated = verifyAdminToken(token);
  return res.json({ authenticated });
}

/**
 * GET /api/admin/monthly-ledger?yearMonth=YYYY-MM
 */
async function getMonthlyLedger(req, res) {
  try {
    const todayIST = getTodayIST();
    const defaultYearMonth = todayIST.slice(0, 7);
    const yearMonth = /^\d{4}-\d{2}$/.test(String(req.query.yearMonth || ''))
      ? String(req.query.yearMonth)
      : defaultYearMonth;

    const [employees, records, pendingApprovals] = await Promise.all([
      Employee.find({})
        .select('employeeId name registeredDeviceToken deviceSignature createdAt')
        .sort({ employeeId: 1 })
        .lean(),
      Attendance.find({ date: { $regex: `^${yearMonth}` } })
        .sort({ date: 1, employeeId: 1 })
        .lean(),
      Attendance.find({
        status: 'MISSING_CHECKOUT'
      })
        .sort({ date: -1, employeeId: 1 })
        .lean()
    ]);

    const safeEmployees = employees.map((emp) => ({
      employeeId: emp.employeeId,
      name: emp.name,
      isDeviceBound: Boolean(emp.registeredDeviceToken),
      deviceSignature: emp.deviceSignature || { platform: '', screenSize: '' }
    }));

    const token = extractAdminToken(req);

    return res.json({
      yearMonth,
      todayIST,
      authenticated: verifyAdminToken(token),
      employees: safeEmployees,
      records,
      pendingApprovals
    });
  } catch (err) {
    console.error('getMonthlyLedger error:', err);
    return res.status(500).json({ error: 'Failed to load monthly ledger.' });
  }
}

/**
 * POST /api/admin/manual-override (Protected by verifyAdminAuth)
 */
async function manualOverride(req, res) {
  try {
    const {
      employeeId,
      date,
      checkInHHMM,
      checkOutHHMM,
      status,
      dailyTask
    } = req.body || {};

    const normalizedId = String(employeeId || '').trim().toUpperCase();
    const cleanDate = String(date || '').trim();
    const normalizedStatus = String(status || '').trim().toUpperCase();

    if (!normalizedId || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      return res.status(400).json({
        error: 'Valid Employee ID and Target Date (YYYY-MM-DD) are required.'
      });
    }

    const employee = await Employee.findOne({ employeeId: normalizedId });
    if (!employee) {
      return res.status(404).json({ error: `Employee ${normalizedId} not found.` });
    }

    if (normalizedStatus === 'ABSENT') {
      await Attendance.deleteOne({ employeeId: normalizedId, date: cleanDate });
      return res.json({
        deleted: true,
        employeeId: normalizedId,
        date: cleanDate
      });
    }

    if (!['COMPLETED', 'CURRENTLY_WORKING'].includes(normalizedStatus)) {
      return res.status(400).json({
        error: 'Status must be COMPLETED, CURRENTLY_WORKING, or ABSENT.'
      });
    }

      const parsedInHHMM = normalizeHHMM(checkInHHMM);
      if (!parsedInHHMM) {
        return res.status(400).json({
          error: 'Valid Check-In time (HH:MM) is required.'
        });
      }

      const checkInTime = parseISTDateTime(cleanDate, parsedInHHMM);
      const estCheckOutTime = new Date(
        checkInTime.getTime() + REQUIRED_SHIFT_MINUTES * 60 * 1000
      );

      const existing = await Attendance.findOne({
        employeeId: normalizedId,
        date: cleanDate
      });

      const trimmedNotes = String(dailyTask || '').trim();

      if (normalizedStatus === 'CURRENTLY_WORKING') {
        const updated = await Attendance.findOneAndUpdate(
          { employeeId: normalizedId, date: cleanDate },
          {
            $set: {
              employeeId: normalizedId,
              name: employee.name,
              date: cleanDate,
              checkInTime,
              estCheckOutTime,
              checkOutTime: null,
              totalWorkedMinutes: 0,
              shortfallMinutes: 0,
              dailyTask: trimmedNotes,
              status: 'CURRENTLY_WORKING',
              checkInMethod: existing?.checkInMethod || 'ADMIN_MANUAL',
              checkOutMethod: null
            }
          },
          { upsert: true, new: true, runValidators: true }
        );
        return res.json({ shift: updated });
      }

        const parsedOutHHMM = normalizeHHMM(checkOutHHMM);
        if (!parsedOutHHMM) {
          return res.status(400).json({
            error: 'Valid Check-Out time (HH:MM) is required for Completed status.'
          });
        }

        const checkOutTime = parseISTDateTime(cleanDate, parsedOutHHMM);
        if (checkOutTime.getTime() < checkInTime.getTime()) {
          return res.status(400).json({
            error: 'Check-Out time cannot be earlier than Check-In time.'
          });
        }

        const { totalWorkedMinutes, shortfallMinutes } = calculateShiftDurations(
          checkInTime,
          checkOutTime
        );

        const updated = await Attendance.findOneAndUpdate(
          { employeeId: normalizedId, date: cleanDate },
          {
            $set: {
              employeeId: normalizedId,
              name: employee.name,
              date: cleanDate,
              checkInTime,
              estCheckOutTime,
              checkOutTime,
              totalWorkedMinutes,
              shortfallMinutes,
              dailyTask:
                trimmedNotes || existing?.dailyTask || 'Approved by Admin',
              status: 'COMPLETED',
              checkInMethod: existing?.checkInMethod || 'ADMIN_MANUAL',
              checkOutMethod: 'ADMIN_APPROVED'
            }
          },
          { upsert: true, new: true, runValidators: true }
        );

        return res.json({ shift: updated });
      } catch (err) {
        console.error('manualOverride error:', err);
        return res.status(500).json({ error: 'Failed to save manual attendance record.' });
      }
    }

    /**
     * POST /api/admin/unbind-device (Protected by verifyAdminAuth)
     */
    async function unbindDevice(req, res) {
      try {
        const normalizedId = String(req.body?.employeeId || '').trim().toUpperCase();
        if (!normalizedId) {
          return res.status(400).json({ error: 'Employee ID is required.' });
        }

        const employee = await Employee.findOneAndUpdate(
          { employeeId: normalizedId },
          {
            $set: {
              registeredDeviceToken: null,
              deviceSignature: { platform: '', screenSize: '' }
            }
          },
          { new: true }
        );

        if (!employee) {
          return res.status(404).json({ error: `Employee ${normalizedId} not found.` });
        }

        return res.json({
          unbound: true,
          employee: {
            employeeId: employee.employeeId,
            name: employee.name,
            isDeviceBound: false
          }
        });
      } catch (err) {
        console.error('unbindDevice error:', err);
        return res.status(500).json({ error: 'Failed to unbind employee device.' });
      }
    }

    module.exports = {
      adminLogin,
      adminLogout,
      getAdminStatus,
      getMonthlyLedger,
      manualOverride,
  unbindDevice,
      normalizeHHMM
    };
