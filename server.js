/* White Top Up — zero-dependency Node.js server (Render target).
   Serves the static shop (public/) and routes /api/** to the same
   handler.js that the Firebase Cloud Function uses, backed by the
   file-based db (filedb.js, data/db.json) instead of Firestore.

   - Shop:      GET /                  -> public/index.html
   - Admin:     GET /admin.html        -> public/admin.html (DIRECT URL ONLY —
                the shop never links to it)
   - API:       /api/**                -> handler.js (the /api prefix is
                stripped exactly like the Firebase function does)
   - CORS:      /api/** answers allow any origin (Access-Control-Allow-Origin:
                *), including OPTIONS preflights — so the shop frontend can
                live on another domain (e.g. Firebase Hosting) while this
                API runs on Render.
   - Port:      process.env.PORT (Render sets it), default 3000. */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const createRouter = require('./handler');
const { createFileDb } = require('./filedb');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB — orders/settings are tiny

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const db = createFileDb();
const route = createRouter(db);

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function serveStatic(req, res, pathname) {
  // '/' -> index.html; everything else maps straight under public/.
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const decoded = decodeURIComponent(rel);
  const filePath = path.join(PUBLIC_DIR, decoded);
  // Block path traversal: the resolved file must stay inside public/.
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    // HTML is never cached (shop/admin must always be fresh); assets cache a day.
    headers['Cache-Control'] = ext === '.html'
      ? 'no-store'
      : 'public, max-age=86400';
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleApi(req, res, pathname, query) {
  setCorsHeaders(res);
  // Preflight: answer immediately, no handler call.
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Security headers on every API response (same as the Firebase function).
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Strip the /api prefix exactly like functions/index.js does.
  const apiPath = pathname.replace(/^\/api/, '') || '/';

  let body = {};
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    try {
      const raw = await readBody(req);
      if (raw.trim()) {
        try {
          body = JSON.parse(raw);
        } catch (e) {
          body = {}; // tolerate a non-JSON body, like the Firebase function
        }
      }
    } catch (e) {
      sendJson(res, 413, { error: 'body_too_large' });
      return;
    }
  }
  if (body == null || typeof body !== 'object') body = {};

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || (req.socket && req.socket.remoteAddress)
    || 'unknown';

  const result = await route({
    method: req.method,
    path: apiPath,
    query,
    body,
    headers: req.headers || {},
    ip,
  });
  sendJson(res, result.status, result.body);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;
    const query = Object.fromEntries(url.searchParams.entries());
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      handleApi(req, res, pathname, query).catch((e) => {
        console.error('API error:', e);
        try { sendJson(res, 500, { error: 'server_error' }); } catch (_) { /* socket gone */ }
      });
      return;
    }
    serveStatic(req, res, pathname);
  } catch (e) {
    console.error('Server error:', e);
    try { sendJson(res, 500, { error: 'server_error' }); } catch (_) { /* socket gone */ }
  }
});

server.listen(PORT, HOST, () => {
  console.log('White Top Up running on http://' + HOST + ':' + PORT);
});
