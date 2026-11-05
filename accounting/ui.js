// 経理部の画面で共通の小さな部品
import { yen } from '../src/format.js';

export const LEVEL = { danger: 'bg-rose-100 text-rose-700', warn: 'bg-amber-100 text-amber-800', info: 'bg-slate-100 text-slate-600' };
export const signed = (n) => (n ? `${n > 0 ? '+' : '−'}${yen(Math.abs(n))}` : '一致');
export const signedYen = (n) => (n < 0 ? `−${yen(-n)}` : yen(n));
export const badge = (cls, text) => `<span class="rounded px-2 py-0.5 text-xs font-bold whitespace-normal ${cls}">${text}</span>`;
export const card = (label, value, cls = '') => `<div class="rounded-xl bg-white border p-3 flex-1 min-w-[10rem]"><div class="text-xs text-slate-500">${label}</div><div class="text-2xl font-bold ${cls}">${value}</div></div>`;
export const md = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
export const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];
export const mdw = (date) => `${md(date)}（${WEEKDAY[new Date(`${date}T00:00:00`).getDay()]}）`;

// 画像のサムネイル（押すと拡大表示）。src はそのまま画面の data-zoom の中の img から読む
export const thumb = (src, alt, cls = 'h-12') => `<button class="rounded border border-slate-300 hover:ring-2 hover:ring-teal-500 cursor-zoom-in overflow-hidden" data-zoom aria-label="${alt}を拡大して見る" title="クリックで拡大"><img src="${src}" alt="${alt}" class="${cls} block" /></button>`;
// 拡大表示（外側・✕・Escで閉じる）
export const zoomView = (z) => `<div class="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-label="${z.alt}の拡大表示">
  <button class="absolute inset-0 bg-black/80 cursor-zoom-out" data-zoom-close aria-label="閉じる"></button>
  <img src="${z.src}" alt="${z.alt}" class="relative max-w-[92vw] max-h-[88vh] min-w-[40vw] object-contain bg-white rounded shadow-2xl" />
  <button class="absolute top-4 right-4 w-12 h-12 rounded-full bg-white text-2xl font-bold shadow" data-zoom-close aria-label="閉じる">✕</button>
</div>`;
