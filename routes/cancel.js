const express      = require('express');
const auth         = require('../middleware/auth');
const PendingAlert = require('../models/PendingAlert');
const { sendToUser, broadcast } = require('../services/wsService');

const router = express.Router();

// POST /cancel  — cancel the latest pending alert for this user
router.post('/', auth, async (req, res) => {
  try {
    const alert = await PendingAlert.findOneAndUpdate(
      { userId: req.user._id, cancelled: false, emailSent: false },
      { cancelled: true },
      { sort: { startedAt: -1 }, new: true }
    );

    if (!alert) return res.status(404).json({ error: 'No active alert to cancel' });

    sendToUser(String(req.user._id), { type: 'alert_cancelled' });
    broadcast({ type: 'alert_cancelled', userId: String(req.user._id), userName: req.user.name });

    console.log(`🛑 Alert cancelled for ${req.user.name}`);
    res.json({ status: 'cancelled', alertId: alert._id });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
