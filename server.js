require('dotenv').config();
const express     = require('express');
const http        = require('http');
const mongoose    = require('mongoose');
const cors        = require('cors');
const bodyParser  = require('body-parser');
const rateLimit   = require('express-rate-limit');

const { initWebSocket } = require('./services/wsService');
const { startWatchdog } = require('./services/watchdog');

const authRoutes     = require('./routes/auth');
const contactRoutes  = require('./routes/contacts');
const sensorRoutes   = require('./routes/sensor');
const cancelRoutes   = require('./routes/cancel');
const logRoutes      = require('./routes/logs');

const app    = express();
const server = http.createServer(app);

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: ['*'],
  credentials: true,
}));
app.use(bodyParser.json());

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use(limiter);

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/auth',     authRoutes);
app.use('/contacts', contactRoutes);
app.use('/sensor',   sensorRoutes);
app.use('/cancel',   cancelRoutes);
app.use('/logs',     logRoutes);

app.get('/health', (req, res) => res.json({
  status: 'SADS Backend Active',
  time: new Date().toISOString(),
}));

// ── MongoDB ────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');

    // Start WebSocket
    initWebSocket(server);

    // Start watchdog
    startWatchdog();

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`🚀 SADS Backend on port ${PORT}`));
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
