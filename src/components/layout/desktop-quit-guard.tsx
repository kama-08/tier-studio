import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { flushEditor } from '@/features/editor/editor-store';
import { waitForOperations } from '@/services/operations';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function DesktopQuitGuard() {
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const quit = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    // Inputs commit on blur, so include the last typed title/description.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setStatus('saving');
    try {
      await waitForOperations();
      await flushEditor();
      await invoke('complete_quit');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
      await invoke('cancel_quit').catch(console.error);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen('tier-studio:quit-requested', () => {
      if (!disposed) void quit();
    })
      .then(async (stop) => {
        if (disposed) {
          stop();
          return;
        }
        unlisten = stop;
        await invoke('quit_ready');
      })
      .catch(console.error);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [quit]);

  return (
    <Dialog
      open={status !== 'idle'}
      title={status === 'error' ? 'Your changes haven’t saved' : 'Saving before quitting…'}
      onClose={() => {
        if (status === 'error') setStatus('idle');
      }}
    >
      {status === 'error' ? (
        <>
          <p role="alert">{error}</p>
          <p className="dialog-help">
            Stay in the app to save a project copy or resolve the error.
          </p>
          <div className="dialog-actions">
            <Button onClick={() => setStatus('idle')}>Stay in app</Button>
            <Button variant="primary" onClick={() => void quit()}>
              Retry and quit
            </Button>
          </div>
        </>
      ) : (
        <p className="text-secondary">Waiting for your files and latest edits to finish saving.</p>
      )}
    </Dialog>
  );
}
