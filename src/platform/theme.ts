export function setNativeTheme(theme: 'light' | 'dark' | null) {
  if (!('__TAURI_INTERNALS__' in window)) return;
  void import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(theme))
    .catch((error: unknown) => console.error('Could not apply the native window theme.', error));
}
