// 「?」アイコン。補足説明を常時表示せず、押した（タップした）ときだけ吹き出しで見せる。
// 使い方: 文言の横に ${helpIcon('説明')} を置き、画面の起動時に initHelp() を1回呼ぶ。
import { esc } from './format.js';

const MARGIN = 8; // 画面の端との余白
const GAP = 6; // ボタンと吹き出しの間

export const helpIcon = (text, cls = '') =>
  `<button type="button" class="help-btn${cls ? ` ${cls}` : ''}" data-help="${esc(text)}" aria-label="説明を表示">?</button>`;

// 吹き出しの位置。基本はボタンの下で左をそろえ、はみ出すときは寄せる／上に出す
export function placePopover(rect, size, view) {
  const left = Math.max(MARGIN, Math.min(rect.left, view.w - size.w - MARGIN));
  const below = rect.bottom + GAP;
  const top = below + size.h > view.h - MARGIN ? Math.max(MARGIN, rect.top - size.h - GAP) : below;
  return { left, top };
}

const CSS = `
.help-btn { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; flex: none; width: 1.25rem; height: 1.25rem; margin: 0 .25rem; padding: 0; border-radius: 9999px; border: 1px solid #94a3b8; background: transparent; color: #64748b; font-size: .75rem; font-weight: 700; line-height: 1; cursor: pointer; position: relative; }
.help-btn::after { content: ''; position: absolute; inset: -.5rem; } /* 指で押しやすいよう、見た目より広く反応させる */
.help-btn:hover, .help-btn[aria-expanded="true"] { background: #0f766e; border-color: #0f766e; color: #fff; }
html.dark .help-btn { border-color: #64748b; color: #94a3b8; }
html.dark .help-btn:hover, html.dark .help-btn[aria-expanded="true"] { background: #0d9488; border-color: #0d9488; color: #fff; }
.help-pop { position: fixed; z-index: 9999; max-width: min(22rem, calc(100vw - 16px)); padding: .5rem .75rem; border-radius: .5rem; background: #0f172a; color: #f1f5f9; border: 1px solid #475569; font-size: .8125rem; font-weight: 400; line-height: 1.55; white-space: pre-line; box-shadow: 0 6px 20px rgba(0,0,0,.35); text-align: left; }
`;

let pop = null;
let owner = null;

function close() {
  if (!pop) return;
  pop.remove();
  owner?.setAttribute('aria-expanded', 'false');
  pop = owner = null;
}

function open(btn) {
  close();
  pop = document.createElement('div');
  pop.className = 'help-pop';
  pop.setAttribute('role', 'tooltip');
  pop.textContent = btn.dataset.help;
  pop.style.visibility = 'hidden';
  document.body.appendChild(pop);
  const { width: w, height: h } = pop.getBoundingClientRect();
  const { left, top } = placePopover(btn.getBoundingClientRect(), { w, h }, { w: innerWidth, h: innerHeight });
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.style.visibility = '';
  owner = btn;
  btn.setAttribute('aria-expanded', 'true');
}

// 画面を再描画してもアイコンが効くよう、クリックは document で受ける
let ready = false;
export function initHelp() {
  if (ready) return;
  ready = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  document.addEventListener(
    'click',
    (e) => {
      const btn = e.target.closest?.('.help-btn');
      if (btn) {
        e.preventDefault();
        e.stopPropagation(); // 親のカードやボタンの操作を起こさない
        btn === owner ? close() : open(btn);
      } else if (!e.target.closest?.('.help-pop')) {
        close();
      }
    },
    true,
  );
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  window.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
}
