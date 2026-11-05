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
