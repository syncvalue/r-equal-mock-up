// 💹 売上管理: 売れた商品の売上・原価・手数料・送料・利益を、期間別・販売先別・カテゴリ別に確認する。
import { salesRows, salesStats, salesByWarehouse, scopeState, dateOf, channelOf } from '../src/warehouse.js';
import { yen, esc } from '../src/format.js';
import { card, mdTime, yenS, profitCls, pct } from './ui.js';

const PERIODS = [['day', '今日'], ['month', '今月'], ['all', '全期間']];
const keyOf = (period, now) => (period === 'day' ? dateOf(now) : period === 'month' ? dateOf(now).slice(0, 7) : '');

const warehouseBreakdown = (list) => `<section class="rounded-xl border bg-white p-4"><h2 class="font-bold mb-2">倉庫別（会社全体の内訳）</h2>
  <table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>倉庫</th><th class="text-right">販売点数</th><th class="text-right">売上</th><th class="text-right">利益</th></tr></thead><tbody>
  ${list.length ? list.map((g) => `<tr class="border-b"><td class="font-bold">${esc(g.label)}</td><td class="text-right">${g.count}点</td><td class="text-right">${yen(g.revenue)}</td><td class="text-right font-bold ${profitCls(g.profit)}">${yenS(g.profit)}</td></tr>`).join('') : '<tr><td colspan="4" class="text-slate-400">この期間の売上はありません。</td></tr>'}</tbody></table></section>`;

// 購入者への発送の状況。委託先の市場で売れたものは、市場が購入者へ送る
const shipCell = (rec) => (channelOf(rec.channel)?.consign ? '<span class="text-slate-400">委託先が発送</span>' : rec.shippedAt ? `<span class="text-emerald-700 font-bold">✓ 発送済み</span>${rec.tracking ? `<div class="font-mono">${esc(rec.tracking)}</div>` : ''}` : '<span class="text-amber-700 font-bold">発送待ち</span>');

const bars = (list, cls) => {
  const max = Math.max(1, ...list.map((g) => g.revenue));
  return list.length ? list.map((g) => `<div class="mb-2 text-sm"><div class="flex justify-between"><span>${esc(g.label)}（${g.count}件）</span><span>${yen(g.revenue)}　<b class="${profitCls(g.profit)}">利益 ${yenS(g.profit)}</b></span></div>
    <div class="h-2 rounded bg-slate-100"><div class="h-2 rounded ${cls}" style="width:${Math.round((g.revenue / max) * 100)}%"></div></div></div>`).join('') : '<div class="text-slate-400 text-sm">売上はありません。</div>';
};

// 売上は、自分の倉庫（初期値）・他の倉庫・会社全体に切り替えて見られる
export function salesTab(full, master, { period, salesScope }, me, now = Date.now()) {
  const scope = salesScope || me.warehouseId;
  const st = salesStats(salesRows(scopeState(full, scope, master)), keyOf(period, now));
  const chip = (value, label) => `<button class="b b-sec ${scope === value ? 'on' : ''}" data-sales-scope="${esc(value)}">${esc(label)}</button>`;
  return `
  <div class="flex flex-wrap items-center gap-2"><span class="text-sm font-bold">集計の対象</span>${chip('all', '🏢 会社全体')}${master.warehouses.map((w) => chip(w.id, `${w.name}${w.id === me.warehouseId ? '（自分の倉庫）' : ''}`)).join('')}</div>
  <div class="flex gap-2">${PERIODS.map(([k, l]) => `<button class="b b-sec ${period === k ? 'on' : ''}" data-period="${k}">${l}</button>`).join('')}</div>
  <div class="flex flex-wrap gap-3">
    ${card('売上', yen(st.revenue))}${card('原価（買取額）', yen(st.cost), 'text-slate-600')}${card('手数料・送料', yen(st.fee + st.shipping), 'text-slate-600')}
    ${card('利益', yenS(st.profit), profitCls(st.profit))}${card('利益率', pct(st.margin))}${card('販売点数', `${st.count} 点`)}
  </div>
  <div class="grid lg:grid-cols-2 gap-4">
    <section class="rounded-xl border bg-white p-4"><h2 class="font-bold mb-2">販売先別</h2>${bars(st.byChannel.map((g) => ({ ...g, label: channelOf(g.key)?.label ?? g.label })), 'bg-sky-600')}</section>
    <section class="rounded-xl border bg-white p-4"><h2 class="font-bold mb-2">カテゴリ別</h2>${bars(st.byCategory, 'bg-teal-600')}</section>
  </div>
  ${scope === 'all' ? warehouseBreakdown(salesByWarehouse(st.rows, master)) : ''}
  <table class="w-full text-sm bg-white rounded-xl border"><thead><tr class="text-left text-slate-500 border-b"><th>売却日時</th><th>商品</th><th>販売先</th><th class="text-right">売価</th><th class="text-right">原価</th><th class="text-right">手数料</th><th class="text-right">送料</th><th class="text-right">利益</th><th>担当</th><th>購入者への発送</th></tr></thead><tbody>
    ${st.rows.length ? st.rows.map((r) => `<tr class="border-b"><td>${mdTime(r.rec.soldAt)}</td><td class="font-bold">${esc(r.unit.name)}</td>
      <td>${esc(channelOf(r.rec.channel)?.label)}${r.rec.buyer ? `<div class="text-xs text-slate-500">${esc(r.rec.buyer)}</div>` : ''}</td>
      <td class="text-right">${yen(r.revenue)}</td><td class="text-right">${yen(r.cost)}</td><td class="text-right">${yen(r.fee)}</td><td class="text-right">${yen(r.shipping)}</td>
      <td class="text-right font-bold ${profitCls(r.profit)}">${yenS(r.profit)}</td><td class="text-xs">${esc(r.rec.soldBy ?? '-')}</td><td class="text-xs">${shipCell(r.rec)}</td></tr>`).join('') : '<tr><td colspan="10" class="text-slate-400">この期間の売上はありません。</td></tr>'}
  </tbody></table>
  <p class="text-xs text-slate-500">利益 ＝ 売価 − 原価（お客様への買取額）− 手数料 − 送料。返品（クーリングオフ）になった商品は、売上に含まれません。営業の経費・人件費などは含めていません。</p>`;
}
