import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { parse, type ParseError } from 'jsonc-parser';
import { z } from 'zod';

const configSchema = z.strictObject({
  $schema: z.string().optional(),
  name: z.string().regex(/^[a-z0-9_][a-z0-9_-]*$/),
  compatibility_date: z.string(),
  compatibility_flags: z.array(z.string()).optional(),
  workers_dev: z.boolean(),
  preview_urls: z.boolean(),
  assets: z.strictObject({
    directory: z.string(),
    not_found_handling: z.enum(['none', '404-page', 'single-page-application']).optional(),
    html_handling: z
      .enum(['auto-trailing-slash', 'force-trailing-slash', 'drop-trailing-slash', 'none'])
      .optional(),
  }),
});
type Config = z.infer<typeof configSchema>;
type Request = (url: string, init: RequestInit) => Promise<Response>;
type Envelope<T> = { success: boolean; result: T; errors?: { code: number }[] };

export async function readDeploymentConfig(path = 'wrangler.jsonc') {
  const errors: ParseError[] = [];
  const raw = parse(await Bun.file(path).text(), errors, { allowTrailingComma: true });
  if (errors.length) throw new Error('Invalid wrangler.jsonc syntax.');
  return configSchema.parse(raw);
}

export async function deployWeb(
  options: {
    config: Config;
    directory: string;
    accountId: string;
    apiToken: string;
    commit?: string;
  },
  request: Request = fetch,
) {
  const { config, directory, accountId, apiToken, commit } = options;
  if (!/^[a-f0-9]{32}$/.test(accountId) || !apiToken)
    throw new Error('Deployment credentials are missing or invalid.');
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers`;
  const worker = `${base}/scripts/${config.name}`;
  async function api<T>(url: string, init: RequestInit = {}, token = apiToken): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await request(url, { ...init, headers, signal: AbortSignal.timeout(60_000) });
    let data: Envelope<T>;
    try {
      data = (await response.json()) as Envelope<T>;
    } catch {
      throw new Error(`Cloudflare returned an invalid response (HTTP ${response.status}).`);
    }
    if (!response.ok || !data.success) {
      // Print codes only; API response bodies and upload JWTs must never reach logs.
      throw new Error(
        `Cloudflare request failed (HTTP ${response.status}; codes ${data.errors?.map((error) => error.code).join(', ') || 'unknown'}).`,
      );
    }
    return data.result;
  }
  // Require an existing Worker; this uploader never creates additional resources.
  await api(`${worker}/settings`);
  const manifest: Record<string, { hash: string; size: number }> = {};
  const files = new Map<string, { bytes: Buffer; type: string }>();
  async function walk(folder: string, prefix = '') {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const relative = `${prefix}/${entry.name}`;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path, relative);
      else if (entry.isFile() && relative !== '/_headers' && relative !== '/_redirects') {
        const file = Bun.file(path);
        const bytes = Buffer.from(await file.arrayBuffer());
        const hash = createHash('sha256')
          .update(extname(relative))
          .update(bytes)
          .digest('hex')
          .slice(0, 32);
        manifest[relative] = { hash, size: bytes.length };
        files.set(hash, { bytes, type: file.type });
      } else if (!entry.isFile())
        throw new Error('Build contains an unsupported filesystem entry.');
    }
  }
  await walk(directory);
  if (!manifest['/index.html']) throw new Error('Production build has no index.html.');
  const session = await api<{ jwt: string; buckets: string[][] }>(
    `${worker}/assets-upload-session`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifest }),
    },
  );
  if (!session?.jwt || !Array.isArray(session.buckets))
    throw new Error('Invalid Cloudflare asset-upload session.');
  let completion = session.buckets.length === 0 ? session.jwt : undefined;
  for (const bucket of session.buckets) {
    const form = new FormData();
    for (const hash of bucket) {
      const file = files.get(hash);
      if (!file) throw new Error('Cloudflare requested an unknown asset hash.');
      form.append(hash, new Blob([file.bytes.toString('base64')], { type: file.type }), hash);
    }
    const uploaded = await api<{ jwt?: string }>(
      `${base}/assets/upload?base64=true`,
      { method: 'POST', body: form },
      session.jwt,
    );
    if (uploaded?.jwt) completion = uploaded.jwt;
  }
  if (!completion) throw new Error('Cloudflare did not confirm completion of the asset upload.');
  const assetConfig: Record<string, string | undefined> = {
    not_found_handling: config.assets.not_found_handling,
    html_handling: config.assets.html_handling,
  };
  for (const name of ['_headers', '_redirects']) {
    const file = Bun.file(join(directory, name));
    if (await file.exists()) assetConfig[name] = await file.text();
  }
  const form = new FormData();
  form.set(
    'metadata',
    JSON.stringify({
      assets: { jwt: completion, config: assetConfig },
      compatibility_date: config.compatibility_date,
      compatibility_flags: config.compatibility_flags,
      ...(commit ? { annotations: { 'workers/message': commit } } : {}),
    }),
  );
  const published = await api<{
    deployment_id?: string;
    has_assets: boolean;
    has_modules: boolean;
  }>(worker, { method: 'PUT', body: form });
  if (!published?.has_assets || published.has_modules || !published.deployment_id)
    throw new Error('Cloudflare did not confirm an assets-only deployment.');
  await api(`${worker}/subdomain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: config.workers_dev, previews_enabled: config.preview_urls }),
  });
  return { worker: config.name, deploymentId: published.deployment_id };
}

if (import.meta.main) {
  const configPath = resolve('wrangler.jsonc');
  const config = await readDeploymentConfig(configPath);
  const result = await deployWeb({
    config,
    directory: resolve(dirname(configPath), config.assets.directory),
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    apiToken: process.env.CLOUDFLARE_API_TOKEN ?? '',
    commit: process.env.DEPLOY_COMMIT,
  });
  console.log(`Published ${result.worker}; Cloudflare deployment ${result.deploymentId}.`);
}
