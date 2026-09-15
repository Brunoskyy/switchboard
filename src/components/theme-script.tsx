/**
 * Applies the stored theme before first paint.
 *
 * This has to run as a blocking inline script: if we waited for React to
 * hydrate, a dark-mode user would get a white flash on every navigation that
 * hits the server. The script is tiny, has no dependencies, and is the only
 * place in the app allowed to touch the DOM outside React.
 */
const SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem('sb-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored ? stored === 'dark' : prefersDark;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {
    // Private mode or blocked storage: fall back to the light theme.
  }
})();
`

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
}
