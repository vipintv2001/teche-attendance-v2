import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable/es';
import {
  REQUIRED_SHIFT_MINUTES,
  HALF_DAY_SHIFT_MINUTES,
  formatDuration,
  formatTime12hIST,
  formatDatePretty,
  getDaysInMonth
} from './timeUtils.js';

export function generateDailyAttendancePdf({
  dateStr,
  todayIST,
  employees,
  recordsByKey,
  holiday
}) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4'
  });

  const [y, m, d] = dateStr.split('-').map(Number);
  const isSunday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
  const isFuture = dateStr > todayIST;
  const isFullHoliday = holiday?.type === 'HOLIDAY';
  const isHalfDay = holiday?.type === 'HALF_DAY';
  const targetShiftMinutes = isHalfDay ? HALF_DAY_SHIFT_MINUTES : REQUIRED_SHIFT_MINUTES;
  const targetShiftLabel = isHalfDay ? '3h 45m (225 mins) [Half-Day]' : '7h 30m (450 mins)';

  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('TechE Education — Daily Attendance Report', 40, 38);

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  const holidayNote = holiday ? `   |   ${holiday.type}: ${holiday.title}` : '';
  doc.text(
    `Date: ${formatDatePretty(dateStr)} (${dateStr})   |   Required Shift: ${targetShiftLabel}${holidayNote}   |   Timezone: IST`,
    40,
    56
  );

  const activeEmployees = employees.filter((emp) => emp.isActive !== false);

  const body = activeEmployees.map((emp) => {
    const record = recordsByKey.get(`${emp.employeeId}__${dateStr}`);
    if (record) {
      const workedStr =
        record.status === 'COMPLETED'
          ? formatDuration(record.totalWorkedMinutes)
          : '--';
      const shortfallStr =
        record.status === 'COMPLETED'
          ? formatDuration(
              record.shortfallMinutes !== undefined
                ? record.shortfallMinutes
                : Math.max(0, targetShiftMinutes - (record.totalWorkedMinutes || 0))
            )
          : record.status === 'MISSING_CHECKOUT'
            ? formatDuration(targetShiftMinutes)
            : '--';

      return [
        emp.employeeId,
        emp.name,
        formatTime12hIST(record.checkInTime),
        record.checkOutTime ? formatTime12hIST(record.checkOutTime) : '--',
        workedStr,
        shortfallStr,
        record.status,
        record.dailyTask || '--'
      ];
    }

    if (isSunday) {
      return [emp.employeeId, emp.name, '--', '--', '--', '--', 'HOLIDAY', 'Sunday Holiday'];
    }
    if (isFullHoliday) {
      return [emp.employeeId, emp.name, '--', '--', '--', '--', 'HOLIDAY', holiday.title];
    }
    if (isFuture) {
      return [emp.employeeId, emp.name, '--', '--', '--', '--', 'UPCOMING', '--'];
    }

    return [
      emp.employeeId,
      emp.name,
      '--',
      '--',
      '0h 0m',
      formatDuration(targetShiftMinutes),
      'ABSENT',
      '--'
    ];
  });

  autoTable(doc, {
    startY: 70,
    head: [
      [
        'Emp ID',
        'Employee Name',
        'Check-In',
        'Check-Out',
        'Total Time',
        `Shortfall (vs ${isHalfDay ? '3h 45m' : '7h 30m'})`,
        'Status',
        'Daily Activity Summary'
      ]
    ],
    body,
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: 5,
      textColor: [30, 41, 59],
      valign: 'middle'
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 68 },
      1: { cellWidth: 115 },
      2: { cellWidth: 62 },
      3: { cellWidth: 62 },
      4: { cellWidth: 58 },
      5: { cellWidth: 88 },
      6: { cellWidth: 82 },
      7: { cellWidth: 'auto' }
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 6) {
        const val = String(data.cell.raw || '');
        if (val === 'ABSENT' || val === 'MISSING_CHECKOUT') {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = 'bold';
        } else if (val === 'COMPLETED') {
          data.cell.styles.textColor = [4, 120, 87];
          data.cell.styles.fontStyle = 'bold';
        } else if (val === 'HOLIDAY') {
          data.cell.styles.textColor = [180, 83, 9];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  doc.save(`TECHE_Daily_Attendance_${dateStr}.pdf`);
}

export function generateMonthlySummaryPdf({
  yearMonth,
  todayIST,
  employees,
  recordsByKey,
  holidayMap = new Map()
}) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4'
  });

  const allDays = getDaysInMonth(yearMonth);
  // Exclude Sundays AND full public holidays from elapsed working days
  const elapsedWorkingDays = allDays.filter((d) => {
    if (d.isSunday) return false;
    const h = holidayMap.get(d.dateStr);
    if (h?.type === 'HOLIDAY') return false;
    return d.dateStr <= todayIST;
  });

  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('TechE Education — Monthly Attendance Summary Report', 40, 38);

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Ledger Period: ${yearMonth}   |   Elapsed Working Days (Excl. Sundays & Holidays): ${elapsedWorkingDays.length}   |   Standard Shift: 7h 30m / Half-Day: 3h 45m`,
    40,
    56
  );

  const activeEmployees = employees.filter((emp) => emp.isActive !== false);

  const body = activeEmployees.map((emp) => {
    let presentDays = 0;
    let totalWorkedMinutes = 0;
    let expectedMinutes = 0;
    let totalShortfallMinutes = 0;

    for (const dayInfo of elapsedWorkingDays) {
      const h = holidayMap.get(dayInfo.dateStr);
      const isHalfDay = h?.type === 'HALF_DAY';
      const targetMins = isHalfDay ? HALF_DAY_SHIFT_MINUTES : REQUIRED_SHIFT_MINUTES;

      const record = recordsByKey.get(`${emp.employeeId}__${dayInfo.dateStr}`);
      if (record) {
        presentDays += 1;
        expectedMinutes += targetMins;
        const worked = Number(record.totalWorkedMinutes) || 0;
        totalWorkedMinutes += worked;

        if (record.status === 'COMPLETED') {
          totalShortfallMinutes += Math.max(0, targetMins - worked);
        } else if (record.status === 'MISSING_CHECKOUT') {
          totalShortfallMinutes += targetMins;
        }
      }
    }

    const totalWorkingDays = elapsedWorkingDays.length;
    const absentDays = Math.max(0, totalWorkingDays - presentDays);
    const attendancePct =
      totalWorkingDays > 0
        ? `${((presentDays / totalWorkingDays) * 100).toFixed(1)}%`
        : '0.0%';

    return [
      emp.employeeId,
      emp.name,
      String(totalWorkingDays),
      String(presentDays),
      String(absentDays),
      formatDuration(totalWorkedMinutes),
      formatDuration(expectedMinutes),
      formatDuration(totalShortfallMinutes),
      attendancePct
    ];
  });

  autoTable(doc, {
    startY: 70,
    head: [
      [
        'Emp ID',
        'Employee Name',
        'Total Working Days',
        'Total Present Days',
        'Total Absent Days',
        'Total Working Hours',
        'Expected Hours',
        'Total Shortfall Hours',
        'Attendance %'
      ]
    ],
    body,
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 6,
      textColor: [30, 41, 59],
      valign: 'middle'
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 75 },
      1: { cellWidth: 145 },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center' },
      6: { halign: 'center' },
      7: { halign: 'center' },
      8: { halign: 'center', fontStyle: 'bold' }
    }
  });

  doc.save(`TECHE_Monthly_Attendance_Report_${yearMonth}.pdf`);
}
