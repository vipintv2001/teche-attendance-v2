import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable/es';
import {
  REQUIRED_SHIFT_MINUTES,
  formatDuration,
  formatTime12hIST,
  formatDatePretty,
  getDaysInMonth
} from './timeUtils.js';

export function generateDailyAttendancePdf({
  dateStr,
  todayIST,
  employees,
  recordsByKey
}) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4'
  });

  const [y, m, d] = dateStr.split('-').map(Number);
  const isSunday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
  const isFuture = dateStr > todayIST;

  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('TechE Education — Daily Attendance Report', 40, 38);

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Date: ${formatDatePretty(dateStr)} (${dateStr})   |   Required Shift: 7h 30m (450 mins)   |   Timezone: IST (Asia/Kolkata)`,
    40,
    56
  );

  const body = employees.map((emp) => {
    const record = recordsByKey.get(`${emp.employeeId}__${dateStr}`);
    if (record) {
      const workedStr =
        record.status === 'COMPLETED'
          ? formatDuration(record.totalWorkedMinutes)
          : '--';
      const shortfallStr =
        record.status === 'COMPLETED'
          ? formatDuration(record.shortfallMinutes)
          : record.status === 'MISSING_CHECKOUT'
            ? formatDuration(REQUIRED_SHIFT_MINUTES)
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
    if (isFuture) {
      return [emp.employeeId, emp.name, '--', '--', '--', '--', 'UPCOMING', '--'];
    }

    return [
      emp.employeeId,
      emp.name,
      '--',
      '--',
      '0h 0m',
      formatDuration(REQUIRED_SHIFT_MINUTES),
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
        'Shortfall (vs 7h 30m)',
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
      5: { cellWidth: 78 },
      6: { cellWidth: 92 },
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
  recordsByKey
}) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4'
  });

  const allDays = getDaysInMonth(yearMonth);
  const elapsedWorkingDays = allDays.filter(
    (d) => !d.isSunday && d.dateStr <= todayIST
  );

  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('TechE Education — Monthly Attendance Summary Report', 40, 38);

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Ledger Period: ${yearMonth}   |   Elapsed Working Days (Excl. Sundays): ${elapsedWorkingDays.length}   |   Standard Shift: 7h 30m`,
    40,
    56
  );

  const body = employees.map((emp) => {
    let presentDays = 0;
    let totalWorkedMinutes = 0;
    let totalShortfallMinutes = 0;

    for (const dayInfo of elapsedWorkingDays) {
      const record = recordsByKey.get(`${emp.employeeId}__${dayInfo.dateStr}`);
      if (record) {
        presentDays += 1;
        if (record.status === 'COMPLETED') {
          const worked = Number(record.totalWorkedMinutes) || 0;
          const shortfall =
            record.shortfallMinutes !== undefined && record.shortfallMinutes !== null
              ? Number(record.shortfallMinutes)
              : Math.max(0, REQUIRED_SHIFT_MINUTES - worked);
          totalWorkedMinutes += worked;
          totalShortfallMinutes += shortfall;
        } else if (record.status === 'MISSING_CHECKOUT') {
          totalShortfallMinutes += REQUIRED_SHIFT_MINUTES;
        }
      }
    }

    const totalWorkingDays = elapsedWorkingDays.length;
    const absentDays = Math.max(0, totalWorkingDays - presentDays);
    const expectedMinutes = presentDays * REQUIRED_SHIFT_MINUTES;
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

