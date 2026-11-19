// マーケティング部「配布カレンダー」: 月の表で、日ごとに、どのチラシを配るかを見る。日を押すと、その日のチラシの詳細
import { esc } from '../src/format.js';
import { modalHtml } from './modal.js';
import { helpIcon } from '../src/help.js';
import { monthGrid } from '../src/flyerCalendar.js';
import { mediaOf } from '../src/flyers.js';
import { areaOf, areaColor, areaOptions } from '../src/areaColor.js';

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const MAX_CHIPS = 3; // 1日のマスに出す数。超えたら「ほかN件」

// エリアの色: 薄い色の帯に、濃い色の左線（文字は濃いグレーのまま）
const chip = (f) => `<div class="truncate rounded px-1 py-0.5 text-[11px] leading-tight text-slate-900" style="background:${areaColor(areaOf(f)).tint};border-left:4px solid ${areaColor(areaOf(f)).solid}" title="${esc(areaOf(f))}　${esc(f.id)} ${esc(f.name)}"><span class="font-mono font-bold">${esc(f.id)}</span> ${esc(f.name)}</div>`;

function cell(c, today, sel, open) {
  const shown = c.flyers.slice(0, MAX_CHIPS);
  const more = c.flyers.length - shown.length;
  return `<button class="text-left min-h-[96px] border-t border-l border-slate-200 p-1 align-top flex flex-col gap-0.5 ${c.inMonth ? 'bg-white' : 'bg-slate-50 text-slate-400'} ${c.day === sel && open ? 'ring-2 ring-inset ring-teal-600' : 'hover:bg-slate-50'}" data-cal-day="${c.day}" aria-label="${c.day} 配布 ${c.flyers.length}件">
    <span class="text-xs ${c.day === today ? 'inline-flex w-6 h-6 items-center justify-center rounded-full bg-teal-700 text-white font-bold' : 'font-bold'}">${Number(c.day.slice(8))}</span>
    ${shown.map(chip).join('')}${more > 0 ? `<span class="text-[11px] text-slate-500">ほか${more}件</span>` : ''}</button>`;
}

function dayDetail(flyers, day) {
  const list = flyers.filter((f) => f.active && f.from <= day && day <= f.to).sort((a, b) => a.id.localeCompare(b.id));
  return modalHtml('MKT-M03', `<section data-cal-detail>
    <h2 class="font-bold">${esc(day)} に配布するチラシ <span class="text-sm font-normal text-slate-500">${list.length}件</span></h2>
    ${list.length ? `<ul class="mt-2 divide-y">${list.map((f) => `<li class="py-1.5 text-sm flex flex-wrap gap-x-3" style="border-left:4px solid ${areaColor(areaOf(f)).solid};padding-left:.5rem"><span class="font-mono font-bold">${esc(f.id)}</span><span class="rounded bg-slate-100 px-1.5 text-xs font-bold self-center">${esc(mediaOf(f.media)?.label)}</span><span class="font-bold">${esc(f.name)}</span><span class="text-slate-600">${esc(f.area)}</span><span class="text-slate-500">${f.quantity.toLocaleString('ja-JP')}部${f.from === f.to ? '' : `（${esc(f.from)}〜${esc(f.to)}）`}</span></li>`).join('')}</ul>` : '<p class="mt-1 text-sm text-slate-500">この日に配布するチラシは、ありません</p>'}
  </section>`);
}

// エリアの絞り込み（すべて／エリア）。色の見本（凡例）を兼ねる
function areaFilter(options, area) {
  const chip = (key, label, color) => `<button class="b !min-h-0 !py-1 !px-2.5 text-xs inline-flex items-center gap-1.5 ${area === key ? 'on' : 'b-sec'}" data-cal-area="${esc(key)}">${color ? `<span class="inline-block w-3 h-3 rounded-sm" style="background:${color}"></span>` : ''}${esc(label)}</button>`;
  return `<div class="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-slate-200" data-cal-areas><span class="text-xs font-bold text-slate-600">配布エリア</span>${chip('', 'すべて', '')}${options.map((o) => chip(o.area, `${o.area} ${o.count}`, areaColor(o.area).solid)).join('')}</div>`;
}

export function calendarTab({ flyers: all, month, today, selDay, area = '', open = false }) {
  const options = areaOptions(all);
  const flyers = area ? all.filter((f) => areaOf(f) === area) : all;
  const grid = monthGrid(flyers, month);
  const [y, m] = month.split('-');
  return `<div class="p-4 space-y-3">
    <section class="rounded-lg bg-white border border-slate-300 overflow-hidden">
      <div class="flex items-center justify-between gap-2 p-3 border-b border-slate-200"><h2 class="font-bold">${y}年${Number(m)}月の配布${helpIcon('有効なチラシだけを出します。配布の期間が複数日のチラシは、期間の毎日に出ます。色は、配布エリア（都道府県）ごとです。エリアを押すと、そのエリアのチラシだけに絞り込めます。日を押すと、下に、その日のチラシの詳細が出ます。')}</h2>
        <div class="flex gap-1"><button class="b b-sec !min-h-0 !py-1 !px-3 text-sm" data-cal-move="-1">前の月</button><button class="b b-sec !min-h-0 !py-1 !px-3 text-sm" data-cal-move="0">今月</button><button class="b b-sec !min-h-0 !py-1 !px-3 text-sm" data-cal-move="1">次の月</button></div></div>
      ${areaFilter(options, area)}
      <div class="grid grid-cols-7 text-center text-xs font-bold bg-slate-100 border-b border-slate-200">${WD.map((w, i) => `<div class="py-1 ${i === 0 ? 'text-rose-700' : i === 6 ? 'text-sky-700' : ''}">${w}</div>`).join('')}</div>
      <div class="grid grid-cols-7 border-r border-b border-slate-200" data-cal-grid>${grid.flat().map((c) => cell(c, today, selDay, open)).join('')}</div>
    </section>
    ${open ? dayDetail(flyers, selDay) : ''}
  </div>`;
}
