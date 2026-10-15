import { useEffect, useState } from 'react';
import { projects } from '@/app/services';
import { useNotice } from '@/components/ui/notice';
import { mapConcurrent } from '@/core/async-pool';
import { thumbnailFor } from './thumbnails';

export function useAssetUrls(
  projectId: string,
  revision = 0,
  assetIds?: string[],
  thumbnails = false,
) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = assetIds ? JSON.stringify([...new Set(assetIds)].sort()) : undefined;
  useEffect(() => {
    let disposed = false;
    const created: string[] = [];
    void projects
      .assets(projectId, key ? (JSON.parse(key) as string[]) : undefined)
      .then(async (assets) => {
        if (disposed) return;
        const result = Object.fromEntries(
          await mapConcurrent(assets, 4, async (asset) => {
            const blob = thumbnails ? await thumbnailFor(asset) : asset.blob;
            if (disposed) return [asset.id, ''];
            const url = URL.createObjectURL(blob);
            created.push(url);
            return [asset.id, url];
          }),
        );
        if (!disposed) setUrls(result);
      })
      .catch((error: unknown) => {
        if (!disposed)
          useNotice
            .getState()
            .show(error instanceof Error ? error.message : 'Could not load project images.', true);
      });
    return () => {
      disposed = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [projectId, revision, key, thumbnails]);
  return urls;
}
