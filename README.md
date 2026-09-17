# metriq ai

Legal Metrology field compliance for packaged commodities — mobile-first scan app
for inspectors (Android APK + web). See
[legal-metrology-compliance-mvp-prd-claude-code.md](legal-metrology-compliance-mvp-prd-claude-code.md)
for the full spec.

## Website development

The website from `project_2.zip` lives independently in [`website/`](website/README.md).
It uses the Android visual theme, with separate source, dependencies, API, and
build output. The setup instructions below this section are for the mobile app.

```bash
npm run website:install
npm run website:dev
```

Open http://localhost:5174 (website API: 8787). Configure the website key using
`website/.env.example`; see the [website developer guide](website/README.md)
for commands, module boundaries, and environment settings.

Use `npm run website:build`, `npm run website:test`, and `npm run website:lint`
for website checks; `npm run test:mobile` runs the existing mobile suite separately.
Website changes do not require an Android build or Capacitor sync.

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

Open http://localhost:3000 — the Express server serves the built app and `/api/*`.

## Android app

```bash
npm run mobile:sync          # build web + sync into android/
npm run mobile:apk           # assemble installable debug APK (macOS/Linux/Windows)
# or open Android Studio:
npm run mobile:open
```

Install `android/app/build/outputs/apk/debug/app-debug.apk` on a phone (or grab the
release asset). On the phone: **You → Analysis server** → set `http://<laptop-lan-ip>:3000`
while the backend is running (`npm start`) on the same Wi‑Fi.

Dev mode starts Vite (http://localhost:5173) and the API (http://localhost:3000). Vite proxies `/api/*` to the backend, so
just open http://localhost:5173.

- `npm run dev:client` — frontend only
- `npm run dev:server` — backend only
- `npm run build` — production build of the frontend

## Architecture

- `src/App.jsx` — field app shell: home, pull-to-scan, feed, cases, settings
- `server/index.js` — Groq analysis + Gemini 3D matching; never expose keys to the client
- Capacitor `android/` — native Android wrapper (`ai.metriq.app`)
- Firebase Auth + Firestore for session/cases/rules sync

### Local Android development on macOS

`npm run mobile:apk` uses Java 21 bundled with Android Studio when installed.
Set `android/local.properties` to `sdk.dir=/absolute/path/to/Android/sdk`.
Keep `npm run dev` running and set `VITE_API_BASE_URL` and `VITE_3D_API_BASE`
in `.env` to `http://<laptop-lan-ip>:3000` before building.

Pair and install with wireless debugging enabled (both devices on the same Wi-Fi):

```bash
adb pair <phone-ip>:<pairing-port>
adb connect <phone-ip>:<connection-port>
npm run mobile:apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n ai.metriq.app/.MainActivity
```

The pairing port and connection port are different. Rebuild and reinstall after
frontend changes; the web development view at http://localhost:5173 hot reloads.
API keys are required for AI analysis, and Firebase settings enable cloud sync.
Debug APKs allow calls to the local HTTP backend from the WebView. Release
builds retain the default mixed-content restriction and should use an HTTPS API.
