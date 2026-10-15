import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import type { FileService } from './types';

export const desktopFiles: FileService = {
  async openProject() {
    const path = await open({
      multiple: false,
      filters: [{ name: 'Tier Studio project', extensions: ['tier'] }],
    });
    if (!path) return null;
    return { name: path.split(/[\\/]/).at(-1) ?? 'project.tier', bytes: await readFile(path) };
  },
  async saveFile(name, bytes, kind) {
    const path = await save({
      defaultPath: name,
      filters: [
        {
          name: kind === 'image' ? 'PNG image' : 'Tier Studio project',
          extensions: [kind === 'image' ? 'png' : 'tier'],
        },
      ],
    });
    if (!path) return false;
    await writeFile(path, bytes);
    return true;
  },
};
