// オペレーターの受電画面に出す「今日配布のチラシ」。どのチラシが配られているかを事前に知って、どこからの電話が増えそうかを見込む（マーケティング部が登録したチラシ）。
// 開くと、明日の配布予定と、過去の反響の傾向（曜日・エリア）も見られる。
import { esc } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { flyersOnDay, flyersTomorrow, weekdayTrend, areaTrend, mediaOf } from '../src/flyers.js';

const list = (items, empty) => (!items.length
  ? `<p class="text-xs text-slate-500">${empty}</p>`
  : `<ul class="space-y-1">${items.map((f) => `<li class="flex items-start gap-2 text-xs" data-today-flyer="${esc(f.id)}"><span class="font-mono font-bold shrink-0">${esc(f.id)}</span><span class="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-bold">${esc(mediaOf(f.media)?.label)}</span><span class="min-w-0"><span class="font-bold">${esc(f.name)}</span><span class="block text-slate-600">${esc(f.area)}</span></span></li>`).join('')}</ul>`);

// 曜日ごとの棒（いちばん多い曜日を100%）と、反響率の高いエリアの上位3つ
function trendHtml(trend) {
  const max = Math.max(1, ...trend.weekday.map((w) => w.count));
  const areas = trend.area.filter((a) => a.calls > 0).slice(0, 3);
  return `<div class="mt-2 border-t border-slate-200 pt-2" data-trend><h3 class="text-xs font-bold">過去の反響の傾向</h3>
    <div class="mt-1 flex items-end gap-1" aria-label="曜日ごとの受付の件数">${trend.weekday.map((w) => `<div class="flex-1 text-center" data-weekday="${w.label}" title="${w.label}曜日 ${w.count}件"><div class="mx-auto w-full rounded-t bg-teal-600" style="height:${Math.max(2, Math.round((w.count / max) * 36))}px"></div><div class="text-[10px] ${w.count === max && w.count ? 'font-bold text-teal-700' : 'text-slate-500'}">${w.label}</div></div>`).join('')}</div>
    <div class="mt-1.5 text-[11px] text-slate-500">反響率の高いエリア</div>
    ${areas.length ? `<ul class="text-xs">${areas.map((a) => `<li class="flex justify-between"><span class="font-bold">${esc(a.pref)}</span><span>${(a.rate * 100).toFixed(2)}%（${a.calls}件）</span></li>`).join('')}</ul>` : '<p class="text-xs text-slate-500">まだありません</p>'}</div>`;
}

export function todayFlyersHtml({ flyers, today, open, tomorrow = flyersTomorrow(flyers, today), trend = null }) {
  const now = flyersOnDay(flyers, today);
  const toggle = `<button class="chip !py-0 !text-[11px]" data-flyer-panel>${open ? '▲ 閉じる' : '▼ 開く'}</button>`;
  const body = !open && now.length ? ''
    : `<div class="mt-1.5">${list(now, '今日配布のチラシは、ありません')}</div>${open ? `<div class="mt-2 border-t border-slate-200 pt-2"><h3 class="text-xs font-bold">明日の配布予定</h3><div class="mt-1">${list(tomorrow, '明日配布のチラシは、ありません')}</div></div>${trend ? trendHtml(trend) : ''}` : ''}`;
  return `<section class="rounded-lg border border-slate-300 bg-white p-2.5" data-today-flyers>
    <div class="flex items-center justify-between gap-2"><h2 class="text-sm font-bold">今日配布のチラシ <span class="font-normal text-slate-500">${now.length}件</span>${helpIcon('マーケティング部が登録した、今日配布しているチラシです。配布するエリアから、今日は、どこからの電話が増えそうかを見込めます。開くと、明日の予定と、過去の傾向（曜日・エリア）も見られます。お客様がチラシのIDを伝えたら、受付の「来電のきっかけ」に入れます。')}</h2>${toggle}</div>
    ${body}
  </section>`;
}
