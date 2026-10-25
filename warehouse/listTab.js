// 🛒 販売（出品）: 在庫をフリマ・業者に出品し、出品中の商品の価格変更・売却登録・取り下げを行う。
import { CHANNELS, channelOf, feeFor, dateOf } from '../src/warehouse.js';
import { moneyInputHtml } from '../src/moneyInput.js';
import { yen, esc } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { badge, md, yenS, profitCls } from './ui.js';
import { packList, packWork, openPackOf, shipInfo } from './packUi.js';

// 委託（業者オークション）は、パックの流れ（下の「業者に委託する」）で行う。ここでは、フリマと、業者への直接販売を出品する
const channelButtons = (value) => ['flea', 'trade'].map((type) => `<div class="mb-1"><span class="text-xs text-slate-500 mr-1">${type === 'flea' ? 'フリマ' : '業者向け'}</span>
  ${CHANNELS.filter((c) => c.type === type && !c.consign).map((c) => `<button class="b b-sec !min-h-[40px] !py-1 mr-1 ${value === c.key ? 'on' : ''}" data-lf-channel="${c.key}">${c.label}</button>`).join('')}</div>`).join('');

function listForm(sellable, lf) {
  const unit = sellable.find((r) => r.unit.code === lf.code)?.unit;
  const fee = unit && lf.price > 0 ? feeFor(lf.channel, lf.price) : 0;
  const est = unit ? lf.price - unit.price - fee : 0;
  return `
  <section class="rounded-xl border bg-white p-4 space-y-3">
    <h2 class="font-bold text-lg">🛒 出品する${helpIcon('フリマ・業者への直接販売の出品です。業者への委託は、下のパックで行います。')}</h2>
    ${sellable.length ? `
    <label class="text-sm font-bold block">商品（クーリングオフ期間が過ぎた在庫）<select class="inp mt-1 font-normal" data-f="lf.code">
      <option value="">選んでください（${sellable.length}点）</option>
      ${sellable.map((r) => `<option value="${esc(r.unit.code)}" ${lf.code === r.unit.code ? 'selected' : ''}>${esc(r.unit.name)}（${esc(r.unit.code)}／原価 ${yen(r.unit.price)}）</option>`).join('')}</select></label>
    <div><div class="text-sm font-bold mb-1">販売先</div>${channelButtons(lf.channel)}</div>
    <label class="text-sm font-bold block">出品価格${moneyInputHtml({ attrs: 'data-f="lf.price"', value: lf.price, placeholder: '150,000', cls: 'inp mt-1 font-normal' })}</label>
    ${unit && lf.price > 0 ? `<div class="text-sm rounded bg-slate-50 p-2">原価 ${yen(unit.price)}　手数料（${channelOf(lf.channel)?.label} ${(channelOf(lf.channel).rate * 100).toFixed(1).replace('.0', '')}%）${yen(fee)}　<b class="${profitCls(est)}">見込み利益 ${yenS(est)}</b><span class="text-xs text-slate-500">（送料を除く）</span></div>` : ''}
    <button class="b b-pri" data-list-add ${unit ? '' : 'disabled'}>出品する</button>`
    : `<p class="text-sm text-slate-500">いま出品できる在庫はありません。${helpIcon('入庫済みで、保管期間（買取から10日間）が過ぎた商品が、ここに出ます。')}</p>`}
  </section>`;
}

function sellForm(row, sf) {
  const consigned = row.stage === 'consigned';
  const fee = sf.price > 0 ? feeFor(row.rec.channel, sf.price) : 0;
  const profit = sf.price - row.unit.price - fee - sf.shipping;
  return `<tr class="bg-slate-50"><td colspan="7" class="!whitespace-normal"><div class="p-2 flex flex-wrap items-end gap-3">
    <label class="text-sm font-bold">${consigned ? '売れた金額（入金額）' : '実際の売価'}${moneyInputHtml({ attrs: 'data-f="sf.price"', value: sf.price, cls: 'inp mt-1 font-normal' })}</label>
    ${consigned ? '' : `<label class="text-sm font-bold">送料（当社負担）${moneyInputHtml({ attrs: 'data-f="sf.shipping"', value: sf.shipping, placeholder: '0', cls: 'inp mt-1 font-normal' })}</label>`}
    <label class="text-sm font-bold flex-1 min-w-[10rem]">購入者・販売先<input class="inp mt-1 font-normal" data-f="sf.buyer" value="${esc(sf.buyer)}" placeholder="例: ○○時計店" /></label>
    <div class="text-sm">${consigned ? '委託手数料' : '手数料'} ${yen(fee)}　<b class="${profitCls(profit)}">利益 ${yenS(profit)}</b></div>
    <button class="b b-pri" data-sell-done="${esc(row.unit.code)}">売却を登録</button><button class="b b-sec" data-sell-cancel>やめる</button>
  </div></td></tr>`;
}

