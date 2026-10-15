import { chromium, expect, type Browser, type Page } from '@playwright/test';
import type { ConnectOverCDPTransport } from 'playwright-core';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

if (process.platform !== 'win32')
  throw new Error('This native smoke check requires Windows/WebView2.');

const executable = resolve(import.meta.dir, '../../src-tauri/target/debug/tier-studio.exe');
await access(executable);
const profile = await mkdtemp(join(tmpdir(), 'tier-studio-desktop-'));
const reservation = createServer();
await new Promise<void>((done) => reservation.listen(0, '127.0.0.1', done));
const address = reservation.address();
if (!address || typeof address === 'string')
  throw new Error('Could not reserve a local debug port.');
const port = address.port;
await new Promise<void>((done, reject) =>
  reservation.close((error) => (error ? reject(error) : done())),
);

let logs = '';
const launchErrors = new WeakMap<ChildProcess, Error>();
const children: ChildProcess[] = [];
function launch(userData: string) {
  const env = { ...process.env };
  // The test must work through the native API, even on a non-elevated machine.
  delete env.WEBVIEW2_USER_DATA_FOLDER;
  delete env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;
  const child = spawn(executable, [], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...env,
      TIER_STUDIO_TEST_PROFILE: userData,
      TIER_STUDIO_TEST_DEBUG_PORT: String(port),
    },
  });
  for (const stream of [child.stdout, child.stderr])
    stream?.on('data', (data) => {
      logs = (logs + `[${child.pid}] ${String(data)}`).slice(-16000);
    });
  child.on('error', (error) => launchErrors.set(child, error));
  children.push(child);
  return child;
}

const primary = launch(profile);
let browser: Browser | undefined;
let page: Page | undefined;
let launches = 0;
async function launchAgain() {
  const secondary = launch(join(profile, `secondary-${++launches}`));
  await new Promise<void>((done, reject) => {
    const timeout = setTimeout(() => reject(new Error('The second instance did not exit.')), 10000);
    secondary.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    secondary.once('exit', (code, signal) => {
      clearTimeout(timeout);
      if (code === 0 && signal === null) done();
      else reject(new Error(`The second instance exited with ${code ?? signal}. ${logs}`));
    });
  });
  expect(primary.exitCode).toBe(null);
}

async function invoke(command: string, args: Record<string, unknown> = {}) {
  return page!.evaluate(
    ({ command, args }) =>
      (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
}
const windowState = (name: string) => invoke(`plugin:window|${name}`);

async function startupDiagnostics(child: ChildProcess) {
  const files = await readdir(profile).catch(() => []);
  if (!child.pid) return `Profile entries: ${files.join(', ') || '(empty)'}`;
  // Only report this test child's process tree, not unrelated user processes.
  const script = `
    $processes = @(Get-CimInstance Win32_Process)
    $owned = @(${child.pid})
    do {
      $next = @($processes | Where-Object {
        $owned -contains $_.ParentProcessId -and $owned -notcontains $_.ProcessId
      } | Select-Object -ExpandProperty ProcessId)
      $owned += $next
    } while ($next.Count -gt 0)
    $processes | Where-Object { $owned -contains $_.ProcessId } |
      Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress
  `;
  const processes = await new Promise<string>((done) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 5000 },
      (error, stdout) => done(stdout.trim() || error?.message || '(none)'),
    );
  });
  return `Profile entries: ${files.join(', ') || '(empty)'}. Owned processes: ${processes}`;
}

async function waitForEndpoint(child: ChildProcess, label: string, previousEndpoint?: string) {
  const deadline = Date.now() + 60000;
  let lastFailure = 'No response received.';
  while (Date.now() < deadline) {
    const error = launchErrors.get(child);
    if (error) throw error;
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(
        `${label} exited during startup (${child.exitCode ?? child.signalCode}). Close any running Tier Studio first. ${logs}`,
      );
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(1000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const version = await response.json();
      const endpoint: unknown = version.webSocketDebuggerUrl;
      if (typeof endpoint === 'string' && endpoint !== previousEndpoint) return endpoint;
      lastFailure =
        endpoint === previousEndpoint
          ? 'The previous WebView2 process is still stopping.'
          : 'No WebSocket endpoint in the response.';
    } catch (cause) {
      lastFailure = cause instanceof Error ? cause.message : String(cause);
    }
    await Bun.sleep(100);
  }
  throw new Error(
    `${label}: WebView2 did not expose its test endpoint at 127.0.0.1:${port} within 60s. Last response: ${lastFailure}. App output: ${logs || '(empty)'}. ${await startupDiagnostics(child)}`,
  );
}

