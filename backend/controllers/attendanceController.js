const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const {
  REQUIRED_SHIFT_MINUTES,
  getTodayIST,
  calculateShiftDurations
} = require('../utils/istTime');
const { setDeviceTokenCookie } = require('../utils/cookieUtils');
const { findBoundEmployee, sanitizeEmployee } = require('../utils/deviceLookup');
const {
  extractClientIp,
  normalizeIp,
  haversineDistanceMeters
} = require('../middleware/verifyOfficePresence');

async function findPendingMissedShift(employeeId, todayIST) {
  return Attendance.findOne({
    employeeId,
    date: { $lt: todayIST },
    status: { $in: ['CURRENTLY_WORKING', 'MISSING_CHECKOUT'] }
  }).sort({ date: -1 });
}

function resolveCheckOutMethod(req) {
  const clientIp = extractClientIp(req);
  const officePublicIp = normalizeIp(process.env.OFFICE_PUBLIC_IP || '');
  if (officePublicIp && clientIp === officePublicIp) {
    return 'OFFICE_WIFI';
  }

  const { lat, lng } = req.body || {};
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  const officeLat = Number(process.env.OFFICE_LAT);
  const officeLng = Number(process.env.OFFICE_LNG);
  const allowedRadius = Number(process.env.ALLOWED_RADIUS_METERS || 100);

  if (
    lat !== undefined &&
    lng !== undefined &&
    lat !== null &&
    lng !== null &&
    Number.isFinite(parsedLat) &&
    Number.isFinite(parsedLng) &&
    Number.isFinite(officeLat) &&
    Number.isFinite(officeLng)
  ) {
    const distance = haversineDistanceMeters(parsedLat, parsedLng, officeLat, officeLng);
    if (distance <= allowedRadius) {
      return 'OFFICE_GPS';
    }
  }

  return 'REMOTE_CHECKOUT';
}

/**
 * GET /api/attendance/session?platform=...&screenSize=...
 */
async function getSession(req, res) {
  try {
    const { platform = '', screenSize = '' } = req.query;
    const employee = await findBoundEmployee(req, platform, screenSize);

    if (!employee) {
      const unboundDocs = await Employee.find({ registeredDeviceToken: null })
        .select('employeeId name -_id')
        .sort({ employeeId: 1 });

      return res.json({
        state: 'FIRST_TIME_DEVICE_SETUP',
        unboundEmployees: unboundDocs
      });
    }

    // Refresh the 1-year HttpOnly deviceToken cookie on every recognized visit
    setDeviceTokenCookie(req, res, employee.registeredDeviceToken);

    const todayIST = getTodayIST();
    const missedShift = await findPendingMissedShift(employee.employeeId, todayIST);

    if (missedShift) {
      return res.json({
        state: 'LOCKED_PENDING_ADMIN_APPROVAL',
        employee: sanitizeEmployee(employee),
        missedShift
      });
    }

    const todayShift = await Attendance.findOne({
      employeeId: employee.employeeId,
      date: todayIST
    });

    if (!todayShift) {
      return res.json({
        state: 'RECOGNIZED_READY_FOR_CHECKIN',
        employee: sanitizeEmployee(employee)
      });
    }

    if (todayShift.status === 'CURRENTLY_WORKING') {
      return res.json({
        state: 'CURRENTLY_WORKING',
        employee: sanitizeEmployee(employee),
        shift: todayShift
      });
    }

    if (todayShift.status === 'COMPLETED') {
      return res.json({
        state: 'SHIFT_COMPLETED',
        employee: sanitizeEmployee(employee),
        shift: todayShift
      });
    }

    return res.json({
      state: 'LOCKED_PENDING_ADMIN_APPROVAL',
      employee: sanitizeEmployee(employee),
      missedShift: todayShift
    });
  } catch (err) {
    console.error('getSession error:', err);
    return res.status(500).json({ error: 'Failed to load attendance session.' });
  }
}

/**
 * POST /api/attendance/check-in (Protected by verifyOfficePresence)
 */
