// コールセンター「クーリングオフ」タブの表示。クーリングオフ専用の番号を受けたオペレーターが、商品を探して状態を確認し、依頼を作って、進捗を管理する。
import { RETURN_REASONS, reasonOf, isOpenReturn } from '../src/warehouse.js';
import { yen, esc } from '../src/format.js';
import { badge, md, mdTime } from '../warehouse/ui.js';
import { STATUS, stepsHtml } from '../warehouse/returnTab.js';

// 依頼を作れなかった商品の理由
export const REJECT_TEXT = { unknown: '登録のない商品', inProgress: 'すでに依頼中の商品', returned: 'すでに返品済みの商品', inTransit: '倉庫間を輸送中の商品（届いてから依頼してください）', inPacking: '梱包中の商品（発送が済んでから依頼してください）' };

const KIND_CLS = { ok: 'bg-emerald-100 text-emerald-800', expired: 'bg-rose-100 text-rose-700', ask: 'bg-amber-100 text-amber-800', sold: 'bg-slate-200 text-slate-700', busy: 'bg-sky-100 text-sky-800', returned: 'bg-slate-100 text-slate-600', wait: 'bg-slate-200 text-slate-700' };
const SELECTABLE = new Set(['ok', 'expired', 'ask', 'sold']); // 依頼にできる商品（売却済みは、対応不可として記録する）

function contractCard(c, sel) {
  const mine = sel.visitId === c.visitId;
  return `<div class="rounded-lg border bg-white p-3 space-y-1.5 ${mine ? 'border-teal-600 ring-1 ring-teal-600' : ''}">
    <div class="flex flex-wrap items-center gap-2"><b>${esc(c.customerName)} 様</b><span class="text-xs text-slate-500">${md(c.date)}買取・期間 ${md(c.coolEnd)}まで・${c.rows.length}点 ${yen(c.total)}</span></div>
    ${c.rows.map((r) => `<label class="flex flex-wrap items-center gap-2 text-sm ${SELECTABLE.has(r.check.kind) ? '' : 'opacity-60'}">
      <input type="checkbox" data-co-code="${esc(r.unit.code)}" data-co-visit="${esc(c.visitId)}" ${mine && sel.codes.includes(r.unit.code) ? 'checked' : ''} ${SELECTABLE.has(r.check.kind) ? '' : 'disabled'} />
      <span class="text-xs font-mono text-slate-500">${esc(r.unit.code)}</span>${esc(r.unit.name)}<span class="text-slate-500">（${yen(r.unit.price)}）</span>${badge(KIND_CLS[r.check.kind], esc(r.check.label))}
      <span class="text-xs text-violet-700">${r.unit.status === 'stored' ? esc(r.unit.location) : '入庫前'}</span></label>`).join('')}
  </div>`;
}

// 商品を探した結果（契約ごと）。商品の状態を見て、依頼にできるかを確認する
export function resultsHtml(contracts, q, sel) {
  if (!String(q).trim()) return '<p class="text-xs text-slate-500">お客様のお名前・シールNo.・商品名で探して、商品の状態を確認します。</p>';
  if (!contracts.length) return '<p class="text-sm text-slate-500">該当する商品がありません。</p>';
  return `<div class="space-y-2">${contracts.map((c) => contractCard(c, sel)).join('')}</div>`;
}

// 依頼の入力（選んだ商品・電話番号・理由・メモ）
export function formHtml(contracts, sel, form) {
  const c = contracts.find((x) => x.visitId === sel.visitId);
  const rows = c ? c.rows.filter((r) => sel.codes.includes(r.unit.code)) : [];
  const asks = rows.filter((r) => r.check.kind !== 'sold'); // 売却済み以外は、倉庫に問い合わせる
  const sold = rows.filter((r) => r.check.kind === 'sold');
  return `<div class="rounded-xl border bg-white p-3 space-y-2">
    <div class="font-bold">依頼の作成</div>
    ${rows.length ? `<div class="text-sm"><b>${esc(c.customerName)} 様</b>　${rows.length}点を選択中（お客様から返していただく買取代金 <b>${yen(rows.filter((r) => r.check.kind !== 'sold').reduce((n, r) => n + r.unit.price, 0))}</b>）</div>` : '<div class="text-xs text-slate-500">上の検索結果から、返品を希望する商品にチェックを入れてください。</div>'}
    <div class="grid grid-cols-2 gap-2">
      <label class="text-xs font-bold">お客様の電話番号<input class="inp mt-0.5 font-normal" data-co-field="phone" value="${esc(form.phone)}" placeholder="例: 090-1234-5678" /></label>
      <label class="text-xs font-bold">理由<select class="inp mt-0.5 font-normal" data-co-field="reason">${RETURN_REASONS.map((r) => `<option value="${r.key}" ${form.reason === r.key ? 'selected' : ''}>${r.label}</option>`).join('')}</select></label>
    </div>
    <label class="text-xs font-bold block">受電メモ<input class="inp mt-0.5 font-normal" data-co-field="memo" value="${esc(form.memo)}" placeholder="例: 返送先は、ご自宅（買取時の住所）で確認済み" /></label>
    ${asks.length ? `<div class="text-xs rounded bg-amber-50 border border-amber-200 p-2 text-amber-900">${asks.length}点は、倉庫に問い合わせて、返送できるか回答をもらいます${asks.some((r) => r.check.kind === 'expired') ? '（期間を過ぎた商品は、倉庫が個別に判断します）' : ''}。</div>` : ''}
    ${sold.length ? `<div class="text-xs rounded bg-slate-100 border p-2 text-slate-700">売却済みの ${sold.length}点は、対応できません（対応不可として記録します）。</div>` : ''}
    <button class="b b-pri" data-co-create ${rows.length ? '' : 'disabled'}>依頼を作る（倉庫に問い合わせる）</button>
  </div>`;
}

