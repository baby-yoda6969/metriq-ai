# metriq ai

Legal Metrology field compliance for packaged commodities — mobile-first scan app
for inspectors (Android APK + web). See
[legal-metrology-compliance-mvp-prd-claude-code.md](legal-metrology-compliance-mvp-prd-claude-code.md)
for the full spec.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and add API keys:
   ```bash
   cp .env.example .env
   ```
   - **GROQ_API_KEY** — label analysis, object ID, correction verify, RegulaSync (text)
   - **GEMINI_3D_API_KEY** — AI Studio auth key (`AQ.*`) for 3D pack matching from photos
   - **VITE_*** Firebase keys — cloud sync
   - Optional **VITE_API_BASE_URL** — absolute API URL baked into the Android build

   Keys stay in `.env` (git-ignored). The browser/app only calls `/api/*` on the backend.

## Run

**Development** (hot reload):

```bash
npm run dev
```

**Production** (single port after build):

```bash
npm run build
npm start
```

Open http://localhost:8787 — the Express server serves the built app and `/api/*`.

## Android app

```bash
npm run mobile:sync          # build web + sync into android/
npm run mobile:apk           # assemble release/debug via Gradle
# or open Android Studio:
npm run mobile:open
```

Install `android/app/build/outputs/apk/debug/app-debug.apk` on a phone (or grab the
release asset). On the phone: **You → Analysis server** → set `http://<laptop-lan-ip>:8787`
while the backend is running (`npm start`) on the same Wi‑Fi.

Dev mode starts Vite (http://localhost:5173) and the API (http://localhost:8787). Vite proxies `/api/*` to the backend, so
just open http://localhost:5173.

- `npm run dev:client` — frontend only
- `npm run dev:server` — backend only
- `npm run build` — production build of the frontend

## Architecture

- `src/App.jsx` — field app shell: home, pull-to-scan, feed, cases, settings
- `server/index.js` — Groq analysis + Gemini 3D matching; never expose keys to the client
- Capacitor `android/` — native Android wrapper (`ai.metriq.app`)
- Firebase Auth + Firestore for session/cases/rules sync
