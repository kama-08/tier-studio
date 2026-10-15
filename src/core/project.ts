import { POOL_ID, type Placements, type Project } from './schema';

export const TIER_COLORS = ['#eea194', '#edba8d', '#e7ce89', '#c1cfab', '#a8c9c5', '#bcb6d8'];
export const ITEM_COLORS = ['#d8dfc6', '#e8cfc0', '#c6d7df', '#ddd0e5', '#eedba9', '#c9d9d2'];

export function createProject(title = 'Untitled ranking'): Project {
  const now = Date.now();
  return {
    version: 1,
    id: crypto.randomUUID(),
    title,
    description: '',
    itemShape: 'square',
    createdAt: now,
    updatedAt: now,
    tiers: ['S', 'A', 'B', 'C', 'D'].map((label, index) => ({
      id: crypto.randomUUID(),
      label,
      color: TIER_COLORS[index],
      itemIds: [],
    })),
    items: {},
    unranked: [],
  };
}

export function createSampleProject(): Project {
  const project = createProject('The little things');
  project.description = 'An entirely subjective ranking of everyday joys.';
  const names = [
    'Slow mornings',
    'Fresh coffee',
    'Rainy days',
    'Good books',
    'Long walks',
    'Movie nights',
    'New places',
    'Warm cookies',
    'Sunday naps',
    'House plants',
    'Ocean air',
    'Old playlists',
  ];
  names.forEach((name, index) => {
    const id = crypto.randomUUID();
    project.items[id] = { id, name, color: ITEM_COLORS[index % ITEM_COLORS.length] };
    if (index < 2) project.tiers[0].itemIds.push(id);
    else if (index < 5) project.tiers[1].itemIds.push(id);
    else if (index < 7) project.tiers[2].itemIds.push(id);
    else project.unranked.push(id);
  });
  return project;
}

export function getPlacements(project: Project): Placements {
  return Object.fromEntries([
    ...project.tiers.map((tier) => [tier.id, tier.itemIds]),
    [POOL_ID, project.unranked],
  ]);
}

export function countRanked(project: Project): number {
  return Object.keys(project.items).length - project.unranked.length;
}
