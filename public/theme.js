const theme = document.getElementById('theme-toggle');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const root = document.documentElement;

function updateThemeButton() {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : systemTheme.matches;
  theme.setAttribute('aria-pressed', String(dark));
  theme.textContent = dark ? '라이트' : '다크';
  theme.title = dark ? '라이트 모드로 전환' : '다크 모드로 전환';
}
theme.addEventListener('click', () => {
  const next = theme.getAttribute('aria-pressed') === 'true' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('frachalab-theme', next); } catch {}
  updateThemeButton();
});
systemTheme.addEventListener('change', updateThemeButton);
updateThemeButton();
