// 倉庫・物流画面の共通部品（見た目の小さな部品と、表示用の整形）。
import { yen, fmtTime } from '../src/format.js';
import { dateOf } from '../src/warehouse.js';

export const STAGE_CLS = {
  incoming: 'bg-slate-200 text-slate-600', missing: 'bg-rose-100 text-rose-700', stock: 'bg-emerald-100 text-emerald-800', listed: 'bg-sky-100 text-sky-800', consigned: 'bg-violet-50 text-violet-800',
  sold: 'bg-indigo-100 text-indigo-800', returning: 'bg-amber-100 text-amber-800', returned: 'bg-slate-100 text-slate-600',
};

export const badge = (cls, text) => `<span class="rounded px-2 py-0.5 text-xs font-bold whitespace-normal ${cls}">${text}</span>`;
export const card = (label, value, cls = '') => `<div class="rounded-xl bg-white border p-3 flex-1 min-w-[10rem]"><div class="text-xs text-slate-500">${label}</div><div class="text-2xl font-bold ${cls}">${value}</div></div>`;
export const md = (date) => { const [, m, d] = date.split('-'); return `${Number(m)}/${Number(d)}`; };
export const mdTime = (ms) => `${md(dateOf(ms))} ${fmtTime(ms).slice(0, 5)}`;
export const yenS = (n) => (n < 0 ? `−${yen(-n)}` : yen(n)); // マイナスは「−」で表す
export const profitCls = (n) => (n < 0 ? 'text-rose-600' : 'text-emerald-700');
export const pct = (r) => `${(r * 100).toFixed(1)}%`;
