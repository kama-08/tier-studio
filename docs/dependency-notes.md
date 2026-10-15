# Dependency compatibility notes

Observed on Windows x64 with Bun 1.3.14 and Playwright/playwright-core 1.64.0. No installed dependency files were modified.

## Browser installation through bunx

Reproduction:

```sh
bunx --bun playwright install chromium
```

Expected: download Playwright's Chromium. Actual: the spawned download helper is interpreted as a package/git dependency, ending with `git clone` / `InstallFailed` and a path to `playwright-core/lib/entry/oopBrowserDownload.js`.

The exercised path is `downloadBrowserWithProgressBarOutOfProcess` in `playwright-core/lib/coreBundle.js`. It uses `child_process.fork` without overriding `execArgv`; the failure appears related to Bunx's inherited invocation arguments. This is a likely Bun invocation/fork compatibility issue, rather than a project error. The exact runtime cause is unconfirmed.

Calling the same CLI directly with Bun successfully downloaded Chromium:

```sh
bun ./node_modules/playwright/cli.js install chromium
```

That is the project's `test:install` script. An upstream regression test should run a CLI through Bunx which forks an absolute-path JS helper, and assert that the helper runs rather than triggering package installation. A minimal upstream fix needs further isolation of the inherited argument handling.

## Browser transport under Bun

Two launch paths were reproduced independently of application code:

1. `chromium.launch()` starts Chrome but stalls before resolving on Windows. The exercised launch path requests five stdio descriptors and `--remote-debugging-pipe`. This suggests a pipe compatibility problem; the exact runtime cause is unconfirmed.
2. A manually launched Chromium exposes a working local CDP endpoint. `chromium.connectOverCDP(endpoint, { timeout: 5000 })` times out. Playwright logs a WebSocket `101 WebSocket Protocol Handshake` as an unexpected response. Bun's native `WebSocket` connects to that identical endpoint and successfully receives `Browser.getVersion`.

Minimal reproduction after starting a headless Chromium with a local debugging endpoint:

```ts
import { chromium } from 'playwright';

const endpoint = 'ws://127.0.0.1:9222/devtools/browser/REPLACE_WITH_BROWSER_ID';
const socket = new WebSocket(endpoint);
socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: 'Browser.getVersion' }));
socket.onmessage = (event) => console.log(event.data); // Receives the version.

await chromium.connectOverCDP(endpoint, { timeout: 5000 }); // Times out here.
```

Expected: both transports connect. Actual: native WebSocket succeeds while Playwright's bundled `ws` upgrade path does not. The relevant implementation is `WebSocketTransport._connect` in `playwright-core/lib/coreBundle.js`, using the bundled `ws` in `utilsBundle.js`. This is consistent with the [existing Bun report #32526](https://github.com/oven-sh/bun/issues/32526), which describes the same upgrade signature in earlier Playwright 1.61.0, and the [Windows launch report #13543](https://github.com/oven-sh/bun/issues/13543). Reproduction here establishes the affected installed versions; it does not establish behavior in newer Bun releases.

The test-only fixture in `tests/e2e/fixtures.ts` owns a Chromium process and unique temporary profile, then supplies Bun's native WebSocket through Playwright's public `ConnectOverCDPTransport` interface. It binds debugging to localhost and cleans up its browser and profile. Other platforms retain the normal Playwright launch path. CDP has lower fidelity than the standard Playwright protocol, so reassess this workaround when changing browser features or upgrading Bun.

Suggested upstream regression tests: Chromium launch with the extra stdio pipe descriptors on Windows, and a bundled `ws` client upgrading a localhost HTTP response to WebSocket and exchanging a CDP-style message. The runtime's HTTP upgrade behavior needs investigation before proposing a code fix. The existing report makes adding a focused runtime regression test a better contribution than opening a duplicate issue. Nothing has been posted upstream.

## Native theme smoke checks

Playwright's CDP color emulation can make a WebView2 page report light mode while the actual Windows theme is dark. When checking native system appearance, clear `Emulation.setEmulatedMedia` with `{ features: [] }` before comparing the page and native window. In a fresh hidden Tauri instance, clearing that override confirmed matching page/window themes for System → Dark → Light → System. This was test configuration, not an application or dependency bug.

## WebView2 debugging on elevated Windows runners

The first GitHub Actions Windows run built the desktop app successfully, then timed out waiting for its CDP endpoint. The fixture supplied `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` and `WEBVIEW2_USER_DATA_FOLDER` through the process environment. GitHub's hosted Windows runners run with administrator privileges. Microsoft confirms that WebView2 Runtime 150+ intentionally ignores user-writable debugging overrides for elevated hosts; see [WebView2Feedback #5640](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5640). This is documented runtime hardening, not a new upstream bug.

Windows debug builds now read the paired `TIER_STUDIO_TEST_DEBUG_PORT` and `TIER_STUDIO_TEST_PROFILE` variables. The test window is created during setup with Tauri's `WebviewWindowBuilder`, passing browser arguments and an absolute temporary profile through the native APIs. Tauri/Wry forward these options to `CoreWebView2EnvironmentOptions` and `CreateCoreWebView2EnvironmentWithOptions`, which are the supported API path under elevation. The test removes inherited WebView2 debugging/profile variables, so local runs verify that the direct API path works. Release builds do not compile this test configuration. Native startup uses a bounded 60-second readiness check with the last connection error and app stderr in failure output.

Tauri 2.12.2's config `data_directory` is documented as a relative path; an absolute temporary path belongs in `WebviewWindowBuilder::data_directory`. The first API patch used the config field incorrectly, causing local test projects to persist in the default desktop library. The fixture now checks that the temporary profile contains WebView2 files and the project library is empty before writing anything, and repeated runs verify isolation.

The hosted runner confirmed elevation and WebView2 153.0.4234.48, and the API configuration restored CDP access. It then exposed a separate defect in the save-before-quit assertion. Dexie 4.4.6's `createDBCore` binds the native `IDBDatabase.transaction` method during database opening, so replacing that prototype method afterward did not apply the intended delay. The assertion depended on a transient progress dialog with no delayed commit. This is intentional dependency caching and incorrect test instrumentation, not an upstream bug.

The test now intercepts `IDBObjectStore.put`, which Dexie looks up for each mutation, and holds that real write transaction behind an explicit test-controlled barrier. It verifies a pending write, the visible dialog, and the live app process, then releases writes and checks saved data after reopening. The pending-write assertion also prevents future instrumentation changes from silently removing the delay.

## Dexie database version compatibility

Dexie 4.4.6 deliberately retries `open()` without a native version when IndexedDB returns `VersionError` (`dexieOpen` in `dist/dexie.mjs`). A reproduction with a version-1 Dexie connection reopening a version-2 database succeeds when their schemas match. This is explicit compatibility behavior, not an upstream bug; incrementing the database version alone cannot prevent older application code from writing. Tier Studio instead checks storage revisions inside the same read/write transaction as each save. Revision metadata and thumbnail caches add record properties without changing indexes, so the database schema stays at version 1. Conflict protection requires clients running the updated repository code; historical builds with unconditional writes do not participate in that contract.
