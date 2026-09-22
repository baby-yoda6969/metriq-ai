# Manual Azure demo deployment

Subscription: Azure for Students. Resource group: `rg-metriq-demo`.
Region: Central India. One Linux B1 plan: `plan-metriq-demo`, one worker.

- Website: https://metriq-web-bd8258.azurewebsites.net
- Android backend and mobile web preview: https://metriq-api-bd8258.azurewebsites.net

Both apps share the same plan. There is no GitHub Actions workflow or continuous
deployment. Azure receives a manually uploaded ZIP containing prebuilt assets and Linux runtime
dependencies. No local `.env`, native Android project, or macOS node_modules is
uploaded. Keys live in App Service application settings, never in the ZIP.

## Repeat a release

Build the website with `npm run website:build`. Build the mobile web preview with
`VITE_API_BASE_URL=https://metriq-api-bd8258.azurewebsites.net VITE_3D_API_BASE=https://metriq-api-bd8258.azurewebsites.net npm run build`.
This does not sync or install the Android app.

Stage each runtime outside the repository:

```sh
node scripts/azure/package.mjs website /tmp/metriq-azure-release-website
node scripts/azure/package.mjs mobile /tmp/metriq-azure-release-mobile
```

Use a fresh staging directory for each release. ZIP its contents (not the enclosing
folder). Deploy with `az webapp deploy -g rg-metriq-demo -n <app-name> --src-path
<zip-path> --type zip`. The app must retain `SCM_DO_BUILD_DURING_DEPLOYMENT=false`,
`ENABLE_ORYX_BUILD=false`, Node 22 LTS, and startup `node server/index.js`.
Website settings include `WEBSITE_API_PORT=8080`; mobile uses `BACKEND_PORT=8080`.
Keep `WEBSITE_RUN_FROM_PACKAGE` unset for extracted ZIP deployments.
Each app receives only its own API keys. One worker is intentional: existing
rule and handoff stores are process-local, not distributed.

For the installed Android APK, open Profile and change its API base URL to the
hosted Android backend above. The existing save action also updates its 3D API
base. No APK rebuild or native theme changes are needed.

## Costs and stopping

Azure Retail Prices API listed Linux B1 in Central India at USD 0.018/hour on
2026-09-17 (~USD 0.432/day for this shared plan). This excludes egress, external
AI services and any other subscription resources. Billing continues until the
plan is removed or changed to an available free tier: stopping individual web
apps does not stop App Service plan charges.

`vm-saga-demo` in `rg-saga-demo` was deallocated, not deleted. Its disk and other
retained resources may still incur charges. Restart only when needed:
`az vm start -g rg-saga-demo -n vm-saga-demo`.

This is the existing demonstration app. Simulated sign-in remains simulated,
website cases live in frontend memory, and rules/handoff sessions reset on
server restart. No NLP branch has been merged. Firebase/Gemini/Groq remain
external services with their existing quotas and configuration.

Shared report links are an exception to the frontend-only case list: their
immutable snapshots and link secret are stored under `/home/data/metriq-reports`
on the website App Service. They survive app restarts and manual releases on
this one-worker plan. Each link gives anyone holding it read access to the
report and its evidence photos. There is no report listing or revocation UI
yet; moving to multiple workers requires shared storage for these snapshots.

### Deployment troubleshooting

A successful upload is not a health check. Check `/api/health` on the website,
then run `WEBSITE_TEST_ORIGIN=https://metriq-web-bd8258.azurewebsites.net npm --prefix website run test:api`.
If Azure reports success but startup cannot find `server/index.js`, inspect the
Kudu runtime directory and deployment logs: a stale run-from-package setting
can leave the ZIP in `/home/data/SitePackages` instead of extracting it.
Confirm the setting is unset and redeploy before restarting. Avoid management
changes while an upload is running. Large uploads may need a longer timeout
or smaller authenticated Kudu VFS transfers on an unreliable connection.
