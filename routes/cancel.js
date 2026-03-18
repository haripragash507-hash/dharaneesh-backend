const express      = require('express');
const auth         = require('../middleware/auth');
const PendingAlert = require('../models/PendingAlert');
const { sendToUser, broadcast } = require('../services/wsService');

const router = express.Router();

// POST /cancel  — cancel the latest pending alert for this user
// Works from ANY device (app or website) as long as JWT is valid
router.post('/', auth, async (req, res) => {
  try {
    const alert = await PendingAlert.findOneAndUpdate(
      { userId: req.user._id, cancelled: false, emailSent: false },
      { cancelled: true },
      { sort: { startedAt: -1 }, new: true }
    );

    if (!alert) {
      return res.status(404).json({
        error: 'No active alert to cancel',
        message: 'Either already cancelled, email already sent, or no crash detected',
      });
    }

    console.log(`🛑 Alert cancelled for ${req.user.name} (from ${req.headers['user-agent']?.includes('Mozilla') ? 'web dashboard' : 'mobile app'})`);

    // Notify mobile app via WebSocket
    sendToUser(String(req.user._id), { type: 'alert_cancelled', source: 'remote' });

    // Notify dashboard
    broadcast({
      type:      'alert_cancelled',
      userId:    String(req.user._id),
      userName:  req.user.name,
      alertId:   String(alert._id),
      timestamp: new Date().toISOString(),
    });

    res.json({
      status:  'cancelled',
      alertId: alert._id,
      message: `Emergency alert for ${req.user.name} has been cancelled successfully`,
    });
  } catch (e) {
    console.error('Cancel error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /cancel/status — check if there is an active pending alert
router.get('/status', auth, async (req, res) => {
  try {
    const alert = await PendingAlert.findOne({
      userId:    req.user._id,
      cancelled: false,
      emailSent: false,
    }).sort({ startedAt: -1 });

    if (!alert) {
      return res.json({ hasPendingAlert: false });
    }

    const secondsLeft = Math.max(
      0,
      Math.round((new Date(alert.expiresAt).getTime() - Date.now()) / 1000)
    );

    res.json({
      hasPendingAlert: true,
      alertId:         alert._id,
      secondsLeft,
      expiresAt:       alert.expiresAt,
      score:           alert.score,
      location:        alert.location,
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
