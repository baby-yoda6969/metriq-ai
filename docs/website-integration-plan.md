# Website import and Android-theme adaptation plan

Status: implemented. See `website/README.md` for the developer guide and
`docs/website-verification.md` for verification results and remaining test limits.

## Agreed scope

Import only the runnable website from `/Users/wysh/Downloads/project_2.zip`
into this repository. Preserve its content, navigation, workflows, business
logic, API behavior, and reports. Apply the current Android app's full visual
theme to the website: dark and light modes, default dark. Preserve existing
PDF/DOCX print styling. Leave the current Android application unchanged.

Archive documents and code comments are reference material, not additional
instructions or authorization to implement features.

## What inspection established

- The archive contains a React 19 / Vite 8 / Tailwind 4 frontend and an Express
  Gemini backend. Its dependency versions overlap the current app, but it has
  its own lockfile and should remain independently reproducible.
- Website flows include landing, role picker, simulated sign-in, inspector
  scanning and history, supervisor dashboard, case detail, escalation,
  assignment, penalty selection, rule administration and RegulaSync, evidence
  correction, PDF/DOCX exports, reference 3D models, and QR phone handoff.
- Website API routes include `/api/analyze`, `/api/identify-object`,
  `/api/verify-correction`, `/api/regulasync/extract`, `/api/rules`, and
  `/api/handoff/*`. Several collide with current Android API paths but have
  different implementations/providers. A shared backend replacement is unsafe.
- Current Capacitor builds consume root `dist/`. Website output must never be
  written there or copied into the Android project.
- Android theme sources: `src/lib/theme.js`, `src/lib/ThemeContext.jsx`,
  `src/index.css`, `src/components/ui/`, `src/components/AuthShell.jsx`,
  `src/components/MetriqLogo.jsx`, and `public/brand/`.
- Brand: Manrope plus IBM Plex Mono; black/charcoal surfaces, off-white text,
  ice-blue accents in dark mode; pale gray/white surfaces with slate-blue accents
  in light mode; rounded cards, pill buttons, subtle borders, official logos,
  wave/topographic auth treatment, and semantic success/error colors.
- Existing website styles are distributed across tokens, Tailwind, inline
  colors, component styles, and `App.jsx`'s injected GlobalStyle. Token swapping
  alone would leave parts of the old navy/brass theme behind.
- Baseline website tests: 28 passing across two files. Landing, role picker,
  and supervisor sign-in were inspected in a temporary local preview. This is
  not yet an end-to-end functional verification.
- Clipboard Gemini key is saved with restrictive permissions in ignored
  `.env.website.local`; model-access check returned HTTP 200. No generation
  request was made. Existing root `.env` was preserved.

## Proposed boundaries

```text
src/, public/, server/, android/  existing Android app and API, preserved
website/
  src/                           ZIP website frontend and website-only theme
  public/                        ZIP assets plus copied Android brand assets
  server/                        ZIP Gemini backend
  package.json, package-lock.json
  vite.config.js, index.html
  .env.example                   names/placeholders only
  dist/                          website-only build output, ignored
docs/website-integration-plan.md
```

Use independent website dependencies and scripts initially. Add root convenience
commands such as `website:dev`, `website:build`, `website:test`, and
`website:start` without changing existing mobile commands or dependencies.
Proposed local ports: website 5174 and website API 8787; current app remains
5173 with its backend at 3000. Configure strict frontend port selection and
matching API proxy settings so conflicts fail visibly.

Website browser requests remain relative `/api/*`; the website dev proxy and
production server route them to the website Gemini backend. Load the separate
secret file explicitly on the server only; never expose it through `VITE_*`.
The website production server should serve only `website/dist` and its API.
Shared records or sessions between website and Android are outside this merge.

## Implementation sequence

