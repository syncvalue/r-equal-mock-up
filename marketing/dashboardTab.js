// マーケティング部「ダッシュボード」: 追いたい数字を、ひと目で。今日配布・今日入稿・直近3か月の反響の上位・今月のまとめ・進捗
import { esc, yen } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { flyersOnDay, mediaOf, stageLabel, STAGES } from '../src/flyers.js';
import { dueFlyers, topFlyersByCalls, stageCounts, monthSummary } from '../src/flyerDashboard.js';

export const TOP_LIMITS = [3, 5, 10];
const pct = (r) => `${(r * 100).toFixed(2)}%`;
const signed = (n) => `<span class="${n < 0 ? 'text-rose-700' : 'text-teal-700'}">${n < 0 ? '−' : ''}${yen(Math.abs(n))}</span>`;

const tile = (label, value, sub = '', attr = '') => `<div class="rounded-lg bg-white border border-slate-300 p-3" ${attr}><div class="text-xs text-slate-500">${label}</div><div class="text-2xl font-bold leading-tight">${value}</div>${sub ? `<div class="text-xs text-slate-500">${sub}</div>` : ''}</div>`;
const card = (title, body, { help = '', attr = '' } = {}) => `<section class="rounded-lg bg-white border border-slate-300 p-4" ${attr}><h2 class="font-bold mb-2">${title}${help ? helpIcon(help) : ''}</h2>${body}</section>`;
const empty = (t) => `<p class="text-sm text-slate-500">${t}</p>`;
const flyerLine = (f, extra = '') => `<li class="py-1.5 text-sm flex flex-wrap items-baseline gap-x-2"><span class="font-mono font-bold">${esc(f.id)}</span><span class="rounded bg-slate-100 px-1.5 text-xs font-bold">${esc(mediaOf(f.media)?.label)}</span><span class="font-bold">${esc(f.name)}</span>${extra}</li>`;

function dueCard(due, today) {
  const row = (f, tag, cls) => flyerLine(f, `<span class="text-xs font-bold ${cls}">${tag}</span><span class="text-xs text-slate-500">${esc(stageLabel(f.stage))}・配布 ${esc(f.from)}</span><button class="b b-pri !min-h-0 !py-0.5 !px-2 text-xs ml-auto" data-flyer-advance="${esc(f.id)}" data-dash>進める</button>`);
  const none = !due.overdue.length && !due.today.length;
  return card('本日中に入稿するチラシ', `${none ? empty('本日中に入稿するチラシは、ありません') : `<ul class="divide-y">${due.overdue.map((f) => row(f, `期限切れ（${f.deadline}）`, 'text-rose-700')).join('')}${due.today.map((f) => row(f, '今日が期限', 'text-amber-700')).join('')}</ul>`}
    ${due.soon.length ? `<div class="mt-2 border-t border-slate-200 pt-2"><div class="text-xs font-bold text-slate-600">3日以内に入稿するチラシ</div><ul class="divide-y">${due.soon.map((f) => flyerLine(f, `<span class="text-xs text-slate-600">期限 ${esc(f.deadline)}</span><span class="text-xs text-slate-500">${esc(stageLabel(f.stage))}</span>`)).join('')}</ul></div>` : ''}`,
  { help: '未着手・制作中のチラシで、入稿期限が今日（または過ぎている）ものです。「進める」で進捗を進められます。入稿期限は、チラシの登録で入れます。', attr: 'data-due' });
}

function topCard(top, limit) {
  const chip = (n) => `<button class="b !min-h-0 !py-1 !px-2.5 text-xs ${n === limit ? 'on' : 'b-sec'}" data-dash-top="${n}">上位${n}件</button>`;
  return card(`直近3か月の反響 上位${limit}件`, `<div class="flex gap-1 mb-2">${TOP_LIMITS.map(chip).join('')}</div>${top.length ? `<ol class="divide-y" data-top-list>${top.map((s, i) => `<li class="py-1.5 text-sm flex items-baseline gap-2"><b class="w-5 text-slate-500">${i + 1}</b><span class="font-mono font-bold">${esc(s.flyer.id)}</span><span class="font-bold min-w-0 truncate">${esc(s.flyer.name)}</span><span class="ml-auto whitespace-nowrap"><b class="text-lg">${s.calls}</b>件<span class="text-xs text-slate-500 ml-1">反響率 ${pct(s.rate)}</span></span></li>`).join('')}</ol>` : empty('この3か月の反響は、まだありません')}`,
  { help: '直近3か月（今日から3か月前の同じ日まで）に、コールセンターが受けた受付の件数が多いチラシです（取消も数えます）。', attr: 'data-top' });
}

function stageCard(counts) {
  return card('進捗', `<div class="grid grid-cols-4 gap-2 text-center">${STAGES.map((s) => `<div class="rounded border border-slate-200 p-2"><div class="text-[11px] text-slate-500">${s.label}</div><b class="text-2xl">${counts[s.key]}</b></div>`).join('')}</div>`, { attr: 'data-stages', help: '有効なチラシを、進捗ごとに数えた件数です。' });
}

export function dashboardTab({ flyers, receptions, results, today, topLimit = 5 }) {
  const now = flyersOnDay(flyers, today);
  const due = dueFlyers(flyers, today);
  const m = monthSummary(flyers, receptions, results, today);
  const diff = m.calls - m.prevCalls;
  const urgent = due.overdue.length + due.today.length;
  return `<div class="p-4 space-y-4" data-dashboard>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      ${tile('本日配布のチラシ', `${now.length}<span class="text-base font-normal">件</span>`, '', 'data-tile="today"')}
      ${tile('本日中に入稿', `<span class="${urgent ? 'text-rose-700' : ''}">${urgent}<span class="text-base font-normal">件</span></span>`, due.overdue.length ? `期限切れ ${due.overdue.length}件を含む` : '', 'data-tile="due"')}
      ${tile('今月の受付', `${m.calls}<span class="text-base font-normal">件</span>`, `先月 ${m.prevCalls}件（${diff >= 0 ? '+' : '−'}${Math.abs(diff)}）`, 'data-tile="calls"')}
      ${tile('今月の損益', signed(m.profit), `粗利 ${yen(m.gross)} − 今月配布の費用 ${yen(m.cost)}`, 'data-tile="profit"')}
    </div>
    <div class="grid lg:grid-cols-2 gap-4 items-start">
      ${card('本日配布のチラシ', now.length ? `<ul class="divide-y">${now.map((f) => flyerLine(f, `<span class="text-xs text-slate-600">${esc(f.area)}</span><span class="text-xs text-slate-500">${f.quantity.toLocaleString('ja-JP')}部</span>`)).join('')}</ul>` : empty('本日配布のチラシは、ありません'), { attr: 'data-today-list' })}
      ${dueCard(due, today)}
      ${topCard(topFlyersByCalls(flyers, receptions, today, { limit: topLimit }), topLimit)}
      ${stageCard(stageCounts(flyers, today))}
    </div>
  </div>`;
}
