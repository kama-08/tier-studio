import { RefreshCw } from 'lucide-react';
import { useDesktopUpdates } from '@/app/desktop-updates';
import { Button } from '@/components/ui/button';

export function DesktopUpdateSettings() {
  const { enabled, status, check, install } = useDesktopUpdates();
  if (!enabled) return null;

  const checking = status.type === 'checking';
  const available = status.type === 'available';
  const busy = status.type === 'installing' || status.type === 'install-error';

  return (
    <section className="settings-card">
      <RefreshCw size={22} aria-hidden="true" />
      <div>
        <h2>Desktop updates</h2>
        <output className="block text-secondary">
          {checking && 'Checking for a new version…'}
          {status.type === 'idle' && 'Tier Studio checks for updates when it starts.'}
          {status.type === 'current' && 'Tier Studio is up to date.'}
          {status.type === 'check-error' && 'Could not check for updates. Try again.'}
          {available &&
            `Tier Studio v${status.update.version} is available. The app will restart after installation.`}
        </output>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={checking || busy} onClick={() => void check()}>
            Check for updates
          </Button>
          {available ? (
            <Button variant="primary" onClick={() => void install()}>
              Install update
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
