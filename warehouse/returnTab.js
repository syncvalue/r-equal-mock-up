// ↩ クーリングオフ返品: お客様からの返品依頼の受付と、返送・代金返還の確認までの対応。
import { RETURN_REASONS, reasonOf, returnableContracts, dateOf } from '../src/warehouse.js';
import { yen, esc } from '../src/format.js';
import { badge, md, mdTime, whName } from './ui.js';

const STATUS = { requested: ['返送の準備中', 'bg-amber-100 text-amber-800'], shipped: ['返送済み・代金の返還待ち', 'bg-sky-100 text-sky-800'], done: ['完了', 'bg-emerald-100 text-emerald-800'] };

function requestForm(contracts, rf, now, master) {
  const c = contracts.find((x) => x.visitId === rf.visitId);
  return `
  <section class="rounded-xl border bg-white p-4 space-y-3">
    <h2 class="font-bold text-lg">↩ 返品の受付</h2>
    <p class="text-xs text-slate-500">訪問購入のお客様は、書面を受け取った日から8日間、無条件で契約を解除できます（通知は郵送で届くため、当社は買取から10日間を受付期間にしています）。期間内は商品を出品・販売せず、依頼があったら受け付けて、当社の負担でお客様へ返送します。お客様には、受け取った買取代金を返していただきます。</p>
    ${contracts.length ? `
    <label class="text-sm font-bold block">契約（お客様・買取日）<select class="inp mt-1 font-normal" data-f="rf.visitId">
      <option value="">選んでください（期間内 ${contracts.length}件）</option>
      ${contracts.map((x) => `<option value="${esc(x.visitId)}" ${rf.visitId === x.visitId ? 'selected' : ''}>${esc(x.customerName)} 様　${md(x.date)}買取・${md(x.coolEnd)}まで（${x.units.length}点 ${yen(x.total)}）</option>`).join('')}</select></label>
    ${c ? `<div class="text-sm font-bold">返品する商品</div>
      <div class="space-y-1">${c.units.map((u) => `<label class="flex items-center gap-2 text-sm"><input type="checkbox" data-rf-code="${esc(u.code)}" ${rf.codes.includes(u.code) ? 'checked' : ''} />${esc(u.name)}<span class="text-slate-500">（${yen(u.price)}）</span><span class="text-xs text-violet-700">${esc(whName(u, master))}／${esc(u.location)}</span></label>`).join('')}</div>
      ${new Set(c.units.map((u) => whName(u, master))).size > 1 ? '<div class="text-xs rounded bg-violet-50 border border-violet-200 p-2 text-violet-800">この契約の商品は、複数の保管場所（本社・倉庫）に分かれています。受け付けると、保管場所ごとの返品に分かれ、それぞれの担当者が返送します。</div>' : ''}
      <div class="grid sm:grid-cols-2 gap-3">
        <label class="text-sm font-bold">理由<select class="inp mt-1 font-normal" data-f="rf.reason">${RETURN_REASONS.map((r) => `<option value="${r.key}" ${rf.reason === r.key ? 'selected' : ''}>${r.label}</option>`).join('')}</select></label>
        <label class="text-sm font-bold">メモ<input class="inp mt-1 font-normal" data-f="rf.memo" value="${esc(rf.memo)}" placeholder="例: 返送先の住所確認済み" /></label>
      </div>
      <div class="text-sm rounded bg-slate-50 p-2">お客様から返していただく買取代金 <b class="text-lg">${yen(c.units.filter((u) => rf.codes.includes(u.code)).reduce((n, u) => n + u.price, 0))}</b></div>
      <button class="b b-pri" data-return-add ${rf.codes.length ? '' : 'disabled'}>返品を受け付ける</button>` : ''}`
    : `<p class="text-sm text-slate-500">いま返品を受け付けられる商品はありません（${dateOf(now)} 時点で、買取から10日以内の入庫済みの商品がありません）。</p>`}
  </section>`;
}

function returnItem(r, unitsByCode, master) {
  const [label, cls] = STATUS[r.status];
  return `<div class="rounded-lg border p-3 space-y-2 text-sm">
    <div class="flex flex-wrap items-center gap-2"><b class="text-base">${esc(r.customerName)} 様</b>${badge(cls, label)}${r.warehouseId ? badge('bg-violet-50 text-violet-800', esc(master.warehouses.find((w) => w.id === r.warehouseId)?.name ?? '')) : ''}<span class="text-xs text-slate-500">受付 ${mdTime(r.requestedAt)}${r.requestedBy ? `（${esc(r.requestedBy)}）` : ''}／${esc(reasonOf(r.reason).label)}</span></div>
    <div>${r.codes.map((c) => esc(unitsByCode.get(c)?.name ?? c)).join('、')}（${r.codes.length}点）</div>
    ${r.memo ? `<div class="text-xs text-slate-500">${esc(r.memo)}</div>` : ''}
    <div>お客様から返していただく買取代金 <b>${yen(r.refund)}</b>${r.groupRefund && r.groupRefund !== r.refund ? `<span class="text-xs text-slate-500">（同じ契約の、他の保管場所の分を含めた合計 ${yen(r.groupRefund)}）</span>` : ''}</div>
    ${r.status === 'requested' ? `<div class="flex items-end gap-2"><label class="text-xs font-bold flex-1">返送の追跡番号<input class="inp mt-1 font-normal" data-track="${esc(r.id)}" placeholder="例: 5012-3344-9871" /></label><button class="b b-pri" data-ship="${esc(r.id)}">返送済みにする</button></div>` : ''}
    ${r.status === 'shipped' ? `<div class="flex items-center gap-3"><span class="text-xs">追跡番号 <b>${esc(r.tracking)}</b>（${mdTime(r.shippedAt)} 返送${r.shippedBy ? `・${esc(r.shippedBy)}` : ''}）</span><button class="b b-pri" data-return-done="${esc(r.id)}">代金の返還を確認して完了</button></div>` : ''}
    ${r.status === 'done' ? `<div class="text-xs text-slate-500">追跡番号 ${esc(r.tracking)}／${mdTime(r.doneAt)} 完了${r.doneBy ? `（${esc(r.doneBy)}）` : ''}</div>` : ''}
  </div>`;
}

// state は自分の倉庫の分（返送・完了の対応の一覧）。契約は、他の倉庫・本社の商品を含めて受け付けられる（full は全倉庫の状態）
export function returnTab(state, ui, now = Date.now(), { full, master }) {
  const contracts = returnableContracts(full, now);
  const unitsByCode = new Map(state.units.map((u) => [u.code, u]));
  const open = state.returns.filter((r) => r.status !== 'done');
  const done = state.returns.filter((r) => r.status === 'done');
  return `<div class="grid xl:grid-cols-[28rem_1fr] gap-4 items-start">
    ${requestForm(contracts, ui.rf, now, master)}
    <section class="rounded-xl border bg-white p-4 space-y-3">
      <h2 class="font-bold text-lg">対応中の返品（${open.length}件）</h2>
      ${open.length ? open.map((r) => returnItem(r, unitsByCode, master)).join('') : '<p class="text-sm text-slate-500">対応中の返品はありません。</p>'}
      <h2 class="font-bold text-lg pt-2">完了した返品（${done.length}件）</h2>
      ${done.length ? done.map((r) => returnItem(r, unitsByCode, master)).join('') : '<p class="text-sm text-slate-500">まだありません。</p>'}
    </section>
  </div>`;
}
