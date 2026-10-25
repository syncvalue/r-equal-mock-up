// 📦 商品管理: 買い取った商品の在庫を、状態・キーワードで絞り込んで確認する。
import { STAGES, channelOf, stockSummary, dateOf, findByCode, historyOf } from '../src/warehouse.js';
import { yen, esc } from '../src/format.js';
import { userById } from '../src/dashboard.js';
import { badge, card, md, mdTime, whName, STAGE_CLS } from './ui.js';

export const FILTERS = [['all', 'すべて'], ['stock', '在庫'], ['listed', '出品中'], ['consigned', '委託中'], ['incoming', '入庫待ち・所在不明'], ['sold', '売却済み'], ['return', '返品']];
const MATCH = {
  all: () => true,
  stock: (r) => r.stage === 'stock',
  listed: (r) => r.stage === 'listed',
  consigned: (r) => r.stage === 'consigned',
  incoming: (r) => r.stage === 'incoming' || r.stage === 'missing',
  sold: (r) => r.stage === 'sold',
  return: (r) => r.stage === 'returning' || r.stage === 'returned',
};
const hit = (r, q) => !q || [r.unit.name, r.unit.code, r.unit.customerName, r.unit.category].some((v) => v.toLowerCase().includes(q.toLowerCase()));

function action(r) {
  const { unit, rec } = r;
  if (r.canList) return `<button class="b b-pri !min-h-0 !py-1 !px-3 text-sm" data-go-list="${esc(unit.code)}">出品する</button>`;
  if (r.stage === 'stock' && r.cooling) {
    return `<span class="text-xs text-amber-700 font-bold">${md(r.coolEnd)} まで出品不可</span> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-go-return="${esc(unit.visitId)}">返品受付</button>`;
  }
  if (r.stage === 'listed') return `<span class="text-xs">${esc(channelOf(rec.channel)?.label)}で ${yen(rec.listPrice)}</span>`;
  if (r.stage === 'consigned') return `<span class="text-xs">${esc(rec.vendor || '委託先')}に委託中（${md(dateOf(rec.listedAt))}〜）</span>`;
  if (r.stage === 'sold') return `<span class="text-xs">${esc(channelOf(rec.channel)?.label)}で ${yen(rec.soldPrice)}</span>`;
  return '';
}

// QRシール（シールNo.）を読み取った結果。商品の詳細と、買取から現在までの履歴
function scanResult(data, scan) {
  if (!scan.raw) return '';
  const r = findByCode(data.allRows, scan.raw); // 読み取りは、他の倉庫の商品も探す
  if (!r) return `<div class="rounded-xl border-2 border-rose-400 bg-rose-50 p-3 text-sm font-bold text-rose-700 flex items-center">⚠ ${esc(scan.raw)} は、買取商品として登録されていません<button class="ml-auto b b-sec !min-h-0 !py-1 !px-3 text-xs" data-qr-close>閉じる</button></div>`;
  const { unit } = r;
  return `<section class="rounded-xl border-2 border-sky-400 bg-white p-4 space-y-3">
    <div class="flex flex-wrap items-center gap-2"><span class="text-xs font-mono text-slate-500">${esc(unit.code)}</span><b class="text-lg">${esc(unit.name)}</b>${badge(STAGE_CLS[r.stage], STAGES[r.stage])}${r.stage === 'stock' && r.cooling ? badge('bg-amber-100 text-amber-800', `${md(r.coolEnd)} まで保管（出品不可）`) : ''}
      <span class="ml-auto">${action(r)}</span><button class="b b-sec !min-h-0 !py-1 !px-3 text-xs" data-qr-close>閉じる</button></div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1 text-sm">
      <div><span class="text-slate-500">カテゴリ・ランク</span><br>${esc(unit.category)}／ランク${esc(unit.rank)}</div>
      <div><span class="text-slate-500">買取先</span><br>${esc(unit.customerName)} 様（${md(unit.date)}・担当営業 ${esc(userById(unit.userId)?.name ?? unit.userId)}）</div>
      <div><span class="text-slate-500">原価（買取額）</span><br>${yen(unit.price)}</div>
      <div><span class="text-slate-500">倉庫・保管場所</span><br>${r.stage === 'consigned' ? `倉庫の外（委託中）／元の倉庫 ${esc(whName(unit, data.master))}` : unit.status === 'stored' ? `${esc(whName(unit, data.master))}／${esc(unit.location)}` : '入庫前'}</div>
    </div>
    <ol class="text-sm border-l-2 border-slate-200 pl-3 space-y-1">${historyOf(data.full, unit.code).map((e) => `<li><span class="text-xs text-slate-500">${mdTime(e.at)}</span> <b>${e.label}</b> <span class="text-slate-600">${esc(e.detail)}</span></li>`).join('')}</ol>
  </section>`;
}

