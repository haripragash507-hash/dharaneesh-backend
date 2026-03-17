const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId:   { type: String },
  lastActive: { type: Date, default: Date.now },
  isActive:   { type: Boolean, default: true },
  createdAt:  { type: Date, default: Date.now },
});

module.exports = mongoose.model('Session', sessionSchema);
