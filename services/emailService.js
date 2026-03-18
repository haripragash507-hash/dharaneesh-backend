const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL  = process.env.SENDER_EMAIL  || 'noreply@sads.app';
const SENDER_NAME   = process.env.SENDER_NAME   || 'SADS Emergency System';
const GOVT_EMAIL = process.env.GOVT_EMERGENCY_EMAIL || 'emergency@example.gov.in';

// Per-address cooldown: max 1 email per minute
const cooldowns = {};
const COOLDOWN_MS = 60_000;

async function sendEmail(to, subject, html) {
  if (!BREVO_API_KEY) {
    console.warn('⚠️  BREVO_API_KEY not set — email not sent');
    return false;
  }
  const now = Date.now();
  if (cooldowns[to] && now - cooldowns[to] < COOLDOWN_MS) {
    console.log(`⏳ Cooldown active for ${to} — skipping`);
    return false;
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method:  'POST',
      headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender:      { name: SENDER_NAME, email: SENDER_EMAIL },
        to:          [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (res.ok) {
      cooldowns[to] = now;
      console.log(`✅ Email sent → ${to} | ${subject}`);
      return true;
    }
    const err = await res.text();
    console.error(`❌ Brevo error for ${to}:`, err);
  } catch (e) {
    console.error('❌ Email send exception:', e.message);
  }
  return false;
}

// ── CRASH ALERT EMAIL ─────────────────────────────────────────────────────
function crashEmailHtml(userName, userEmail, mapLink, timestamp) {
  const hasLocation = mapLink && mapLink !== 'https://maps.google.com';
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#060610;color:#fff">
<div style="max-width:620px;margin:32px auto;background:linear-gradient(160deg,#140000,#0a0a1a);border:2px solid #cc0000;border-radius:16px;overflow:hidden">

  <!-- Header -->
  <div style="background:linear-gradient(90deg,#aa0000,#ff2200);padding:28px;text-align:center">
    <div style="font-size:56px;margin-bottom:8px">🚨</div>
    <h1 style="margin:0;font-size:28px;letter-spacing:3px;font-weight:900;color:#fff">ACCIDENT DETECTED</h1>
    <p style="margin:8px 0 0;font-size:13px;opacity:0.85;color:#ffcccc">Smart Accident Detection System — Emergency Alert</p>
  </div>

  <!-- Body -->
  <div style="padding:32px">

    <!-- Person -->
    <div style="background:rgba(255,0,0,0.12);border:1px solid rgba(255,51,51,0.4);border-radius:12px;padding:20px;margin-bottom:24px;text-align:center">
      <p style="margin:0 0 6px;font-size:14px;color:#ffaaaa">Accident detected for</p>
      <p style="margin:0;font-size:28px;font-weight:900;color:#ff6666">${userName}</p>
      <p style="margin:4px 0 0;font-size:14px;color:#888">${userEmail}</p>
    </div>

    <!-- Details table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr>
        <td style="padding:10px 14px;background:#111;border-radius:8px 0 0 0;color:#888;font-size:13px;width:130px;border-bottom:1px solid #222">⏰ Time</td>
        <td style="padding:10px 14px;background:#111;color:#fff;font-size:13px;border-bottom:1px solid #222;border-radius:0 8px 0 0">${timestamp}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;background:#0d0d0d;color:#888;font-size:13px;border-radius:0 0 0 8px">📍 Location</td>
        <td style="padding:10px 14px;background:#0d0d0d;color:#fff;font-size:13px;border-radius:0 0 8px 0">
          ${hasLocation ? 'GPS coordinates attached below' : '⚠️ Location unavailable at time of accident'}
        </td>
      </tr>
    </table>

    <!-- Map button -->
    ${hasLocation ? `
    <div style="text-align:center;margin:28px 0">
      <a href="${mapLink}" style="display:inline-block;background:linear-gradient(135deg,#ff3333,#cc0000);color:#fff;padding:18px 40px;border-radius:50px;text-decoration:none;font-size:18px;font-weight:900;letter-spacing:1px;box-shadow:0 4px 20px rgba(255,0,0,0.4)">
        📍 OPEN LIVE LOCATION IN MAPS
      </a>
      <p style="margin:10px 0 0;font-size:12px;color:#555">Tap the button to see exact location on Google Maps</p>
    </div>` : `
    <div style="background:#1a1a00;border:1px solid #554400;border-radius:10px;padding:16px;text-align:center;margin-bottom:24px">
      <p style="margin:0;color:#ffcc44;font-size:14px">⚠️ GPS location was not available at time of accident.<br>Please contact ${userName} immediately.</p>
    </div>`}

    <!-- Grace period note -->
    <div style="background:#111;border-radius:10px;padding:16px;margin-top:20px">
      <p style="margin:0;font-size:13px;color:#666;text-align:center;line-height:1.7">
        This alert was sent automatically after a <strong style="color:#aaa">90-second grace period</strong>.<br>
        <strong style="color:#aaa">${userName}</strong> did not cancel — they may be unconscious or unable to respond.<br>
        Please check on them immediately.
      </p>
    </div>
  </div>

  <div style="background:#050505;padding:14px;text-align:center;border-top:1px solid #1a1a1a">
    <p style="margin:0;font-size:11px;color:#333">SADS – Smart Accident Detection System · Automated Emergency Alert</p>
  </div>
</div>
</body></html>`;
}

// ── GOVERNMENT EMERGENCY EMAIL ────────────────────────────────────────────
function govtEmailHtml(userName, userEmail, mapLink, timestamp) {
  const hasLocation = mapLink && mapLink !== 'https://maps.google.com';
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5">
<div style="max-width:620px;margin:32px auto;background:#fff;border-top:6px solid #cc0000;border-radius:4px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1)">

  <div style="background:#cc0000;padding:24px;text-align:center">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:900">🚑 EMERGENCY MEDICAL ALERT</h1>
    <p style="margin:6px 0 0;color:#ffcccc;font-size:13px">Automated Emergency Notification — SADS System</p>
  </div>

  <div style="padding:32px">
    <p style="font-size:16px;color:#333;line-height:1.6;margin-bottom:24px">
      An automated road accident alert has been triggered. Immediate medical response may be required.
    </p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr style="background:#f9f9f9">
        <td style="padding:12px 16px;font-weight:700;color:#555;border:1px solid #eee;width:140px">Person</td>
        <td style="padding:12px 16px;color:#333;border:1px solid #eee;font-weight:700;font-size:18px">${userName}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-weight:700;color:#555;border:1px solid #eee">Contact</td>
        <td style="padding:12px 16px;color:#333;border:1px solid #eee">${userEmail}</td>
      </tr>
      <tr style="background:#f9f9f9">
        <td style="padding:12px 16px;font-weight:700;color:#555;border:1px solid #eee">Date & Time</td>
        <td style="padding:12px 16px;color:#333;border:1px solid #eee">${timestamp}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-weight:700;color:#555;border:1px solid #eee">GPS Location</td>
        <td style="padding:12px 16px;border:1px solid #eee">
          ${hasLocation
            ? `<a href="${mapLink}" style="color:#cc0000;font-weight:700">View on Google Maps →</a>`
            : '<span style="color:#cc6600">⚠️ GPS unavailable</span>'}
        </td>
      </tr>
    </table>

    <div style="background:#fff3f3;border-left:4px solid #cc0000;padding:16px;margin:20px 0;border-radius:0 4px 4px 0">
      <strong style="color:#cc0000;font-size:15px">Immediate Response Required</strong>
      <p style="margin:8px 0 0;color:#555;font-size:14px;line-height:1.6">
        The accident victim (${userName}) may be unconscious or require urgent medical attention.
        Please dispatch emergency services to the location provided above.
      </p>
    </div>

    ${hasLocation ? `
    <a href="${mapLink}" style="display:block;background:#cc0000;color:#fff;padding:16px;text-align:center;text-decoration:none;font-weight:900;border-radius:6px;font-size:16px;margin-top:20px">
      📍 DISPATCH TO THIS LOCATION
    </a>` : ''}
  </div>

  <div style="background:#f5f5f5;padding:12px;text-align:center;border-top:1px solid #eee">
    <p style="margin:0;font-size:11px;color:#999">SADS — Smart Accident Detection System | Automated Government Alert</p>
  </div>
</div>
</body></html>`;
}

// ── DISCONNECT / RECONNECT EMAILS ─────────────────────────────────────────
function disconnectEmailHtml(userName, userEmail, mapLink, isReconnect = false) {
  const hasLocation = mapLink && mapLink !== 'https://maps.google.com';

  if (isReconnect) {
    return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#060610;color:#fff">
<div style="max-width:600px;margin:32px auto;background:#0a1a0e;border:2px solid #00aa55;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(90deg,#007733,#00aa55);padding:22px;text-align:center">
    <div style="font-size:48px;margin-bottom:6px">🟢</div>
    <h1 style="margin:0;font-size:22px;color:#fff;font-weight:900">Device Reconnected</h1>
  </div>
  <div style="padding:28px">
    <p style="font-size:16px;color:#aaffcc;line-height:1.7;text-align:center">
      Good news — <strong>${userName}</strong>'s device has reconnected<br>and is back online.
    </p>
    <div style="background:#0d1a10;border:1px solid #00aa5544;border-radius:10px;padding:16px;margin:20px 0;text-align:center">
      <p style="margin:0;font-size:14px;color:#66cc88">Monitoring has resumed. You will be notified if anything changes.</p>
    </div>
    ${hasLocation ? `
    <div style="text-align:center;margin-top:20px">
      <a href="${mapLink}" style="background:#00aa55;color:#fff;padding:13px 28px;border-radius:50px;text-decoration:none;font-weight:700;display:inline-block">
        📍 Current Location
      </a>
    </div>` : ''}
  </div>
  <div style="background:#050a07;padding:12px;text-align:center;border-top:1px solid #1a2a1a">
    <p style="margin:0;font-size:11px;color:#334433">SADS — Smart Accident Detection System</p>
  </div>
</div>
</body></html>`;
  }

  // Disconnect email
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#060610;color:#fff">
<div style="max-width:600px;margin:32px auto;background:#1a1000;border:2px solid #ff8800;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(90deg,#aa5500,#ff8800);padding:22px;text-align:center">
    <div style="font-size:48px;margin-bottom:6px">📴</div>
    <h1 style="margin:0;font-size:22px;color:#fff;font-weight:900">Connection Lost</h1>
  </div>
  <div style="padding:28px">
    <p style="font-size:16px;color:#ffddaa;line-height:1.7;text-align:center">
      <strong>${userName}</strong>'s device has stopped sending data for over 2 minutes<br>
      while accident monitoring was active.
    </p>
    <div style="background:#1a1200;border:1px solid #ff880044;border-radius:10px;padding:16px;margin:20px 0">
      <p style="margin:0;font-size:14px;color:#ffaa44;line-height:1.6">
        This could mean their phone battery died, they lost internet connection, or they may need assistance.
        Please try to contact <strong>${userName}</strong> immediately.
      </p>
    </div>
    ${hasLocation ? `
    <div style="text-align:center;margin-top:20px">
      <a href="${mapLink}" style="background:#ff8800;color:#fff;padding:14px 28px;border-radius:50px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
        📍 Last Known Location
      </a>
      <p style="margin:8px 0 0;font-size:12px;color:#664400">This was their GPS location when connection was last active</p>
    </div>` : `
    <div style="background:#1a1200;border:1px solid #554400;border-radius:10px;padding:14px;text-align:center;margin-top:16px">
      <p style="margin:0;color:#ffaa44;font-size:13px">⚠️ No GPS location available</p>
    </div>`}
  </div>
  <div style="background:#0a0800;padding:12px;text-align:center;border-top:1px solid #2a1a00">
    <p style="margin:0;font-size:11px;color:#443300">SADS — Smart Accident Detection System</p>
  </div>
</div>
</body></html>`;
}

module.exports = { sendEmail, crashEmailHtml, govtEmailHtml, disconnectEmailHtml, GOVT_EMAIL };
