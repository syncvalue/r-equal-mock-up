// 配車確定: 「走行距離」を押すと開く、その日の訪問ルートの地図（モーダル）。ピンの番号＝訪問する順
import { USERS } from '../src/dashboard.js';
import { busyBlocks, routeStops } from '../src/dispatch.js';
import { esc } from '../src/format.js';
import { avatarHtml } from './avatar.js';
import { modalBadgeHtml } from '../src/screenIds.js';
import { dateLabel } from './view.js';

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const surname = (name) => String(name).trim().split(/[\s　]+/)[0];

export function routeModalHtml({ userId, date, reservations, now }) {
  const user = USERS.find((u) => u.id === userId);
  if (!user) return '';
  const { stops, legs, km } = routeStops(busyBlocks(userId, date, reservations, now));
  const legTo = (n) => legs.find((l) => l.to.lat === stops[n - 1]?.lat && l.to.lng === stops[n - 1]?.lng);
  const list = stops.map((s) => `<li class="flex items-start gap-2 text-xs"><span class="route-num-s${s.tentative ? ' tentative' : ''}">${s.n}</span>
    <span class="min-w-0"><b>${hhmm(s.start)}–${hhmm(s.end)}</b> ${esc(s.label)}${s.tentative ? '<span class="ml-1 rounded bg-slate-200 px-1 text-[10px]">仮確定</span>' : ''}<br /><span class="text-slate-500">${esc(s.place)}</span>${legTo(s.n) ? `<br /><span class="text-teal-800">前の訪問から ${legTo(s.n).km}km</span>` : ''}</span></li>`).join('');
  return `<div class="fixed inset-0 z-[60] flex items-center justify-center p-4"><div class="absolute inset-0 bg-black/40" data-routeclose></div>
    <div class="relative z-10 flex max-h-[92vh] w-[60rem] max-w-full flex-col gap-3 overflow-hidden rounded-lg bg-white p-4 shadow-2xl">${modalBadgeHtml('CC-M07')}
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">${avatarHtml(user, 40)}<div><div class="text-lg font-bold">${esc(surname(user.name))}　${esc(dateLabel(date))}の訪問ルート</div>
          <div class="text-sm text-slate-700">走行距離：<b>${km}km</b>（訪問 ${stops.length}件。ピンの番号は、訪問する順）</div></div></div>
        <button class="b" data-routeclose aria-label="閉じる">✕ 閉じる</button></div>
      ${stops.length ? `<div class="flex min-h-0 flex-1 gap-3"><div id="route-map" class="h-[28rem] min-w-0 flex-1 rounded border"></div>
        <ol class="max-h-[28rem] w-60 shrink-0 space-y-2 overflow-y-auto">${list}</ol></div>
        <div class="text-[11px] text-slate-500">※ 線は、ピンどうしを順に結んだ直線です（道路に沿ったルートではありません）。モックのため、ピンの位置は、住所からの概算です。</div>`
    : '<div class="rounded border bg-slate-50 p-6 text-center text-sm text-slate-600">この日の訪問の場所が分かる予定がありません。</div>'}
    </div></div>`;
}
