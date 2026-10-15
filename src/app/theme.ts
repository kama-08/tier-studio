import { useEffect } from 'react';
import { create } from 'zustand';
import { setNativeTheme } from '@/platform/theme';

export type ThemePreference = 'light' | 'dark' | 'system';
type Theme = 'light' | 'dark';
const STORAGE_KEY = 'tier-studio.theme.v1';
const SYSTEM_QUERY = '(prefers-color-scheme: dark)';

function parsePreference(value: string | null | undefined): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function resolveTheme(preference: ThemePreference): Theme {
  return preference === 'system'
    ? window.matchMedia(SYSTEM_QUERY).matches
      ? 'dark'
      : 'light'
    : preference;
}

function applyTheme(preference: ThemePreference): Theme {
  const theme = resolveTheme(preference);
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#18181b' : '#f7f7f2');
  setNativeTheme(preference === 'system' ? null : theme);
  return theme;
}

const initialPreference = parsePreference(document.documentElement.dataset.themePreference);

export const useThemeStore = create<{
  preference: ThemePreference;
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
}>((set) => ({
  preference: initialPreference,
  theme: resolveTheme(initialPreference),
  setPreference: (preference) => {
    const theme = applyTheme(preference);
    set({ preference, theme });
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Keep the selected theme usable even when persistent storage is blocked.
    }
  },
}));

export function useThemeSynchronization() {
  useEffect(() => {
    function synchronize(preference: ThemePreference) {
      useThemeStore.setState({ preference, theme: applyTheme(preference) });
    }
    function systemChanged() {
      if (useThemeStore.getState().preference === 'system') synchronize('system');
    }
    function storageChanged(event: StorageEvent) {
      if (event.key === STORAGE_KEY || event.key === null)
        synchronize(parsePreference(event.newValue));
    }
    const system = window.matchMedia(SYSTEM_QUERY);
    synchronize(useThemeStore.getState().preference);
    system.addEventListener('change', systemChanged);
    window.addEventListener('storage', storageChanged);
    return () => {
      system.removeEventListener('change', systemChanged);
      window.removeEventListener('storage', storageChanged);
    };
  }, []);
}