try {
  const endpoint = await waitForEndpoint(primary, 'Initial launch');

  // Bun's native WebSocket avoids the Windows transport issue documented in
  // docs/dependency-notes.md and used by the browser test fixture.
  const socket = new WebSocket(endpoint);
  const transport: ConnectOverCDPTransport = {
    send: (message) => socket.send(JSON.stringify(message)),
    close: () => socket.close(),
  };
  socket.onmessage = (event) => transport.onmessage?.(JSON.parse(String(event.data)));
  socket.onclose = (event) => transport.onclose?.(event.reason);
  await new Promise<void>((done, reject) => {
    socket.onopen = () => done();
    socket.onerror = () => reject(new Error('Could not connect to the native test window.'));
  });
  browser = await chromium.connectOverCDP(transport, { timeout: 10000 });
  const context = browser.contexts()[0];
  page = context.pages()[0] ?? (await context.waitForEvent('page', { timeout: 10000 }));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForURL(/tauri\.localhost/);
  await expect(page.getByRole('button', { name: 'Hide to tray', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download desktop', exact: true })).toHaveCount(0);
  // Fail before any writes if WebView2 is not using the owned temporary profile.
  await expect.poll(async () => (await readdir(profile)).length).toBeGreaterThan(0);
  await expect(page.locator('.project-card')).toHaveCount(0);
  const tray = await invoke('plugin:tray|get_by_id', { id: 'main-tray' });
  expect(typeof tray).toBe('number');

  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Desktop lifecycle');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByRole('button', { name: 'Text item', exact: true }).click();
  await page.getByLabel('Item name', { exact: true }).fill('Still here');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  const documentUrl = page.url();
  await page.evaluate(() => {
    document.documentElement.dataset.lifecycle = 'same-webview';
  });
  await page.getByRole('button', { name: 'Hide to tray', exact: true }).click();
  await expect.poll(() => windowState('is_visible')).toBe(false);
  expect(page.isClosed()).toBe(false);
  expect(primary.exitCode).toBe(null);
  console.log('PASS: closing the window hides it and keeps the tray and editor alive.');

  await launchAgain();
  await expect
    .poll(() => windowState('is_visible'), { message: 'relaunch shows the window' })
    .toBe(true);
  // A background test runner cannot reliably transfer foreground rights on Windows.
  // The single-instance plugin requests that transfer for normal user launches;
  // visibility and restoration are deterministic here, keyboard focus is not.
  // https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-allowsetforegroundwindow
  expect(page.url()).toBe(documentUrl);
  await expect(page.locator('html')).toHaveAttribute('data-lifecycle', 'same-webview');
  await expect(page.getByLabel('Project title', { exact: true })).toHaveValue('Desktop lifecycle');
  await expect(page.getByRole('button', { name: 'Drag Still here', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  console.log(
    'PASS: a second launch exits and restores the same window, project, and undo history.',
  );

  await page.getByRole('button', { name: 'Minimize window', exact: true }).click();
  await expect.poll(() => windowState('is_minimized')).toBe(true);
  await launchAgain();
  await expect.poll(() => windowState('is_minimized')).toBe(false);
  await expect.poll(() => windowState('is_visible')).toBe(true);
  console.log('PASS: a second launch also restores a minimized window.');

  await invoke('plugin:window|close');
  await expect.poll(() => windowState('is_visible')).toBe(false);
  await launchAgain();
  await expect.poll(() => windowState('is_visible')).toBe(true);
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Drag Still here', exact: true })).toBeVisible();
  expect(await invoke('plugin:tray|get_by_id', { id: 'main-tray' })).toBe(tray);
  expect(errors).toEqual([]);
  console.log(
    'PASS: native close requests hide the window; saved data and one tray survive reload.',
  );

  // A storage failure must keep the process and the unsaved editor alive.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    Object.assign(window, {
      restorePut: () => {
        IDBObjectStore.prototype.put = original;
      },
    });
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'projects')
        throw new DOMException('Storage full in smoke test', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await page.getByLabel('Project title', { exact: true }).fill('Saved by safe quit');
  await page.getByLabel('Project title', { exact: true }).press('Enter');
  await expect(page.getByText('Could not save', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Text item', exact: true }).click();
  await invoke('request_quit');
  const failure = page.getByRole('dialog', { name: 'Your changes haven’t saved', exact: true });
  await expect(failure).toBeVisible();
  expect(primary.exitCode).toBe(null);
  await expect(failure.getByRole('alert')).toContainText('Storage full');
  await page.evaluate(() => (window as unknown as { restorePut: () => void }).restorePut());
  await failure.getByRole('button', { name: 'Stay in app', exact: true }).click();
  const previousDialog = page.getByRole('dialog', { name: 'Add text item', exact: true });
  await expect(
    previousDialog.getByRole('button', { name: 'Minimize window', exact: true }),
  ).toBeVisible();
  await previousDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  console.log('PASS: a failed save cancels Quit and restores the editor for recovery.');

  // Hold project writes until the test has verified the saving UI and live
  // process. A timed delay can expire before assertions reach a fast CI runner.
  await page.evaluate(() => {
    // Dexie binds IDBDatabase.transaction when opening the database. Patch the
    // object-store write instead, which is looked up for each save operation.
    const original = IDBObjectStore.prototype.put;
    let holdWrites = true;
    let activeWrites = 0;
    const held = new WeakSet<IDBTransaction>();
    Object.assign(window, {
      projectWritesHeld: () => activeWrites,
      releaseProjectWrites: () => {
        holdWrites = false;
      },
    });
    IDBObjectStore.prototype.put = function (...args) {
      const result = original.apply(this, args);
      const transaction = this.transaction;
      if (holdWrites && this.name === 'projects' && !held.has(transaction)) {
        held.add(transaction);
        activeWrites++;
        transaction.addEventListener(
          'complete',
          () => {
            activeWrites--;
          },
          { once: true },
        );
        transaction.addEventListener(
          'abort',
          () => {
            activeWrites--;
          },
          { once: true },
        );
        const store = transaction.objectStore('projects');
        function hold() {
          const request = store.get('__quit-smoke__');
          request.onsuccess = () => {
            if (holdWrites) hold();
          };
        }
        hold();
      }
      return result;
    };
  });
  // Leave the field focused: Quit must also commit its blur handler.
  await page
    .getByLabel('Project description', { exact: true })
    .fill('Committed from a focused field');
  const exited = new Promise<number | null>((done) => primary.once('exit', done));
  await invoke('request_quit');
  await expect
    .poll(() =>
      page!.evaluate(() =>
        (window as unknown as { projectWritesHeld: () => number }).projectWritesHeld(),
      ),
    )
    .toBeGreaterThan(0);
  await expect(
    page.getByRole('dialog', { name: 'Saving before quitting…', exact: true }),
  ).toBeVisible();
  expect(primary.exitCode).toBe(null);
  await page.evaluate(() =>
    (window as unknown as { releaseProjectWrites: () => void }).releaseProjectWrites(),
  );
  const code = await Promise.race([
    exited,
    Bun.sleep(15000).then(() => {
      throw new Error('Safe Quit did not finish.');
    }),
  ]);
  expect(code).toBe(0);
  console.log('PASS: Quit commits the focused input, waits for storage, and exits cleanly.');

  // Reopen the same isolated profile and verify bytes survived the process exit.
  await browser.close().catch(() => {});
  const reopened = launch(profile);
  const reopenedEndpoint = await waitForEndpoint(reopened, 'Reopened app', endpoint);
  const reopenedSocket = new WebSocket(reopenedEndpoint);
  const reopenedTransport: ConnectOverCDPTransport = {
    send: (message) => reopenedSocket.send(JSON.stringify(message)),
    close: () => reopenedSocket.close(),
  };
  reopenedSocket.onmessage = (event) =>
    reopenedTransport.onmessage?.(JSON.parse(String(event.data)));
  reopenedSocket.onclose = (event) => reopenedTransport.onclose?.(event.reason);
  await new Promise<void>((done, reject) => {
    reopenedSocket.onopen = () => done();
    reopenedSocket.onerror = () => reject(new Error('Could not reconnect after safe Quit.'));
  });
  browser = await chromium.connectOverCDP(reopenedTransport);
  const reopenedContext = browser.contexts()[0];
  page =
    reopenedContext.pages()[0] ?? (await reopenedContext.waitForEvent('page', { timeout: 10000 }));
  await expect(
    page.getByRole('link', { name: 'Open Saved by safe quit', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Open Saved by safe quit', exact: true }).click();
  await expect(page.getByLabel('Project description', { exact: true })).toHaveValue(
    'Committed from a focused field',
  );
  console.log('PASS: reopening after Quit retains the last title and focused description.');
} catch (error) {
  const results = resolve(import.meta.dir, '../../test-results');
  await mkdir(results, { recursive: true });
  await writeFile(
    join(results, 'native-smoke.log'),
    `${logs}\n${error instanceof Error ? error.stack : String(error)}`,
  );
  throw error;
} finally {
  // Only clean up processes and the unique profile created by this smoke run.
  if (page && !page.isClosed())
    await invoke('plugin:tray|remove_by_id', { id: 'main-tray' }).catch(() => {});
  await browser?.close().catch(() => {});
  await Promise.all(
    children.map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise<void>((done) => child.once('exit', () => done()));
      child.kill();
      await exited;
    }),
  );
  if (
    dirname(resolve(profile)) === resolve(tmpdir()) &&
    basename(profile).startsWith('tier-studio-desktop-')
  )
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
      () => {},
    );
}
