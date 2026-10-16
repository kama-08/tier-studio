import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { deployWeb, readDeploymentConfig } from './deploy-web';

const scratch = resolve('.tanstack');
let directory: string;
const config = {
  name: 'tier-studio',
  compatibility_date: '2026-10-15',
  workers_dev: true,
  preview_urls: false,
  assets: { directory: './dist/web', not_found_handling: 'single-page-application' as const },
};
const apiToken = 'test-credential';
const uploadJwt = 'test-upload-grant';
const completionJwt = 'test-completion-grant';
const options = () => ({
  config,
  directory,
  accountId: '0'.repeat(32),
  apiToken,
  commit: 'test-commit',
});
const response = (result: unknown) => new Response(JSON.stringify({ success: true, result }));

beforeEach(async () => {
  await mkdir(scratch, { recursive: true });
  directory = await mkdtemp(join(scratch, 'deploy-test-'));
  await Bun.write(join(directory, 'index.html'), '<html>tested build</html>');
  await Bun.write(join(directory, 'assets/app.js'), 'console.log("app")');
  await Bun.write(
    join(directory, '_headers'),
    '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n',
  );
});
afterEach(async () => {
  if (!directory.startsWith(join(scratch, 'deploy-test-')))
    throw new Error('Unexpected test directory.');
  await rm(directory, { recursive: true, force: true });
});

function cloudflare(
  mode: 'upload' | 'cached' | 'reject' | 'missing-completion' | 'unknown-hash' = 'upload',
) {
  return vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (url, init) => {
    if (url.endsWith('/settings')) return response({});
    if (url.endsWith('/assets-upload-session')) {
      const { manifest } = JSON.parse(init.body as string);
      return response({
        jwt: uploadJwt,
        buckets:
          mode === 'cached'
            ? []
            : [
                mode === 'unknown-hash'
                  ? ['unknown']
                  : Object.values(manifest).map((file) => (file as { hash: string }).hash),
              ],
      });
    }
    if (url.includes('/assets/upload?')) {
      if (mode === 'reject')
        return new Response(
          JSON.stringify({ success: false, errors: [{ code: 10023, message: apiToken }] }),
          { status: 403 },
        );
      return response(mode === 'missing-completion' ? {} : { jwt: completionJwt });
    }
    if (url.endsWith('/subdomain')) return response({});
    return response({ has_assets: true, has_modules: false, deployment_id: 'test-deployment' });
  });
}

describe('Bun static asset deployment', () => {
  it('uploads real multipart/base64 assets and requires publication confirmation', async () => {
    const request = cloudflare();
    await expect(deployWeb(options(), request)).resolves.toEqual({
      worker: 'tier-studio',
      deploymentId: 'test-deployment',
    });
    expect(request).toHaveBeenCalledTimes(5);
    const [settings, session, upload, publish, subdomain] = request.mock.calls;
    expect(settings[0]).toContain('/scripts/tier-studio/settings');
    expect(session[0]).toContain('/scripts/tier-studio/assets-upload-session');
    expect(new Headers(session[1].headers).get('Authorization')).toBe(`Bearer ${apiToken}`);
    const { manifest } = JSON.parse(session[1].body as string);
    expect(Object.keys(manifest).sort()).toEqual(['/assets/app.js', '/index.html']);
    expect(manifest['/index.html'].hash).toMatch(/^[a-f0-9]{32}$/);
    expect(manifest['/index.html'].size).toBe(25);
    expect(upload[0]).toContain('/workers/assets/upload?base64=true');
    expect(new Headers(upload[1].headers).get('Authorization')).toBe(`Bearer ${uploadJwt}`);
    const values: unknown[] = Array.from((upload[1].body as FormData).values());
    const files = values.filter((value): value is File => value instanceof File);
    expect(files).toHaveLength(2);
    expect(files.map((file) => file.type)).toEqual(
      expect.arrayContaining(['text/html;charset=utf-8', 'text/javascript;charset=utf-8']),
    );
    expect(
      await Promise.all(
        files.map(async (file) => Buffer.from(await file.text(), 'base64').toString()),
      ),
    ).toEqual(expect.arrayContaining(['<html>tested build</html>', 'console.log("app")']));
    expect(publish[0]).toMatch(/\/scripts\/tier-studio$/);
    expect(publish[1].method).toBe('PUT');
    expect(new Headers(publish[1].headers).get('Authorization')).toBe(`Bearer ${apiToken}`);
    const metadata = JSON.parse((publish[1].body as FormData).get('metadata') as string);
    expect(metadata.assets.jwt).toBe(completionJwt);
    expect(metadata.assets.config.not_found_handling).toBe('single-page-application');
    expect(metadata.assets.config._headers).toContain('immutable');
    expect(metadata.annotations['workers/message']).toBe('test-commit');
    expect(metadata.main_module).toBeUndefined();
    expect(subdomain[0]).toContain('/scripts/tier-studio/subdomain');
    expect(JSON.parse(subdomain[1].body as string)).toEqual({
      enabled: true,
      previews_enabled: false,
    });
  });
  it('reuses the completion grant when all assets are cached', async () => {
    const request = cloudflare('cached');
    await deployWeb(options(), request);
    expect(request).toHaveBeenCalledTimes(4);
    const metadata = JSON.parse(
      (request.mock.calls[2][1].body as FormData).get('metadata') as string,
    );
    expect(metadata.assets.jwt).toBe(uploadJwt);
  });
  it('stops before publication on an upload error and never logs a credential from the response', async () => {
    const request = cloudflare('reject');
    const result = deployWeb(options(), request);
    await expect(result).rejects.toThrow('HTTP 403; codes 10023');
    await expect(result).rejects.not.toThrow(apiToken);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('stops if the upload never returns a completion grant', async () => {
    const request = cloudflare('missing-completion');
    await expect(deployWeb(options(), request)).rejects.toThrow('did not confirm completion');
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('rejects a server bucket that references a file outside the manifest', async () => {
    const request = cloudflare('unknown-hash');
    await expect(deployWeb(options(), request)).rejects.toThrow('unknown asset hash');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('parses the actual JSONC config but refuses configurations with application Worker code', async () => {
    expect((await readDeploymentConfig()).name).toBe('tier-studio');
    const path = join(directory, 'unsupported.jsonc');
    await Bun.write(path, JSON.stringify({ ...config, main: 'worker.ts' }));
    await expect(readDeploymentConfig(path)).rejects.toThrow('Unrecognized key');
  });
});
