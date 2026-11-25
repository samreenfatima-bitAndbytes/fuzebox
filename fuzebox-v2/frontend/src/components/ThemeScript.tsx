/**
 * Inline before paint to reduce theme flash on load.
 */
export function ThemeScript() {
  const script = `
(function() {
  try {
    var raw = localStorage.getItem('fuzebox_shell_prefs');
    var mode = 'light';
    if (raw) {
      var p = JSON.parse(raw);
      if (p.themeMode === 'light' || p.themeMode === 'dark' || p.themeMode === 'system') {
        mode = p.themeMode;
      }
    }
    var resolved = mode;
    if (mode === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
  } catch (e) {}
})();
`;
  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
