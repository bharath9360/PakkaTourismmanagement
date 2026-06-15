const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true },
  password:    { type: String, required: true, minlength: 6, select: false },
  phone:       { type: String },

  // Only 2 roles: admin or employee
  role:        { type: String, enum: ['admin', 'employee'], default: 'employee' },
  department:  { type: String, default: 'Sales' },
  designation: { type: String, default: 'Travel Executive' },
  avatar:      { type: String },
  isActive:    { type: Boolean, default: true },

  // Employee-specific fields
  destination:     { type: String },                          // Assigned destination/location
  faceRegistered:  { type: Boolean, default: false },         // Face ID enrolled
  faceRegisteredAt:{ type: Date },                            // When face was registered
  workMode:        { type: String, enum: ['office', 'wfh'], default: 'office' },
  lastLogin:       { type: Date },

  // Geo-fencing
  geoLocation: {                                              // Last captured GPS
    lat:  { type: Number },
    lng:  { type: Number },
    city: { type: String }
  },
  officeLocation: {                                           // Assigned office geo-fence (employee-specific)
    name:   { type: String },
    lat:    { type: Number },
    lng:    { type: Number },
    radius: { type: Number, default: 50 }                     // Geo-fence radius in meters
  },

  // Admin-managed list of all office locations (stored on admin user)
  officeLocations: [{
    name:   { type: String, required: true },
    lat:    { type: Number, required: true },
    lng:    { type: Number, required: true },
    radius: { type: Number, default: 50 }                     // Default 50m precision
  }],
}, { timestamps: true });

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Remove password from JSON output
UserSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);
