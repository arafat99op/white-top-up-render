# White Top Up — Render deploy

Free Fire diamond top-up shop (BD) — shop + admin panel, running as ONE
zero-dependency Node.js server. Same code as the Firebase project
(`handler.js` + `catalog.js` copied verbatim); only the database is
different — a JSON file (`data/db.json`) instead of Firestore.

- Shop: `https://<your-render-service>.onrender.com`
- Admin: `https://<your-render-service>.onrender.com/admin.html` (direct URL
  only — no link from the shop; set a PIN on first visit, there is no
  default PIN)

## What is inside

| Path | What it is |
|---|---|
| `public/` | Static shop (`index.html`), admin (`admin.html`), CSS/JS, logo + bKash/Nagad brand logos |
| `handler.js` | The whole JSON API (orders, tracking, admin auth, packages, settings, dormant Check UID) — verbatim from the Firebase project |
| `catalog.js` | The 54-package catalog + default settings (single source of truth) |
| `filedb.js` | File-backed db adapter implementing the same interface the Firebase project gets from Firestore |
| `server.js` | Zero-dependency Node http server: static files + `/api/**` -> handler.js, CORS enabled on the API |
| `data/db.json` | Orders, packages, settings, admin PIN hash, sessions — auto-seeded with the catalog on first run |
| `render.yaml` | Render Blueprint (one free web service) |

Catalog: 17 ID Code diamond packs, 3 Deshi Offer deals (with server-side
purchase limits), 11 Weekly/Monthly memberships + bundles, 5 Weekly Lite,
7 level-wise Level Up Passes, 2 Likes, 3 Like Offers, 6 Mystery Boxes —
54 packages total. Payment is **bKash + Nagad only**
(bKash 01327762121, Nagad 01781018186 — editable in Admin Settings).
WhatsApp help: https://wa.me/8801781018186.

## Deploy on Render (free)

1. Push this folder to a Git repo (GitHub/GitLab).
2. Render Dashboard -> **New +** -> **Blueprint** -> pick the repo.
   (Or **New +** -> **Web Service**, pick the repo, Runtime **Node**,
   Plan **Free**, Build Command `echo "no build step"`, Start Command
   `node server.js`.)
3. Open the service URL — the shop seeds itself on the first visit.
4. Open `/admin.html`, set a 4–12 digit PIN, log in, check **Packages**
   (54 packages) and **Settings** (payment numbers + WhatsApp link are
   already filled in).

## Render free-tier caveats (read this)

1. **Sleep:** the free service sleeps after 15 minutes with no traffic.
   The first visit after a sleep takes **30–60 seconds** to wake up
   (cold start). After that it is fast until it sleeps again.
2. **Ephemeral disk:** the free plan has NO persistent disk.
   `data/db.json` **resets on every restart/redeploy** — orders, PIN
   and settings go back to the clean seeded state. Orders placed before
   a restart can be lost, so confirm/deliver orders promptly. A paid
   Render disk (or a cheap VPS) is the fix when the shop grows.

## Run locally

```bash
node server.js
# shop: http://localhost:3000  |  admin: http://localhost:3000/admin.html
```

No `npm install` needed — there are no dependencies (Node 20+).

## Notes

- The API allows any origin (CORS `*`), so the shop frontend can also
  live on another domain (e.g. Firebase Hosting) while this API runs
  on Render — point the frontend's `/api` calls at the Render URL.
- Check UID (Leak Studio) is dormant: it only works if the owner turns
  it on in Admin Settings AND saves an API key there. Unlike Firebase
  Spark, Render free CAN call external APIs, so no plan upgrade is
  needed for it.
- Files you should never share: your **admin PIN** and the **Leak Studio
  API key** (paste it only into Admin Settings, never into chat).
