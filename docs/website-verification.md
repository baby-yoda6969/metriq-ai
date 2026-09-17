# Website integration verification

The standalone website lives in `website/`. Android and its backend remain
separate. See [developer guide](../website/README.md) for setup and commands.

## Local checks

- Production Vite build succeeds. The existing report/chart/model-viewer
  dependencies still produce large-chunk warnings; performance splitting is
  future work, not a suppressed warning.
- Website: 33 passing tests, including the imported tests and five history
  controller regression cases.
- Mobile: 28 passing tests via the isolated `test:mobile` command.
- API smoke checks pass for health, input validation, handoff creation/submission,
  and SSE replay. The health response confirms the separate website service.
- Lint has no errors; inherited unused-variable and React hook warnings remain.
- All 169 protected mobile-source/configuration files match the pre-integration
  snapshot. Earlier Android development-setup changes already in the working
  tree were preserved.
- Website credentials are ignored local files. The configured secret is absent
  from the generated browser bundle.
- No GitHub Actions, CI/CD configuration, deployment, or scheduled checks added.

## Earlier interactive checks

Before the user requested no more computer-use testing, local browser checks
covered inspector/supervisor/rule-admin entry, an actual Gemini sample-label
analysis, saving and viewing a case, PDF and DOCX downloads, supervisor demo
monitoring, and local rule drafting/publication. Export output retained its
original report palette. Dark/light desktop and narrow layouts were inspected.

The final reference-inspired landing, role picker, and sign-in layout were
subsequently changed and verified by build/lint checks only, per that request.
No claim is made that every final layout or every browser workflow was tested.
Physical camera capture and full device-to-browser capture were not tested.

## Development boundaries

Login remains simulated. Cases are in React session state; rule changes and
handoffs use process memory. Reload/restart can reset demonstration data.
Monitoring and some 3D behavior remain fixtures from the source website.
These are deliberate preserved behaviors for this base, not production services.

The next implementation phase should introduce real authorization, durable
storage, API contracts, bounded service requests and persistence tests. Keep
these changes behind the existing service boundaries. Report colors are in
`src/lib/reportTheme.js`; UI tokens are in `src/lib/theme.js`. The shared
`FieldLandscape` component is theme-aware local SVG artwork with no network
or image-generation dependency. All developer checks are manual local commands.

## Latest landing revision

Replaced the split landscape landing with the user-selected dark reference:
compact floating navigation, a deterministic ASCII sphere, subtle texture, a
centered serif headline and a single primary inspection action. Light mode uses
the same theme variables. Features and role entry points remain below the hero.
Only the landing component and its scoped stylesheet changed in this revision.
No browser/computer-use testing was performed; local build and lint checks only.

## Theme and alignment pass

Removed the sign-in page's forced light palette and black logo filter. Landing
typography now uses the same Manrope theme fonts as the workspace, while keeping
the selected reference composition. Shared gutters align the console header,
navigation and page content; responsive grids allow content to shrink and wrap.
Forms, status rows, modal headings/footers, mobile rule editors and sticky
dashboard navigation have explicit sizing and spacing rules. Phone handoff
content reserves space for the theme control. Signature/QR and camera media
surfaces keep their necessary fixed contrast; exported documents are unchanged.

Production build and 33 website tests pass. Lint exits successfully with existing
warnings. No browser/computer-use testing was performed, so these layout changes
have source/build validation rather than a new visual inspection.

## Routed website and consistent page shell

Added React Router public pages and workspace sections, a shared public layout,
and sessionStorage-backed demo identity (without passwords). Removed the old
landscape presentation from sign-in/role selection. Landing, feature directory,
use-case directory, roles and sign-in share navigation, brand and theme tokens.
Workspace navigation now uses real links. Case history has URL-based filtering
and pagination with 10/25/50 row options. The workspace is loaded on demand.

Validation: 43 website tests pass, including route rendering, role/return-path
validation and pagination edge cases. Production build succeeds, lint exits
successfully with inherited warnings, API smoke checks pass, and direct-route
HTML fallback checks pass on both Vite (5174) and Express (8787). No browser or
computer-use checks were run. Existing large workspace/model-viewer chunk
warnings remain. These changes do not add a database or real authentication.
