// 💹 売上管理: 売れた商品の売上・原価・手数料・送料・利益を、期間別・販売先別・カテゴリ別に確認する。
import { salesRows, salesStats, dateOf, channelOf } from '../src/warehouse.js';
import { yen, esc } from '../src/format.js';
import { card, mdTime, yenS, profitCls, pct } from './ui.js';

const PERIODS = [['day', '今日'], ['month', '今月'], ['all', '全期間']];
const keyOf = (period, now) => (period === 'day' ? dateOf(now) : period === 'month' ? dateOf(now).slice(0, 7) : '');

const bars = (list, cls) => {
  const max = Math.max(1, ...list.map((g) => g.revenue));
  return list.length ? list.map((g) => `<div class="mb-2 text-sm"><div class="flex justify-between"><span>${esc(g.label)}（${g.count}件）</span><span>${yen(g.revenue)}　<b class="${profitCls(g.profit)}">利益 ${yenS(g.profit)}</b></span></div>
    <div class="h-2 rounded bg-slate-100"><div class="h-2 rounded ${cls}" style="width:${Math.round((g.revenue / max) * 100)}%"></div></div></div>`).join('') : '<div class="text-slate-400 text-sm">売上はありません。</div>';
};

export function salesTab(state, { period }, now = Date.now()) {
  const st = salesStats(salesRows(state), keyOf(period, now));
  return `
  <div class="flex gap-2">${PERIODS.map(([k, l]) => `<button class="b b-sec ${period === k ? 'on' : ''}" data-period="${k}">${l}</button>`).join('')}</div>
  <div class="flex flex-wrap gap-3">
    ${card('売上', yen(st.revenue))}${card('原価（買取額）', yen(st.cost), 'text-slate-600')}${card('手数料・送料', yen(st.fee + st.shipping), 'text-slate-600')}
    ${card('利益', yenS(st.profit), profitCls(st.profit))}${card('利益率', pct(st.margin))}${card('販売点数', `${st.count} 点`)}
  </div>
  <div class="grid lg:grid-cols-2 gap-4">
    <section class="rounded-xl border bg-white p-4"><h2 class="font-bold mb-2">販売先別</h2>${bars(st.byChannel.map((g) => ({ ...g, label: channelOf(g.key)?.label ?? g.label })), 'bg-sky-600')}</section>
    <section class="rounded-xl border bg-white p-4"><h2 class="font-bold mb-2">カテゴリ別</h2>${bars(st.byCategory, 'bg-teal-600')}</section>
  </div>
  <table class="w-full text-sm bg-white rounded-xl border"><thead><tr class="text-left text-slate-500 border-b"><th>売却日時</th><th>商品</th><th>販売先</th><th class="text-right">売価</th><th class="text-right">原価</th><th class="text-right">手数料</th><th class="text-right">送料</th><th class="text-right">利益</th></tr></thead><tbody>
    ${st.rows.length ? st.rows.map((r) => `<tr class="border-b"><td>${mdTime(r.rec.soldAt)}</td><td class="font-bold">${esc(r.unit.name)}</td>
      <td>${esc(channelOf(r.rec.channel)?.label)}${r.rec.buyer ? `<div class="text-xs text-slate-500">${esc(r.rec.buyer)}</div>` : ''}</td>
      <td class="text-right">${yen(r.revenue)}</td><td class="text-right">${yen(r.cost)}</td><td class="text-right">${yen(r.fee)}</td><td class="text-right">${yen(r.shipping)}</td>
      <td class="text-right font-bold ${profitCls(r.profit)}">${yenS(r.profit)}</td></tr>`).join('') : '<tr><td colspan="8" class="text-slate-400">この期間の売上はありません。</td></tr>'}
  </tbody></table>
  <p class="text-xs text-slate-500">利益 ＝ 売価 − 原価（お客様への買取額）− 手数料 − 送料。返品（クーリングオフ）になった商品は、売上に含まれません。営業の経費・人件費などは含めていません。</p>`;
}