function consignedTable(consigned, sf, now, packs) {
  return `
  <section class="rounded-xl border bg-white p-4 space-y-3">
    <h2 class="font-bold text-lg">🚚 委託中の商品（${consigned.length}点）${helpIcon('委託中の商品は、倉庫の外にあります。\n売れたら「売れた（入金）」で入金額を登録します。売れ残って商品が戻ってきたら「売れ残り」を押すと、倉庫の在庫に戻り、再び出品できます。')}</h2>
    <table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>商品</th><th>委託先</th><th>委託日</th><th class="text-right">原価</th><th>希望価格</th><th>操作</th></tr></thead><tbody>
      ${consigned.length ? consigned.map((r) => {
        const { unit, rec } = r;
        const days = Math.floor((now - rec.listedAt) / 86400000);
        return `<tr class="border-b"><td class="font-bold">${esc(unit.name)}<div class="text-xs font-normal text-slate-500 font-mono">${esc(unit.code)}</div></td>
          <td>${badge('bg-violet-50 text-violet-800', esc(rec.vendor || '（未入力）'))}<div class="text-xs text-slate-500">${esc(channelOf(rec.channel)?.label)}</div>${rec.packId && packs.get(rec.packId) ? `<div class="text-xs text-slate-500">${shipInfo(packs.get(rec.packId))}</div>` : ''}</td><td>${md(dateOf(rec.listedAt))}<div class="text-xs text-slate-500">${days}日経過</div></td><td class="text-right">${yen(unit.price)}</td>
          <td><div class="flex items-center gap-1 w-44">${moneyInputHtml({ attrs: `data-reprice-input="${esc(unit.code)}"`, value: rec.listPrice, cls: 'inp !py-1' })}<button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-reprice="${esc(unit.code)}">変更</button></div></td>
          <td><button class="b b-pri !min-h-0 !py-1 !px-3 text-sm" data-sell-open="${esc(unit.code)}">売れた（入金）</button> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-recall="${esc(unit.code)}">売れ残り（倉庫に戻る）</button></td></tr>
          ${sf.code === unit.code ? sellForm(r, sf) : ''}`;
      }).join('') : '<tr><td colspan="6" class="text-slate-400">委託中の商品はありません。</td></tr>'}
    </tbody></table>
  </section>`;
}

function listedTable(listed, sf) {
  return `
  <section class="rounded-xl border bg-white p-4 space-y-3">
    <h2 class="font-bold text-lg">📣 出品中の商品（${listed.length}点）${helpIcon('手数料率はダミーです（メルカリ・ヤフオク 10%、ラクマ 6.6%、業者オークション 3%、業者へ直接販売 0%）。\n売れたら「売れた」から、実際の売価・送料を登録すると、売上管理に反映されます。')}</h2>
    <table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>商品</th><th>販売先</th><th>出品日</th><th class="text-right">原価</th><th>出品価格</th><th class="text-right">見込み利益</th><th>操作</th></tr></thead><tbody>
      ${listed.length ? listed.map((r) => {
        const { unit, rec } = r;
        const est = rec.listPrice - unit.price - feeFor(rec.channel, rec.listPrice);
        return `<tr class="border-b"><td class="font-bold">${esc(unit.name)}<div class="text-xs font-normal text-slate-500 font-mono">${esc(unit.code)}</div></td>
          <td>${badge('bg-sky-100 text-sky-800', esc(channelOf(rec.channel)?.label))}</td><td>${md(dateOf(rec.listedAt))}</td><td class="text-right">${yen(unit.price)}</td>
          <td><div class="flex items-center gap-1 w-44">${moneyInputHtml({ attrs: `data-reprice-input="${esc(unit.code)}"`, value: rec.listPrice, cls: 'inp !py-1' })}<button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-reprice="${esc(unit.code)}">変更</button></div></td>
          <td class="text-right font-bold ${profitCls(est)}">${yenS(est)}</td>
          <td><button class="b b-pri !min-h-0 !py-1 !px-3 text-sm" data-sell-open="${esc(unit.code)}">売れた</button> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-delist="${esc(unit.code)}">取り下げ</button></td></tr>
          ${sf.code === unit.code ? sellForm(r, sf) : ''}`;
      }).join('') : '<tr><td colspan="7" class="text-slate-400">出品中の商品はありません。</td></tr>'}
    </tbody></table>
  </section>`;
}

// 委託のパック（業者への委託）の画面は、委託中の商品の一覧と並べる。ctx は { full, master, me }
export function listTab({ rows }, { lf, sf, pk }, now = Date.now(), ctx = null) {
  const packs = new Map((ctx?.full.transfers ?? []).filter((t) => t.kind === 'consign').map((t) => [t.id, t]));
  const flea = `<div class="grid xl:grid-cols-[26rem_1fr] gap-4 items-start">${listForm(rows.filter((r) => r.canList), lf)}
  <div class="space-y-4">${listedTable(rows.filter((r) => r.stage === 'listed'), sf)}</div></div>`;
  if (!ctx) return flea;
  const consign = `<div class="grid xl:grid-cols-[minmax(32rem,40rem)_1fr] gap-4 items-start">${openPackOf(ctx.full, pk, 'consign') ? packWork(ctx.full, ctx.master, ctx.me, pk, now, 'consign') : packList(ctx.full, ctx.master, ctx.me, pk, 'consign')}
    ${consignedTable(rows.filter((r) => r.stage === 'consigned'), sf, now, packs)}</div>`;
  const sale = `<div class="grid xl:grid-cols-[minmax(32rem,40rem)_1fr] gap-4 items-start">${openPackOf(ctx.full, pk, 'sale') ? packWork(ctx.full, ctx.master, ctx.me, pk, now, 'sale') : packList(ctx.full, ctx.master, ctx.me, pk, 'sale')}</div>`;
  return `${flea}${consign}${sale}`;
}
