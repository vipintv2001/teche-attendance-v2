const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  registeredDeviceToken: {
    type: String,
    default: null,
    index: true
  },
  deviceSignature: {
    platform: { type: String, default: '' },
    screenSize: { type: String, default: '' } // Format: "${screen.width}x${screen.height}x${devicePixelRatio}"
  },
  pushSubscription: {
    type: Object,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);

