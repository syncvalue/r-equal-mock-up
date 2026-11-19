// マーケティング部「反響管理」: どのチラシが効果的だったかを、受付の件数・反響率・1件あたりの費用・買取の金額・粗利・損益で見る
import { esc, yen } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { flyerStats, statsByMedia, rankByEfficiency, rankByProfit, dailyCalls, receptionDetails, mediaOf } from '../src/flyers.js';

const pct = (r) => `${(r * 100).toFixed(2)}%`;
const perCall = (v) => (v === null ? '<span class="text-slate-400">―</span>' : yen(v));
const signed = (n) => `<span class="${n < 0 ? 'text-rose-700' : 'text-teal-700'} font-bold">${n < 0 ? '−' : ''}${yen(Math.abs(n))}</span>`;
const ST = { confirmed: '確定', tentative: '仮確定', cancelled: '取消' };

function mediaCards(byMedia) {
  return `<div class="grid sm:grid-cols-3 gap-3">${byMedia.map((m) => `<div class="rounded-lg bg-white border border-slate-300 p-3" data-media="${m.media.key}">
    <div class="font-bold">${esc(m.media.label)} <span class="text-xs font-normal text-slate-500">${m.count}件</span></div>
    <div class="grid grid-cols-4 gap-1 mt-1 text-center"><div><div class="text-[11px] text-slate-500">受付</div><b class="text-lg">${m.calls}</b></div><div><div class="text-[11px] text-slate-500">反響率</div><b class="text-lg">${m.quantity ? pct(m.rate) : '―'}</b></div><div><div class="text-[11px] text-slate-500">1件あたり</div><b class="text-base">${perCall(m.costPerCall)}</b></div><div><div class="text-[11px] text-slate-500">損益</div><span class="text-base">${signed(m.profit)}</span></div></div></div>`).join('')}</div>`;
}

function detailHtml(stats, receptions, visits) {
  if (!stats) return '<section class="rounded-lg bg-white border border-dashed border-slate-300 p-4 text-sm text-slate-500">チラシの行を押すと、日ごとの受付と、アポごとの買取が出ます</section>';
  const days = dailyCalls(receptions, stats.flyer.id);
  const max = Math.max(1, ...days.map((d) => d.count));
  const apos = receptionDetails(stats.flyer.id, receptions, visits);
  return `<section class="rounded-lg bg-white border border-slate-300 p-4 space-y-4" data-daily>
    <div><h2 class="font-bold">${esc(stats.flyer.id)} ${esc(stats.flyer.name)}</h2>
      <div class="text-xs text-slate-500">配布 ${esc(stats.flyer.from === stats.flyer.to ? stats.flyer.from : `${stats.flyer.from} 〜 ${stats.flyer.to}`)} ／ ${esc(stats.flyer.area)}</div></div>
    <div><h3 class="text-sm font-bold">日ごとの受付</h3>
    ${days.length ? `<ul class="mt-1 space-y-1">${days.map((d) => `<li class="flex items-center gap-2 text-sm"><span class="w-24 shrink-0 font-mono text-xs">${d.day}</span><span class="h-4 rounded bg-teal-600" style="width:${Math.round((d.count / max) * 60)}%"></span><b>${d.count}件</b></li>`).join('')}</ul>` : '<p class="mt-1 text-sm text-slate-500">このチラシの受付は、まだありません</p>'}</div>
    <div><h3 class="text-sm font-bold">アポごとの買取${helpIcon('チラシは、受付（アポ）に結びついています。受付をたどると、訪問で何を買い取ったかが分かります（商品そのものには、チラシを結びつけません）。訪問が終わっていないアポは、買取の欄が空です。')}</h3>
    ${apos.length ? `<table class="w-full text-sm mt-1" data-apo-list><thead><tr class="text-left text-xs text-slate-500 border-b"><th>受付番号</th><th>訪問日</th><th>お客様</th><th>状態</th><th>買い取った商品</th><th class="text-right">買取額</th></tr></thead><tbody>${apos.map((a) => `<tr class="border-b"><td class="font-mono text-xs">${esc(a.receptionNo)}</td><td>${esc(a.date)}</td><td>${esc(a.customer)}</td><td>${ST[a.status] ?? ''}</td><td class="whitespace-normal">${a.items.length ? esc(a.items.join('、')) : a.visited ? '<span class="text-slate-500">買取なし</span>' : '<span class="text-slate-400">―</span>'}</td><td class="text-right">${a.amount ? yen(a.amount) : '―'}</td></tr>`).join('')}</tbody></table>` : '<p class="mt-1 text-sm text-slate-500">アポは、まだありません</p>'}</div>
  </section>`;
}

