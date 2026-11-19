// マーケティング部の一覧のページ送り（20件ごと。件数の切り替えはない）。部品は src/paging.js
import { pageNumbers } from '../src/paging.js';

export const PAGE_SIZE = 20;

// attr: ボタンに付ける data 属性の名前（チラシ一覧と反響管理で別にする。例: data-flyer-page）
export function pagerHtml(pg, attr) {
  if (pg.pages <= 1) return '';
  const btn = (label, page, { on = false, off = false } = {}) => `<button class="b b-sec !min-h-[36px] !py-0.5 !px-3 text-sm ${on ? 'on' : ''}" ${attr}="${page}" ${off ? 'disabled' : ''}>${label}</button>`;
  return `<div class="flex flex-wrap items-center gap-2 text-sm mt-2" aria-label="ページ送り">
    <span class="text-slate-700">全 <b>${pg.total}</b> 件中 ${pg.from}–${pg.to} 件を表示</span>
    <div class="flex flex-wrap items-center gap-1 ml-auto">${btn('‹ 前へ', pg.page - 1, { off: pg.page <= 1 })}
      ${pageNumbers(pg.page, pg.pages).map((n) => (n === '…' ? '<span class="px-1 text-slate-400">…</span>' : btn(n, n, { on: n === pg.page }))).join('')}
      ${btn('次へ ›', pg.page + 1, { off: pg.page >= pg.pages })}</div>
  </div>`;
}
