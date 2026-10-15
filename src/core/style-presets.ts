import { z } from 'zod';
import { appearanceSchema, DEFAULT_APPEARANCE } from './appearance';
import { itemShapeSchema } from './schema';
import { TIER_COLORS } from './project';

export const styleSchema = z.object({
  appearance: appearanceSchema,
  itemShape: itemShapeSchema,
  colors: z
    .array(z.string().regex(/^#[0-9a-f]{6}$/i))
    .min(1)
    .max(30),
});
export type BoardStyle = z.infer<typeof styleSchema>;

export const COLOR_PALETTES = [
  { name: 'Classic', colors: TIER_COLORS },
  { name: 'Vibrant', colors: ['#fb7185', '#fb923c', '#facc15', '#a3e635', '#38bdf8', '#c084fc'] },
  {
    name: 'Monochrome',
    colors: ['#e4e4e7', '#d4d4d8', '#a1a1aa', '#91919a', '#81818b', '#71717a'],
  },
];

export const STYLE_PRESETS: { name: string; description: string; style: BoardStyle }[] = [
  {
    name: 'Compact',
    description: 'Small tiles, less spacing',
    style: {
      appearance: {
        ...DEFAULT_APPEARANCE,
        itemSize: 64,
        itemGap: 4,
        tierPadding: 8,
        tierGap: 4,
        labelWidth: 80,
        labelFontSize: 18,
      },
      itemShape: 'square',
      colors: TIER_COLORS,
    },
  },
  {
    name: 'Standard',
    description: 'The original layout',
    style: { appearance: DEFAULT_APPEARANCE, itemShape: 'square', colors: TIER_COLORS },
  },
  {
    name: 'Showcase',
    description: 'Larger tiles, more breathing room',
    style: {
      appearance: {
        ...DEFAULT_APPEARANCE,
        itemSize: 120,
        itemGap: 12,
        tierPadding: 16,
        tierGap: 12,
        labelWidth: 128,
        labelFontSize: 24,
        itemRadius: 10,
      },
      itemShape: 'square',
      colors: TIER_COLORS,
    },
  },
];
