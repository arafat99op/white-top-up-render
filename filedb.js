/* White Top Up — file-backed db adapter for the API handler.
   Implements EXACTLY the same interface as the Firebase project's
   functions/firestore.js, so handler.js runs unchanged. Data lives in
   data/db.json (single JSON file, written atomically via tmp + rename):

     { packages: [...54 packages...],
       orders:   [...orders keyed by WTU-XXXXXX code...],
       settings: {...},
       admin:    { pinHash, pinSalt } (nulls until the owner sets a PIN),
       sessions: [{ token, createdAt }] — 7-day admin sessions }

   State is held in memory and persisted on every mutation. Reads return
   deep copies so callers can never mutate stored state without saving.

   NOTE (Render free tier): the disk is ephemeral — data/db.json resets on
   every restart/redeploy, so orders can be lost. See README.md. */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function emptyState() {
  return {
    packages: [],
    orders: [],
    settings: {},
    admin: { pinHash: null, pinSalt: null },
    sessions: [],
  };
}

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function loadState() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // Tolerate a partial/corrupt file: fill in any missing top-level keys.
    return Object.assign(emptyState(), parsed || {});
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('filedb: could not read db.json, starting empty:', e.message);
    return emptyState();
  }
}

function createFileDb() {
  let state = loadState();

  function save() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const tmp = DB_PATH + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, DB_PATH); // atomic replace
  }

  return {
    async getPackages() {
      return clone(state.packages);
    },

    async getPackage(id) {
      const pkg = state.packages.find((p) => p.id === Number(id));
      return pkg ? clone(pkg) : null;
    },

    // Mirrors the Firestore adapter: the stored record is a MERGE of the
    // incoming package over the old one, and a null/undefined `limit` is
    // dropped from the write (so an existing limit is kept, exactly like
    // Firestore's set(..., { merge: true }) with the key deleted).
    async savePackage(pkg) {
      const data = Object.assign({}, pkg);
      if (data.limit === null || data.limit === undefined) delete data.limit;
      const idx = state.packages.findIndex((p) => p.id === Number(pkg.id));
      if (idx === -1) {
        state.packages.push(Object.assign({ id: Number(pkg.id) }, data));
      } else {
        state.packages[idx] = Object.assign({}, state.packages[idx], data);
      }
      save();
      return pkg;
    },

    async getSettings() {
      return clone(state.settings) || {};
    },

    async saveSettings(patch) {
      state.settings = Object.assign({}, state.settings, patch);
      save();
    },

    async getAdmin() {
      const a = state.admin || {};
      return { pinHash: a.pinHash || null, pinSalt: a.pinSalt || null };
    },

    async saveAdmin(admin) {
      state.admin = { pinHash: admin.pinHash || null, pinSalt: admin.pinSalt || null };
      save();
    },

    async createOrder(order) {
      state.orders.push(clone(order));
      save();
      return order;
    },

    async getOrderByCode(code) {
      const upper = String(code).toUpperCase();
      const o = state.orders.find((x) => String(x.code).toUpperCase() === upper);
      return o ? clone(o) : null;
    },

    async listOrders() {
      return clone(state.orders);
    },

    async updateOrder(code, patch) {
      const upper = String(code).toUpperCase();
      const o = state.orders.find((x) => String(x.code).toUpperCase() === upper);
      if (!o) return null;
      Object.assign(o, patch);
      save();
      return clone(o);
    },

    async getOrdersByUid(uid) {
      return clone(state.orders.filter((o) => String(o.playerUid) === String(uid)));
    },

    async createSession(token, createdAt) {
      const idx = state.sessions.findIndex((s) => s.token === token);
      if (idx === -1) state.sessions.push({ token, createdAt });
      else state.sessions[idx] = { token, createdAt };
      save();
    },

    async getSession(token) {
      const s = state.sessions.find((x) => x.token === token);
      return s ? clone(s) : null;
    },

    async deleteSession(token) {
      const before = state.sessions.length;
      state.sessions = state.sessions.filter((x) => x.token !== token);
      if (state.sessions.length !== before) save();
    },

    // Idempotent first-run seed: writes the full catalog + default settings
    // only when no packages exist yet. Safe to call on every storefront
    // visit — after the first seed it is a cheap no-op. Returns true when
    // it actually seeded.
    async seedIfEmpty(packages, settings) {
      if (state.packages.length > 0) return false;
      state.packages = clone(packages);
      state.settings = Object.assign({}, state.settings, clone(settings));
      save();
      return true;
    },
  };
}

module.exports = { createFileDb, DB_PATH };
