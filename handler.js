/* White Top Up — API logic for the Firebase Cloud Function.
   This module knows nothing about Firebase itself: it talks to a small `db`
   interface (implemented by firestore.js, mocked by the smoke test), and the
   router takes a plain request object and returns { status, body }.
   Port of the original zero-dependency server.js, plus:
   - bKash + Nagad ONLY (no Rocket/Upay anywhere)
   - Deshi Offer purchase limits enforced server-side on order creation
   - package save is a PARTIAL update (missing fields keep their old values,
     so saving a price can never reset a package's category/note/limit)
   - orders are keyed by their WTU-XXXXXX code (the Firestore document id) */

'use strict';

const crypto = require('node:crypto');
const { CATEGORY_ORDER, PACKAGES, DEFAULT_SETTINGS } = require('./catalog');

const PAY_METHODS = ['bkash', 'nagad'];
const PAY_FALLBACK = '01xxxxxxxx';
const ORDER_STATUSES = ['pending', 'confirmed', 'delivered', 'rejected'];
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/* ---------------- helpers ---------------- */

// Convert Bangla (০–৯), Arabic-Indic (٠–٩) and Eastern Arabic (۰–۹) digits to 0–9.
function toEnglishDigits(s) {
  return String(s || '').replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function normalizeUid(raw) {
  return toEnglishDigits(raw).replace(/\D/g, '');
}

function sortPackages(list) {
  const rank = (c) => {
    const i = CATEGORY_ORDER.indexOf(c);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  return list.slice().sort((a, b) => (rank(a.category) - rank(b.category)) || (a.sort - b.sort) || (a.id - b.id));
}

/* Passwords and recovery codes are hashed with scrypt (random per-secret
   salt), never plain SHA-256. Hashes are compared in constant time. */
function hashSecret(secret, salt) {
  return crypto.scryptSync(secret, salt, 64).toString('hex');
}

function verifySecret(secret, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  try {
    const actual = crypto.scryptSync(String(secret), salt, 64);
    const expected = Buffer.from(String(expectedHash), 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (e) {
    return false;
  }
}

function validUsername(u) {
  return /^[A-Za-z0-9_-]{4,20}$/.test(u);
}

// Returns an error code string, or null when the password is acceptable.
function passwordError(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'password_too_short';
  if (pw.length > 128) return 'password_too_long';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'password_weak';
  return null;
}

// Recovery code: 16 random hex chars, shown as XXXX-XXXX-XXXX-XXXX.
function newRecoveryCode() {
  const hex = crypto.randomBytes(8).toString('hex').toUpperCase();
  return hex.slice(0, 4) + '-' + hex.slice(4, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16);
}

function normalizeRecoveryCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// An admin record counts as "set up" only when it has a username + password
// hash. An old PIN-only record (no username) is treated as NOT set up, and
// a fresh setup overwrites it completely.
function isSetup(admin) {
  return Boolean(admin && admin.username && admin.passwordHash && admin.passwordSalt);
}

function isLocked(admin) {
  return Boolean(admin && admin.lockedUntil && admin.lockedUntil > Date.now());
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function randomCode() {
  let code = 'WTU-';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

function ok(body) { return { status: 200, body }; }
function err(status, error, extra) { return { status, body: Object.assign({ error }, extra || {}) }; }

function publicOrder(o) {
  return {
    code: o.code,
    packageName: o.packageName,
    diamonds: o.diamonds,
    price: o.price,
    paymentMethod: o.paymentMethod,
    status: o.status,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function publicSettings(stored) {
  const s = Object.assign({}, DEFAULT_SETTINGS, stored || {});
  return {
    notice: s.notice || '',
    deliveryNote: s.deliveryNote || '',
    payBkash: s.payBkash || PAY_FALLBACK,
    payNagad: s.payNagad || PAY_FALLBACK,
    whatsapp: s.whatsapp || '',
    telegram: s.telegram || '',
    facebook: s.facebook || '',
    uidCheckEnabled: false, // Check UID stays OFF in the shop (dormant for now)
  };
}

/* ---------------- router factory ---------------- */

module.exports = function createRouter(db) {
  // Simple in-memory login throttle: max 10 failed attempts per IP per 5 min.
  // (Per function instance — good enough for a single-owner admin panel.)
  // Also guards password recovery against guessing the recovery code.
  const loginAttempts = new Map();
  function loginBlocked(ip) {
    const rec = loginAttempts.get(ip);
    if (!rec) return false;
    if (Date.now() > rec.resetAt) { loginAttempts.delete(ip); return false; }
    return rec.count >= 10;
  }
  function loginFailed(ip) {
    const now = Date.now();
    const rec = loginAttempts.get(ip);
    if (!rec || now > rec.resetAt) loginAttempts.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 });
    else rec.count += 1;
  }
  function loginOk(ip) { loginAttempts.delete(ip); }

  function authToken(headers) {
    const h = (headers && (headers.authorization || headers.Authorization)) || '';
    const m = /^Bearer\s+(.+)$/.exec(h);
    return m ? m[1] : null;
  }

  async function requireAuth(headers) {
    const token = authToken(headers);
    if (!token) return false;
    const sess = await db.getSession(token);
    if (!sess || sess.createdAt + SESSION_TTL_MS < Date.now()) {
      if (sess) await db.deleteSession(token).catch(() => {});
      return false;
    }
    return true;
  }

  async function ensureSeeded() {
    const pkgs = await db.getPackages();
    if (pkgs.length === 0) {
      await db.seedIfEmpty(PACKAGES, DEFAULT_SETTINGS);
      return db.getPackages();
    }
    return pkgs;
  }

  async function genOrderCode() {
    for (let i = 0; i < 10; i++) {
      const code = randomCode();
      if (!(await db.getOrderByCode(code))) return code;
    }
    return randomCode() + crypto.randomInt(10, 99);
  }

  /* ---- public ---- */

  async function handleStorefront() {
    const packages = sortPackages(await ensureSeeded()).filter((p) => p.active);
    const settings = await db.getSettings();
    return ok({ packages, settings: publicSettings(settings) });
  }

  async function handleCreateOrder(body) {
    body = body || {};
    const packageId = Number(body.packageId);
    const pkg = await db.getPackage(packageId);
    if (!pkg || !pkg.active) return err(400, 'invalid_package');
    const playerUid = normalizeUid(body.playerUid);
    if (!/^\d{5,15}$/.test(playerUid)) return err(400, 'invalid_uid');
    const paymentMethod = String(body.paymentMethod || '').toLowerCase();
    if (!PAY_METHODS.includes(paymentMethod)) return err(400, 'invalid_payment_method');
    const trxId = String(body.trxId || '').trim();
    if (!/^[A-Za-z0-9]{6,30}$/.test(trxId)) return err(400, 'invalid_trxid');

    // Deshi Offer limits: per UID, per exact package, inside the window.
    // Rejected orders don't count; hitting one deal's limit never blocks others.
    if (pkg.limit && pkg.limit.max && pkg.limit.windowDays) {
      const cutoff = Date.now() - pkg.limit.windowDays * 24 * 3600 * 1000;
      const prior = await db.getOrdersByUid(playerUid);
      const count = prior.filter((o) =>
        o.packageId === pkg.id &&
        o.status !== 'rejected' &&
        (o.createdAtMillis || 0) >= cutoff).length;
      if (count >= pkg.limit.max) {
        return err(429, 'deshi_limit', {
          message: 'এই দেশি অফারটা ' + pkg.limit.windowDays + ' দিনে ' + pkg.limit.max +
            ' বার নেওয়া যায় — তোমার লিমিট শেষ।',
        });
      }
    }

    const now = Date.now();
    const order = {
      code: await genOrderCode(),
      packageId: pkg.id,
      packageName: pkg.name,
      diamonds: pkg.diamonds,
      price: pkg.price,
      playerUid,
      paymentMethod,
      trxId,
      status: 'pending',
      note: '',
      createdAt: new Date(now).toISOString(),
      createdAtMillis: now,
      updatedAt: new Date(now).toISOString(),
    };
    await db.createOrder(order);
    return ok({ ok: true, code: order.code, order: publicOrder(order) });
  }

  async function handleTrackOrder(code) {
    const o = await db.getOrderByCode(String(code).toUpperCase());
    if (!o) return err(404, 'order_not_found');
    return ok({ order: publicOrder(o) });
  }

  /* ---- admin: auth ---- */

  async function handleAuthStatus() {
    const admin = await db.getAdmin();
    const setup = isSetup(admin);
    const locked = setup && isLocked(admin);
    return ok({
      setup,
      locked,
      lockedUntil: locked ? admin.lockedUntil : null,
    });
  }

  async function handleSetup(body) {
    const admin = await db.getAdmin();
    if (isSetup(admin)) return err(403, 'already_set_up');
    body = body || {};
    const username = String(body.username || '').trim();
    if (!validUsername(username)) return err(400, 'invalid_username');
    const pwErr = passwordError(body.password);
    if (pwErr) return err(400, pwErr);
    const passwordSalt = crypto.randomBytes(16).toString('hex');
    const recoveryCode = newRecoveryCode();
    const recoverySalt = crypto.randomBytes(16).toString('hex');
    await db.saveAdmin({
      username,
      passwordHash: hashSecret(body.password, passwordSalt),
      passwordSalt,
      recoveryHash: hashSecret(normalizeRecoveryCode(recoveryCode), recoverySalt),
      recoverySalt,
      failedAttempts: 0,
      lockedUntil: 0,
    });
    const token = newToken();
    await db.createSession(token, Date.now());
    // The recovery code is returned ONLY here — never again.
    return ok({ ok: true, token, recoveryCode });
  }

  async function handleLogin(body, ip) {
    const admin = await db.getAdmin();
    if (!isSetup(admin)) return err(403, 'not_set_up');
    if (isLocked(admin)) {
      return err(423, 'account_locked', { lockedUntil: admin.lockedUntil });
    }
    if (loginBlocked(ip)) return err(429, 'too_many_attempts');
    body = body || {};
    const username = String(body.username || '').trim();
    const password = body.password;
    // Same error for a wrong username or a wrong password — never leak which.
    if (username !== admin.username || !verifySecret(password, admin.passwordSalt, admin.passwordHash)) {
      loginFailed(ip);
      const failedAttempts = (admin.failedAttempts || 0) + 1;
      const patch = { failedAttempts };
      if (failedAttempts >= MAX_FAILED_ATTEMPTS) patch.lockedUntil = Date.now() + LOCKOUT_MS;
      await db.saveAdmin(Object.assign({}, admin, patch));
      if (patch.lockedUntil) return err(423, 'account_locked', { lockedUntil: patch.lockedUntil });
      return err(401, 'wrong_credentials', { attemptsLeft: MAX_FAILED_ATTEMPTS - failedAttempts });
    }
    loginOk(ip);
    await db.saveAdmin(Object.assign({}, admin, { failedAttempts: 0, lockedUntil: 0 }));
    const token = newToken();
    await db.createSession(token, Date.now());
    return ok({ ok: true, token });
  }

  async function handleRecover(body, ip) {
    const admin = await db.getAdmin();
    if (!isSetup(admin)) return err(403, 'not_set_up');
    if (loginBlocked(ip)) return err(429, 'too_many_attempts');
    body = body || {};
    const code = normalizeRecoveryCode(body.code);
    if (code.length !== 16 || !verifySecret(code, admin.recoverySalt, admin.recoveryHash)) {
      loginFailed(ip);
      return err(401, 'wrong_recovery_code');
    }
    const pwErr = passwordError(body.password);
    if (pwErr) return err(400, pwErr);
    const passwordSalt = crypto.randomBytes(16).toString('hex');
    await db.saveAdmin(Object.assign({}, admin, {
      passwordHash: hashSecret(body.password, passwordSalt),
      passwordSalt,
      failedAttempts: 0,
      lockedUntil: 0,
    }));
    // The recovery code stays the same; all sessions are cleared so the
    // owner must log in again with the new password.
    if (typeof db.deleteAllSessions === 'function') {
      await db.deleteAllSessions().catch(() => {});
    }
    return ok({ ok: true });
  }

  async function handleChangePassword(body) {
    const admin = await db.getAdmin();
    if (!isSetup(admin)) return err(403, 'not_set_up');
    body = body || {};
    if (!verifySecret(body.currentPassword, admin.passwordSalt, admin.passwordHash)) {
      return err(401, 'wrong_password');
    }
    const pwErr = passwordError(body.password);
    if (pwErr) return err(400, pwErr);
    const passwordSalt = crypto.randomBytes(16).toString('hex');
    await db.saveAdmin(Object.assign({}, admin, {
      passwordHash: hashSecret(body.password, passwordSalt),
      passwordSalt,
    }));
    return ok({ ok: true });
  }

  async function handleLogout(headers) {
    const token = authToken(headers);
    if (token) await db.deleteSession(token).catch(() => {});
    return ok({ ok: true });
  }

  /* ---- admin: orders ---- */

  async function handleAdminOrders(query) {
    const q = String((query && query.q) || '').trim().toLowerCase();
    const status = (query && query.status) || '';
    let list = (await db.listOrders())
      .slice()
      .sort((a, b) => ((b.createdAtMillis || 0) - (a.createdAtMillis || 0)));
    if (status && ORDER_STATUSES.includes(status)) list = list.filter((o) => o.status === status);
    if (q) {
      list = list.filter((o) =>
        String(o.code).toLowerCase().includes(q) ||
        String(o.playerUid).includes(q) ||
        String(o.trxId).toLowerCase().includes(q) ||
        String(o.packageName).toLowerCase().includes(q));
    }
    const all = await db.listOrders();
    const counts = { pending: 0, confirmed: 0, delivered: 0, rejected: 0, total: all.length };
    let deliveredRevenue = 0;
    for (const o of all) {
      if (counts[o.status] !== undefined) counts[o.status] += 1;
      if (o.status === 'delivered') deliveredRevenue += Number(o.price) || 0;
    }
    return ok({ orders: list, counts, deliveredRevenue });
  }

  async function handleOrderStatus(code, body) {
    body = body || {};
    const order = await db.getOrderByCode(String(code).toUpperCase());
    if (!order) return err(404, 'order_not_found');
    const status = String(body.status || '');
    if (!ORDER_STATUSES.includes(status)) return err(400, 'invalid_status');
    const patch = { status, updatedAt: new Date().toISOString() };
    if (typeof body.note === 'string') patch.note = body.note.slice(0, 300);
    const updated = await db.updateOrder(order.code, patch);
    return ok({ ok: true, order: updated });
  }

  /* ---- admin: packages ---- */

  async function handleAdminPackages() {
    const list = sortPackages(await ensureSeeded());
    return ok({ packages: list });
  }

  async function handleSavePackage(body) {
    body = body || {};
    const has = (k) => body[k] !== undefined && body[k] !== null;
    let pkg = null;
    if (has('id')) {
      pkg = await db.getPackage(Number(body.id));
      if (!pkg) return err(404, 'package_not_found');
    }
    const patch = {};
    if (has('name')) {
      const name = String(body.name).trim();
      if (!name) return err(400, 'invalid_package');
      patch.name = name.slice(0, 100);
    }
    if (has('price')) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0) return err(400, 'invalid_package');
      patch.price = price;
    }
    if (has('category')) patch.category = String(body.category).slice(0, 30);
    if (has('diamonds')) {
      const d = body.diamonds === '' ? null : Number(body.diamonds);
      patch.diamonds = Number.isFinite(d) ? d : null;
    }
    if (has('oldPrice')) {
      const d = body.oldPrice === '' ? null : Number(body.oldPrice);
      patch.oldPrice = Number.isFinite(d) ? d : null;
    }
    if (has('badge')) patch.badge = String(body.badge).slice(0, 30) || null;
    if (has('note')) patch.note = String(body.note).slice(0, 200) || null;
    if (has('active')) patch.active = body.active !== false;
    if (has('sort')) patch.sort = Number(body.sort) || 0;
    if (has('limit')) {
      const l = body.limit;
      patch.limit = (l && Number(l.max) > 0 && Number(l.windowDays) > 0)
        ? { max: Number(l.max), windowDays: Number(l.windowDays) }
        : null;
    }
    if (pkg) {
      Object.assign(pkg, patch);
    } else {
      if (!patch.name || patch.price === undefined) return err(400, 'invalid_package');
      const all = await db.getPackages();
      const nextId = all.length ? Math.max(...all.map((p) => p.id)) + 1 : 1;
      pkg = Object.assign({
        id: nextId, category: 'diamond', diamonds: null, oldPrice: null,
        badge: null, note: null, active: true, sort: 0, limit: null,
      }, patch);
    }
    await db.savePackage(pkg);
    return ok({ ok: true, package: pkg });
  }

  /* ---- admin: settings ---- */

  async function handleAdminSettings() {
    const s = Object.assign({}, DEFAULT_SETTINGS, await db.getSettings());
    return ok({
      settings: {
        notice: s.notice || '',
        deliveryNote: s.deliveryNote || '',
        payBkash: s.payBkash || '',
        payNagad: s.payNagad || '',
        whatsapp: s.whatsapp || '',
        telegram: s.telegram || '',
        facebook: s.facebook || '',
        uidCheckEnabled: Boolean(s.uidCheckEnabled),
      },
      hasLeakApiKey: Boolean(s.leakApiKey),
    });
  }

  async function handleSaveSettings(body) {
    body = body || {};
    const str = (v, n) => String(v === undefined || v === null ? '' : v).slice(0, n);
    const patch = {};
    if (body.notice !== undefined) patch.notice = str(body.notice, 200);
    if (body.deliveryNote !== undefined) patch.deliveryNote = str(body.deliveryNote, 200);
    if (body.payBkash !== undefined) patch.payBkash = str(body.payBkash, 20);
    if (body.payNagad !== undefined) patch.payNagad = str(body.payNagad, 20);
    if (body.whatsapp !== undefined) patch.whatsapp = str(body.whatsapp, 300);
    if (body.telegram !== undefined) patch.telegram = str(body.telegram, 300);
    if (body.facebook !== undefined) patch.facebook = str(body.facebook, 300);
    if (body.clearLeakApiKey === true) patch.leakApiKey = '';
    else if (typeof body.leakApiKey === 'string' && body.leakApiKey.trim()) {
      patch.leakApiKey = body.leakApiKey.trim().slice(0, 200);
    }
    // Check UID stays OFF in the shop for now; the flag is stored but never
    // enables shop UI until the owner re-enables it deliberately.
    if (typeof body.uidCheckEnabled === 'boolean') patch.uidCheckEnabled = body.uidCheckEnabled;
    await db.saveSettings(patch);
    const s = await db.getSettings();
    return ok({ ok: true, hasLeakApiKey: Boolean(s.leakApiKey) });
  }

  // Dormant UID lookup (Leak Studio /region). Disabled unless the owner turns
  // uidCheckEnabled on AND a key is saved. No shop UI calls this for now.
  // NOTE: on Firebase's free Spark plan, functions cannot call external APIs,
  // so this lookup needs the Blaze plan — see README.
  async function handleCheckUid(body) {
    const s = Object.assign({}, DEFAULT_SETTINGS, await db.getSettings());
    if (!s.uidCheckEnabled || !s.leakApiKey) {
      return err(403, 'uid_check_disabled');
    }
    const uid = normalizeUid((body || {}).uid);
    if (!/^\d{5,15}$/.test(uid)) return err(400, 'invalid_uid');
    try {
      const url = 'https://api.leakstudiobd.com/region?uid=' + encodeURIComponent(uid)
        + '&key=' + encodeURIComponent(s.leakApiKey);
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error || data.status === 'error') {
        return err(502, 'lookup_failed', { detail: String(data.message || data.error || r.status).slice(0, 200) });
      }
      return ok({
        uid,
        nickname: data.player_name || data.nickname || null,
        region: data.region || null,
        level: data.level ?? null,
        likes: data.likes ?? null,
      });
    } catch (e) {
      return err(502, 'lookup_failed');
    }
  }

  /* ---- router ---- */

  return async function route(req) {
    const method = req.method;
    const path = req.path || '/';
    const query = req.query || {};
    const body = req.body || {};
    const headers = req.headers || {};
    const ip = req.ip || 'unknown';

    try {
      if (path === '/storefront' && method === 'GET') return handleStorefront();
      if (path === '/orders' && method === 'POST') return handleCreateOrder(body);
      let m = /^\/orders\/([A-Za-z0-9-]+)$/.exec(path);
      if (m && method === 'GET') return handleTrackOrder(m[1]);

      if (path === '/admin/auth-status' && method === 'GET') return handleAuthStatus();
      if (path === '/admin/setup' && method === 'POST') return handleSetup(body);
      if (path === '/admin/login' && method === 'POST') return handleLogin(body, ip);
      if (path === '/admin/recover' && method === 'POST') return handleRecover(body, ip);

      // Everything below needs a valid admin session.
      const authed = async () => {
        if (!(await requireAuth(headers))) return err(401, 'unauthorized');
        return null;
      };

      if (path === '/admin/logout' && method === 'POST') {
        const denied = await authed(); if (denied) return denied;
        return handleLogout(headers);
      }
      if (path === '/admin/change-password' && method === 'POST') {
        const denied = await authed(); if (denied) return denied;
        return handleChangePassword(body);
      }
      if (path === '/admin/orders' && method === 'GET') {
        const denied = await authed(); if (denied) return denied;
        return handleAdminOrders(query);
      }
      m = /^\/admin\/orders\/([A-Za-z0-9-]+)\/status$/.exec(path);
      if (m && method === 'POST') {
        const denied = await authed(); if (denied) return denied;
        return handleOrderStatus(m[1], body);
      }
      if (path === '/admin/packages' && method === 'GET') {
        const denied = await authed(); if (denied) return denied;
        return handleAdminPackages();
      }
      if (path === '/admin/packages' && method === 'POST') {
        const denied = await authed(); if (denied) return denied;
        return handleSavePackage(body);
      }
      if (path === '/admin/settings' && method === 'GET') {
        const denied = await authed(); if (denied) return denied;
        return handleAdminSettings();
      }
      if (path === '/admin/settings' && method === 'POST') {
        const denied = await authed(); if (denied) return denied;
        return handleSaveSettings(body);
      }
      if (path === '/admin/check-uid' && method === 'POST') {
        const denied = await authed(); if (denied) return denied;
        return handleCheckUid(body);
      }

      return err(404, 'not_found');
    } catch (e) {
      console.error('API error:', e);
      return err(500, 'server_error');
    }
  };
};

// Exported for the smoke test (and any other unit test).
module.exports.toEnglishDigits = toEnglishDigits;
module.exports.normalizeUid = normalizeUid;