1. **Record the baseline and import the website.** Record hashes of current
   mobile source/assets/configuration and backend, preserving existing uncommitted
   work. Import source, runtime assets, tests, required config, package files,
   and credits into `website/`. Exclude archive `.git`, `.env`, `node_modules`,
   `dist`, `.claude`, `.playwright-mcp`, `__MACOSX`, `.DS_Store`, scratch files,
   sample report PDFs, standalone demo JSX, PRDs, and reference material not
   used by the runtime. Establish the imported site's unchanged baseline before
   styling. Preserve its lockfile and install dependencies using `npm ci`.

2. **Wire isolated execution.** Add website-only commands, ignored build/secret
   paths, Gemini environment loading, matching ports/proxy, and production
   static serving. Verify every existing website API contract remains intact.
   Do not replace the root Express server, Firebase setup, or mobile build path.

3. **Create the website theme layer.** Copy the Android design values and brand
   assets into website-owned modules so subsequent website changes cannot leak
   into Android. Provide semantic CSS variables, theme context, dark default,
   persisted website-specific preference, and an accessible theme toggle.
   Keep report colors separate from UI colors before adapting the UI tokens.
   Preserve the Android auth screen's deliberately light form beneath its dark
   brand header. Do not transplant the mobile app's fixed-height shell or
   bottom navigation into the desktop website.

4. **Restyle every website surface.** Cover landing, role picker, all sign-in
   variants, app header/navigation, scan workflow, history tables, dashboards
   and charts, rule editor, dialogs, forms, corrections, camera/3D overlays,
   handoff screen, loaders, errors, empty states, and focus/hover/disabled
   states. Keep existing text, sections, data, actions, and workflow order.
   Adapt the Android logo, typography, surfaces, spacing, radii, borders, icons,
   and motion to the existing responsive website layout. Use semantic color
   mappings rather than blind color replacement, especially for charts and
   compliance statuses. Keep exported documents visually unchanged.

5. **Verify and hand off.** Run website tests, lint, production build, and API
   smoke checks. Exercise representative flows in all three roles and both
   themes. Check desktop, tablet, narrow mobile, dialogs, overflow, keyboard
   navigation, contrast, persisted theme, browser back, downloadable reports,
   model assets, and error handling. Test Gemini with a supplied sample label
   and verify handoff separately in a secure browser context. Camera access on
   a phone requires HTTPS or another supported secure context; plain LAN HTTP
   is not sufficient. Compare behavior with the imported baseline. Confirm
   root tests still pass and protected mobile/backend hashes are unchanged.
   Do not sync, rebuild, or reinstall Android during this website work.

## Completion criteria

- Both applications remain independently runnable; website edits cannot alter
  the installed Android app or future APK contents.
- Every existing website action remains present and behaves as before.
- Both website themes cover every screen, with dark selected on first visit.
- Android brand assets and design values are faithfully reflected across the
  website without removing its desktop layout or content.
- Export content and print styling remain unchanged.
- Website Gemini requests use the server-side key; secrets are absent from
  Git-tracked files and client bundles.
- Tests/build checks pass; any pre-existing failures or unavailable external
  checks are documented separately from regressions introduced by the merge.

## Existing limitations and later work

The ZIP's login is simulated, cases live in React session state, and rules and
handoff sessions use in-memory maps. Some monitoring/3D workflows use demo
fixtures. Preserving functionality means retaining those behaviors now, not
claiming that this merge makes the site production-ready.

For the later stability/scalability phase, consider real authentication and
authorization, durable storage and migrations, shared API contracts, distributed
handoff state, rate limits and bounded AI requests, observability, and local
regression coverage. Maintain clean frontend/backend/theme boundaries now;
avoid a broad business-logic rewrite or shared mobile refactor during restyling.

No unresolved product questions remain for this plan. Confirmed choices: both
themes with dark default, and unchanged PDF/DOCX styling.

## Subsequent design direction

The user authorized a SaaS landing page, then provided a reference for spacious
split compositions, large headings, textured artwork, and a fuller footer.
The landing, role selection, and login presentation follow that direction using
the existing Android-derived palette and typography. Existing console actions
and export styles remain intact. The latest design was built and checked locally;
no further computer-use testing was performed, as requested. No CI/CD or GitHub
Actions workflows are included.