export function responseTab({ flyers, receptions, visits = [], results = {}, selId, mediaFilter, sortBy = 'efficiency' }) {
  const all = flyerStats(flyers, receptions, results);
  const stats = mediaFilter ? all.filter((s) => s.flyer.media === mediaFilter) : all;
  const ranked = sortBy === 'profit' ? rankByProfit(stats) : rankByEfficiency(stats);
  const sel = all.find((s) => s.flyer.id === selId) ?? null;
  const chip = (key, label) => `<button class="b !min-h-0 !py-1.5 !px-3 text-sm ${mediaFilter === key ? 'on' : 'b-sec'}" data-media-filter="${key}">${label}</button>`;
  const sortChip = (key, label) => `<button class="b !min-h-0 !py-1.5 !px-3 text-sm ${sortBy === key ? 'on' : 'b-sec'}" data-resp-sort="${key}">${label}</button>`;
  return `<div class="p-4 space-y-4">
    ${mediaCards(statsByMedia(all))}
    <section class="rounded-lg bg-white border border-slate-300 p-4">
      <div class="flex items-center justify-between gap-2 flex-wrap mb-2"><h2 class="font-bold">チラシごとの反響${helpIcon('反響＝そのチラシのIDで、コールセンターが受けた受付の件数です（取消も、電話が来たので数えます）。\n反響率＝受付÷部数。1件あたり＝費用÷受付。\n成約＝訪問で買取があった件数。粗利＝売った商品の、想定販売価格−買取額（想定販売価格を入れた商品だけ）。損益＝粗利−費用。\n「効果」順は、1件あたりが安い順、「損益」順は、損益が大きい順です。')} <span class="demo-only !text-[11px]" title="訪問の記録がない確定の受付には、見本の買取の実績を入れています">見本の買取実績を含む</span></h2>
        <div class="flex gap-3 flex-wrap"><div class="flex gap-1">${sortChip('efficiency', '効果の順')}${sortChip('profit', '損益の順')}</div><div class="flex gap-1">${chip('', 'すべて')}${chip('newspaper', '新聞折込')}${chip('posting', 'ポスティング')}${chip('dm', 'DM・はがき')}</div></div></div>
      <div class="overflow-x-auto"><table class="w-full text-sm" data-response-list>
        <thead><tr class="text-left text-xs text-slate-500 border-b"><th>順</th><th>ID</th><th>チラシ</th><th>配布方法</th><th class="text-right">部数</th><th class="text-right">費用</th><th class="text-right">受付</th><th class="text-right">確定</th><th class="text-right">取消</th><th class="text-right">反響率</th><th class="text-right">1件あたり</th><th class="text-right">成約</th><th class="text-right">買取額</th><th class="text-right">粗利</th><th class="text-right">損益</th></tr></thead>
        <tbody>${ranked.map((s, i) => `<tr class="border-b cursor-pointer hover:bg-slate-50 ${s.flyer.id === selId ? 'bg-teal-50' : ''} ${s.flyer.active ? '' : 'text-slate-400'}" data-response-row="${esc(s.flyer.id)}">
          <td>${s.calls ? i + 1 : '―'}</td><td class="font-mono font-bold">${esc(s.flyer.id)}</td><td class="whitespace-normal min-w-[10rem]">${esc(s.flyer.name)}</td><td>${esc(mediaOf(s.flyer.media)?.label)}</td>
          <td class="text-right">${s.flyer.quantity.toLocaleString('ja-JP')}</td><td class="text-right">${yen(s.flyer.cost)}</td><td class="text-right font-bold">${s.calls}</td><td class="text-right">${s.confirmed}</td><td class="text-right">${s.cancelled}</td><td class="text-right">${pct(s.rate)}</td><td class="text-right">${perCall(s.costPerCall)}</td>
          <td class="text-right">${s.won}</td><td class="text-right">${yen(s.amount)}</td><td class="text-right">${yen(s.gross)}</td><td class="text-right">${signed(s.profit)}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>
    ${detailHtml(sel, receptions, visits)}
  </div>`;
}
