// ライト／ダークモード。初回は端末の設定に従い、切り替えは localStorage に保存する（3つの画面で共有）。
import { icon } from './icons.js';
const KEY = 'rq-theme';
const root = document.documentElement;

const saved = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const isDark = () => root.classList.contains('dark');

function apply(dark) {
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

export function initTheme() {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  apply(saved() ? saved() === 'dark' : media.matches);
  media.addEventListener('change', (e) => !saved() && apply(e.matches));

  // 画面を再描画してもボタンが効くよう、クリックは document で受ける
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-theme-toggle]')) return;
    const next = !isDark();
    apply(next);
    try {
      localStorage.setItem(KEY, next ? 'dark' : 'light');
    } catch {
      // 保存できなくても切り替えは有効（モック）
    }
  });
  // 他のタブでの切り替えにも追従する
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) apply(e.newValue === 'dark');
  });
}

// 切り替えボタン（ライト時は月、ダーク時は太陽をCSSで出し分け）
export const themeToggleHtml = (cls = '') =>
  `<button data-theme-toggle class="theme-btn ${cls}" aria-label="ダークモード切り替え" title="ダークモード切り替え"><span class="theme-moon">${icon('moon', 22)}</span><span class="theme-sun">${icon('sun', 22)}</span></button>`;
