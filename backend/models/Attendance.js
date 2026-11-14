const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  date: {
    type: String, // "YYYY-MM-DD" in Asia/Kolkata
    required: true,
    index: true
  },
  checkInTime: {
    type: Date,
    required: true
  },
  estCheckOutTime: {
    type: Date,
    required: true
  },
  checkOutTime: {
    type: Date,
    default: null
  },
  totalWorkedMinutes: {
    type: Number,
    default: 0
  },
  shortfallMinutes: {
    type: Number,
    default: 0
  },
  dailyTask: {
    type: String,
    default: '' // Populated ONLY on Check-Out submission or Admin Manual Override
  },
  status: {
    type: String,
    enum: ['CURRENTLY_WORKING', 'COMPLETED', 'MISSING_CHECKOUT'],
    default: 'CURRENTLY_WORKING'
  },
  checkInMethod: {
    type: String,
    enum: ['OFFICE_WIFI', 'OFFICE_GPS', 'ADMIN_MANUAL'],
    default: 'OFFICE_WIFI'
  },
  checkOutMethod: {
    type: String,
    enum: ['OFFICE_WIFI', 'OFFICE_GPS', 'REMOTE_CHECKOUT', 'ADMIN_APPROVED', null],
    default: null
  }
}, { timestamps: true });

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);

