# Web hosting

The official app is published at **https://tier-studio.kama-08.workers.dev** using
Cloudflare Workers Static Assets. The Worker is named `tier-studio` and serves
`dist/web/` without an application Worker script or backend database.

## Deployment

The first deployment on October 16, 2026 used the connected Cloudflare plugin's
API because local Wrangler device authentication under Bun did not establish a
verified login. The production assets were built with Bun, registered with the
Workers assets upload API, uploaded in the returned buckets, and attached to an
assets-only Worker using the completion token. Short-lived upload credentials
were removed from the local staging directory after deployment.

The deployed configuration matches `wrangler.jsonc` and `public/_headers`:

- Navigation to project routes falls back to `index.html`.
- Hashed `/assets/*` resources have a one-year immutable cache policy.
- HTML revalidates; the service worker, registration script, and manifest use
  `no-cache`.
- The production `workers.dev` address is enabled; preview URLs are disabled.

The published application build is commit
`f7eb3332f0a84bc33529ae3c224eaaa22af08b8d`. Cloudflare returned deployment ID
`3935e8b69a864434990c3afcca43b992`.

Normal manual deployment commands remain in the README. A successful browser
authorization alone is insufficient: verify `wrangler whoami` before relying on
the CLI. See [dependency notes](dependency-notes.md) for the observed limitation.

## Verification

All 26 production Playwright tests passed against the actual HTTPS URL, including
project creation, saving and import/export, image shapes, PNG output, drag
highlights, responsive layouts, cross-tab conflicts, and offline reload/edit/export.
Direct HTTP checks confirmed HTTP 200 for a project navigation, JavaScript and CSS
content types, and the deployed cache headers. The live sample project also
survived a direct editor-page reload in the in-app browser.

Run the deployment checks again after publishing application changes:

```powershell
$env:TEST_BASE_URL = 'https://tier-studio.kama-08.workers.dev'
$env:TEST_PRODUCTION = '1'
bun run test:e2e --workers=2
Remove-Item Env:TEST_BASE_URL, Env:TEST_PRODUCTION
```

## Automatic deployments

GitHub pushes do **not** deploy the website yet. The Cloudflare account has no
build token or connected build configuration for this repository. Enabling it
requires connecting the `kama-08/tier-studio` GitHub repository and configuring a
deployment credential in Cloudflare Workers Builds; the README lists the Bun
build and deploy commands. Existing GitHub CI and Windows release workflows
continue to operate independently.

## Project storage

Projects and images stay in the visitor's browser, separate from localhost and
the desktop app. Export a `.tier` project file from the old origin and import it
on the public site to transfer a project. Visiting a `/projects/:id` link does
not share the associated project with another browser.
