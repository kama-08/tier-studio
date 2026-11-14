import { flushEditor } from '@/features/editor/editor-store';
import { waitForOperations } from '@/services/operations';

export async function saveBeforeDesktopExit(): Promise<void> {
  // The editor commits the title on blur. Include the last typed value.
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && !focused.closest('dialog')) focused.blur();
  await waitForOperations();
  await flushEditor();
}
