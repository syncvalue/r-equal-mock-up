// ↩ クーリングオフ返品: コールセンターが受電して作った依頼への、倉庫の対応（問い合わせへの回答 → 返送 → 代金の返還の確認）。
import { reasonOf, isOpenReturn, returnSteps } from '../src/warehouse.js';
import { yen, esc } from '../src/format.js';
import { badge, mdTime } from './ui.js';
import { photoOf } from '../src/image.js';

export const STATUS = {
  inquiring: ['倉庫に問い合わせ中', 'bg-rose-100 text-rose-800'], requested: ['返送の準備中', 'bg-amber-100 text-amber-800'], shipped: ['返送済み・代金の返還待ち', 'bg-sky-100 text-sky-800'],
  done: ['完了', 'bg-emerald-100 text-emerald-800'], unavailable: ['対応不可', 'bg-slate-200 text-slate-700'],
};
const STEP_CLS = { done: 'bg-emerald-600 text-white', current: 'bg-amber-400 text-slate-900', todo: 'bg-slate-200 text-slate-500', ng: 'bg-rose-600 text-white' };

// 進捗（受電・依頼 → 倉庫の回答 → 返送 → 代金の返還）。コールセンターの画面でも使う
export const stepsHtml = (r) => `<ol class="flex flex-wrap items-center gap-1 text-xs">${returnSteps(r).map((x, i) => `${i ? '<li aria-hidden="true" class="text-slate-400">›</li>' : ''}<li class="rounded px-2 py-0.5 font-bold ${STEP_CLS[x.state]}">${x.state === 'done' ? '✔ ' : x.state === 'ng' ? '✕ ' : ''}${x.label}</li>`).join('')}</ol>`;

// 商品の1行。保管場所と、期間超過の目印
function unitLine(r, u) {
  const place = u?.status === 'stored' ? esc(u.location) : '入庫前';
  return `<div class="flex flex-wrap items-center gap-2">${u?.name ? `<img src="${photoOf(u)}" alt="${esc(u.name)}" class="h-12 w-12 object-cover rounded border bg-slate-100" />` : ''}<span class="text-xs font-mono text-slate-500">${esc(u?.code ?? '')}</span>${esc(u?.name ?? '')}<span class="text-slate-500">（${yen(u?.price ?? 0)}）</span><span class="text-xs text-violet-700">${place}</span>${r.expiredCodes?.includes(u?.code) ? badge('bg-rose-100 text-rose-700', '期間超過') : ''}</div>`;
}

