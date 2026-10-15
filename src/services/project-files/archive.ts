import { strFromU8, strToU8, unzipSync, zip } from 'fflate';
import { z } from 'zod';
import { parseProject, type Project } from '@/core/schema';
import type { Asset } from '@/services/storage/database';

const MAX_SIZE = 100 * 1024 * 1024;
const assetManifest = z
  .array(
    z.object({
      id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
      name: z.string().max(200),
      mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    }),
  )
  .max(2000);

export async function packProject(project: Project, assets: Asset[]): Promise<Uint8Array> {
  const wanted = new Set(
    Object.values(project.items).flatMap((item) => (item.assetId ? [item.assetId] : [])),
  );
  const included = assets.filter((asset) => wanted.has(asset.id));
  if (included.length !== wanted.size)
    throw new Error('Some images are missing. Please re-import them before saving.');
  const files: Record<string, Uint8Array> = {
    'project.json': strToU8(JSON.stringify(project)),
    'assets.json': strToU8(
      JSON.stringify(included.map(({ id, name, mime }) => ({ id, name, mime }))),
    ),
  };
  await Promise.all(
    included.map(async (asset) => {
      files[`assets/${asset.id}`] = new Uint8Array(await asset.blob.arrayBuffer());
    }),
  );
  const total = Object.values(files).reduce((size, bytes) => size + bytes.byteLength, 0);
  if (total > MAX_SIZE) throw new Error('Projects must be smaller than 100 MB to export.');
  return new Promise((resolve, reject) =>
    zip(files, { level: 0 }, (error, bytes) => (error ? reject(error) : resolve(bytes))),
  );
}

export function unpackProject(bytes: Uint8Array): { project: Project; assets: Asset[] } {
  if (bytes.byteLength > MAX_SIZE) throw new Error('This project file is larger than 100 MB.');
  let declaredSize = 0;
  let entryCount = 0;
  const files = unzipSync(bytes, {
    filter(file) {
      declaredSize += file.originalSize;
      entryCount++;
      if (declaredSize > MAX_SIZE || entryCount > 2002)
        throw new Error('This project archive is too large.');
      return (
        file.name === 'project.json' ||
        file.name === 'assets.json' ||
        /^assets\/[a-zA-Z0-9_-]+$/.test(file.name)
      );
    },
  });
  if (!files['project.json'] || !files['assets.json'])
    throw new Error('This is not a Tier Studio project file.');
  if (Object.values(files).reduce((size, data) => size + data.byteLength, 0) > MAX_SIZE)
    throw new Error('This project archive is too large.');
  const project = parseProject(JSON.parse(strFromU8(files['project.json'])));
  const manifest = assetManifest.parse(JSON.parse(strFromU8(files['assets.json'])));
  if (new Set(manifest.map((asset) => asset.id)).size !== manifest.length)
    throw new Error('Duplicate image IDs in project.');
  const assets = manifest.map((asset) => {
    const data = files[`assets/${asset.id}`];
    if (!data) throw new Error(`Missing image: ${asset.name}`);
    return {
      ...asset,
      projectId: project.id,
      blob: new Blob([new Uint8Array(data)], { type: asset.mime }),
    };
  });
  const available = new Set(assets.map((asset) => asset.id));
  if (Object.values(project.items).some((item) => item.assetId && !available.has(item.assetId)))
    throw new Error('The project references a missing image.');
  return { project, assets };
}

export function copyImportedProject(project: Project, assets: Asset[]) {
  const id = crypto.randomUUID();
  const assetIds = new Map(assets.map((asset) => [asset.id, crypto.randomUUID()]));
  return {
    project: {
      ...project,
      id,
      updatedAt: Date.now(),
      items: Object.fromEntries(
        Object.entries(project.items).map(([key, item]) => [
          key,
          { ...item, assetId: item.assetId ? assetIds.get(item.assetId) : undefined },
        ]),
      ),
    },
    assets: assets.map((asset) => ({ ...asset, id: assetIds.get(asset.id)!, projectId: id })),
  };
}
