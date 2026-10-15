import { ITEM_COLORS } from '@/core/project';
import type { TierItem } from '@/core/schema';
import type { Asset } from '@/services/storage/database';
import { mapConcurrent } from '@/core/async-pool';

export async function importImages(
  files: File[],
  projectId: string,
): Promise<{ items: TierItem[]; assets: Asset[] }> {
  const supported = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  for (const file of files) {
    if (!supported.has(file.type))
      throw new Error(`${file.name}: choose a PNG, JPEG, WebP, or GIF image.`);
    if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
  }
  const imported = await mapConcurrent(files, 4, async (file, index) => {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const size = Math.min(512, Math.max(image.naturalWidth, image.naturalHeight));
      const ratio = size / Math.max(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image processing is unavailable in this browser.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) =>
            result ? resolve(result) : reject(new Error(`Could not read ${file.name}.`)),
          'image/png',
        ),
      );
      const assetId = crypto.randomUUID();
      const item: TierItem = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 160) || 'Untitled image',
        color: ITEM_COLORS[index % ITEM_COLORS.length],
        assetId,
      };
      const asset: Asset = {
        id: assetId,
        projectId,
        name: file.name.slice(0, 200),
        mime: blob.type,
        blob,
      };
      return { item, asset };
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  return {
    items: imported.map((entry) => entry.item),
    assets: imported.map((entry) => entry.asset),
  };
}
