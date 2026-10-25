// 倉庫・物流画面の共通部品（見た目の小さな部品と、表示用の整形）。
import { yen, fmtTime, esc } from '../src/format.js';
import { photoOf } from '../src/image.js';
import { dateOf } from '../src/warehouse.js';
import { warehouseById, warehouseIdOf } from '../src/warehouseMaster.js';
import { sealColorOf } from '../src/stock.js';

export const STAGE_CLS = {
  incoming: 'bg-slate-200 text-slate-600', missing: 'bg-rose-100 text-rose-700', stock: 'bg-emerald-100 text-emerald-800', listed: 'bg-sky-100 text-sky-800', consigned: 'bg-violet-50 text-violet-800', transit: 'bg-amber-100 text-amber-800',
  sold: 'bg-indigo-100 text-indigo-800', returning: 'bg-amber-100 text-amber-800', returned: 'bg-slate-100 text-slate-600',
};

export const badge = (cls, text) => `<span class="rounded px-2 py-0.5 text-xs font-bold whitespace-normal ${cls}">${text}</span>`;
export const card = (label, value, cls = '') => `<div class="rounded-xl bg-white border p-3 flex-1 min-w-[10rem]"><div class="text-xs text-slate-500">${label}</div><div class="text-2xl font-bold ${cls}">${value}</div></div>`;
export const md = (date) => { const [, m, d] = date.split('-'); return `${Number(m)}/${Number(d)}`; };
// 曜日つきの日付（10/24(金)）
export const mdw = (date) => { const [y, m, d] = date.split('-').map(Number); return `${m}/${d}(${'日月火水木金土'[new Date(y, m - 1, d).getDay()]})`; };
export const mdTime = (ms) => `${md(dateOf(ms))} ${fmtTime(ms).slice(0, 5)}`;
export const yenS = (n) => (n < 0 ? `−${yen(-n)}` : yen(n)); // マイナスは「−」で表す
export const profitCls = (n) => (n < 0 ? 'text-rose-600' : 'text-emerald-700');
// 商品が入庫されている倉庫の名前（入庫前は「-」）
export const whName = (unit, master) => (unit.status === 'stored' ? warehouseById(master, warehouseIdOf(unit, master))?.name ?? '-' : '-');
// シールの色の表示（紫・赤は本社管理の高額品）
export const sealBadge = (unit) => { const c = sealColorOf(unit.sealColor); return c ? `<span class="text-xs whitespace-nowrap" title="シールの色: ${c.label}">${c.dot}${c.label}</span>` : ''; };
export const pct = (r) => `${(r * 100).toFixed(1)}%`;

// 商品の写真。押すと、撮影・選択して登録（撮り直し）できる。未登録（ダミーの絵）は見分けられる
export const photoSlot = (unit, size = 'h-12 w-12') => `<label class="relative inline-block cursor-pointer shrink-0 align-middle" title="${unit.photo ? '写真を撮り直す・選び直す' : '写真を登録する（撮影・選択）'}">
  <img src="${photoOf(unit)}" alt="${esc(unit.name)}" class="${size} object-cover rounded border bg-slate-100 ${unit.photo ? '' : 'opacity-60'}" />
  <span class="absolute bottom-0 inset-x-0 rounded-b text-[9px] leading-4 text-center font-bold text-white ${unit.photo ? 'bg-black/50' : 'bg-amber-500'}">${unit.photo ? '📷変更' : '未登録'}</span>
  <input type="file" accept="image/*" capture="environment" class="hidden" data-photo-file="${esc(unit.code)}" /></label>`;
