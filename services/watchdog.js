const cron    = require('node-cron');
const User    = require('../models/User');
const Contact = require('../models/Contact');
const { sendEmail, disconnectEmailHtml } = require('./emailService');
const { broadcast } = require('./wsService');

const INACTIVITY_MS = 120_000; // 2 minutes

const disconnectSent = new Set(); // userId strings already notified

function startWatchdog() {
  // Run every 30 seconds
  cron.schedule('*/30 * * * * *', async () => {
    const now = Date.now();
    try {
      const activeUsers = await User.find({ isMonitoring: true });

      for (const user of activeUsers) {
        if (!user.lastSeen) continue;
        const timeSince = now - new Date(user.lastSeen).getTime();
        const uid       = String(user._id);

        if (timeSince > INACTIVITY_MS && !disconnectSent.has(uid)) {
          disconnectSent.add(uid);
          console.log(`⚠️  ${user.name} went offline`);

          const mapLink = user.lastLocation?.lat
            ? `https://www.google.com/maps?q=${user.lastLocation.lat},${user.lastLocation.lng}`
            : 'https://maps.google.com';

          const contacts = await Contact.find({ userId: user._id });
          for (const c of contacts) {
            await sendEmail(
              c.email,
              `⚠️ ${user.name}'s device disconnected – SADS`,
              disconnectEmailHtml(user.name, user.email, mapLink, false)
            );
          }

          // Mark user as not monitoring
          await User.findByIdAndUpdate(user._id, { isMonitoring: false });

          broadcast({
            type: 'user_offline',
            userId: uid,
            userName: user.name,
            lastSeen: user.lastSeen,
          });
        }

        // If reconnected, clear from set so we can notify again on next disconnect
        if (timeSince < INACTIVITY_MS && disconnectSent.has(uid)) {
          disconnectSent.delete(uid);
        }
      }
    } catch (e) {
      console.error('Watchdog error:', e.message);
    }
  });

  console.log('⏱️  Inactivity watchdog started');
}

module.exports = { startWatchdog };
