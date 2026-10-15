import { z } from 'zod';
import { appearanceSchema } from './appearance';

export const POOL_ID = 'unranked';
export const ITEM_SHAPES = ['square', 'vertical', 'horizontal', 'circle', 'original'] as const;
export const itemShapeSchema = z.enum(ITEM_SHAPES);
export type ItemShape = z.infer<typeof itemShapeSchema>;
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .refine(
    (value) => !['__proto__', 'constructor', 'prototype'].includes(value),
    'Reserved identifier.',
  );

const itemSchema = z.object({
  id,
  name: z.string().min(1).max(160),
  color,
  assetId: id.optional(),
});

export const projectSchema = z
  .object({
    version: z.literal(1),
    id,
    title: z.string().min(1).max(160),
    description: z.string().max(500),
    itemShape: itemShapeSchema.optional(),
    appearance: appearanceSchema.optional(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    tiers: z
      .array(z.object({ id, label: z.string().min(1).max(40), color, itemIds: z.array(id) }))
      .min(1)
      .max(30),
    items: z.record(id, itemSchema),
    unranked: z.array(id),
  })
  .superRefine((project, context) => {
    const tierIds = project.tiers.map((tier) => tier.id);
    const placements = [...project.unranked, ...project.tiers.flatMap((tier) => tier.itemIds)];
    const itemIds = Object.keys(project.items);
    if (tierIds.includes(POOL_ID) || new Set(tierIds).size !== tierIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Tier IDs must be unique and cannot use the pool ID.',
      });
    }
    if (itemIds.length > 2000) {
      context.addIssue({ code: 'custom', message: 'A project can contain at most 2,000 items.' });
    }
    if (
      placements.length !== itemIds.length ||
      new Set(placements).size !== placements.length ||
      placements.some((key) => !Object.hasOwn(project.items, key))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Every item must appear exactly once in a tier or the unranked pool.',
      });
    }
    if (itemIds.some((key) => key !== project.items[key].id)) {
      context.addIssue({ code: 'custom', message: 'Item IDs must match their record keys.' });
    }
  });

export type Project = z.infer<typeof projectSchema>;
export type TierItem = z.infer<typeof itemSchema>;
export type Placements = Record<string, string[]>;

export function parseProject(input: unknown): Project {
  return projectSchema.parse(input);
}
