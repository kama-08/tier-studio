import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './button';
import { DesktopTitlebarHost } from '@/components/layout/desktop-frame';

export function Dialog({
  open,
  onClose,
  title,
  children,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) {
      ref.current?.showModal();
      ref.current?.querySelector<HTMLInputElement>('input, textarea')?.focus();
    }
    if (!open && ref.current?.open) ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className={`app-dialog ${className}`}
    >
      <DesktopTitlebarHost open={open} />
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl">{title}</h2>
        <Button variant="ghost" size="icon" aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
