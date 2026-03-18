const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

let wss = null;

// Map of userId → Set of WebSocket clients
const clients = new Map();

function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    let userId = null;

    // Authenticate via token in query string: /ws?token=xxx
    try {
      const url   = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.userId;
        if (!clients.has(userId)) clients.set(userId, new Set());
        clients.get(userId).add(ws);
        ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket authenticated' }));
        console.log(`🔌 WS connected: ${userId}`);
      }
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
    }

    ws.on('close', () => {
      if (userId && clients.has(userId)) {
        clients.get(userId).delete(ws);
        if (clients.get(userId).size === 0) clients.delete(userId);
        console.log(`🔌 WS disconnected: ${userId}`);
      }
    });

    ws.on('error', (err) => console.error('WS error:', err.message));
  });

  console.log('🔌 WebSocket server initialized');
}

// Send event to a specific user (all their devices)
function sendToUser(userId, payload) {
  const userClients = clients.get(String(userId));
  if (!userClients || userClients.size === 0) return;
  const msg = JSON.stringify(payload);
  userClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

// Broadcast to all connected clients (for dashboard)
function broadcast(payload) {
  if (!wss) return;
  const msg = JSON.stringify(payload);
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

function getConnectedCount() {
  return wss ? wss.clients.size : 0;
}

module.exports = { initWebSocket, sendToUser, broadcast, getConnectedCount };
