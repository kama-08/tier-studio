import { create } from 'zustand';

const SIDEBAR_KEY = 'tier-studio.sidebar.v1';

function readSidebarVisibility() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== 'hidden';
  } catch {
    return true;
  }
}

export const useSidebarStore = create<{
  visible: boolean;
  toggle: () => void;
}>((set, get) => ({
  visible: readSidebarVisibility(),
  toggle: () => {
    const visible = !get().visible;
    set({ visible });
    try {
      localStorage.setItem(SIDEBAR_KEY, visible ? 'visible' : 'hidden');
    } catch {
      // The toggle still works when persistent storage is unavailable.
    }
  },
}));