function returnItem(r, unitsByCode) {
  const [label, cls] = STATUS[r.status];
  const units = r.codes.map((c) => unitsByCode.get(c));
  const inq = r.inquiry;
  return `<div class="rounded-lg border p-3 space-y-2 text-sm">
    <div class="flex flex-wrap items-center gap-2"><b class="text-base">${esc(r.customerName)} 様</b>${badge(cls, label)}<span class="text-xs text-slate-500">受電 ${mdTime(r.requestedAt)}${r.requestedBy ? `（${esc(r.requestedBy)}）` : ''}／${esc(reasonOf(r.reason).label)}</span></div>
    ${stepsHtml(r)}
    <div class="space-y-0.5">${units.map((u, i) => unitLine(r, u ?? { code: r.codes[i] })).join('')}</div>
    ${r.memo ? `<div class="text-xs text-slate-500">受電メモ: ${esc(r.memo)}</div>` : ''}
    ${r.status === 'unavailable' ? '' : `<div>お客様から返していただく買取代金 <b>${yen(r.refund)}</b>${r.groupRefund && r.groupRefund !== r.refund ? `<span class="text-xs text-slate-500">（同じ契約の、他の保管場所の分を含めた合計 ${yen(r.groupRefund)}）</span>` : ''}</div>`}
    ${inq?.answeredAt ? `<div class="text-xs text-slate-500">倉庫の回答: ${inq.ok ? '返送できる' : '対応できない'}${inq.note ? `（${esc(inq.note)}）` : ''}／${mdTime(inq.answeredAt)}${inq.answeredBy ? `・${esc(inq.answeredBy)}` : ''}</div>` : ''}
    ${r.status === 'unavailable' ? `<div class="text-xs rounded bg-slate-50 p-2">${r.unavailable.reason === 'sold' ? '売却済みのため、対応できません。' : '倉庫が対応できないと回答しました。'}${r.unavailable.note && r.unavailable.reason !== 'sold' ? esc(r.unavailable.note) : ''}</div>` : ''}
    ${r.status === 'inquiring' ? `<div class="rounded bg-rose-50 border border-rose-200 p-2 space-y-2">
      <div class="text-xs text-rose-800 font-bold">コールセンターからの問い合わせです。商品があって、お客様へ返送できるか回答してください。${r.expiredCodes?.length ? '期間（10日間）を過ぎた商品を含むので、返送するか個別に判断してください。' : ''}</div>
      <label class="text-xs font-bold block">メモ（対応できない場合は理由が必要）<input class="inp mt-1 font-normal" data-inq-note="${esc(r.id)}" placeholder="例: 在庫にあります／出品の準備に入っており、お断りします" /></label>
      <div class="flex gap-2"><button class="b b-pri" data-inq-ok="${esc(r.id)}">返送できる（準備に進む）</button><button class="b b-sec" data-inq-ng="${esc(r.id)}">対応できない</button></div></div>` : ''}
    ${r.status === 'requested' ? `<div class="flex items-end gap-2"><label class="text-xs font-bold flex-1">返送の追跡番号<input class="inp mt-1 font-normal" data-track="${esc(r.id)}" placeholder="例: 5012-3344-9871" /></label><button class="b b-pri" data-ship="${esc(r.id)}">返送済みにする</button></div>` : ''}
    ${r.status === 'shipped' ? `<div class="flex items-center gap-3"><span class="text-xs">追跡番号 <b>${esc(r.tracking)}</b>（${mdTime(r.shippedAt)} 返送${r.shippedBy ? `・${esc(r.shippedBy)}` : ''}）</span><button class="b b-pri" data-return-done="${esc(r.id)}">代金の返還を確認して完了</button></div>` : ''}
    ${r.status === 'done' ? `<div class="text-xs text-slate-500">追跡番号 ${esc(r.tracking)}／${mdTime(r.doneAt)} 完了${r.doneBy ? `（${esc(r.doneBy)}）` : ''}</div>` : ''}
  </div>`;
}

const group = (title, list, unitsByCode, empty) => `<section class="rounded-xl border bg-white p-4 space-y-3">
  <h2 class="font-bold text-lg">${title}（${list.length}件）</h2>
  ${list.length ? list.map((r) => returnItem(r, unitsByCode)).join('') : `<p class="text-sm text-slate-500">${empty}</p>`}
</section>`;

// state は自分の倉庫の分（回答・返送・完了の対応の一覧）。依頼は、コールセンターの「クーリングオフ」タブで受電して作る（full は全倉庫の状態）
export function returnTab(state, ui, now = Date.now(), { full }) {
  const unitsByCode = new Map(full.units.map((u) => [u.code, u]));
  const byTime = (a, b) => b.requestedAt - a.requestedAt;
  const asked = state.returns.filter((r) => r.status === 'inquiring').sort(byTime);
  const open = state.returns.filter((r) => isOpenReturn(r) && r.status !== 'inquiring').sort(byTime);
  const closed = state.returns.filter((r) => !isOpenReturn(r)).sort(byTime);
  return `<div class="space-y-4">
    <p class="text-xs text-slate-500">クーリングオフは、お客様の電話（専用の番号）をコールセンターが受けて、依頼を作ります。倉庫は、問い合わせに回答し、返送して、お客様から買取代金の返還を確認したら完了にします。お客様は書面を受け取った日から8日間、無条件で契約を解除できます（当社は、郵送の余裕を見て、買取から10日間は商品を販売せずに保管します）。</p>
    <div class="grid xl:grid-cols-2 gap-4 items-start">
      ${group('問い合わせへの回答待ち', asked, unitsByCode, '回答待ちの問い合わせはありません。')}
      ${group('返送・代金の返還の対応中', open, unitsByCode, '対応中の返品はありません。')}
    </div>
    ${group('完了・対応不可', closed, unitsByCode, 'まだありません。')}
  </div>`;
}
