const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  origin: { type: String, required: true },
  destination: { type: String, required: true },
  travelCompanion: { type: String, required: true },
  budget: { type: String, required: true },
  interests: { type: [String], required: true },
  travelDates: { type: [Date], required: true },
  responseSummary: { type: String, required: true },
  totalCostEstimate: { type: Number, required: true }
});

const Trip = mongoose.model('Trip', tripSchema);

module.exports = Trip;