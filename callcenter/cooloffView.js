// コールセンター「クーリングオフ」タブの表示。クーリングオフ専用の番号を受けたオペレーターが、商品を探して状態を確認し、依頼を作って、進捗を管理する。
import { RETURN_REASONS, reasonOf, isOpenReturn } from '../src/warehouse.js';
import { yen, esc } from '../src/format.js';
import { badge, md, mdw, mdTime } from '../warehouse/ui.js';
import { photoOf } from '../src/image.js';
import { STATUS, stepsHtml } from '../warehouse/returnTab.js';

// 依頼を作れなかった商品の理由
export const REJECT_TEXT = { unknown: '登録のない商品', inProgress: 'すでに依頼中の商品', returned: 'すでに返品済みの商品', inTransit: '倉庫間を輸送中の商品（届いてから依頼してください）', inPacking: '梱包中の商品（発送が済んでから依頼してください）' };

const KIND_CLS = { ok: 'bg-emerald-100 text-emerald-800', expired: 'bg-rose-100 text-rose-700', ask: 'bg-amber-100 text-amber-800', sold: 'bg-slate-200 text-slate-700', busy: 'bg-sky-100 text-sky-800', returned: 'bg-slate-100 text-slate-600', wait: 'bg-slate-200 text-slate-700' };
const SELECTABLE = new Set(['ok', 'expired', 'ask', 'sold']); // 依頼にできる商品（売却済みは、対応不可として記録する）

const thumb = (u, cls) => `<img src="${photoOf(u)}" alt="${esc(u.name)}" class="${cls} object-cover rounded border bg-slate-100 shrink-0" />`;

// 商品1点のカード。お客様と話しながら見分けられるよう、写真を大きく出す（押すと拡大）
function productCard(c, r, sel) {
  const can = SELECTABLE.has(r.check.kind);
  const mine = sel.visitId === c.visitId && sel.codes.includes(r.unit.code);
  return `<div class="flex gap-3 rounded-lg border p-2 ${mine ? 'border-teal-600 bg-teal-50' : 'bg-white'} ${can ? '' : 'opacity-60'}">
    <button class="shrink-0" data-co-zoom="${esc(r.unit.code)}" aria-label="写真を拡大" title="押すと拡大">${thumb(r.unit, 'h-28 w-28')}</button>
    <label class="flex-1 min-w-0 space-y-0.5 ${can ? 'cursor-pointer' : ''}">
      <div class="flex items-start gap-2"><input type="checkbox" class="mt-1" data-co-code="${esc(r.unit.code)}" data-co-visit="${esc(c.visitId)}" ${mine ? 'checked' : ''} ${can ? '' : 'disabled'} /><b class="text-sm leading-snug">${esc(r.unit.name)}</b></div>
      <div class="text-xs text-slate-600">${esc(r.unit.category)}　${yen(r.unit.price)}${r.unit.n > 1 || r.unit.qty > 1 ? `　（${r.unit.n}/${r.unit.qty}点目）` : ''}</div>
      <div>${badge(KIND_CLS[r.check.kind], esc(r.check.label))}</div>
      <div class="text-xs text-slate-500"><span class="font-mono">${esc(r.unit.code)}</span>　<span class="text-violet-700">${r.unit.status === 'stored' ? esc(r.unit.location) : '入庫前'}</span></div>
    </label>
  </div>`;
}

function contractCard(c, sel) {
  return `<section class="space-y-1.5">
    <div class="flex flex-wrap items-baseline gap-2 border-b pb-0.5"><b>${esc(c.customerName)} 様</b><span class="text-sm font-bold text-teal-800">${mdw(c.date)}買取</span><span class="text-xs text-slate-500">期間 ${md(c.coolEnd)}まで・${c.rows.length}点 ${yen(c.total)}</span>${c.phones?.length ? `<span class="text-xs text-slate-600">📞 ${c.phones.map(esc).join(' ／ ')}</span>` : ''}</div>
    <div class="space-y-1.5">${c.rows.map((r) => productCard(c, r, sel)).join('')}</div>
  </section>`;
}

// 電話で聞いた手がかり（買取日・カテゴリ）で絞る入力。買取日は、直近の日を曜日つきで並べ、その日の契約の数を添える
export function filtersHtml({ days, categories, criteria }) {
  const chip = (attrs, on, text) => `<button class="chip ${on ? 'on' : ''}" ${attrs} aria-pressed="${on}">${text}</button>`;
  return `<div class="rounded-xl border bg-white p-3 space-y-2">
    <div class="flex items-center justify-between"><span class="text-xs font-bold">買取日（「先週の金曜日」など。複数選べます）</span><button class="text-xs underline text-slate-500" data-co-clear>条件をすべて外す</button></div>
    <div class="flex flex-wrap gap-1">${days.map((d) => chip(`data-co-day="${esc(d.date)}"`, criteria.dates.includes(d.date), `${esc(d.label)}${d.count ? ` <span class="${criteria.dates.includes(d.date) ? '' : 'text-teal-700'}">${d.count}件</span>` : ' <span class="opacity-50">なし</span>'}`)).join('')}</div>
    <div class="text-xs font-bold">商品の種類</div>
    <div class="flex flex-wrap gap-1">${chip('data-co-cat=""', !criteria.category, 'すべて')}${categories.map((c) => chip(`data-co-cat="${esc(c)}"`, criteria.category === c, esc(c))).join('')}</div>
  </div>`;
}

