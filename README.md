# Tier Studio

An offline tier list editor for the web and desktop. Built with React, TypeScript, Vite, TanStack Router, and Tauri 2. Bun manages dependencies and runs the JavaScript tooling.

[Open the web app](https://tier-studio.kama-08.workers.dev) · [Download for Windows (x64)](https://github.com/kama-08/tier-studio/releases/latest/download/Tier-Studio-windows-x64-setup.exe) · [Release notes](https://github.com/kama-08/tier-studio/releases/latest)

## Run

```sh
git clone https://github.com/kama-08/tier-studio.git
cd tier-studio
bun install
bun run dev
```

Open http://127.0.0.1:1420. For desktop development:

```sh
bun run desktop:dev
```

Desktop starts its own Vite server on port 1422. The web dev server uses port 1420, so both can run together. Both ports are fixed; an occupied port produces an error instead of silently changing the URL Tauri loads.

Desktop requires Rust and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/), including the Microsoft C++ build tools and WebView2 on Windows.

```sh
bun run build                # Web app and offline service worker → dist/web/
bun run preview              # Preview the web build
bun run desktop:build        # Native desktop app and installers
```

The first web visit requires a connection. Production builds cache the app for subsequent offline visits. The service worker is disabled in development and desktop builds. A static host must serve `index.html` for unknown routes. Desktop uses hash routing to avoid native asset path issues.

## Included

- Project library with create, search, duplicate, delete, and a sample board.
- Image and text items, sortable tiers, custom labels/colors, and an unranked pool.
- Project-wide item shapes: square, vertical (3:4), horizontal (4:3), circle, and original image proportions. The setting applies to ranked and unranked items, supports undo/redo, and is preserved in project files and PNG exports. Text items use a square in Original mode.
- A Customize panel with live preview: item size and spacing, tier padding and spacing, label width/font/alignment/weight, color palettes, row tints and borders, image crop/fit, rounded corners, item borders, and shadows. Settings save with the project and support undo/redo; a slider gesture creates one undo step.
- Compact, Standard, and Showcase presets, plus up to 20 named reusable styles saved on this device. Saved styles include item shape, tier colors, layout, and export options. Applying a preset preserves items and their placements.
- Crowded tiers shrink and wrap without horizontal scrolling. Full wrapped lines fit the available width as the window resizes; shorter final lines keep the same tile size. Tiles never grow beyond the selected size (92px by default). PNG export preserves the current board width, item order, theme, and customization, and refits items into the space freed by removing editor-only row controls.
- Pointer dragging and an item menu for moving items without dragging.
- Undo/redo (100 commands); Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z outside text fields.
- Automatic IndexedDB saves with error feedback and a retry action. Atomic revision checks prevent a stale tab from overwriting edits or resurrecting a deleted project. Conflicts pause editing and offer a project-file backup and an explicit reload of the latest version.
- PNG export and portable `.tier` project import/export. The preview button beside Export PNG offers Match editor or fixed board widths (800–4,096 px) and 1×, 2×, or 3× resolution. Fixed-width exports use the saved style across screen sizes. Long titles, descriptions, tier labels, and text items wrap at word boundaries. Export width and resolution save with the project.
- Image imports process four files at a time. Library previews load only their visible images and cache 96px thumbnails. PNG rendering decodes and releases four images at a time and ignores images outside the exported sections. Canvas dimensions are limited to 16,000px per side and approximately 64 megapixels; the preview reports any automatic resolution reduction.
- Unused images are collected when no editor tab has the project open. Cross-tab Web Locks preserve images needed for undo and stale-tab backups, including after a project is deleted elsewhere. Browsers without Web Locks retain those images instead of risking data loss.
- Responsive layout, native desktop open/save dialogs, and storage persistence requests.
- Light, dark, and system appearance. Use the sun/moon button for a quick switch, or Settings → Appearance to follow your device. Your preference is saved locally and also updates the native desktop window theme.
- A sidebar toggle in each page’s top bar. Its visibility is remembered across navigation and reloads.
- Desktop system tray with Show and Quit actions. Closing the window hides it in the tray; choose Show Tier Studio to reopen it (left-clicking the icon also works on Windows/macOS). Quit commits the focused title/description, waits for file operations and database saves, then exits. A save failure keeps the app open for recovery.
- A single desktop instance. Launching the app again restores and focuses the existing window, including when it is hidden or minimized.

