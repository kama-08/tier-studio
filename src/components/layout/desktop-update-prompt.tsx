import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useDesktopUpdates } from '@/app/desktop-updates';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export function DesktopUpdatePrompt() {
  const { status, start, install, dismiss } = useDesktopUpdates();
  useEffect(() => {
    void start();
  }, [start]);

  const isInstalling = status.type === 'installing';
  const hasError = status.type === 'install-error';

  return (
    <>
      {status.type === 'available' && status.announce ? (
        <section className="update-notice" aria-label="Desktop update">
          <output className="update-notice-heading">
            <RefreshCw size={16} aria-hidden="true" />
            <strong>Tier Studio v{status.update.version} is available</strong>
          </output>
          <p>Tier Studio will save your changes and restart when you install the update.</p>
          <div className="update-notice-actions">
            <Button variant="primary" size="sm" onClick={() => void install()}>
              Install update
            </Button>
            <Button variant="ghost" size="sm" onClick={dismiss}>
              Later
            </Button>
          </div>
        </section>
      ) : null}
      <Dialog
        open={isInstalling || hasError}
        title={hasError ? 'Update paused' : 'Updating Tier Studio'}
        dismissible={!isInstalling}
        onClose={() => {
          if (hasError) dismiss();
        }}
      >
        {hasError ? (
          <>
            <p role="alert">{status.message}</p>
            <div className="dialog-actions">
              <Button onClick={dismiss}>Back to app</Button>
              <Button variant="primary" onClick={() => void install()}>
                Retry update
              </Button>
            </div>
          </>
        ) : null}
        {isInstalling ? (
          <>
            <output className="block text-secondary">
              {status.stage === 'download' && 'Downloading and verifying the update…'}
              {status.stage === 'save' && 'Saving your latest changes…'}
              {status.stage === 'install' && 'Starting the Windows installer…'}
            </output>
            {status.stage === 'download' ? (
              <progress
                aria-label="Update download progress"
                className="mt-4 w-full"
                max={100}
                value={status.percent ?? undefined}
              />
            ) : null}
          </>
        ) : null}
      </Dialog>
    </>
  );
}
