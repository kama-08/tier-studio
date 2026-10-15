# Tier Studio

An offline tier list editor for the web and desktop. Built with React, TypeScript, Vite, TanStack Router, and Tauri 2. Bun manages dependencies and runs the JavaScript tooling.

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

Once the first desktop installer release is published, copy `.env.example` to
`.env.local` and set `VITE_PUBLIC_REPOSITORY_URL=https://github.com/kama-08/tier-studio`.
Restart the dev server or rebuild after changing
it. Only repository URLs on `github.com` are accepted; branch, release, and asset URLs
are not repository URLs. Vite embeds this public value in the frontend bundle.

The dialog links to the repository's latest release, where users select the Windows
`.exe` installer, and provides a separate GitHub source link. No versioned asset names
are hardcoded. Until a valid repository URL is configured, it shows **Downloads coming
soon** and creates no external links. The private development repository is not a fallback.

Upload the Windows NSIS installer produced by `bun run desktop:build` to GitHub Releases.
It installs for the current user by default and retains the standard installation-folder
selection page. The web app does not choose the installation folder. GitHub Pages may
host the web frontend or a download landing page; installers belong in GitHub Releases.
Release publication and automatic desktop updates are not configured yet.

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

GitHub Actions runs the Bun checks, web production build and browser suite on Linux, plus a native debug build and lifecycle smoke check on Windows. The workflow runs on pushes and pull requests; it does not publish releases or deploy the app.

See [dependency notes](docs/dependency-notes.md) for the Bun/Playwright compatibility investigation and the test fixture's scoped workaround.

On Windows, `bun run test:desktop` builds the debug desktop app and checks tray registration, close-to-tray, and restoring the existing window after a second launch. Close any running desktop instance first. The check uses temporary storage and verifies that project data and undo history survive hiding and restoring the window. It also injects a storage failure and delayed writes to verify that Quit permits recovery, waits for commits, and retains the last focused input after reopening.

## License

[MIT](LICENSE) © 2026 kama-08.
