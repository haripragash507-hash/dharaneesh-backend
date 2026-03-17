const express    = require('express');
const auth       = require('../middleware/auth');
const SensorLog  = require('../models/SensorLog');
const PendingAlert = require('../models/PendingAlert');
const User       = require('../models/User');

const router = express.Router();

// GET /logs  — last 1-hour sensor logs for current user
router.get('/', auth, async (req, res) => {
  try {
    const logs = await SensorLog.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ logs });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /logs/all  — all users logs (dashboard admin view)
router.get('/all', auth, async (req, res) => {
  try {
    const logs = await SensorLog.find({})
      .sort({ createdAt: -1 })
      .limit(500);
    res.json({ logs });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /logs/alerts  — recent pending alerts
router.get('/alerts', auth, async (req, res) => {
  try {
    const alerts = await PendingAlert.find({})
      .sort({ startedAt: -1 })
      .limit(50)
      .populate('userId', 'name email');
    res.json({ alerts });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /logs/users  — all users with monitoring status
router.get('/users', auth, async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ lastSeen: -1 });
    res.json({ users });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