export function stockTab(data, { filter, q, scan }) {
  const { rows } = data;
  const sum = stockSummary(rows);
  const shown = rows.filter((r) => MATCH[filter](r) && hit(r, q.trim())).sort((a, b) => b.unit.at - a.unit.at);
  return `
  <div class="rounded-xl border bg-white p-3 flex flex-wrap items-center gap-2">
    <label class="font-bold text-sm">🔳 QRで探す</label>
    <input class="inp !w-72 font-mono" data-qr placeholder="シールのQRを読み取る（スキャナ）／シールNo." autocomplete="off" />
    <button class="b b-pri" data-qr-submit>探す</button>
    <button class="b b-pri !bg-teal-700" data-cam-search>📷 カメラで読み取る</button>
    <span class="text-xs text-slate-500">タブレットのカメラ、またはQRリーダーで読み取ると、その商品の詳細と履歴が出ます。</span>
  </div>
  ${scanResult(data, scan)}
  <div class="flex flex-wrap gap-3">
    ${card('すぐ出品できる在庫', `${sum.stock - sum.cooling} 点`, 'text-emerald-700')}
    ${card('保管期間中', `${sum.cooling} 点`, sum.cooling ? 'text-amber-700' : '')}
    ${card('出品中', `${sum.listed} 点`, 'text-sky-700')}
    ${card('委託中（倉庫の外）', `${sum.consigned} 点`, 'text-violet-700')}
    ${card('入庫待ち・所在不明', `${sum.incoming + sum.missing} 点`, sum.missing ? 'text-rose-600' : '')}
    ${card('倉庫の在庫の原価', yen(sum.inventoryCost))}
    ${card('委託中の原価', yen(sum.consignedCost))}
  </div>
  <div class="flex flex-wrap items-center gap-2">
    ${FILTERS.map(([k, l]) => `<button class="b b-sec !min-h-[40px] !py-1 ${filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}
    <input class="inp !w-64 ml-auto" data-q placeholder="商品名・シールNo.・お客様名" value="${esc(q)}" />
  </div>
  <table class="w-full text-sm bg-white rounded-xl border"><thead><tr class="text-left text-slate-500 border-b"><th>シールNo.</th><th>商品</th><th>ランク</th><th>買取先</th><th>買取日</th><th class="text-right">原価</th><th>倉庫・保管場所</th><th>状態</th><th>操作・備考</th></tr></thead><tbody>
    ${shown.length ? shown.map((r) => `<tr class="border-b">
      <td class="font-mono text-xs">${esc(r.unit.code)}</td><td class="font-bold">${esc(r.unit.name)}<div class="text-xs font-normal text-slate-500">${esc(r.unit.category)}</div></td><td>${esc(r.unit.rank)}</td>
      <td>${esc(r.unit.customerName)} 様</td><td>${md(r.unit.date)}</td><td class="text-right">${yen(r.unit.price)}</td><td class="text-xs">${r.stage === 'consigned' ? '倉庫の外（委託中）' : r.unit.status === 'stored' ? `${esc(whName(r.unit, data.master))}<div>${esc(r.unit.location)}</div>` : '-'}</td>
      <td>${badge(STAGE_CLS[r.stage], STAGES[r.stage])}</td><td>${action(r)}</td></tr>`).join('') : '<tr><td colspan="9" class="text-slate-400">該当する商品はありません。</td></tr>'}
  </tbody></table>
  <p class="text-xs text-slate-500">買い取った商品は、クーリングオフに備え、買取から10日間は保管し、出品・販売できません（お客様の通知は郵送で届くため、法定の8日間に余裕を足しています）。保管期間が過ぎた入庫済みの商品から出品できます。入庫は営業のタブレット（商品の持ち帰り）で、QRシールを読み取って行います。</p>`;
}
