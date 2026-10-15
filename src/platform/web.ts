import type { FileService, OpenedFile } from './types';

export const webFiles: FileService = {
  openProject() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.tier';
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.addEventListener(
        'change',
        async () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }
          if (file.size > 100 * 1024 * 1024) {
            reject(new Error('Project files must be smaller than 100 MB.'));
            return;
          }
          try {
            const opened: OpenedFile = {
              name: file.name,
              bytes: new Uint8Array(await file.arrayBuffer()),
            };
            resolve(opened);
          } catch (error) {
            reject(error);
          }
        },
        { once: true },
      );
      input.click();
    });
  },
  async saveFile(name, bytes, kind) {
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], {
        type: kind === 'image' ? 'image/png' : 'application/zip',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return true;
  },
};
