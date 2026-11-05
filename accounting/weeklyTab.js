// 週間収支: 週単位の入出金、粗利、固定費、残高
import { weeklySummary, recentWeeks, weekEnd } from '../src/weekly.js';
import { loadLedger } from '../src/ledger.js';
import { helpIcon } from '../src/help.js';
import { yen } from '../src/format.js';
import { card, mdw, md, signedYen } from './ui.js';

export function weeklyTab(c) {
  const ledger = loadLedger();
  const w = weeklySummary(ledger, c.st.week);
  const weeks = recentWeeks(ledger, Date.now(), 8);
  const max = Math.max(1, ...w.days.map((d) => Math.max(d.in, d.out)));
  return `
  <div class="flex flex-wrap items-center gap-2">
    <button class="b b-sec !min-h-0 !py-1 !px-3" data-week="-1" aria-label="前の週">◀</button><b>${md(w.start)} 〜 ${md(w.end)}</b><button class="b b-sec !min-h-0 !py-1 !px-3" data-week="1" aria-label="次の週">▶</button>
    ${helpIcon('週は月曜〜日曜。入金・支払は、入出金の帳簿の合計です。粗利 ＝ 販売代金 − 原価（販売代金の記録に入れた原価）。固定費は、その週に支払った固定費。残高は、週の最後の日の残高です。')}
  </div>
  <div class="flex flex-wrap gap-3">
    ${card('入金', yen(w.in), 'text-emerald-700')}${card('支払', yen(w.out), 'text-rose-700')}${card('粗利', yen(w.gross))}${card('固定費', yen(w.fixed))}
    ${card('粗利 − 固定費', signedYen(w.afterFixed), w.afterFixed < 0 ? 'text-rose-600' : 'text-emerald-700')}${card('週末の残高', signedYen(w.balance), w.balance < 0 ? 'text-rose-600' : '')}
  </div>
  <div class="grid xl:grid-cols-2 gap-4 items-start">
    <section class="rounded-xl border bg-white p-4"><h2 class="font-bold mb-2">日ごとの入出金と残高</h2>
      <table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>日付</th><th class="w-1/3">入金／支払</th><th class="text-right">入金</th><th class="text-right">支払</th><th class="text-right">残高</th></tr></thead><tbody>
      ${w.days.map((d) => `<tr class="border-b"><td>${mdw(d.date)}</td><td><div class="h-2 rounded bg-emerald-500" style="width:${Math.round((d.in / max) * 100)}%"></div><div class="h-2 mt-0.5 rounded bg-rose-400" style="width:${Math.round((d.out / max) * 100)}%"></div></td>
        <td class="text-right">${d.in ? yen(d.in) : '-'}</td><td class="text-right">${d.out ? yen(d.out) : '-'}</td><td class="text-right font-bold">${signedYen(d.balance)}</td></tr>`).join('')}
      </tbody></table></section>
    <section class="rounded-xl border bg-white p-4"><h2 class="font-bold mb-2">直近8週の推移${helpIcon('行を押すと、その週を開きます。')}</h2>
      <table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>週</th><th class="text-right">入金</th><th class="text-right">支払</th><th class="text-right">粗利</th><th class="text-right">固定費</th><th class="text-right">週末の残高</th></tr></thead><tbody>
      ${weeks.map((x) => `<tr class="border-b cursor-pointer hover:bg-slate-50 ${x.start === c.st.week ? 'bg-teal-50 font-bold' : ''}" data-pick-week="${x.start}"><td>${md(x.start)}〜${md(weekEnd(x.start))}</td><td class="text-right">${yen(x.in)}</td><td class="text-right">${yen(x.out)}</td><td class="text-right">${yen(x.gross)}</td><td class="text-right">${yen(x.fixed)}</td><td class="text-right">${signedYen(x.balance)}</td></tr>`).join('')}
      </tbody></table></section>
  </div>`;
}
