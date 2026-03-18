const mongoose = require('mongoose');

const pendingAlertSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userEmail:   { type: String, required: true },
  userName:    { type: String, required: true },
  startedAt:   { type: Date,   default: Date.now },
  expiresAt:   { type: Date,   required: true },
  cancelled:   { type: Boolean, default: false },
  emailSent:   { type: Boolean, default: false },
  location: {
    lat: Number,
    lng: Number,
    mapLink: String,
  },
  score:       { type: Number, default: 0 },
});

module.exports = mongoose.model('PendingAlert', pendingAlertSchema);
