const express      = require('express');
const auth         = require('../middleware/auth');
const User         = require('../models/User');
const Contact      = require('../models/Contact');
const PendingAlert = require('../models/PendingAlert');
const SensorLog    = require('../models/SensorLog');
const { analyseSensor }              = require('../services/crashDetection');
const { sendEmail, crashEmailHtml, govtEmailHtml, disconnectEmailHtml, GOVT_EMAIL } = require('../services/emailService');
const { sendToUser, broadcast }      = require('../services/wsService');

const router = express.Router();

const GRACE_PERIOD_MS    = 90_000;  // 1.5 min
const CRASH_COOLDOWN_MS  = 30_000;

// POST /sensor
router.post('/', auth, async (req, res) => {
  const { sensor, location } = req.body;
  if (!sensor) return res.status(400).json({ error: 'Missing sensor data' });

  const user    = req.user;
  const now     = Date.now();
  const mapLink = location?.lat && location?.lng
    ? `https://www.google.com/maps?q=${location.lat},${location.lng}`
    : 'https://maps.google.com';

  // Update user last seen + location
  const wasOffline = user.lastSeen && (now - new Date(user.lastSeen).getTime() > 120_000);

  await User.findByIdAndUpdate(user._id, {
    lastSeen: new Date(),
    isMonitoring: true,
    'lastLocation.lat': location?.lat || null,
    'lastLocation.lng': location?.lng || null,
    'lastLocation.updatedAt': new Date(),
  });

  // Reconnect notification
  if (wasOffline) {
    const contacts = await Contact.find({ userId: user._id });
    for (const c of contacts) {
      await sendEmail(
        c.email,
        `🟢 ${user.name} is back online – SADS`,
        disconnectEmailHtml(user.name, user.email, mapLink, true)
      );
    }
    broadcast({ type: 'user_reconnected', userId: String(user._id), userName: user.name, mapLink });
  }

  // Run crash detection
  const { gForce, rotation, score, isCrash } = analyseSensor(String(user._id), sensor);

  // Log to DB (TTL auto-deletes after 1 hour)
  SensorLog.create({
    userId: user._id, userEmail: user.email, userName: user.name,
    sensor: { ...sensor, gForce, rotation, score },
    location: { lat: location?.lat, lng: location?.lng },
    isCrash,
  }).catch(console.error);

  // Broadcast live sensor update to dashboard
  broadcast({
    type: 'sensor_update',
    userId: String(user._id),
    userName: user.name,
    gForce, rotation, score, isCrash,
    location: { lat: location?.lat, lng: location?.lng },
    timestamp: new Date().toISOString(),
  });

  // Check for active pending alert cooldown
  const existingAlert = await PendingAlert.findOne({
    userId: user._id,
    cancelled: false,
    emailSent: false,
    startedAt: { $gte: new Date(now - CRASH_COOLDOWN_MS) },
  });

  let pendingAlert = false;

  if (isCrash && !existingAlert) {
    const expiresAt = new Date(now + GRACE_PERIOD_MS);

    const alert = await PendingAlert.create({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      expiresAt,
      location: { lat: location?.lat, lng: location?.lng, mapLink },
      score,
    });

    console.log(`🚨 CRASH for ${user.name} (${user.email}) – score: ${score} – grace starts`);

    // Notify mobile device via WS
    sendToUser(String(user._id), {
      type: 'crash_detected',
      alertId: alert._id,
      score,
      expiresAt: expiresAt.toISOString(),
    });

    // Broadcast to dashboard
    broadcast({
      type: 'crash_alert',
      userId: String(user._id),
      userName: user.name,
      alertId: String(alert._id),
      score,
      mapLink,
      timestamp: new Date().toISOString(),
    });

    // Schedule email after grace period
    setTimeout(async () => {
      const fresh = await PendingAlert.findById(alert._id);
      if (!fresh || fresh.cancelled || fresh.emailSent) return;

      const contacts = await Contact.find({ userId: user._id });
      const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      // Send to all emergency contacts
      for (const c of contacts) {
        await sendEmail(
          c.email,
          `🚨 ${user.name} has been in an accident – SADS Alert`,
          crashEmailHtml(user.name, user.email, mapLink, timestamp)
        );
      }

      // Send to government emergency email
      await sendEmail(
        GOVT_EMAIL,
        `🚑 EMERGENCY: Road accident detected – ${user.name}`,
        govtEmailHtml(user.name, user.email, mapLink, timestamp)
      );

      await PendingAlert.findByIdAndUpdate(alert._id, { emailSent: true });

      broadcast({
        type: 'alert_email_sent',
        userId: String(user._id),
        userName: user.name,
        timestamp: new Date().toISOString(),
      });

      console.log(`📧 Crash emails sent for ${user.name}`);
    }, GRACE_PERIOD_MS);

    pendingAlert = true;
  }

  res.json({ crash: isCrash, pendingAlert, score, gForce, rotation });
});

module.exports = router;