async function checkIn(req, res) {
  try {
    const { employeeId, platform = '', screenSize = '' } = req.body || {};
    const requestedId = String(employeeId || '').trim().toUpperCase();
    const cleanPlatform = String(platform || '').trim();
    const cleanScreen = String(screenSize || '').trim();

    let employee = await findBoundEmployee(req, cleanPlatform, cleanScreen);

    if (employee) {
      // Anti-spoofing check 1: Device already bound to another employee
      if (requestedId && employee.employeeId !== requestedId) {
        return res.status(403).json({
          error: `This phone is already bound to ${employee.name} (${employee.employeeId}). You cannot check in as ${requestedId}.`
        });
      }
      setDeviceTokenCookie(req, res, employee.registeredDeviceToken);
    } else {
      if (!requestedId) {
        return res.status(400).json({ error: 'Employee ID is required for first-time setup.' });
      }

      const targetEmployee = await Employee.findOne({ employeeId: requestedId });
      if (!targetEmployee) {
        return res.status(404).json({ error: `Employee ID ${requestedId} not found.` });
      }

      // Anti-spoofing check 2: Requested Employee ID already bound to a different phone
      if (targetEmployee.registeredDeviceToken !== null) {
        return res.status(403).json({
          error: `Employee ID ${requestedId} is already bound to another phone. Please ask Admin to unbind the previous device.`
        });
      }

      const newDeviceToken = `teche_dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      targetEmployee.registeredDeviceToken = newDeviceToken;
      targetEmployee.deviceSignature = {
        platform: cleanPlatform,
        screenSize: cleanScreen
      };
      await targetEmployee.save();

      employee = targetEmployee;
      setDeviceTokenCookie(req, res, newDeviceToken);
    }

    const todayIST = getTodayIST();
    const missedShift = await findPendingMissedShift(employee.employeeId, todayIST);

    if (missedShift) {
      return res.status(403).json({
        state: 'LOCKED_PENDING_ADMIN_APPROVAL',
        employee: sanitizeEmployee(employee),
        missedShift,
        error:
          "You forgot to check out on your last shift. Yesterday's check-out time can only be added after it is accepted by the Admin. Please see the Admin to approve your previous check-out."
      });
    }

    const existingToday = await Attendance.findOne({
      employeeId: employee.employeeId,
      date: todayIST
    });

    if (existingToday) {
      if (existingToday.status === 'CURRENTLY_WORKING') {
        return res.json({
          state: 'CURRENTLY_WORKING',
          employee: sanitizeEmployee(employee),
          shift: existingToday
        });
      }
      if (existingToday.status === 'COMPLETED') {
        return res.status(409).json({
          state: 'SHIFT_COMPLETED',
          employee: sanitizeEmployee(employee),
          shift: existingToday,
          error: 'You have already completed your shift for today.'
        });
      }
      return res.status(403).json({
        state: 'LOCKED_PENDING_ADMIN_APPROVAL',
        employee: sanitizeEmployee(employee),
        missedShift: existingToday,
        error: 'Your shift requires Admin approval.'
      });
    }

    const checkInTime = new Date();
    const estCheckOutTime = new Date(
      checkInTime.getTime() + REQUIRED_SHIFT_MINUTES * 60 * 1000
    );

    const shift = await Attendance.create({
      employeeId: employee.employeeId,
      name: employee.name,
      date: todayIST,
      checkInTime,
      estCheckOutTime,
      status: 'CURRENTLY_WORKING',
      checkInMethod: req.locationMethod || 'OFFICE_WIFI'
    });

    return res.status(201).json({
      state: 'SHIFT_STARTED',
      employee: sanitizeEmployee(employee),
      shift
    });
  } catch (err) {
    console.error('checkIn error:', err);
    return res.status(500).json({ error: 'Failed to process check-in.' });
  }
}

/**
 * POST /api/attendance/check-out
 */
async function checkOut(req, res) {
  try {
    const { dailyTask, platform = '', screenSize = '' } = req.body || {};
    const trimmedTask = String(dailyTask || '').trim();

    if (!trimmedTask) {
      return res.status(400).json({
        error: 'Please enter your Daily Work Summary before checking out.'
      });
    }

    const employee = await findBoundEmployee(req, platform, screenSize);
    if (!employee) {
      return res.status(403).json({
        error: 'Device is not registered to an employee. Please set up your device first.'
      });
    }

    setDeviceTokenCookie(req, res, employee.registeredDeviceToken);

    const todayIST = getTodayIST();
    const shift = await Attendance.findOne({
      employeeId: employee.employeeId,
      date: todayIST,
      status: 'CURRENTLY_WORKING'
    });

    if (!shift) {
      return res.status(404).json({
        error: 'No active shift found for today.'
      });
    }

    const checkOutTime = new Date();
    const { totalWorkedMinutes, shortfallMinutes } = calculateShiftDurations(
      shift.checkInTime,
      checkOutTime
    );

    shift.checkOutTime = checkOutTime;
    shift.totalWorkedMinutes = totalWorkedMinutes;
    shift.shortfallMinutes = shortfallMinutes;
    shift.dailyTask = trimmedTask;
    shift.status = 'COMPLETED';
    shift.checkOutMethod = resolveCheckOutMethod(req);
    await shift.save();

    return res.json({
      state: 'SHIFT_COMPLETED',
      employee: sanitizeEmployee(employee),
      shift
    });
  } catch (err) {
    console.error('checkOut error:', err);
    return res.status(500).json({ error: 'Failed to process check-out.' });
  }
}

/**
 * POST /api/attendance/subscribe-push
 */
async function subscribePush(req, res) {
  try {
    const { subscription, platform = '', screenSize = '' } = req.body || {};

    if (
      !subscription ||
      typeof subscription !== 'object' ||
      !subscription.endpoint ||
      !subscription.keys?.p256dh ||
      !subscription.keys?.auth
    ) {
      return res.status(400).json({ error: 'Invalid Web Push subscription payload.' });
    }

    const employee = await findBoundEmployee(req, platform, screenSize);
    if (!employee) {
      return res.status(403).json({
        error: 'Please register your phone before subscribing to reminders.'
      });
    }

    employee.pushSubscription = subscription;
    await employee.save();

    return res.json({
      subscribed: true,
      employee: sanitizeEmployee(employee)
    });
  } catch (err) {
    console.error('subscribePush error:', err);
    return res.status(500).json({ error: 'Failed to save push subscription.' });
  }
}

/**
 * GET /api/attendance/vapid-public-key
 */
function getVapidPublicKey(req, res) {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  return res.json({
    publicKey,
    configured: Boolean(publicKey)
  });
}

module.exports = {
  getSession,
  checkIn,
  checkOut,
  subscribePush,
  getVapidPublicKey
};

