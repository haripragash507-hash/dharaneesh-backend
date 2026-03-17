const BREVO_API_KEY  = process.env.BREVO_API_KEY;
const SENDER_EMAIL   = process.env.SENDER_EMAIL   || 'noreply@sads.app';
const SENDER_NAME    = process.env.SENDER_NAME    || 'SADS Emergency System';
const GOVT_EMAIL     = process.env.GOVT_EMERGENCY_EMAIL || 'emergency@example.gov.in';

const emailCooldowns = {}; // { email: lastSentTimestamp }
const COOLDOWN_MS    = 60_000; // 1 min between emails to same address

async function sendEmail(to, subject, html) {
  const now = Date.now();
  if (emailCooldowns[to] && now - emailCooldowns[to] < COOLDOWN_MS) {
    console.log(`⏳ Email cooldown active for ${to}`);
    return false;
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    if (res.ok) {
      emailCooldowns[to] = now;
      console.log(`✅ Email sent → ${to}: ${subject}`);
      return true;
    }
    const err = await res.text();
    console.error(`❌ Brevo error for ${to}:`, err);
  } catch (e) {
    console.error('❌ Email failed:', e.message);
  }
  return false;
}

// ── Templates ──────────────────────────────────────────────────────────────

function crashEmailHtml(userName, userEmail, mapLink, timestamp) {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background:#060610;color:#fff">
  <div style="max-width:620px;margin:0 auto;background:linear-gradient(160deg,#140000,#0a0a1a);border:1px solid #ff3333;border-radius:16px;overflow:hidden">
    <div style="background:linear-gradient(90deg,#cc0000,#ff0000);padding:28px;text-align:center">
      <div style="font-size:52px;margin-bottom:8px">🚨</div>
      <h1 style="margin:0;font-size:28px;letter-spacing:3px;font-weight:900">ACCIDENT DETECTED</h1>
      <p style="margin:8px 0 0;font-size:14px;opacity:0.85">Smart Accident Detection System</p>
    </div>
    <div style="padding:36px">
      <div style="background:rgba(255,0,0,0.12);border:1px solid #ff333344;border-radius:10px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-size:16px;color:#ffaaaa">A serious accident has been detected for:</p>
        <p style="margin:0;font-size:24px;font-weight:900;color:#ff6666">
          ${userName}
        </p>
        <p style="margin:4px 0 0;font-size:14px;color:#aaa">${userEmail}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="padding:10px;background:#111;border-radius:8px 0 0 8px;color:#888;font-size:13px;width:120px">⏰ Time</td>
          <td style="padding:10px;background:#111;color:#fff;font-size:13px">${timestamp}</td>
        </tr>
        <tr><td colspan="2" style="height:4px"></td></tr>
        <tr>
          <td style="padding:10px;background:#111;border-radius:8px 0 0 8px;color:#888;font-size:13px">📍 Location</td>
          <td style="padding:10px;background:#111;color:#fff;font-size:13px">${mapLink !== 'https://maps.google.com' ? 'GPS coordinates available' : 'Location unavailable'}</td>
        </tr>
      </table>

      <div style="text-align:center;margin:28px 0">
        <a href="${mapLink}"
           style="display:inline-block;background:linear-gradient(135deg,#ff3333,#cc0000);color:#fff;padding:18px 40px;border-radius:50px;text-decoration:none;font-size:18px;font-weight:900;letter-spacing:1px">
          📍 TRACK LIVE LOCATION
        </a>
      </div>

      <div style="background:#111;border-radius:10px;padding:16px;margin-top:24px">
        <p style="margin:0;font-size:13px;color:#666;text-align:center">
          This alert was automatically triggered by SADS after a 90-second grace period.<br>
          If this was a false alarm, please check on <strong style="color:#aaa">${userName}</strong>.
        </p>
      </div>
    </div>
    <div style="background:#0a0a0a;padding:16px;text-align:center;border-top:1px solid #1a1a1a">
      <p style="margin:0;font-size:12px;color:#444">SADS – Smart Accident Detection System · Automated Alert</p>
    </div>
  </div>
</body>
</html>`;
}

function govtEmailHtml(userName, userEmail, mapLink, timestamp) {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background:#f5f5f5">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-top:6px solid #cc0000;border-radius:4px;overflow:hidden">
    <div style="background:#cc0000;padding:24px;text-align:center">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:900">🚑 EMERGENCY MEDICAL ALERT</h1>
      <p style="margin:6px 0 0;color:#ffcccc;font-size:13px">Automated Emergency Notification – SADS System</p>
    </div>
    <div style="padding:32px">
      <p style="font-size:16px;color:#333;line-height:1.6">
        This is an automated emergency notification. A road accident has been detected for the following individual:
      </p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <tr style="background:#f9f9f9">
          <td style="padding:12px 16px;font-weight:700;color:#555;border:1px solid #eee;width:140px">Person</td>
          <td style="padding:12px 16px;color:#333;border:1px solid #eee;font-weight:700;font-size:16px">${userName}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-weight:700;color:#555;border:1px solid #eee">Contact Email</td>
          <td style="padding:12px 16px;color:#333;border:1px solid #eee">${userEmail}</td>
        </tr>
        <tr style="background:#f9f9f9">
          <td style="padding:12px 16px;font-weight:700;color:#555;border:1px solid #eee">Date & Time</td>
          <td style="padding:12px 16px;color:#333;border:1px solid #eee">${timestamp}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-weight:700;color:#555;border:1px solid #eee">Location</td>
          <td style="padding:12px 16px;color:#333;border:1px solid #eee">
            <a href="${mapLink}" style="color:#cc0000;font-weight:700">View on Google Maps</a>
          </td>
        </tr>
      </table>
      <div style="background:#fff3f3;border-left:4px solid #cc0000;padding:16px;margin:20px 0;border-radius:4px">
        <strong style="color:#cc0000">Immediate Response Required</strong>
        <p style="margin:8px 0 0;color:#555;font-size:14px">
          Please dispatch emergency medical services to the location provided above.
          The accident victim may be unresponsive or in need of urgent medical attention.
        </p>
      </div>
      <a href="${mapLink}"
         style="display:block;background:#cc0000;color:#fff;padding:16px;text-align:center;text-decoration:none;font-weight:900;border-radius:6px;font-size:16px;margin-top:20px">
        📍 OPEN LOCATION IN MAPS
      </a>
    </div>
    <div style="background:#f5f5f5;padding:12px;text-align:center;border-top:1px solid #eee">
      <p style="margin:0;font-size:11px;color:#999">SADS – Smart Accident Detection System | Automated Government Alert</p>
    </div>
  </div>
</body>
</html>`;
}

