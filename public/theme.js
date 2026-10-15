(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('tier-studio.theme.v1');
    if (saved === 'light' || saved === 'dark' || saved === 'system') preference = saved;
  } catch {
    // Storage may be unavailable; the system theme still works for this session.
  }
  const theme =
    preference === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#18181b' : '#f7f7f2');
})();
