const mongoose = require('mongoose');

const ItinerarySchema = new mongoose.Schema({
  title:       { type: String, required: true },
  destination: { type: String, required: true },
  days:        { type: Number, required: true },
  booking:     { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },

  clientName:  { type: String },
  clientPhone: { type: String },
  totalPrice:  { type: String },

  // Day-wise plan
  dayPlans: [{
    dayNumber:   { type: Number, required: true },
    title:       { type: String }, // e.g. "Arrival & City Tour"
    date:        { type: Date },
    accommodation: { type: String },
    meals: {
      breakfast: { type: Boolean, default: true },
      lunch:     { type: Boolean, default: true },
      dinner:    { type: Boolean, default: true },
    },
    activities: [{
      time:        { type: String },
      activity:    { type: String },
      location:    { type: String },
      duration:    { type: String },
      notes:       { type: String },
      imageUrl:    { type: String },
    }],
    transport:   { type: String },
    notes:       { type: String },
    imageUrl:    { type: String },
  }],

  // Inclusions / Exclusions
  inclusions:  [{ type: String }],
  exclusions:  [{ type: String }],
  importantNotes: [{ type: String }],

  isTemplate:  { type: Boolean, default: false },
  templateName: { type: String },
  pdfUrl:      { type: String },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Itinerary', ItinerarySchema);
