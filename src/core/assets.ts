import type { Project } from './schema';

export function assetIdsForItems(project: Project, itemIds = Object.keys(project.items)): string[] {
  return [
    ...new Set(
      itemIds.flatMap((id) => (project.items[id]?.assetId ? [project.items[id].assetId!] : [])),
    ),
  ];
}
