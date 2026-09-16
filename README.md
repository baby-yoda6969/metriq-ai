# Packaged Commodity Compliance Checker

Screening-round demo for Legal Metrology field inspectors: scan a packaged commodity
label, extract the mandatory declarations, and get a compliance verdict against the
Legal Metrology (Packaged Commodities) Rules, 2011. See
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

   Keys stay in `.env` (git-ignored). The browser only calls `/api/*` on the local backend.

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

Dev mode starts Vite (http://localhost:5173) and the API (http://localhost:8787). Vite proxies `/api/*` to the backend, so
just open http://localhost:5173.

- `npm run dev:client` — frontend only
- `npm run dev:server` — backend only
- `npm run build` — production build of the frontend

## Architecture

- `src/App.jsx` — the whole frontend (ported from `legal-metrology-demo.jsx`): scan
  flow, retake handling, compliance rules, dashboard, roadmap, error boundary.
- `server/index.js` — the only thing that talks to Gemini. Takes an image, calls
  `gemini-2.5-flash` server-side, returns the parsed JSON contract to the frontend.
- No database — scan history lives in React state, seeded on load, and resets on
  page reload (see PRD §7).
