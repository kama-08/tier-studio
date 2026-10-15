import type { Asset } from '@/services/storage/database';
import { projects } from '@/app/services';

export async function thumbnailFor(asset: Asset): Promise<Blob> {
  if (asset.thumbnail) return asset.thumbnail;
  const url = URL.createObjectURL(asset.blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ratio = Math.min(1, 96 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d');
    if (!context) return asset.blob;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const thumbnail = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!thumbnail) return asset.blob;
    // Update only the cache field: a concurrent delete must never resurrect an asset.
    await projects.database.assets.update(asset.id, { thumbnail }).catch(() => {});
    return thumbnail;
  } catch {
    return asset.blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
