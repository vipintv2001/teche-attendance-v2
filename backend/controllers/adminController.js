const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');
const Settings = require('../models/Settings');
const {
  REQUIRED_SHIFT_MINUTES,
  HALF_DAY_SHIFT_MINUTES,
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
const { extractAdminToken } = require('../middleware/requireAdminAuth');
const { extractClientIp, normalizeIp } = require('../middleware/verifyOfficePresence');

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

  return res.json({ authenticated: true, token, username: expectedUsername });
}

/**
 * GET /api/admin/me (Upgrade 1)
 */
function getAdminMe(req, res) {
  const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
  return res.json({ authenticated: true, username: expectedUsername });
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
 * GET /api/admin/settings (Upgrade 2)
 */
async function getSettings(req, res) {
  try {
    const settings = await Settings.findOne({ key: 'global' }).lean();
    const savedOfficeIp = settings?.officePublicIp || process.env.OFFICE_PUBLIC_IP || '';
    const currentRequestIp = extractClientIp(req);

    return res.json({
      savedOfficeIp,
      currentRequestIp,
      updatedAt: settings?.updatedAt || null,
      updatedBy: settings?.updatedBy || 'admin'
    });
  } catch (err) {
    console.error('getSettings error:', err);
    return res.status(500).json({ error: 'Failed to retrieve office network settings.' });
  }
}

/**
 * POST /api/admin/settings/office-ip (Upgrade 2)
 */
async function updateOfficeIp(req, res) {
  try {
    const currentRequestIp = extractClientIp(req);
    const newIp = normalizeIp(req.body?.ip || currentRequestIp);

    if (!newIp) {
      return res.status(400).json({ error: 'A valid IP address is required.' });
    }

    const settings = await Settings.findOneAndUpdate(
      { key: 'global' },
      {
        $set: {
          key: 'global',
          officePublicIp: newIp,
          updatedAt: new Date(),
          updatedBy: process.env.ADMIN_USERNAME || 'admin'
        }
      },
      { upsert: true, new: true }
    );

    return res.json({
      success: true,
      officePublicIp: settings.officePublicIp,
      currentRequestIp
    });
  } catch (err) {
    console.error('updateOfficeIp error:', err);
    return res.status(500).json({ error: 'Failed to update office public IP.' });
  }
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

    const [employees, records, pendingApprovals, holidays] = await Promise.all([
      Employee.find({})
        .select('employeeId name registeredDeviceToken deviceSignature isActive createdAt')
        .sort({ employeeId: 1 })
        .lean(),
      Attendance.find({ date: { $regex: `^${yearMonth}` } })
        .sort({ date: 1, employeeId: 1 })
        .lean(),
      Attendance.find({
        status: 'MISSING_CHECKOUT'
      })
        .sort({ date: -1, employeeId: 1 })
        .lean(),
      Holiday.find({
        date: { $regex: `^${yearMonth}` }
      })
        .sort({ date: 1 })
        .lean()
    ]);

    const safeEmployees = employees.map((emp) => ({
      employeeId: emp.employeeId,
      name: emp.name,
      isActive: emp.isActive !== false,
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
      pendingApprovals,
      holidays
    });
  } catch (err) {
    console.error('getMonthlyLedger error:', err);
    return res.status(500).json({ error: 'Failed to load monthly ledger.' });
  }
}

/**
 * POST /api/admin/holidays (Upgrade 3)
 */
async function createOrUpdateHoliday(req, res) {
  try {
    const { date, title, type = 'HOLIDAY' } = req.body || {};
    const cleanDate = String(date || '').trim();
    const cleanTitle = String(title || '').trim();
    const cleanType = String(type || '').trim().toUpperCase();

    if (!cleanDate || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required.' });
    }
    if (!cleanTitle) {
      return res.status(400).json({ error: 'Holiday title is required.' });
    }
    if (!['HOLIDAY', 'HALF_DAY'].includes(cleanType)) {
      return res.status(400).json({ error: 'Holiday type must be either HOLIDAY or HALF_DAY.' });
    }

    const holiday = await Holiday.findOneAndUpdate(
      { date: cleanDate },
      {
        $set: {
          date: cleanDate,
          title: cleanTitle,
          type: cleanType
        }
      },
      { upsert: true, new: true, runValidators: true }
    );

    return res.json({ success: true, holiday });
  } catch (err) {
    console.error('createOrUpdateHoliday error:', err);
    return res.status(500).json({ error: 'Failed to save holiday.' });
  }
}

/**
 * DELETE /api/admin/holidays/:date (Upgrade 3)
 */
async function deleteHoliday(req, res) {
  try {
    const cleanDate = String(req.params.date || '').trim();
    if (!cleanDate || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required.' });
    }

    await Holiday.deleteOne({ date: cleanDate });
    return res.json({ success: true, deletedDate: cleanDate });
  } catch (err) {
    console.error('deleteHoliday error:', err);
    return res.status(500).json({ error: 'Failed to delete holiday.' });
  }
}

/**
 * POST /api/admin/employees (Upgrade 4)
 */
async function createEmployee(req, res) {
  try {
    const { employeeId, name } = req.body || {};
    const cleanId = String(employeeId || '').trim().toUpperCase();
    const cleanName = String(name || '').trim();

    if (!cleanId || cleanId.length < 3) {
      return res.status(400).json({ error: 'Valid Employee ID (e.g., TECHE1022) is required.' });
    }
    if (!cleanName) {
      return res.status(400).json({ error: 'Employee Full Name is required.' });
    }

    const existing = await Employee.findOne({ employeeId: cleanId });
    if (existing) {
      return res.status(409).json({ error: `Employee ID ${cleanId} already exists.` });
    }

    const newEmp = await Employee.create({
      employeeId: cleanId,
      name: cleanName,
      isActive: true,
      registeredDeviceToken: null,
      deviceSignature: { platform: '', screenSize: '' }
    });

    return res.status(201).json({
      success: true,
      employee: {
        employeeId: newEmp.employeeId,
        name: newEmp.name,
        isActive: true,
        isDeviceBound: false
      }
    });
  } catch (err) {
    console.error('createEmployee error:', err);
    return res.status(500).json({ error: 'Failed to create new employee.' });
  }
}

/**
 * PATCH /api/admin/employees/:employeeId (Upgrade 4)
 */
async function updateEmployee(req, res) {
  try {
    const cleanId = String(req.params.employeeId || '').trim().toUpperCase();
    const { name, isActive } = req.body || {};

    const updateFields = {};
    if (typeof name === 'string' && name.trim()) {
      updateFields.name = name.trim();
    }
    if (typeof isActive === 'boolean') {
      updateFields.isActive = isActive;
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: 'No valid update fields provided.' });
    }

    const updated = await Employee.findOneAndUpdate(
      { employeeId: cleanId },
      { $set: updateFields },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: `Employee ${cleanId} not found.` });
    }

    return res.json({
      success: true,
      employee: {
        employeeId: updated.employeeId,
        name: updated.name,
        isActive: updated.isActive !== false,
        isDeviceBound: Boolean(updated.registeredDeviceToken)
      }
    });
  } catch (err) {
    console.error('updateEmployee error:', err);
    return res.status(500).json({ error: 'Failed to update employee.' });
  }
}

/**
 * POST /api/admin/manual-override (and alias POST /api/admin/approve-missed-checkout)
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

    // Check if target date is marked as HALF_DAY in Holiday collection
    const holidayOnDate = await Holiday.findOne({ date: cleanDate });
    const targetShiftMinutes = holidayOnDate?.type === 'HALF_DAY' ? HALF_DAY_SHIFT_MINUTES : REQUIRED_SHIFT_MINUTES;

    const estCheckOutTime = new Date(
      checkInTime.getTime() + targetShiftMinutes * 60 * 1000
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
      checkOutTime,
      targetShiftMinutes
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
 * POST /api/admin/unbind-device (Protected by requireAdminAuth)
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
        isActive: employee.isActive !== false,
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
  getAdminMe,
  adminLogout,
  getAdminStatus,
  getSettings,
  updateOfficeIp,
  getMonthlyLedger,
  createOrUpdateHoliday,
  deleteHoliday,
  createEmployee,
  updateEmployee,
  manualOverride,
  unbindDevice,
  normalizeHHMM
};