Images are normalized to PNG at up to 512 pixels per side; GIF imports use the decoded first frame. Projects support up to 2,000 items and 30 tiers. PNG export includes ranked tiers by default. Customize → PNG export can include or hide the title, description, Unranked section, and footer, and optionally use a transparent canvas background. These visibility settings affect exported images; editor controls remain available. The project file always keeps all items and their current style. Undo history is session-only. Saved style presets are local to this browser or desktop installation.

Browser and desktop libraries live in separate storage locations. Transfer a `.tier` file to move work between them. Browser storage may be cleared by the browser or user; export important projects for backup. Cloud accounts, sharing, synchronization, and collaboration are future work.

## Desktop downloads

The web app offers **Download desktop** in the sidebar and Settings. Its dialog explains
how to move projects with a `.tier` file. Download actions are hidden in the native app.

The dialog downloads the Windows x64 installer directly and offers release notes and
GitHub source links. Official downloads work without environment configuration. The
installer installs for the current account and includes an installation-folder selection
page. Version 0.1.0 is unsigned, so Windows may display an unknown-publisher warning.
Each release includes `SHA256SUMS.txt` to verify the installer download.

Forks can copy `.env.example` to `.env.local` and change `VITE_PUBLIC_REPOSITORY_URL`.
Use a repository URL on `github.com`; branch, release, and asset URLs are rejected.
An explicitly empty value disables download links. Restart dev or rebuild after changing
this value; Vite embeds it in the frontend bundle. A fork must publish the same stable
installer filename, `Tier-Studio-windows-x64-setup.exe`, for its download link to work.

## Deploy the web app

The official web app is live at **https://tier-studio.kama-08.workers.dev**.
See [hosting notes](docs/hosting.md) for the deployment method, verification, and
automatic-deployment status.

`wrangler.jsonc` deploys `dist/web/` to Cloudflare Workers Static Assets. No Worker
script, database, or paid compute is needed. SPA routing serves `index.html` for
navigation to routes such as `/projects/:id`. The `_headers` file caches hashed
assets for a year and revalidates the HTML, manifest, and service-worker entry files.

```sh
bun run cloudflare:login     # One-time Wrangler sign-in, separate from the Codex plugin
bun run deploy:web:check     # Production build and deployment validation
bun run deploy:web           # Build and publish
bun run preview             # Preview the production web build locally
```

To deploy automatically, connect `kama-08/tier-studio` to the `tier-studio` Worker
under Cloudflare → Settings → Builds, with `main` as the production branch. Use
`bun install --frozen-lockfile && bun run typecheck && bun run lint && bun run test && bun run build`
as the build command and `bun --bun run wrangler deploy` as the deploy command.
Pin `BUN_VERSION=1.3.14` in the build environment. GitHub authorization and a
Cloudflare build token must be configured for this integration.

The existing browser suite can target a deployment without starting a local server:

```powershell
$env:TEST_BASE_URL = 'https://YOUR-DEPLOYMENT.workers.dev'
$env:TEST_PRODUCTION = '1'
bun run test:e2e --workers=2
Remove-Item Env:TEST_BASE_URL, Env:TEST_PRODUCTION
```

Wrangler 4.151.0's local `dev` server is incompatible with Bun 1.3.14 on Windows;
see [dependency notes](docs/dependency-notes.md). Use the Vite production preview
locally and verify Cloudflare's routing and headers on the deployed URL. The
Wrangler dry-run command works under Bun; authentication and live deployment
through that command require a separate Wrangler sign-in. The initial deployment
used the connected Cloudflare plugin's API and Bun for asset uploads. Local
Wrangler device login did not save credentials; see the dependency notes before
relying on that flow.

Projects remain in the visitor's browser. Export `.tier` files before moving from
localhost or changing the production domain; storage does not transfer between origins.

## Publish a Windows release

Update the version in `package.json`, `src-tauri/Cargo.toml`, and
`src-tauri/tauri.conf.json`, refresh `src-tauri/Cargo.lock` with Cargo, and add
`docs/releases/X.Y.Z.md`. Commit and push those changes, then tag that commit:

```sh
bun run release:validate v0.1.0
git tag v0.1.0
git push origin v0.1.0
```

Use the new version in place of `0.1.0` for later releases. The **Windows release**
workflow runs the web/browser and native desktop checks, builds a release-mode Windows
x64 NSIS installer, and publishes it with its SHA-256 checksum. It validates the tag
against all three manifests and requires version-specific release notes. Assets upload
to a draft before publication; reruns can resume a draft but cannot overwrite a published
release. A manual workflow run must select an existing version tag.

For a local Windows build:

```sh
bun run desktop:build:windows
bun run release:prepare v0.1.0
```

The stable installer and checksum are written to ignored `release-artifacts/`.
Signing certificates and automatic desktop updates are not configured. GitHub Pages
can host the web frontend; installers are distributed through GitHub Releases.

## Structure

```text
src/
  app/                 Router, service composition, environment selection
  routes/              Thin TanStack file routes
  features/
    library/           Project collection and import
    editor/            Zustand state, editor, drag-and-drop board
    assets/            Image normalization and object URL lifetime
    settings/          Local storage preferences
  core/                Zod project schema, pure commands, patch history
  services/
    storage/           Dexie repository and serialized saves
    project-files/     Versioned ZIP format and import validation
    image-export/      Canvas PNG renderer
  platform/            Browser downloads vs native dialogs/filesystem
  components/ui/       Shared UI using tailwind-variants
  styles/              Tailwind and app styling
src-tauri/             Rust shell, native plugins, permissions, packaging
tests/e2e/             Playwright workflows
tests/desktop/         Native Windows lifecycle smoke check
```

One frontend serves both environments. Web and desktop builds use separate output directories (`dist/web/` and `dist/desktop/`) so one build does not overwrite the other. Feature components call the repository and platform interfaces; the project model and commands have no React or Tauri dependencies. Routes are generated into `src/routeTree.gen.ts` by the TanStack Vite plugin. Keep route files thin and feature behavior in `features/`.

`.tier` is a ZIP containing a validated `project.json`, an `assets.json` manifest, and embedded image bytes under `assets/`. The format has a version field. Import creates new project/asset IDs, so it does not overwrite an existing project. Future migrations belong at the file/schema boundary.

## Checks

```sh
bun run typecheck
bun run lint
bun run fmt:check
bun run test
bun run test:install
bun run test:e2e
```

To check the production service worker after `bun run build`, run the offline test with `TEST_PRODUCTION=1` set in your shell. For PowerShell:

```powershell
$env:TEST_PRODUCTION = '1'
bun run test:e2e --grep 'production app is offline'
Remove-Item Env:TEST_PRODUCTION
```

`bun run fmt` formats with Oxfmt; `bun run lint:fix` applies Oxlint fixes. Vitest covers commands, history, project validation, archive round trips, concurrent saves, bounded jobs, and text wrapping. Playwright covers editing, conflict recovery, image cleanup and thumbnails, export preview and downloads, file import, dragging/cancellation, narrow layouts, and production offline behavior. Browser tests use Chromium.

GitHub Actions runs the Bun checks, web production build and browser suite on Linux, plus a native debug build and lifecycle smoke check on Windows. CI runs on branch pushes and pull requests. Version tag pushes run those same checks through the Windows release workflow before building and publishing an installer. Web hosting is not deployed by these workflows.

See [dependency notes](docs/dependency-notes.md) for the Bun/Playwright compatibility investigation and the test fixture's scoped workaround.

On Windows, `bun run test:desktop` builds the debug desktop app and checks tray registration, close-to-tray, and restoring the existing window after a second launch. Each run uses temporary storage and its own single-instance identifier, so it can run alongside the ordinary desktop app. The check verifies that project data and undo history survive hiding and restoring the window. It also injects a storage failure and delayed writes to verify that Quit permits recovery, waits for commits, and retains the last focused input after reopening. Startup failures include native stage logs and the owned process tree; CI preserves the log as a `native-desktop-results` artifact.

## License

[MIT](LICENSE) © 2026 kama-08.