function disconnectEmailHtml(userName, userEmail, mapLink, isReconnect = false) {
  const color = isReconnect ? '#00aa55' : '#ff8800';
  const icon  = isReconnect ? '🟢' : '⚠️';
  const title = isReconnect ? 'Device Reconnected' : 'Connection Lost';
  const msg   = isReconnect
    ? `Good news — <strong>${userName}</strong>'s device has reconnected and is back online.`
    : `<strong>${userName}</strong>'s device has stopped sending data for over 2 minutes. This may indicate a serious situation.`;

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background:#060610;color:#fff">
  <div style="max-width:600px;margin:0 auto;background:#0f0f1a;border:1px solid ${color};border-radius:12px;overflow:hidden">
    <div style="background:${color};padding:22px;text-align:center">
      <h1 style="margin:0;font-size:22px">${icon} ${title}</h1>
    </div>
    <div style="padding:28px">
      <p style="font-size:15px;color:#ccc;line-height:1.7">${msg}</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${mapLink}" style="background:${color};color:#000;padding:14px 28px;border-radius:50px;text-decoration:none;font-weight:900;display:inline-block">
          📍 Last Known Location
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  sendEmail,
  crashEmailHtml,
  govtEmailHtml,
  disconnectEmailHtml,
  GOVT_EMAIL,
};
