import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useSidebarStore } from '@/app/layout';
import { Button } from './button';

export function SidebarToggle() {
  const visible = useSidebarStore((state) => state.visible);
  const toggle = useSidebarStore((state) => state.toggle);
  const label = visible ? 'Hide sidebar' : 'Show sidebar';
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      aria-controls="app-sidebar"
      aria-expanded={visible}
      onClick={toggle}
    >
      {visible ? (
        <PanelLeftClose size={18} aria-hidden="true" />
      ) : (
        <PanelLeftOpen size={18} aria-hidden="true" />
      )}
    </Button>
  );
}
