import { z } from 'zod';
import { styleSchema, type BoardStyle } from '@/core/style-presets';

const KEY = 'tier-studio.style-presets.v1';
const presetSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(40),
  style: styleSchema,
});
export type SavedStylePreset = z.infer<typeof presetSchema>;

export function loadStylePresets(): SavedStylePreset[] {
  const raw = localStorage.getItem(KEY);
  return raw ? z.array(presetSchema).max(20).parse(JSON.parse(raw)) : [];
}

export function saveStylePreset(name: string, style: BoardStyle): SavedStylePreset[] {
  const presets = loadStylePresets();
  const trimmed = name.trim();
  const existing = presets.find((preset) => preset.name.toLowerCase() === trimmed.toLowerCase());
  const preset = presetSchema.parse({
    id: existing?.id ?? crypto.randomUUID(),
    name: trimmed,
    style,
  });
  const next = existing
    ? presets.map((entry) => (entry.id === existing.id ? preset : entry))
    : [...presets, preset];
  if (next.length > 20)
    throw new Error('You can save up to 20 styles. Delete one before adding another.');
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function deleteStylePreset(id: string): SavedStylePreset[] {
  const next = loadStylePresets().filter((preset) => preset.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
