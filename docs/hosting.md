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

The initial published application build was commit
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

`.github/workflows/deploy-web.yml` listens for completed **CI** runs. A successful
push or manual CI run on `main` in `kama-08/tier-studio` is eligible to deploy.
Both the web and desktop CI jobs must succeed. Pull requests, other branches,
forks, failed/cancelled CI runs, and release tags do not deploy.

The workflow checks whether the tested commit is still the tip of `main`, then
downloads `web-production-<commit>` from that specific CI run. It deploys these
tested files without rebuilding, using Bun 1.3.14 and the locked Wrangler version.
Production deployments are serialized separately from CI cancellation so an older
deployment cannot finish after a newer deployment. A newer push may temporarily
leave the previously validated build live until the new CI run succeeds.

After deploying, `scripts/verify-web-deployment.ts` compares the live HTML with the
downloaded build, retrying briefly for propagation. The complete browser suite
then runs against the production URL, including offline editing/export. Failed
browser checks retain their artifacts. GitHub's `production` environment displays
deployment status and the public URL. A post-deployment failure reports a failed
workflow; it does not automatically roll back the public site.

### Credentials

Configure the GitHub **production** environment as follows:

- Restrict deployment branches to `main`.
- Set the `CLOUDFLARE_ACCOUNT_ID` environment variable to the account that owns
  `tier-studio`. The account ID is not a secret.
- Store `CLOUDFLARE_API_TOKEN` as an environment secret. Create an account-owned
  Cloudflare token with **Specified Workers → tier-studio → Individual Workers
  Editor**. It can update this existing Worker without access to other Workers,
  DNS, billing, or storage products. A one-year expiration requires renewing the
  token before it expires.

The official repository's token is named **Tier Studio GitHub production deploy**
and expires on **October 16, 2027**. Renew its environment secret before that date.

The token is only passed to the deployment step. It is not embedded in the web
bundle or the artifact, and no token value belongs in source control or logs.
Cloudflare Workers Builds is not connected; GitHub Actions is the deployment
owner. Local Wrangler OAuth login is not needed by this non-interactive flow.

To rotate a token, create a replacement with the same scope, update the GitHub
environment secret, verify a successful deployment, and revoke the old token.

### Retry and rollback

For a fresh validated deployment, select **CI → Run workflow → main** in GitHub.
It reruns the checks and produces a new artifact, then triggers **Deploy web**.
You can also rerun a failed deployment while its tested commit is still the tip
of `main` and its CI artifact is available (retained for 14 days).

For an immediate rollback, select a prior deployment of `tier-studio` in the
Cloudflare dashboard, or use `wrangler rollback` with a valid credential. Revert
the offending application commit on `main` afterward; the normal CI/CD pipeline
will deploy the revert. Desktop installers remain controlled by the separate
versioned Windows release workflow.

## Project storage

Projects and images stay in the visitor's browser, separate from localhost and
the desktop app. Export a `.tier` project file from the old origin and import it
on the public site to transfer a project. Visiting a `/projects/:id` link does
not share the associated project with another browser.
