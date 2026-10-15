import { enablePatches, produceWithPatches } from 'immer';
import type { Appearance } from './appearance';
import type { BoardStyle } from './style-presets';
import {
  POOL_ID,
  parseProject,
  type ItemShape,
  type Placements,
  type Project,
  type TierItem,
} from './schema';

enablePatches();

export type Command =
  | { type: 'rename'; title: string }
  | { type: 'describe'; description: string }
  | { type: 'set-item-shape'; shape: ItemShape }
  | { type: 'set-appearance'; appearance: Appearance }
  | { type: 'apply-style'; style: BoardStyle }
  | { type: 'apply-palette'; colors: string[] }
  | { type: 'add-items'; items: TierItem[] }
  | { type: 'remove-item'; id: string }
  | { type: 'move-item'; id: string; target: string; index?: number }
  | { type: 'place-items'; placements: Placements }
  | { type: 'edit-tier'; id: string; label: string; color: string }
  | { type: 'add-tier'; id: string; label: string; color: string }
  | { type: 'remove-tier'; id: string }
  | { type: 'move-tier'; id: string; direction: -1 | 1 }
  | { type: 'reset' };

export function applyCommand(project: Project, command: Command) {
  const [document, patches, inversePatches] = produceWithPatches(project, (draft) => {
    switch (command.type) {
      case 'rename':
        draft.title = command.title.trim() || 'Untitled ranking';
        break;
      case 'describe':
        draft.description = command.description;
        break;
      case 'set-item-shape':
        draft.itemShape = command.shape;
        break;
      case 'set-appearance':
        draft.appearance = command.appearance;
        break;
      case 'apply-style':
        draft.appearance = command.style.appearance;
        draft.itemShape = command.style.itemShape;
        draft.tiers.forEach((tier, index) => {
          tier.color = command.style.colors[index % command.style.colors.length];
        });
        break;
      case 'apply-palette':
        draft.tiers.forEach((tier, index) => {
          tier.color = command.colors[index % command.colors.length];
        });
        break;
      case 'add-items':
        for (const item of command.items) {
          if (Object.hasOwn(draft.items, item.id)) throw new Error('This item already exists.');
          draft.items[item.id] = item;
          draft.unranked.push(item.id);
        }
        break;
      case 'remove-item':
        delete draft.items[command.id];
        draft.unranked = draft.unranked.filter((id) => id !== command.id);
        for (const tier of draft.tiers)
          tier.itemIds = tier.itemIds.filter((id) => id !== command.id);
        break;
      case 'move-item': {
        if (!Object.hasOwn(draft.items, command.id)) throw new Error('Item not found.');
        const target =
          command.target === POOL_ID
            ? draft.unranked
            : draft.tiers.find((tier) => tier.id === command.target)?.itemIds;
        if (!target) throw new Error('Tier not found.');
        for (const list of [draft.unranked, ...draft.tiers.map((tier) => tier.itemIds)]) {
          const index = list.indexOf(command.id);
          if (index >= 0) list.splice(index, 1);
        }
        target.splice(
          Math.max(0, Math.min(command.index ?? target.length, target.length)),
          0,
          command.id,
        );
        break;
      }
      case 'place-items':
        for (const tier of draft.tiers) {
          const ids = command.placements[tier.id];
          if (!ids) throw new Error('Missing tier placement.');
          if (tier.itemIds.join('\0') !== ids.join('\0')) tier.itemIds = ids;
        }
        if (!command.placements[POOL_ID]) throw new Error('Missing unranked placement.');
        if (draft.unranked.join('\0') !== command.placements[POOL_ID].join('\0'))
          draft.unranked = command.placements[POOL_ID];
        break;
      case 'edit-tier': {
        const tier = draft.tiers.find((entry) => entry.id === command.id);
        if (!tier) throw new Error('Tier not found.');
        tier.label = command.label.trim() || tier.label;
        tier.color = command.color;
        break;
      }
      case 'add-tier':
        draft.tiers.push({
          id: command.id,
          label: command.label,
          color: command.color,
          itemIds: [],
        });
        break;
      case 'remove-tier': {
        if (draft.tiers.length === 1) throw new Error('Keep at least one tier.');
        const tier = draft.tiers.find((entry) => entry.id === command.id);
        if (tier) draft.unranked.push(...tier.itemIds);
        draft.tiers = draft.tiers.filter((entry) => entry.id !== command.id);
        break;
      }
      case 'move-tier': {
        const index = draft.tiers.findIndex((tier) => tier.id === command.id);
        const next = index + command.direction;
        if (index >= 0 && next >= 0 && next < draft.tiers.length) {
          [draft.tiers[index], draft.tiers[next]] = [draft.tiers[next], draft.tiers[index]];
        }
        break;
      }
      case 'reset':
        for (const tier of draft.tiers) {
          draft.unranked.push(...tier.itemIds);
          tier.itemIds = [];
        }
        break;
    }
  });
  if (patches.length) parseProject(document);
  return { document, patches, inversePatches };
}
