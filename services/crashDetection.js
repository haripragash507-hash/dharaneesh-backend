/**
 * SADS Crash Detection — Point Scoring System
 *
 * Demo thresholds (lower than production) so a hard shake triggers it.
 * For production, increase CRASH_THRESHOLD and gForce/rotation values.
 */

// ── TUNABLE CONSTANTS ──────────────────────────────────────────────────────
const CRASH_THRESHOLD  = 4;   // points needed to confirm crash (demo: 4, prod: 7)
const SPIKE_WINDOW_MS  = 2000; // time window to detect multiple spikes
const MAX_HISTORY      = 20;   // frames to keep in rolling buffer

// Per-user rolling history: { userId: [{ gForce, rotation, score, time }] }
const userHistory = new Map();

/**
 * Analyse a sensor frame and return a crash score.
 * @param {string} userId
 * @param {{ ax,ay,az,gx,gy,gz }} sensor
 * @returns {{ gForce, rotation, score, isCrash }}
 */
function analyseSensor(userId, sensor) {
  const { ax = 0, ay = 0, az = 0, gx = 0, gy = 0, gz = 0 } = sensor;

  const gForce   = Math.sqrt(ax * ax + ay * ay + az * az) / 9.81;
  const rotation = Math.sqrt(gx * gx + gy * gy + gz * gz);
  const now      = Date.now();

  // ── Scoring ───────────────────────────────────────────────────────────────
  let score = 0;

  // G-force scoring (DEMO: lower thresholds so hard shake triggers)
  if (gForce > 3.5)      score += 3;   // severe impact  (prod: 4.0)
  else if (gForce > 2.5) score += 2;   // moderate impact (prod: 3.0)
  else if (gForce > 1.8) score += 1;   // mild impact     (prod: 2.5)

  // Rotation scoring
  if (rotation > 3.0)      score += 2; // fast spin (prod: 4.0)
  else if (rotation > 2.0) score += 1; // slow spin  (prod: 3.0)

  // Rolling history for this user
  if (!userHistory.has(userId)) userHistory.set(userId, []);
  const history = userHistory.get(userId);

  // Sudden spike: compare with previous frame
  if (history.length > 0) {
    const prev     = history[history.length - 1];
    const delta    = Math.abs(gForce - prev.gForce);
    if (delta > 1.5) score += 2;  // sudden change (prod: 2.0)
  }

  // Multiple spikes within window → extra points
  const recentSpikes = history.filter(
    f => f.score >= 2 && now - f.time < SPIKE_WINDOW_MS
  );
  if (recentSpikes.length >= 2) score += 2;

  // Maintain rolling buffer
  history.push({ gForce, rotation, score, time: now });
  if (history.length > MAX_HISTORY) history.shift();

  const isCrash = score >= CRASH_THRESHOLD;

  return {
    gForce:   parseFloat(gForce.toFixed(3)),
    rotation: parseFloat(rotation.toFixed(3)),
    score,
    isCrash,
  };
}

function clearHistory(userId) {
  userHistory.delete(userId);
}

module.exports = { analyseSensor, clearHistory };
