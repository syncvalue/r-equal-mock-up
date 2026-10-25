// 📦 商品管理: 買い取った商品の在庫を、状態・キーワードで絞り込んで確認する。
import { STAGES, channelOf, stockSummary, dateOf, findByCode, historyOf, lotsOf, siblingsOf } from '../src/warehouse.js';
import { yen, esc } from '../src/format.js';
import { userById } from '../src/dashboard.js';
import { warehouseIdOf } from '../src/warehouseMaster.js';
import { relabelForm } from './relabelForm.js';
import { paginate, pageNumbers, PAGE_SIZES } from '../src/paging.js';
import { badge, card, md, mdTime, whName, sealBadge, STAGE_CLS } from './ui.js';

export const FILTERS = [['all', 'すべて'], ['stock', '在庫'], ['listed', '出品中'], ['consigned', '委託中'], ['transit', '輸送中'], ['incoming', '入庫待ち・所在不明'], ['sold', '売却済み'], ['return', '返品']];
const MATCH = {
  all: () => true,
  stock: (r) => r.stage === 'stock',
  listed: (r) => r.stage === 'listed',
  consigned: (r) => r.stage === 'consigned',
  transit: (r) => r.stage === 'transit',
  incoming: (r) => r.stage === 'incoming' || r.stage === 'missing',
  sold: (r) => r.stage === 'sold',
  return: (r) => r.stage === 'returning' || r.stage === 'returned',
};
const hit = (r, q) => !q || [r.unit.name, r.unit.code, r.unit.customerName, r.unit.category].some((v) => v.toLowerCase().includes(q.toLowerCase()));

