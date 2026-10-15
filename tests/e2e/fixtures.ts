import { test as base, expect, chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { ConnectOverCDPTransport } from 'playwright-core';

// Bun 1.3.14/Windows stalls on the default browser pipes and bundled ws transport.
// Use Playwright's public CDP transport with Bun's native WebSocket. See docs/dependency-notes.md.
export const test = base.extend({
  browser: [
    async ({ browserName, channel }, provideBrowser) => {
      if (process.platform !== 'win32' || !process.versions.bun) {
        const browser = await chromium.launch({ channel });
        try {
          await provideBrowser(browser);
        } finally {
          await browser.close();
        }
        return;
      }
      if (browserName !== 'chromium')
        throw new Error('The Bun/Windows CDP fixture supports Chromium.');
      const profile = await mkdtemp(join(tmpdir(), 'tier-studio-browser-'));
      const child = spawn(
        chromium.executablePath(),
        [
          '--headless',
          '--no-sandbox',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-component-update',
          '--remote-debugging-port=0',
          '--remote-debugging-address=127.0.0.1',
          `--user-data-dir=${profile}`,
          'about:blank',
        ],
        { stdio: 'ignore', windowsHide: true },
      );
      let launchError: Error | null = null;
      child.on('error', (error) => {
        launchError = error;
      });
      try {
        let port = '';
        let endpoint = '';
        for (let attempt = 0; attempt < 100; attempt++) {
          if (launchError) throw launchError;
          if (child.exitCode !== null) throw new Error('The test browser exited during startup.');
          try {
            [port, endpoint] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8'))
              .trim()
              .split('\n');
          } catch {
            /* The browser has not written its port yet. */
          }
          if (port) break;
          await new Promise((done) => setTimeout(done, 100));
        }
        if (!port)
          throw new Error(
            'The test browser did not expose its local CDP endpoint. Run bun run test:install first.',
          );
        const socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
        const transport: ConnectOverCDPTransport = {
          send: (message) => socket.send(JSON.stringify(message)),
          close: () => socket.close(),
        };
        socket.onmessage = (event) => transport.onmessage?.(JSON.parse(String(event.data)));
        socket.onclose = (event) => transport.onclose?.(event.reason);
        await new Promise<void>((done, reject) => {
          socket.onopen = () => done();
          socket.onerror = () => reject(new Error('Could not connect to the local test browser.'));
        });
        const browser = await chromium.connectOverCDP(transport, { timeout: 10000 });
        try {
          await provideBrowser(browser);
        } finally {
          const session = await browser.newBrowserCDPSession().catch(() => null);
          await session?.send('Browser.close').catch(() => {});
          await browser.close();
        }
      } finally {
        if (child.exitCode === null) child.kill();
        // Only remove the unique temporary profile created by this fixture.
        if (
          dirname(resolve(profile)) === resolve(tmpdir()) &&
          profile.startsWith(join(tmpdir(), 'tier-studio-browser-'))
        ) {
          await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
            () => {},
          );
        }
      }
    },
    { scope: 'worker' },
  ],
});

export { expect };
