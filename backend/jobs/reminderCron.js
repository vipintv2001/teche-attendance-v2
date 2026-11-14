const cron = require('node-cron');
const webpush = require('web-push');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const { getTodayIST } = require('../utils/istTime');

let vapidConfigured = false;

function configureWebPush() {
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@techeeducation.com';
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (publicKey && privateKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  } else {
    console.warn(
      '[WebPush] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not configured. Push notifications disabled until set.'
    );
  }
}

async function sendNotificationSafe(employee, payload) {
  if (!vapidConfigured || !employee.pushSubscription?.endpoint) {
    return;
  }

  try {
    await webpush.sendNotification(
      employee.pushSubscription,
      JSON.stringify(payload)
    );
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      employee.pushSubscription = null;
      await employee.save();
      console.info(
        `[WebPush] Cleared expired subscription (${err.statusCode}) for ${employee.employeeId}`
      );
    } else {
      console.error(
        `[WebPush] Failed to notify ${employee.employeeId}:`,
        err.message
      );
    }
  }
}

async function sendMorningCheckInReminders() {
  try {
    const todayIST = getTodayIST();
    const todayRecords = await Attendance.find({ date: todayIST })
      .select('employeeId -_id')
      .lean();
    const checkedInIds = new Set(todayRecords.map((r) => r.employeeId));

    const employees = await Employee.find({
      pushSubscription: { $ne: null }
    });

    const targets = employees.filter(
      (emp) => !checkedInIds.has(emp.employeeId) && emp.pushSubscription?.endpoint
    );

    await Promise.all(
      targets.map((emp) =>
        sendNotificationSafe(emp, {
          title: 'TechE Attendance Reminder (10:30 AM)',
          body: `Hi ${emp.name}, you haven't checked in yet today. Tap here to mark your attendance!`,
          url: '/'
        })
      )
    );
  } catch (err) {
    console.error('[Cron 10:30 AM] Error sending check-in reminders:', err);
  }
}

async function sendEveningCheckOutReminders() {
  try {
    const todayIST = getTodayIST();
    const activeRecords = await Attendance.find({
      date: todayIST,
      status: 'CURRENTLY_WORKING'
    })
      .select('employeeId -_id')
      .lean();

    if (activeRecords.length === 0) return;

    const activeIds = activeRecords.map((r) => r.employeeId);
    const employees = await Employee.find({
      employeeId: { $in: activeIds },
      pushSubscription: { $ne: null }
    });

    await Promise.all(
      employees.map((emp) =>
        sendNotificationSafe(emp, {
          title: 'Time to Check-Out (6:00 PM)',
          body: `Hi ${emp.name}, don't forget to enter your Daily Work Summary and tap Check-Out!`,
          url: '/'
        })
      )
    );
  } catch (err) {
    console.error('[Cron 6:00 PM] Error sending check-out reminders:', err);
  }
}

async function markMissingCheckoutsAtMidnight() {
  try {
    const todayIST = getTodayIST();
    const result = await Attendance.updateMany(
      {
        status: 'CURRENTLY_WORKING',
        date: { $lte: todayIST }
      },
      {
        $set: { status: 'MISSING_CHECKOUT' }
      }
    );
    console.info(
      `[Cron 11:59 PM] Marked ${result.modifiedCount || 0} unclosed shift(s) as MISSING_CHECKOUT.`
    );
  } catch (err) {
    console.error('[Cron 11:59 PM] Error marking MISSING_CHECKOUT:', err);
  }
}

function startReminderCrons() {
  configureWebPush();

  const cronOptions = { timezone: 'Asia/Kolkata' };

  // 10:30 AM IST (Mon-Sat)
  cron.schedule('30 10 * * 1-6', sendMorningCheckInReminders, cronOptions);

  // 6:00 PM IST (Mon-Sat)
  cron.schedule('0 18 * * 1-6', sendEveningCheckOutReminders, cronOptions);

  // 11:59 PM IST (Daily)
  cron.schedule('59 23 * * *', markMissingCheckoutsAtMidnight, cronOptions);

  console.info('[Cron] Attendance reminder & midnight lock jobs scheduled (Asia/Kolkata).');
}

module.exports = {
  startReminderCrons,
  sendMorningCheckInReminders,
  sendEveningCheckOutReminders,
  markMissingCheckoutsAtMidnight
};

