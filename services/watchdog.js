const cron    = require('node-cron');
const User    = require('../models/User');
const Contact = require('../models/Contact');
const { sendEmail, disconnectEmailHtml } = require('./emailService');
const { broadcast } = require('./wsService');

// Only track users who are actively monitoring
// Key: userId string → { disconnectAlertSent, reconnectAlertSent, wasMonitoring }
const watchState = {};

const INACTIVITY_MS = 120_000; // 2 minutes silence = connection lost

function startWatchdog() {
  // Run every 15 seconds for responsiveness
  cron.schedule('*/15 * * * * *', async () => {
    const now = Date.now();
    try {
      // Only check users who have isMonitoring = true in DB
      const activeUsers = await User.find({ isMonitoring: true });

      for (const user of activeUsers) {
        if (!user.lastSeen) continue;

        const uid       = String(user._id);
        const timeSince = now - new Date(user.lastSeen).getTime();

        // Ensure state entry exists
        if (!watchState[uid]) {
          watchState[uid] = { disconnectAlertSent: false, reconnectAlertSent: false };
        }

        const state = watchState[uid];

        // ── DISCONNECT: silent for > 2 minutes while monitoring was ON ──────
        if (timeSince > INACTIVITY_MS && !state.disconnectAlertSent) {
          state.disconnectAlertSent = true;
          state.reconnectAlertSent  = false;

          console.log(`📴 ${user.name} went offline after ${Math.round(timeSince/1000)}s of silence`);

          const mapLink = user.lastLocation?.lat
            ? `https://www.google.com/maps/search/?api=1&query=${user.lastLocation.lat},${user.lastLocation.lng}`
            : 'https://maps.google.com';

          // Update DB
          await User.findByIdAndUpdate(user._id, { isMonitoring: false });

          // Send disconnect email to all contacts
          const contacts = await Contact.find({ userId: user._id });
          for (const c of contacts) {
            await sendEmail(
              c.email,
              `📴 ${user.name}'s connection was lost – SADS Alert`,
              disconnectEmailHtml(user.name, user.email, mapLink, false)
            );
          }

          // Broadcast to dashboard + mobile app via WebSocket
          broadcast({
            type:     'user_offline',
            userId:   uid,
            userName: user.name,
            lastSeen: user.lastSeen,
            mapLink,
            message:  `${user.name} went offline while monitoring was active`,
          });
        }
      }
    } catch (e) {
      console.error('Watchdog error:', e.message);
    }
  });

  console.log('⏱️  Watchdog started (checks every 15s, triggers after 2min silence)');
}

// Called from sensor route when a user reconnects after being offline
async function handleReconnect(userId, userName, userEmail, mapLink) {
  const uid   = String(userId);
  const state = watchState[uid];

  if (state?.disconnectAlertSent && !state.reconnectAlertSent) {
    state.reconnectAlertSent  = true;
    state.disconnectAlertSent = false;

    console.log(`🟢 ${userName} reconnected`);

    // Send reconnect email to all contacts
    const contacts = await Contact.find({ userId });
    for (const c of contacts) {
      await sendEmail(
        c.email,
        `🟢 ${userName} is back online – SADS`,
        disconnectEmailHtml(userName, userEmail, mapLink, true)
      );
    }

    // Broadcast reconnect
    broadcast({
      type:     'user_reconnected',
      userId:   uid,
      userName: userName,
      mapLink,
      message:  `${userName}'s device reconnected to the server`,
    });

    return true;
  }
  return false;
}

// Called when user starts monitoring — reset state
function startMonitoringState(userId) {
  const uid = String(userId);
  watchState[uid] = { disconnectAlertSent: false, reconnectAlertSent: false };
}

// Called when user stops monitoring — clear state
function stopMonitoringState(userId) {
  delete watchState[String(userId)];
}

module.exports = { startWatchdog, handleReconnect, startMonitoringState, stopMonitoringState };
