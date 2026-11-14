import { beforeEach, describe, expect, it, vi } from 'vitest';
import { check, Update } from '@tauri-apps/plugin-updater';
import { saveBeforeDesktopExit } from '@/platform/desktop-shutdown';
import { useDesktopUpdates } from './desktop-updates';

vi.mock('@tauri-apps/plugin-updater', async (original) => ({
  ...(await original<typeof import('@tauri-apps/plugin-updater')>()),
  check: vi.fn<typeof check>(),
}));
vi.mock('@/platform/desktop-shutdown', () => ({
  saveBeforeDesktopExit: vi.fn<typeof saveBeforeDesktopExit>(),
}));

describe('desktop update installation', () => {
  const download = vi.fn<Update['download']>();
  const install = vi.fn<Update['install']>();
  const close = vi.fn<Update['close']>();
  const update = Object.assign(
    new Update({ rid: 1, version: '1.0.0', currentVersion: '0.2.0', rawJson: {} }),
    { download, install, close },
  );

  beforeEach(() => {
    vi.resetAllMocks();
    useDesktopUpdates.setState({ enabled: true, status: { type: 'idle' } });
    vi.mocked(check).mockResolvedValue(update);
  });

  it('announces an update at startup and keeps it available after dismissal', async () => {
    await useDesktopUpdates.getState().check(true);
    const { status, dismiss } = useDesktopUpdates.getState();
    expect(status).toEqual({ type: 'available', update, announce: true });
    dismiss();
    expect(useDesktopUpdates.getState().status).toEqual({
      type: 'available',
      update,
      announce: false,
    });
    expect(download).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });

  it('keeps the installer closed until the editor finishes saving', async () => {
    const save = Promise.withResolvers<void>();
    const saving = Promise.withResolvers<void>();
    vi.mocked(saveBeforeDesktopExit).mockImplementation(() => {
      saving.resolve();
      return save.promise;
    });
    await useDesktopUpdates.getState().check();
    const applying = useDesktopUpdates.getState().install();
    await saving.promise;
    expect(download).toHaveBeenCalledOnce();
    expect(install).not.toHaveBeenCalled();
    await useDesktopUpdates.getState().install();
    save.resolve();
    await applying;
    expect(install).toHaveBeenCalledOnce();
  });

  it('allows retrying a save failure without starting the installer early', async () => {
    vi.mocked(saveBeforeDesktopExit).mockRejectedValueOnce(new Error('Storage full'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await useDesktopUpdates.getState().check();
      await useDesktopUpdates.getState().install();
      expect(install).not.toHaveBeenCalled();
      expect(useDesktopUpdates.getState().status).toMatchObject({ type: 'install-error' });
      await useDesktopUpdates.getState().install();
      expect(install).toHaveBeenCalledOnce();
      expect(download).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });
});
