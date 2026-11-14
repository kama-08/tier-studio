import { create } from 'zustand';
import type { Update } from '@tauri-apps/plugin-updater';
import { saveBeforeDesktopExit } from '@/platform/desktop-shutdown';

type InstallStage = 'download' | 'save' | 'install';
type UpdateStatus =
  | { type: 'idle' | 'checking' | 'current' | 'check-error' }
  | { type: 'available'; update: Update; announce: boolean; downloaded?: boolean }
  | { type: 'installing'; stage: InstallStage; percent: number | null }
  | { type: 'install-error'; update: Update; message: string; downloaded: boolean };

export const isInstallingDesktopUpdate = (status: UpdateStatus) => status.type === 'installing';

let started = false;

export const useDesktopUpdates = create<{
  enabled: boolean;
  status: UpdateStatus;
  start: () => Promise<void>;
  check: (announce?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}>((set, get) => ({
  enabled: false,
  status: { type: 'idle' },
  async start() {
    if (started) return;
    started = true;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      if (await invoke<boolean>('desktop_updates_enabled')) {
        set({ enabled: true });
        await get().check(true);
      }
    } catch (error) {
      console.error('Could not initialize desktop updates.', error);
    }
  },
  async check(announce = false) {
    const { enabled, status } = get();
    if (!enabled || ['checking', 'installing', 'install-error'].includes(status.type)) return;
    set({ status: { type: 'checking' } });
    try {
      if (status.type === 'available') {
        await status.update.close().catch(console.error);
      }
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check({ timeout: 15_000 });
      set({ status: update ? { type: 'available', update, announce } : { type: 'current' } });
    } catch (error) {
      console.error('Could not check for desktop updates.', error);
      set({ status: { type: 'check-error' } });
    }
  },
  async install() {
    const { status } = get();
    if (status.type !== 'available' && status.type !== 'install-error') return;
    const { update } = status;
    let downloaded = status.downloaded ?? false;
    let stage: InstallStage = downloaded ? 'save' : 'download';
    set({ status: { type: 'installing', stage, percent: null } });
    try {
      if (!downloaded) {
        let total = 0;
        let received = 0;
        let percent = 0;
        await update.download(
          (event) => {
            if (stage !== 'download' || get().status.type !== 'installing') return;
            if (event.event === 'Started') total = event.data.contentLength ?? 0;
            if (event.event !== 'Progress' || !total) return;
            received += event.data.chunkLength;
            const next = Math.min(100, Math.floor((received / total) * 100));
            if (next === percent) return;
            percent = next;
            set({ status: { type: 'installing', stage: 'download', percent } });
          },
          { timeout: 120_000 },
        );
        downloaded = true;
      }
      stage = 'save';
      set({ status: { type: 'installing', stage, percent: null } });
      await saveBeforeDesktopExit();
      stage = 'install';
      set({ status: { type: 'installing', stage, percent: null } });
      // On Windows a successful installer launch exits the running process.
      await update.install();
    } catch (error) {
      console.error(`Desktop update failed during ${stage}.`, error);
      const message = {
        download: 'The update could not be downloaded or verified. Try again.',
        save: 'Your project could not be saved. Go back and resolve the save error before updating.',
        install: 'The Windows installer could not start. Try again.',
      }[stage];
      set({ status: { type: 'install-error', update, message, downloaded } });
    }
  },
  dismiss() {
    const { status } = get();
    if (status.type === 'available' || status.type === 'install-error') {
      set({
        status: {
          type: 'available',
          update: status.update,
          downloaded: status.downloaded,
          announce: false,
        },
      });
    }
  },
}));