// 他の倉庫の商品は、出品・売却・返品を扱えない（先に、自倉庫へ移動する）
function action(r, data) {
  const { unit, rec } = r;
  if (r.stage === 'transit') return `<span class="text-xs">→ ${esc(data.transfers?.find((t) => t.status === 'transit' && t.codes.includes(unit.code))?.toName ?? '')} へ輸送中</span>`;
  if (['stock', 'listed', 'consigned'].includes(r.stage) && warehouseIdOf(unit, data.master) !== data.me.warehouseId) return '<span class="text-xs text-slate-500">他の倉庫の商品（扱うには、先に移動）</span>';
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
// 同じ契約（買取日・お客様）で、一緒に買い取った他の商品。クーリングオフのときに確認する
function siblingsHtml(data, code) {
  const sib = siblingsOf(data.allRows, code);
  return `<div class="rounded bg-slate-50 p-2 text-sm"><div class="font-bold mb-1">同じ契約で一緒に買い取った商品（${sib.length}点）</div>
    ${sib.length ? sib.map((r) => `<div class="flex flex-wrap gap-x-3"><span class="font-bold">${esc(r.unit.name)}</span><span class="font-mono text-xs text-slate-500">${esc(r.unit.code)}</span><span class="text-xs">${r.stage === 'consigned' ? '倉庫の外（委託中）' : r.unit.status === 'stored' ? `${esc(whName(r.unit, data.master))}／${esc(r.unit.location)}` : '入庫前'}</span>${badge(STAGE_CLS[r.stage], STAGES[r.stage])}</div>`).join('') : '<span class="text-slate-500">同じ契約の他の商品はありません。</span>'}</div>`;
}

function scanResult(data, scan, rl) {
  if (!scan.raw) return '';
  const r = findByCode(data.allRows, scan.raw); // 読み取りは、他の倉庫の商品も探す
  if (!r) return `<div class="rounded-xl border-2 border-rose-400 bg-rose-50 p-3 text-sm font-bold text-rose-700 flex items-center">⚠ ${esc(scan.raw)} は、買取商品として登録されていません<button class="ml-auto b b-sec !min-h-0 !py-1 !px-3 text-xs" data-qr-close>閉じる</button></div>`;
  const { unit } = r;
  return `<section class="rounded-xl border-2 border-sky-400 bg-white p-4 space-y-3">${scan.notice ? `<div class="rounded bg-amber-50 border border-amber-300 p-2 text-sm font-bold text-amber-800">${esc(scan.notice)}</div>` : ''}
    <div class="flex flex-wrap items-center gap-2"><span class="text-xs font-mono text-slate-500">${esc(unit.code)}</span><b class="text-lg">${esc(unit.name)}</b>${badge(STAGE_CLS[r.stage], STAGES[r.stage])}${r.stage === 'stock' && r.cooling ? badge('bg-amber-100 text-amber-800', `${md(r.coolEnd)} まで保管（出品不可）`) : ''}
      <span class="ml-auto">${action(r, data)}</span><button class="b b-sec !min-h-0 !py-1 !px-3 text-xs" data-qr-close>閉じる</button></div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1 text-sm">
      <div><span class="text-slate-500">カテゴリ・ランク・シールの色</span><br>${esc(unit.category)}／ランク${esc(unit.rank)} ${sealBadge(unit)}</div>
      <div><span class="text-slate-500">買取先</span><br>${esc(unit.customerName)} 様（${md(unit.date)}・担当営業 ${esc(userById(unit.userId)?.name ?? unit.userId)}）</div>
      <div><span class="text-slate-500">原価（買取額）</span><br>${yen(unit.price)}</div>
      <div><span class="text-slate-500">倉庫・保管場所</span><br>${r.stage === 'consigned' ? `倉庫の外（委託中）／元の倉庫 ${esc(whName(unit, data.master))}` : unit.status === 'stored' ? `${esc(whName(unit, data.master))}／${esc(unit.location)}` : '入庫前'}</div>
    </div>
    ${['incoming', 'missing', 'stock'].includes(r.stage) ? (rl.code === unit.code ? relabelForm(rl, unit) : `<button class="b b-sec !min-h-0 !py-1 !px-3 text-xs" data-rl-open="${esc(unit.code)}">🏷 シール貼り替え（色の間違いなど）</button>`) : ''}
    ${siblingsHtml(data, unit.code)}
    <ol class="text-sm border-l-2 border-slate-200 pl-3 space-y-1">${historyOf(data.full, unit.code).map((e) => `<li><span class="text-xs text-slate-500">${mdTime(e.at)}</span> <b>${e.label}</b> <span class="text-slate-600">${esc(e.detail)}</span></li>`).join('')}</ol>
  </section>`;
}

const where = (r, data) => (r.stage === 'consigned' ? '倉庫の外（委託中）' : r.unit.status === 'stored' ? `${esc(whName(r.unit, data.master))}<div>${esc(r.unit.location)}</div>` : '-');

// 買取日・お客様（契約）ごとの表示。最初は、買取日単位・お客様単位に保管するため、同じ契約の商品がまとまって見える
// ページ送り。件数の表示、前へ・ページ番号・次へ、1ページの件数の切り替え
function pager(pg, unit, pageSize) {
  const btn = (label, page, { on = false, off = false } = {}) => `<button class="b b-sec !min-h-[36px] !py-0.5 !px-3 text-sm ${on ? 'on' : ''}" data-page="${page}" ${off ? 'disabled' : ''}>${label}</button>`;
  return `<div class="flex flex-wrap items-center gap-2 text-sm" aria-label="ページ送り">
    <span class="text-slate-600">全 <b>${pg.total}</b> ${unit}${pg.total ? `中 ${pg.from}–${pg.to} ${unit}を表示` : ''}</span>
    <div class="flex flex-wrap items-center gap-1 ml-auto">${btn('‹ 前へ', pg.page - 1, { off: pg.page <= 1 })}
      ${pageNumbers(pg.page, pg.pages).map((n) => (n === '…' ? '<span class="px-1 text-slate-400">…</span>' : btn(n, n, { on: n === pg.page }))).join('')}
      ${btn('次へ ›', pg.page + 1, { off: pg.page >= pg.pages })}
      <label class="ml-2 text-xs text-slate-500">1ページ <select class="rounded border px-1 py-1 text-sm text-slate-800" data-page-size>${PAGE_SIZES.map((n) => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}${unit}</option>`).join('')}</select></label></div>
  </div>`;
}

function lotView(lots, data) {
  if (!lots.length) return '<div class="rounded-xl border bg-white p-4 text-slate-400 text-sm">該当する商品はありません。</div>';
  const days = [...new Set(lots.map((l) => l.date))];
  return days.map((d) => `<section class="space-y-2"><h3 class="font-bold text-slate-700 border-b pb-0.5">${md(d)} 買取${d === dateOf(Date.now()) ? '（今日）' : ''}</h3>
    ${lots.filter((l) => l.date === d).map((l) => `<div class="rounded-xl border bg-white p-3 space-y-1">
      <div class="flex flex-wrap items-center gap-2 text-sm"><b class="text-base">${esc(l.customerName)} 様</b><span class="text-xs text-slate-500">担当営業 ${esc(userById(l.userId)?.name ?? l.userId)}／${l.rows.length}点 ${yen(l.total)}</span></div>
      <table class="w-full text-sm"><tbody>${l.rows.map((r) => `<tr class="border-t">
        <td class="font-mono text-xs">${esc(r.unit.code)}</td><td class="font-bold">${esc(r.unit.name)}<div class="text-xs font-normal text-slate-500">${esc(r.unit.category)}／ランク${esc(r.unit.rank)} ${sealBadge(r.unit)}</div></td><td class="text-right">${yen(r.unit.price)}</td>
        <td class="text-xs">${where(r, data)}</td><td>${badge(STAGE_CLS[r.stage], STAGES[r.stage])}</td><td>${action(r, data)}</td></tr>`).join('')}</tbody></table></div>`).join('')}</section>`).join('');
}

export function stockTab(data, { filter, q, scan, view, rl, page, pageSize }) {
  const { rows } = data;
  const sum = stockSummary(rows);
  const shown = rows.filter((r) => MATCH[filter](r) && hit(r, q.trim())).sort((a, b) => b.unit.at - a.unit.at);
  // 一覧は商品の点数、買取日・お客様別は契約（まとまり）の件数で、ページを分ける
  const byLot = view === 'lot';
  const pg = byLot ? paginate(lotsOf(shown), page, pageSize) : paginate(shown, page, pageSize);
  const pagerHtml = pager(pg, byLot ? '契約' : '点', pageSize);
  return `
  <div class="rounded-xl border bg-white p-3 flex flex-wrap items-center gap-2">
    <label class="font-bold text-sm" for="wh-search">🔍 商品を探す</label>
    <input id="wh-search" class="inp !w-96 max-w-full" data-q placeholder="商品名・シールNo.・お客様名（QRリーダーで読み取りも可）" value="${esc(q)}" autocomplete="off" />
    <button class="b b-pri !bg-teal-700" data-cam-search>📷 カメラで読み取る</button>
    <span class="text-xs text-slate-500">入力すると、下の一覧が絞り込まれます。シールのQRを読み取る（またはシールNo.を入力してEnter）と、その商品の詳細と履歴が出ます。</span>
  </div>
  ${scanResult(data, scan, rl)}
  <div class="flex flex-wrap gap-3">
    ${card('すぐ出品できる在庫', `${sum.stock - sum.cooling} 点`, 'text-emerald-700')}
    ${card('保管期間中', `${sum.cooling} 点`, sum.cooling ? 'text-amber-700' : '')}
    ${card('出品中', `${sum.listed} 点`, 'text-sky-700')}
    ${card('委託中（倉庫の外）', `${sum.consigned} 点`, 'text-violet-700')}
    ${card('輸送中（倉庫間の移動）', `${sum.transit} 点`, sum.transit ? 'text-amber-700' : '')}
    ${card('入庫待ち・所在不明', `${sum.incoming + sum.missing} 点`, sum.missing ? 'text-rose-600' : '')}
    ${card('倉庫の在庫の原価', yen(sum.inventoryCost))}
    ${card('委託中の原価', yen(sum.consignedCost))}
  </div>
  <div class="flex flex-wrap items-center gap-2">
    ${FILTERS.map(([k, l]) => `<button class="b b-sec !min-h-[40px] !py-1 ${filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}
  </div>
  <div class="flex gap-2 items-center"><span class="text-sm font-bold">表示</span>
    ${[['list', '☰ 一覧'], ['lot', '📅 買取日・お客様別']].map(([k, l]) => `<button class="b b-sec !min-h-[40px] !py-1 ${view === k ? 'on' : ''}" data-view="${k}">${l}</button>`).join('')}
    <span class="text-xs text-slate-500">買取日・お客様（契約）ごとにまとめて保管します。クーリングオフのときも、同じ契約の商品をすぐ探せます。</span></div>
  ${pagerHtml}
  ${byLot ? lotView(pg.items, data) : `<table class="w-full text-sm bg-white rounded-xl border"><thead><tr class="text-left text-slate-500 border-b"><th>シールNo.</th><th>商品</th><th>ランク</th><th>買取先</th><th>買取日</th><th class="text-right">原価</th><th>倉庫・保管場所</th><th>状態</th><th>操作・備考</th></tr></thead><tbody>
    ${pg.items.length ? pg.items.map((r) => `<tr class="border-b">
      <td class="font-mono text-xs">${esc(r.unit.code)}</td><td class="font-bold">${esc(r.unit.name)}<div class="text-xs font-normal text-slate-500">${esc(r.unit.category)} ${sealBadge(r.unit)}</div></td><td>${esc(r.unit.rank)}</td>
      <td>${esc(r.unit.customerName)} 様</td><td>${md(r.unit.date)}</td><td class="text-right">${yen(r.unit.price)}</td><td class="text-xs">${where(r, data)}</td>
      <td>${badge(STAGE_CLS[r.stage], STAGES[r.stage])}</td><td>${action(r, data)}</td></tr>`).join('') : '<tr><td colspan="9" class="text-slate-400">該当する商品はありません。</td></tr>'}
  </tbody></table>`}
  ${pg.total > pageSize || pg.pages > 1 ? pagerHtml : ''}
  <p class="text-xs text-slate-500">買い取った商品は、クーリングオフに備え、買取から10日間は保管し、出品・販売できません（お客様の通知は郵送で届くため、法定の8日間に余裕を足しています）。保管期間が過ぎた入庫済みの商品から出品できます。入庫は営業のタブレット（商品の持ち帰り）で、QRシールを読み取って行います。</p>`;
}
