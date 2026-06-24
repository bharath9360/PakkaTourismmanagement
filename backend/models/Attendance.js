const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  // Employee reference
  employeeId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  employeeName:   { type: String, required: true },

  // Date
  date:           { type: String, required: true }, // YYYY-MM-DD

  // Time
  checkInTime:    { type: Date },
  checkOutTime:   { type: Date },
  hoursWorked:    { type: Number, default: 0 },

  // Work mode
  workMode:       { type: String, enum: ['office', 'wfh'], required: true },

  // Geo-location (stored regardless of mode)
  latitude:       { type: Number },
  longitude:      { type: Number },

  // Geo-fence result
  geoFenceStatus: {
    type: String,
    enum: ['verified', 'failed', 'wfh', 'pending'],
    default: 'pending'
  },
  geoFenceDistance: { type: Number }, // meters from office

  // Status
  attendanceStatus: {
    type: String,
    enum: ['present', 'absent', 'late', 'half_day', 'on_leave'],
    default: 'present'
  },

  // Biometric
  faceVerified:   { type: Boolean, default: false },

  // Device info
  deviceInfo: {
    userAgent:    { type: String },
    platform:     { type: String },
    language:     { type: String },
  },

  // Admin manual override
  markedManually:  { type: Boolean, default: false },
  markedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes:           { type: String },

  // Daily Work Report (submitted at checkout)
  workReport:      { type: String, maxlength: 2000 }, // tasks completed today
  remarks:         { type: String, maxlength: 1000 }, // blockers / notes
  selfRating:      { type: Number, min: 1, max: 10 }, // employee self-productivity rating

}, { timestamps: true });

// One record per employee per day
AttendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
AttendanceSchema.index({ date: 1 });
AttendanceSchema.index({ attendanceStatus: 1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
