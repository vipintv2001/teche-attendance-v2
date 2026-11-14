export const REQUIRED_SHIFT_MINUTES = 450; // 7h 30m

export function formatDuration(totalMinutes) {
  const safeMins = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const hours = Math.floor(safeMins / 60);
  const mins = safeMins % 60;
  return `${hours}h ${mins}m`;
}

export function formatTime12hIST(dateInput, includeSeconds = false) {
  if (!dateInput) return '--';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '--';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true
  }).format(d);
}

export function formatTime24hIST(dateInput) {
  if (!dateInput) return '--';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '--';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d);
}

export function formatDatePretty(yyyyMmDd) {
  if (!yyyyMmDd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return yyyyMmDd || '--';
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(utcDate);
}

export function getTodayISTClient() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function getDaysInMonth(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = [];
  for (let day = 1; day <= totalDays; day += 1) {
    const dd = String(day).padStart(2, '0');
    const dateStr = `${yearMonth}-${dd}`;
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    const weekdayIndex = utcDate.getUTCDay(); // 0 = Sunday
    const weekdayShort = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short'
    }).format(utcDate);
    days.push({
      day,
      dateStr,
      isSunday: weekdayIndex === 0,
      weekdayShort
    });
  }
  return days;
}

