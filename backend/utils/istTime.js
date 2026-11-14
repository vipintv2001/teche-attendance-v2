const REQUIRED_SHIFT_MINUTES = 450; // 7 hours 30 minutes

/**
 * Returns current date in Asia/Kolkata (IST) formatted as "YYYY-MM-DD".
 */
function getTodayIST(referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(referenceDate);
}

/**
 * Parses an IST date ("YYYY-MM-DD") and time ("HH:MM") into a UTC Date object.
 */
function parseISTDateTime(dateStr, hhmmStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD.');
  }
  if (!/^\d{2}:\d{2}$/.test(hhmmStr)) {
    throw new Error('Invalid time format. Expected HH:MM.');
  }
  const isoString = `${dateStr}T${hhmmStr}:00+05:30`;
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid IST date/time value.');
  }
  return parsed;
}

/**
 * Computes worked and shortfall minutes against the 450-minute (7h 30m) requirement.
 */
function calculateShiftDurations(checkInTime, checkOutTime) {
  const diffMs = checkOutTime.getTime() - checkInTime.getTime();
  const totalWorkedMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const shortfallMinutes = Math.max(0, REQUIRED_SHIFT_MINUTES - totalWorkedMinutes);
  return { totalWorkedMinutes, shortfallMinutes };
}

module.exports = {
  REQUIRED_SHIFT_MINUTES,
  getTodayIST,
  parseISTDateTime,
  calculateShiftDurations
};