// 商品を探した結果（契約ごと）。商品の状態を見て、依頼にできるかを確認する
export function resultsHtml(contracts, criteria, sel) {
  const any = String(criteria.q ?? '').trim() || criteria.dates?.length || criteria.category;
  if (!any) return '<p class="text-xs text-slate-500">お客様が話した手がかり（お名前・電話番号・買取日・商品の種類・商品名）で探します。うろ覚えでも、買取日だけ、商品の種類だけでも探せます。</p>';
  if (!contracts.length) return '<div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">該当する商品がありません。実際には買い取っていない可能性もあります。お名前を外して買取日だけで探す、買取日を広げる、商品の種類を「すべて」にする、などで探し直してください。</div>';
  return `<div class="space-y-3">${contracts.map((c) => contractCard(c, sel)).join('')}</div>`;
}

// 写真の拡大（お客様に、これですか、と確認するため）
export function zoomHtml(contract, row) {
  if (!contract || !row) return '';
  const u = row.unit;
  return `<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button class="absolute inset-0 bg-black/60 cursor-default" data-co-zoomclose aria-label="閉じる"></button>
    <div class="relative bg-white rounded-xl p-4 max-w-xl w-full space-y-2 shadow-xl">
      <img src="${photoOf(u)}" alt="${esc(u.name)}" class="w-full max-h-[60vh] object-contain rounded bg-slate-100" />
      <div class="font-bold text-lg">${esc(u.name)}</div>
      <div class="text-sm text-slate-600">${esc(u.category)}　${yen(u.price)}　${esc(contract.customerName)} 様${contract.phones?.length ? `（📞 ${contract.phones.map(esc).join(' ／ ')}）` : ''}　${mdw(contract.date)}買取　<span class="font-mono">${esc(u.code)}</span></div>
      <div>${badge(KIND_CLS[row.check.kind], esc(row.check.label))}</div>
      <button class="b b-sec" data-co-zoomclose>閉じる</button>
    </div></div>`;
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
      <label class="text-xs font-bold">電話番号（空欄なら、買取時の番号を記録）<input class="inp mt-0.5 font-normal" data-co-field="phone" value="${esc(form.phone)}" placeholder="${esc(c?.phones?.[0] ?? '例: 090-1234-5678')}" /></label>
      <label class="text-xs font-bold">理由<select class="inp mt-0.5 font-normal" data-co-field="reason">${RETURN_REASONS.map((r) => `<option value="${r.key}" ${form.reason === r.key ? 'selected' : ''}>${r.label}</option>`).join('')}</select></label>
    </div>
    <label class="text-xs font-bold block">受電メモ<input class="inp mt-0.5 font-normal" data-co-field="memo" value="${esc(form.memo)}" placeholder="例: 返送先は、ご自宅（買取時の住所）で確認済み" /></label>
    ${c?.phones?.length ? `<div class="text-xs text-slate-500">買取時の電話番号: ${c.phones.map(esc).join(' ／ ')}（ご本人の確認に使えます）</div>` : ''}
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
    <div class="text-xs space-y-0.5">${r.codes.map((c) => { const u = unitsByCode.get(c); return `<div class="flex items-center gap-2">${u ? thumb(u, 'h-9 w-9') : ''}<span>${esc(u?.name ?? c)}<span class="text-slate-500">（${yen(u?.price ?? 0)}・${esc(c)}）</span></span>${r.expiredCodes?.includes(c) ? badge('bg-rose-100 text-rose-700', '期間超過') : ''}</div>`; }).join('')}</div>
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

// タブ全体。手がかりの入力・検索結果・依頼の入力・進捗一覧は、それぞれ独立して作り直せるよう、入れ物（id）をつける
export function cooloffPage({ q, filtersInner, resultsInner, formInner, progressInner }) {
  return `<div class="grid grid-cols-[minmax(30rem,42rem)_1fr] gap-4 p-4 overflow-hidden h-[calc(100vh-52px)]">
    <section class="space-y-3 overflow-y-auto pr-1">
      <div class="rounded-xl border bg-white p-3 space-y-2">
        <div class="font-bold">📞 クーリングオフの受電</div>
        <p class="text-xs text-slate-500">専用の番号に電話が入ったら、お客様の手がかりで商品を探し、写真を見ながら「これですか」と確認して、依頼を作ります。依頼は倉庫に届き、倉庫が回答・返送します。</p>
        <label class="text-xs font-bold block">お名前・電話番号・商品名・商品の種類・シールNo.（空白やハイフンは気にしなくて大丈夫です）<input class="inp mt-0.5 font-normal" data-co-q value="${esc(q)}" placeholder="例: 山田、090-1234-5678、時計、ロレックス" /></label>
      </div>
      <div id="co-filters">${filtersInner}</div>
      <div id="co-results">${resultsInner}</div>
      <div id="co-form">${formInner}</div>
    </section>
    <section class="overflow-y-auto pr-1" id="co-progress">${progressInner}</section>
  </div><div id="co-zoom"></div>`;
}