function requestCard(r, unitsByCode) {
  const [label, cls] = STATUS[r.status];
  const inq = r.inquiry;
  return `<div class="rounded-lg border bg-white p-3 space-y-1.5 text-sm">
    <div class="flex flex-wrap items-center gap-2"><b class="text-base">${esc(r.customerName)} 様</b>${badge(cls, label)}<span class="text-xs text-slate-500">受電 ${mdTime(r.requestedAt)}${r.requestedBy ? `（${esc(r.requestedBy)}）` : ''}${r.phone ? `／${esc(r.phone)}` : ''}／${esc(reasonOf(r.reason).label)}</span></div>
    ${stepsHtml(r)}
    <div class="text-xs space-y-0.5">${r.codes.map((c) => { const u = unitsByCode.get(c); return `<div>${esc(u?.name ?? c)}<span class="text-slate-500">（${yen(u?.price ?? 0)}・${esc(c)}）</span>${r.expiredCodes?.includes(c) ? ` ${badge('bg-rose-100 text-rose-700', '期間超過')}` : ''}</div>`; }).join('')}</div>
    ${r.memo ? `<div class="text-xs text-slate-500">受電メモ: ${esc(r.memo)}</div>` : ''}
    ${inq?.answeredAt ? `<div class="text-xs">倉庫の回答: <b>${inq.ok ? '返送できる' : '対応できない'}</b>${inq.note ? `（${esc(inq.note)}）` : ''}／${mdTime(inq.answeredAt)}${inq.answeredBy ? `・${esc(inq.answeredBy)}` : ''}</div>` : ''}
    ${r.status === 'inquiring' ? '<div class="text-xs text-rose-700">倉庫の回答を待っています。回答が来たら、お客様に返送の予定をお伝えください。</div>' : ''}
    ${r.status === 'unavailable' ? `<div class="text-xs rounded bg-slate-50 p-2">${r.unavailable.reason === 'sold' ? '売却済みのため、対応できません。お客様にお伝えください。' : `対応できません。お客様にお伝えください。${r.unavailable.note ? `（${esc(r.unavailable.note)}）` : ''}`}</div>` : ''}
    ${r.status === 'shipped' ? `<div class="text-xs">返送の追跡番号 <b>${esc(r.tracking)}</b>（${mdTime(r.shippedAt)}）。お客様の手元に届いたら、買取代金の返還をお願いします。</div>` : ''}
    ${r.status === 'done' ? `<div class="text-xs text-slate-500">${mdTime(r.doneAt)} 完了（商品が戻り、返金も済みました）</div>` : ''}
    ${r.status !== 'unavailable' ? `<div class="text-xs">お客様から返していただく買取代金 <b>${yen(r.refund)}</b>${r.groupRefund && r.groupRefund !== r.refund ? `（同じ契約の合計 ${yen(r.groupRefund)}）` : ''}</div>` : ''}
  </div>`;
}

// 依頼の進捗一覧（対応中 → 完了・対応不可）
export function progressHtml(returns, units) {
  const unitsByCode = new Map(units.map((u) => [u.code, u]));
  const byTime = (a, b) => b.requestedAt - a.requestedAt;
  const open = returns.filter(isOpenReturn).sort(byTime);
  const closed = returns.filter((r) => !isOpenReturn(r)).sort(byTime);
  const section = (title, list, empty) => `<div class="space-y-2"><div class="font-bold">${title}（${list.length}件）</div>${list.length ? list.map((r) => requestCard(r, unitsByCode)).join('') : `<p class="text-xs text-slate-500">${empty}</p>`}</div>`;
  return `<div class="space-y-4">${section('対応中', open, '対応中の依頼はありません。')}${section('完了・対応不可', closed, 'まだありません。')}</div>`;
}

// タブ全体。検索結果・入力欄・進捗一覧は、それぞれ独立して作り直せるよう、入れ物（id）をつける
export function cooloffPage({ q, resultsInner, formInner, progressInner }) {
  return `<div class="grid grid-cols-[minmax(26rem,32rem)_1fr] gap-4 p-4 overflow-hidden h-[calc(100vh-52px)]">
    <section class="space-y-3 overflow-y-auto pr-1">
      <div class="rounded-xl border bg-white p-3 space-y-2">
        <div class="font-bold">📞 クーリングオフの受電</div>
        <p class="text-xs text-slate-500">専用の番号に、お客様から電話が入ったら、商品を探して状態を確認し、依頼を作ります。依頼は倉庫に届き、倉庫が回答・返送します。</p>
        <label class="text-xs font-bold block">商品を探す（お客様のお名前・シールNo.・商品名）<input class="inp mt-0.5 font-normal" data-co-q value="${esc(q)}" placeholder="例: 山田、RQ-WH0018、ロレックス" /></label>
      </div>
      <div id="co-results">${resultsInner}</div>
      <div id="co-form">${formInner}</div>
    </section>
    <section class="overflow-y-auto pr-1" id="co-progress">${progressInner}</section>
  </div>`;
}
