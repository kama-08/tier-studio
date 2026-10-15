import { z } from 'zod';
import type { Project } from './schema';

export const appearanceSchema = z.object({
  itemSize: z.number().int().min(48).max(160).default(92),
  itemGap: z.number().int().min(0).max(24).default(8),
  tierPadding: z.number().int().min(0).max(32).default(12),
  tierGap: z.number().int().min(0).max(24).default(7),
  labelWidth: z.number().int().min(48).max(200).default(112),
  labelFontSize: z.number().int().min(12).max(40).default(22),
  labelAlign: z.enum(['left', 'center', 'right']).default('center'),
  labelBold: z.boolean().default(true),
  rowTint: z.boolean().default(false),
  borderStyle: z.enum(['none', 'solid', 'dashed']).default('solid'),
  imageFit: z.enum(['cover', 'contain']).default('cover'),
  itemRadius: z.number().int().min(0).max(32).default(5),
  itemBorder: z.boolean().default(false),
  itemShadow: z.boolean().default(true),
  exportTitle: z.boolean().default(true),
  exportDescription: z.boolean().default(true),
  exportUnranked: z.boolean().default(false),
  exportFooter: z.boolean().default(true),
  exportTransparent: z.boolean().default(false),
  exportWidth: z.union([z.literal(0), z.number().int().min(320).max(4096)]).default(0),
  exportScale: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
});

export type Appearance = z.infer<typeof appearanceSchema>;
export const DEFAULT_APPEARANCE: Appearance = appearanceSchema.parse({});

export function getAppearance(project: Pick<Project, 'appearance'>): Appearance {
  return project.appearance ?? DEFAULT_APPEARANCE;
}
