const mongoose = require('mongoose');

const sensorLogSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userEmail: { type: String },
  userName:  { type: String },
  sensor: {
    ax: Number, ay: Number, az: Number,
    gx: Number, gy: Number, gz: Number,
    gForce:   Number,
    rotation: Number,
    score:    Number,
  },
  location: {
    lat: Number,
    lng: Number,
  },
  isCrash:   { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, index: { expires: '1h' } }, // TTL: auto delete after 1 hour
});

module.exports = mongoose.model('SensorLog', sensorLogSchema);
