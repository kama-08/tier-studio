import { useEffect } from 'react';
import { create } from 'zustand';
import { Check, X, AlertCircle } from 'lucide-react';
import { Button } from './button';

export const useNotice = create<{
  message: string;
  error: boolean;
  show: (message: string, error?: boolean) => void;
  clear: () => void;
}>((set) => ({
  message: '',
  error: false,
  show: (message, error = false) => set({ message, error }),
  clear: () => set({ message: '' }),
}));

export function Notice() {
  const { message, error, clear } = useNotice();
  useEffect(() => {
    if (!message || error) return;
    const timeout = setTimeout(clear, 4500);
    return () => clearTimeout(timeout);
  }, [message, error, clear]);
  if (!message) return null;
  return (
    <div role={error ? 'alert' : 'status'} className={`notice ${error ? 'notice-error' : ''}`}>
      {error ? <AlertCircle size={18} /> : <Check size={18} />}
      <span>{message}</span>
      <Button variant="ghost" size="icon" aria-label="Dismiss notification" onClick={clear}>
        <X size={16} />
      </Button>
    </div>
  );
}
