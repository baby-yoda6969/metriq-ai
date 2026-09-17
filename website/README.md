# Metriq website

The website imported from `project_2.zip`, with the Android app's dark/light
visual theme. This is an independent React/Vite frontend and Express/Gemini
backend. It does not import mobile source or write to the Android build output.

## Quick start

Use Node 22.12+ and npm. From the repository root:

```sh
npm run website:install
npm run website:dev
```

Open http://localhost:5174. The website API runs on port 8787. The existing
mobile web preview and backend continue to use ports 5173 and 3000.

For a new checkout, copy `website/.env.example` to `website/.env` and configure
`GEMINI_API_KEY`. This machine already has a separate, ignored
`.env.website.local` at the repository root. The server reads `website/.env`
first, then that file; shell/deployment variables take precedence. It never
reads the root mobile `.env`. Keep secrets server-side, without a `VITE_` prefix.
If changing `WEBSITE_API_PORT`, set it in `website/.env` or the shell so both
Vite and Express see it. Restart the dev command after environment changes.

## Commands

| From repository root | Purpose |
| --- | --- |
| `npm run website:dev` | Vite hot reload and watched API server |
| `npm run website:test` | Website unit tests |
| `npm run website:lint` | Website lint checks |
| `npm --prefix website run test:api` | Local API contracts and handoff/SSE smoke checks (dev server running) |
| `npm run website:build` | Build into `website/dist/` |
| `npm run website:start` | Serve built website and API on port 8787 |
| `npm run test:mobile` | Run the separate existing mobile tests |

For a production-mode local check, stop `website:dev`, run `website:build`,
then `website:start` and open http://localhost:8787. `vite preview` only serves
static assets; use `website:start` to check API-backed features. Ports fail
visibly if already in use. The dev command stops both child processes if either
one exits. No deployment is configured by this import.

## Where to work

| Area | Entry points |
| --- | --- |
| Route definitions and access flow | `src/app/Router.jsx`, `src/app/routes.js` |
| Demo identity adapter | `src/app/SessionContext.jsx` |
| Workspace views and demo cases | `src/App.jsx` |
| Shared public navigation and layout | `src/layouts/PublicLayout.jsx` |
| Pagination | `src/components/Pagination.jsx`, `src/lib/pagination.js` |
| Landing, roles, login | `src/screens/Landing.jsx`, `RolePicker.jsx`, `Login.jsx` |
| Scanning and evidence | `src/screens/ScanView.jsx`, `src/screens/scan/` |
| Rule administration | `src/screens/RuleAdminView.jsx` |
| Client API calls | `src/lib/api.js`, `src/lib/handoff.js` |
| AI/API handlers | `server/index.js`; environment loading in `server/config.js` |
| Pure compliance helpers | `src/lib/scanLogic.js`, `server/rules.js` |
| Design values and theme state | `src/lib/theme.js`, `src/lib/ThemeContext.jsx` |
| Layout and visual styling | `src/styles/application.css`, `src/styles/brand.css` |
| Tailwind tokens / global aliases | `src/index.css` |
| Shared UI primitives | `src/components/ui/` |
| Exports and fixed print palette | `src/lib/pdf/`, `src/lib/docx/`, `src/lib/reportTheme.js` |
| Product fixtures/models | `src/data/`, `public/models/`, `public/samples/` |

`theme.js` owns UI color values. Its generated CSS custom properties power
Tailwind, charts, inline styles, and legacy `.lm-*` styles. Prefer semantic
tokens over literal colors. `brand.css` adapts the Android visual language
without changing the website's desktop layout. Public pages, sign-in, and the workspace inherit the same global theme;
PDF/DOCX use their original fixed palette.
Dark is the default and the preference is stored under `metriq-website-theme`.

Keep website changes inside this directory. Do not run Capacitor sync to ship
website changes. Root `src/`, `public/`, `server/`, `dist/`, and `android/` belong
to the existing mobile app. Root scripts are convenience wrappers, not a shared
runtime. Both apps can adopt shared packages later through an explicit migration.

## Behavior retained from the ZIP

All three role flows, label analysis, corrections, case actions, dashboard,
rule editor, reference models, QR handoff, and document exports are retained.
Sign-in and monitoring are simulated. Demo identity survives refresh in sessionStorage
(no passwords are stored); cases remain in workspace React memory,
and server rule/handoff state is in memory. Those are deliberate starting
points for later replacement, not new persistence or authentication promises.

Phone camera handoff needs an HTTPS browser origin (or localhost on that device)
and normal camera permission. A plain LAN HTTP page cannot enable secure-context
browser camera APIs. Keep the website and its `/api` proxy behind the same
HTTPS origin when testing a real phone; Android's native app is a separate flow.

The tests cover compliance helpers and back-navigation races during StrictMode,
role replacement, and nested dialogs. All checks are local commands; this
integration adds no GitHub Actions or other CI/CD workflows.
The integration verification notes
in `../docs/website-verification.md` record broader checks and known limitations.

## Routes and page structure

React Router owns page navigation. Do not add screen-level history.pushState
calls or new `stage`/`view` state switches. Use `Link`/`NavLink` and register new
pages in `src/app/Router.jsx`. The existing dialog history helper only manages
transient overlays. Public pages share `PublicLayout`; the workspace is a lazy
bundle, keeping charts and export libraries off the initial landing load.

| URL | Page |
| --- | --- |
| `/` | Platform landing |
| `/features` | Feature directory |
| `/use-cases` | Role-specific use cases |
| `/sign-in` | Role selection |
| `/sign-in/:role` | Role sign-in |
| `/app/inspector/scan` | New inspection |
| `/app/inspector/history` | Inspector history |
| `/app/supervisor/dashboard` | Supervisory overview |
| `/app/supervisor/history` | Case repository |
| `/app/ruleadmin/ruleadmin` | Rule editor |

Unknown public paths show a 404 page. Invalid workspace roles return to role
selection; invalid sections return to the role's default section. Direct
workspace entry prompts for the matching demo identity and returns to the
requested section after sign-in. This is navigation gating, not server-side
authorization. Replace the demo session adapter with real auth later.

Case history uses `q`, `status`, `page`, and `size` query parameters. Filtering
resets the page. Page bounds are clamped and page sizes are limited to 10/25/50.
Pagination currently slices the in-memory fixtures; later API pagination can
reuse the control component with server totals. Case photos and edits are not
persisted on reload or after leaving the workspace. The Express server already
serves index.html for non-API routes, so direct links work with `npm start`.
Other future hosting must provide the same SPA fallback.
