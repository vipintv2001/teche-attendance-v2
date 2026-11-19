const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  date: {
    type: String, // YYYY-MM-DD
    required: true,
    unique: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['HOLIDAY', 'HALF_DAY'],
    default: 'HOLIDAY'
  }
}, { timestamps: true });

module.exports = mongoose.model('Holiday', holidaySchema);
