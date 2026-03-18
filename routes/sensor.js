const express      = require('express');
const auth         = require('../middleware/auth');
const User         = require('../models/User');
const Contact      = require('../models/Contact');
const PendingAlert = require('../models/PendingAlert');
const SensorLog    = require('../models/SensorLog');
const { analyseSensor }   = require('../services/crashDetection');
const { sendEmail, crashEmailHtml, govtEmailHtml, disconnectEmailHtml, GOVT_EMAIL } = require('../services/emailService');
const { sendToUser, broadcast } = require('../services/wsService');
const { handleReconnect, startMonitoringState } = require('../services/watchdog');

const router = express.Router();

const GRACE_PERIOD_MS   = 90_000;  // 1.5 min
const CRASH_COOLDOWN_MS = 30_000;

// Best known location per user — in memory for speed
const lastKnownLocation = {};

function buildMapLink(lat, lng) {
  if (!lat || !lng) return null;
  return `https://www.google.com/maps/search/?api=1&query=${parseFloat(lat).toFixed(6)},${parseFloat(lng).toFixed(6)}`;
}

// POST /sensor  — main data ingestion endpoint
router.post('/', auth, async (req, res) => {
  const { sensor, location, monitoringStarted } = req.body;
  if (!sensor) return res.status(400).json({ error: 'Missing sensor data' });

  const user = req.user;
  const uid  = String(user._id);
  const now  = Date.now();

  // ── If client signals monitoring just started, reset watchdog state ──────
  if (monitoringStarted) {
    startMonitoringState(uid);
  }

  // ── LOCATION: update best known ──────────────────────────────────────────
  if (location?.lat && location?.lng) {
    lastKnownLocation[uid] = {
      lat:       parseFloat(location.lat),
      lng:       parseFloat(location.lng),
      timestamp: now,
    };
    // Persist to DB (non-blocking)
    User.findByIdAndUpdate(user._id, {
      'lastLocation.lat':       parseFloat(location.lat),
      'lastLocation.lng':       parseFloat(location.lng),
      'lastLocation.updatedAt': new Date(),
    }).catch(console.error);
  }

  // Best location: current > in-memory > DB
  let best = lastKnownLocation[uid];
  if (!best && user.lastLocation?.lat) {
    best = { lat: user.lastLocation.lat, lng: user.lastLocation.lng };
  }

  const mapLink    = buildMapLink(best?.lat, best?.lng) || 'https://maps.google.com';
  const hasLoc     = !!(best?.lat && best?.lng);
  const locAge     = best?.timestamp ? Math.round((now - best.timestamp) / 1000) : null;

  // ── RECONNECT CHECK ──────────────────────────────────────────────────────
  const wasOffline = user.lastSeen &&
    (now - new Date(user.lastSeen).getTime() > 120_000) &&
    user.isMonitoring === false;

  if (wasOffline) {
    await handleReconnect(user._id, user.name, user.email, mapLink);
  }

  // ── UPDATE LAST SEEN ─────────────────────────────────────────────────────
  await User.findByIdAndUpdate(user._id, {
    lastSeen:     new Date(),
    isMonitoring: true,
  });

  // ── CRASH DETECTION ──────────────────────────────────────────────────────
  const { gForce, rotation, score, isCrash } = analyseSensor(uid, sensor);

  // Log to DB (TTL deletes after 1hr)
  SensorLog.create({
    userId:    user._id,
    userEmail: user.email,
    userName:  user.name,
    sensor:    { ...sensor, gForce, rotation, score },
    location:  best ? { lat: best.lat, lng: best.lng } : {},
    isCrash,
  }).catch(console.error);

  // Live broadcast to dashboard
  broadcast({
    type:      'sensor_update',
    userId:    uid,
    userName:  user.name,
    gForce, rotation, score, isCrash,
    location:  best || null,
    hasLocation: hasLoc,
    mapLink,
    timestamp: new Date().toISOString(),
  });

  // ── CRASH FLOW ───────────────────────────────────────────────────────────
  const cooldownOk = !(await PendingAlert.findOne({
    userId:    user._id,
    cancelled: false,
    emailSent: false,
    startedAt: { $gte: new Date(now - CRASH_COOLDOWN_MS) },
  }));

  let pendingAlert = false;

  if (isCrash && cooldownOk) {
    const expiresAt = new Date(now + GRACE_PERIOD_MS);

    // Snapshot location at crash moment
    const crashLoc = best
      ? { lat: best.lat, lng: best.lng, mapLink }
      : { lat: null, lng: null, mapLink: 'https://maps.google.com' };

    const alert = await PendingAlert.create({
      userId:    user._id,
      userEmail: user.email,
      userName:  user.name,
      expiresAt,
      location:  crashLoc,
      score,
    });

    console.log(`🚨 CRASH for ${user.name} | score:${score} | loc:${hasLoc ? mapLink : 'NONE'}`);

    // Notify phone (if online)
    sendToUser(uid, {
      type:      'crash_detected',
      alertId:   String(alert._id),
      score,
      expiresAt: expiresAt.toISOString(),
      hasLocation: hasLoc,
      mapLink,
    });

    // Notify dashboard
    broadcast({
      type:      'crash_alert',
      userId:    uid,
      userName:  user.name,
      alertId:   String(alert._id),
      score,
      hasLocation: hasLoc,
      mapLink,
      timestamp: new Date().toISOString(),
    });

    // ── Grace period timer ────────────────────────────────────────────────
    setTimeout(async () => {
      const fresh = await PendingAlert.findById(alert._id);
      if (!fresh || fresh.cancelled || fresh.emailSent) {
        console.log(`⏭️  Alert ${alert._id} already cancelled or sent — skipping`);
        return;
      }

      // Re-check location — may have improved during grace period
      const finalLoc   = lastKnownLocation[uid] || best;
      const finalMap   = buildMapLink(finalLoc?.lat, finalLoc?.lng) || crashLoc.mapLink;
      const timestamp  = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      const contacts = await Contact.find({ userId: user._id });

      if (contacts.length === 0) {
        console.warn(`⚠️  No contacts for ${user.name} — only govt email will be sent`);
      }

      // Send to all emergency contacts
      for (const c of contacts) {
        const sent = await sendEmail(
          c.email,
          `🚨 ${user.name} has been in an accident – SADS Alert`,
          crashEmailHtml(user.name, user.email, finalMap, timestamp)
        );
        console.log(`📧 Crash email → ${c.email}: ${sent ? 'sent' : 'failed'}`);
      }

      // Send to government emergency
      await sendEmail(
        GOVT_EMAIL,
        `🚑 EMERGENCY: Accident detected – ${user.name}`,
        govtEmailHtml(user.name, user.email, finalMap, timestamp)
      );

      await PendingAlert.findByIdAndUpdate(alert._id, {
        emailSent: true,
        'location.mapLink': finalMap,
      });

      broadcast({
        type:      'alert_email_sent',
        userId:    uid,
        userName:  user.name,
        timestamp: new Date().toISOString(),
      });

      console.log(`📬 All crash emails sent for ${user.name}`);
    }, GRACE_PERIOD_MS);

    pendingAlert = true;
  }

  res.json({
    crash: isCrash,
    pendingAlert,
    score,
    gForce,
    rotation,
    hasLocation: hasLoc,
    locationAge: locAge,
    mapLink: hasLoc ? mapLink : null,
  });
});

// POST /monitoring/start — called when user taps START button
router.post('/start', auth, async (req, res) => {
  const uid = String(req.user._id);
  startMonitoringState(uid);
  await User.findByIdAndUpdate(req.user._id, { isMonitoring: true, lastSeen: new Date() });
  console.log(`▶️  ${req.user.name} started monitoring`);
  broadcast({ type: 'monitoring_started', userId: uid, userName: req.user.name });
  res.json({ status: 'monitoring_started' });
});

// POST /monitoring/stop — called when user taps STOP button
router.post('/stop', auth, async (req, res) => {
  const uid = String(req.user._id);
  const { stopMonitoringState } = require('../services/watchdog');
  stopMonitoringState(uid);
  await User.findByIdAndUpdate(req.user._id, { isMonitoring: false });
  console.log(`⏹️  ${req.user.name} stopped monitoring`);
  broadcast({ type: 'monitoring_stopped', userId: uid, userName: req.user.name });
  res.json({ status: 'monitoring_stopped' });
});

module.exports = router;
