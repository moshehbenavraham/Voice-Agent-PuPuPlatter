/**
 * 60db TTS WebSocket relay
 *
 * 60db's streaming TTS uses a WebSocket authenticated with a static API key in
 * the query string (wss://api.60db.ai/ws/tts?apiKey=...). To keep SIXTYDB_API_KEY
 * out of the browser, this relay sits in the middle:
 *
 *   browser  <->  /api/60db/tts (this relay)  <->  wss://api.60db.ai/ws/tts?apiKey=...
 *
 * The browser speaks the native 60db protocol (create_context / send_text /
 * flush_context / close_context); the relay transparently pipes frames in both
 * directions and only injects the API key on the upstream connection.
 */

import { WebSocketServer, WebSocket } from 'ws';

const RELAY_PATH = '/api/60db/tts';
const UPSTREAM_BASE = process.env.SIXTYDB_WS_URL || 'wss://api.60db.ai/ws/tts';

/**
 * Decide whether a browser Origin is allowed to open the relay socket.
 * Mirrors the lenient posture used for local development while still honoring
 * the configured CORS allowlist in production.
 */
function isOriginAllowed(origin, { allowedOrigins, isProduction }) {
  if (!origin) {
    // Non-browser clients (e.g. native tooling) do not send Origin.
    return !isProduction;
  }
  if (!isProduction) {
    return true;
  }
  return Array.isArray(allowedOrigins) && allowedOrigins.includes(origin);
}

/**
 * Attach the 60db TTS relay to an existing HTTP server.
 *
 * @param {import('http').Server} server - The Node HTTP server returned by app.listen()
 * @param {{ allowedOrigins?: string[], isProduction?: boolean }} options
 */
export function attachSixtyDbTtsRelay(server, options = {}) {
  const { allowedOrigins = [], isProduction = false } = options;
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }

    // Only handle our relay path. Leave other paths untouched so additional
    // upgrade handlers (if any are added later) can run.
    if (pathname !== RELAY_PATH) {
      return;
    }

    const origin = req.headers.origin;
    if (!isOriginAllowed(origin, { allowedOrigins, isProduction })) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    if (!process.env.SIXTYDB_API_KEY) {
      console.error('[Server] 60db TTS relay rejected: SIXTYDB_API_KEY not configured');
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (client) => {
      wss.emit('connection', client, req);
    });
  });

  wss.on('connection', (client) => {
    const upstreamUrl = `${UPSTREAM_BASE}?apiKey=${encodeURIComponent(process.env.SIXTYDB_API_KEY)}`;
    const upstream = new WebSocket(upstreamUrl);

    // Buffer client frames that arrive before the upstream socket is open.
    const pending = [];
    let upstreamOpen = false;

    const closeBoth = (code, reason) => {
      const safeCode = code >= 1000 && code <= 4999 ? code : 1011;
      try {
        if (client.readyState === WebSocket.OPEN) client.close(safeCode, reason);
      } catch {
        /* ignore */
      }
      try {
        if (upstream.readyState === WebSocket.OPEN) upstream.close(safeCode, reason);
      } catch {
        /* ignore */
      }
    };

    upstream.on('open', () => {
      upstreamOpen = true;
      for (const frame of pending) {
        upstream.send(frame);
      }
      pending.length = 0;
    });

    // Pipe: browser -> 60db
    client.on('message', (data, isBinary) => {
      const frame = isBinary ? data : data.toString();
      if (upstreamOpen) {
        upstream.send(frame);
      } else {
        pending.push(frame);
      }
    });

    // Pipe: 60db -> browser
    upstream.on('message', (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(isBinary ? data : data.toString());
      }
    });

    upstream.on('close', (code, reason) => closeBoth(code, reason?.toString()));
    client.on('close', (code, reason) => closeBoth(code, reason?.toString()));

    upstream.on('error', (error) => {
      console.error('[Server] 60db TTS upstream error:', error.message);
      closeBoth(1011, 'upstream error');
    });
    client.on('error', () => closeBoth(1011, 'client error'));
  });

  console.log(`[Server] 60db TTS relay listening on ${RELAY_PATH}`);
  return wss;
}

export default attachSixtyDbTtsRelay;
