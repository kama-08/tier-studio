import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createProject } from '@/core/project';
import { copyImportedProject, packProject, unpackProject } from './archive';
import type { Asset } from '@/services/storage/database';
import { DEFAULT_APPEARANCE } from '@/core/appearance';

describe('portable projects', () => {
  it('preserves the document and image bytes through a round trip', async () => {
    const project = createProject('Favorites');
    project.itemShape = 'original';
    project.appearance = {
      ...DEFAULT_APPEARANCE,
      itemSize: 120,
      imageFit: 'contain',
      rowTint: true,
      exportTransparent: true,
      exportUnranked: true,
    };
    project.items.item = { id: 'item', name: 'Picture', color: '#aabbcc', assetId: 'image' };
    project.unranked.push('item');
    const assets: Asset[] = [
      {
        id: 'image',
        name: 'picture.png',
        projectId: project.id,
        mime: 'image/png',
        blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
      },
    ];
    const restored = unpackProject(await packProject(project, assets));
    expect(restored.project).toEqual(project);
    expect(new Uint8Array(await restored.assets[0].blob.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
    const copy = copyImportedProject(restored.project, restored.assets);
    expect(copy.project.id).not.toBe(project.id);
    expect(copy.project.appearance).toEqual(project.appearance);
    expect(copy.assets[0].projectId).toBe(copy.project.id);
    expect(copy.project.items.item.assetId).toBe(copy.assets[0].id);
    expect(copy.assets[0].id).not.toBe('image');
  });

  it('refuses an export with missing images instead of silently losing them', async () => {
    const project = createProject();
    project.items.item = { id: 'item', name: 'Picture', color: '#aabbcc', assetId: 'missing' };
    project.unranked.push('item');
    await expect(packProject(project, [])).rejects.toThrow('missing');
  });

  it('rejects unsupported project versions and a missing archive manifest', () => {
    const invalid = zipSync({
      'project.json': strToU8(JSON.stringify({ ...createProject(), version: 2 })),
      'assets.json': strToU8('[]'),
    });
    expect(() => unpackProject(invalid)).toThrow(/version/);
    expect(() => unpackProject(zipSync({ 'project.json': strToU8('{}') }))).toThrow(
      'not a Tier Studio',
    );
  });
});
