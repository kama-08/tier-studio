import { useEffect, useState } from 'react';
import { HardDrive, ShieldCheck, FolderOpen, Check, Palette, Monitor } from 'lucide-react';
import { projects, isDesktop } from '@/app/services';
import { Button } from '@/components/ui/button';
import { useNotice } from '@/components/ui/notice';
import { ThemeOptions, ThemeToggle } from '@/components/ui/theme-controls';
import { SidebarToggle } from '@/components/ui/sidebar-toggle';
import { DesktopDownloadButton } from '@/components/ui/desktop-download';

export function SettingsPage() {
  const [count, setCount] = useState<number | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [busy, setBusy] = useState(false);
  const show = useNotice((state) => state.show);
  useEffect(() => {
    void projects
      .list()
      .then((list) => setCount(list.length))
      .catch(() => show('Could not read local storage.', true));
    void navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => {});
  }, [show]);
  async function keepStorage() {
    setBusy(true);
    try {
      const result = await navigator.storage.persist();
      setPersisted(result);
      show(
        result
          ? 'Your browser will keep this app’s storage.'
          : 'Your browser manages storage automatically. Keep project file backups, too.',
        !result,
      );
    } catch {
      show('Your browser could not enable persistent storage.', true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="page-topbar">
        <div className="topbar-leading">
          <SidebarToggle />
          <span>Workspace / Settings</span>
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
        </div>
      </header>
      <div className="settings-page">
        <div className="workspace-heading">
          <div>
            <h1>Settings</h1>
            <p>Manage your appearance, storage, and desktop app.</p>
          </div>
        </div>
        <section className="settings-card">
          <Palette size={22} aria-hidden="true" />
          <div className="appearance-settings">
            <h2>Appearance</h2>
            <p>Choose a theme, or follow your device’s appearance.</p>
            <ThemeOptions />
          </div>
        </section>
        <section className="settings-card">
          <HardDrive size={22} aria-hidden="true" />
          <div>
            <h2>Saved on this device</h2>
            <p>
              {count === null
                ? 'Reading your library…'
                : `${count} ${count === 1 ? 'project lives' : 'projects live'} here.`}{' '}
              Your browser and desktop libraries are separate. Move projects between them with a
              .tier file.
            </p>
          </div>
        </section>
        {!isDesktop && typeof navigator.storage?.persist === 'function' ? (
          <section className="settings-card">
            <ShieldCheck size={22} aria-hidden="true" />
            <div>
              <h2>Keep local storage</h2>
              <p>
                Ask your browser to keep your projects when it makes room for other sites. Export
                important projects for a backup.
              </p>
              <Button
                className="mt-4"
                disabled={persisted || busy}
                onClick={() => void keepStorage()}
              >
                {persisted ? (
                  <>
                    <Check size={16} /> Storage protected
                  </>
                ) : (
                  'Keep my projects on this device'
                )}
              </Button>
            </div>
          </section>
        ) : null}
        <section className="settings-card">
          <FolderOpen size={22} aria-hidden="true" />
          <div>
            <h2>Project files and backups</h2>
            <p>
              “Save project” in the editor creates a .tier file with your tiers and images. Import
              it on another device to keep editing. “Export PNG” makes an image of the ranked board.
            </p>
          </div>
        </section>
        {!isDesktop ? (
          <section className="settings-card">
            <Monitor size={22} aria-hidden="true" />
            <div>
              <h2>Desktop app</h2>
              <p>Download Tier Studio for Windows. Move your projects with a .tier file.</p>
              <DesktopDownloadButton />
            </div>
          </section>
        ) : null}
        <p className="settings-version">Tier Studio · v0.1</p>
      </div>
    </>
  );
}
