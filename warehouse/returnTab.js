// ↩ クーリングオフ返品: コールセンターが受電して作った依頼の、一覧（検索・状態・未対応の目印）と、詳細（モーダル。やり取りのチャットと、回答・返送・完了の操作）。
import { reasonOf, isOpenReturn, returnSteps, returnAlerts, returnTimeline, searchReturns, returnCounts } from '../src/warehouse.js';
import { yen, esc } from '../src/format.js';
import { badge, mdTime } from './ui.js';
import { photoOf } from '../src/image.js';
import { bubblesHtml, messageBoxHtml } from './returnChat.js';

export const STATUS = {
  inquiring: ['倉庫に問い合わせ中', 'bg-rose-100 text-rose-800'], requested: ['返送の準備中', 'bg-amber-100 text-amber-800'], shipped: ['返送済み・代金の返還待ち', 'bg-sky-100 text-sky-800'],
  done: ['完了', 'bg-emerald-100 text-emerald-800'], unavailable: ['対応不可', 'bg-slate-200 text-slate-700'],
};
const STEP_CLS = { done: 'bg-emerald-600 text-white', current: 'bg-amber-400 text-slate-900', todo: 'bg-slate-200 text-slate-500', ng: 'bg-rose-600 text-white' };
const FILTERS = [['all', 'すべて'], ['todo', '未対応'], ['open', '対応中'], ['closed', '完了・対応不可']];

// 進捗（受電・依頼 → 倉庫の回答 → 返送 → 代金の返還）。コールセンターの画面でも使う
export const stepsHtml = (r) => `<ol class="flex flex-wrap items-center gap-1 text-xs">${returnSteps(r).map((x, i) => `${i ? '<li aria-hidden="true" class="text-slate-400">›</li>' : ''}<li class="rounded px-2 py-0.5 font-bold ${STEP_CLS[x.state]}">${x.state === 'done' ? '✔ ' : x.state === 'ng' ? '✕ ' : ''}${x.label}</li>`).join('')}</ol>`;

const alertBadges = (r) => returnAlerts(r).map((a) => badge('bg-rose-600 text-white', `未対応: ${a}`)).join(' ');

// ---- 一覧 -------------------------------------------------------------------------
function listRow(r, unitsByCode) {
  const [label, cls] = STATUS[r.status];
  const units = r.codes.map((c) => unitsByCode.get(c)).filter(Boolean);
  const todo = returnAlerts(r).length > 0;
  const last = returnTimeline(r).at(-1);
  return `<tr class="border-b align-top ${todo ? 'bg-rose-50' : ''}">
    <td class="whitespace-nowrap text-xs">${mdTime(r.requestedAt)}${r.requestedBy ? `<div class="text-slate-500">${esc(r.requestedBy)}</div>` : ''}</td>
    <td><button class="font-bold text-sky-800 underline text-left" data-ret-open="${esc(r.id)}">${esc(r.customerName)} 様</button>${r.phone ? `<div class="text-xs text-slate-500">${esc(r.phone)}</div>` : ''}</td>
    <td><div class="flex items-center gap-1">${units.slice(0, 3).map((u) => `<img src="${photoOf(u)}" alt="${esc(u.name)}" class="h-10 w-10 object-cover rounded border bg-slate-100" />`).join('')}<span class="text-xs">${esc(units[0]?.name ?? r.codes[0])}${r.codes.length > 1 ? ` ほか${r.codes.length - 1}点` : ''}</span></div></td>
    <td class="text-xs">${esc(reasonOf(r.reason).label)}</td>
    <td><div class="space-y-1">${badge(cls, label)}<div class="flex flex-wrap gap-1">${alertBadges(r)}</div></div></td>
    <td class="text-xs text-slate-600 max-w-[16rem]"><div class="truncate" title="${esc(last.text)}">${last.side === 'callcenter' ? 'コ: ' : last.side === 'warehouse' ? '倉: ' : ''}${esc(last.text.split('\n')[0])}</div><div class="text-slate-400">${mdTime(last.at)}</div></td>
    <td><button class="b b-sec !min-h-0 !py-1 !px-3 text-xs" data-ret-open="${esc(r.id)}">詳細</button></td></tr>`;
}

function listHtml(returns, units, rt) {
  const counts = returnCounts(returns);
  const shown = searchReturns(returns, units, { q: rt.q, filter: rt.filter });
  const unitsByCode = new Map(units.map((u) => [u.code, u]));
  return `<section class="rounded-xl border bg-white p-4 space-y-3">
    ${counts.todo ? `<div class="rounded-lg border-2 border-rose-400 bg-rose-50 p-3 flex flex-wrap items-center gap-3"><b class="text-rose-700 text-lg">未対応の依頼が ${counts.todo} 件あります</b><span class="text-sm text-rose-800">（回答待ち・返送待ち・コールセンターからの未返信のメッセージ）</span><button class="b b-pri !bg-rose-600" data-ret-filter="todo">未対応だけを見る</button></div>` : '<div class="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-800 font-bold">未対応の依頼はありません</div>'}
    <div class="flex flex-wrap items-center gap-2">
      <input class="inp !w-96 max-w-full" data-ret-q placeholder="お客様名・電話番号・商品名・シールNo.・依頼番号・メモで探す" value="${esc(rt.q)}" autocomplete="off" />
      ${FILTERS.map(([k, l]) => `<button class="b b-sec !min-h-[36px] !py-1 ${rt.filter === k ? 'on' : ''}" data-ret-filter="${k}" aria-pressed="${rt.filter === k}">${l} <b>${counts[k]}</b></button>`).join('')}</div>
    <div id="ret-list">${shown.length ? `<table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th>受電</th><th>お客様</th><th>商品</th><th>理由</th><th>状態</th><th>最新のやり取り</th><th></th></tr></thead><tbody>${shown.map((r) => listRow(r, unitsByCode)).join('')}</tbody></table>` : '<p class="text-sm text-slate-500 py-6 text-center">該当する依頼はありません。</p>'}</div>
  </section>`;
}

// ---- 詳細（モーダル）-----------------------------------------------------------------
function actionsHtml(r) {
  if (r.status === 'inquiring') {
    return `<div class="rounded bg-rose-50 border border-rose-200 p-2 space-y-2">
      <div class="text-xs text-rose-800 font-bold">商品があって、お客様へ返送できるか回答してください。${r.expiredCodes?.length ? '期間（10日間）を過ぎた商品を含むので、返送するか個別に判断してください。' : ''}上の入力欄の内容が、回答のメモとして、やり取りに残ります（「対応できない」場合は、理由の入力が必要です）。</div>
      <div class="flex gap-2"><button class="b b-pri" data-inq-ok="${esc(r.id)}">返送できる（準備に進む）</button><button class="b b-sec" data-inq-ng="${esc(r.id)}">対応できない</button></div></div>`;
  }
  if (r.status === 'requested') return `<div class="flex items-end gap-2"><label class="text-xs font-bold flex-1">返送の追跡番号<input class="inp mt-1 font-normal" data-track="${esc(r.id)}" placeholder="例: 5012-3344-9871" /></label><button class="b b-pri" data-ship="${esc(r.id)}">返送済みにする</button></div>`;
  if (r.status === 'shipped') return `<div class="flex items-center gap-3"><span class="text-xs">追跡番号 <b>${esc(r.tracking)}</b></span><button class="b b-pri" data-return-done="${esc(r.id)}">代金の返還を確認して完了</button></div>`;
  return '';
}

function unitLine(r, u) {
  const place = u?.status === 'stored' ? esc(u.location) : '入庫前';
  return `<div class="flex flex-wrap items-center gap-2">${u?.name ? `<img src="${photoOf(u)}" alt="${esc(u.name)}" class="h-12 w-12 object-cover rounded border bg-slate-100" />` : ''}<span class="text-xs font-mono text-slate-500">${esc(u?.code ?? '')}</span>${esc(u?.name ?? '')}<span class="text-slate-500">（${yen(u?.price ?? 0)}）</span><span class="text-xs text-violet-700">${place}</span>${r.expiredCodes?.includes(u?.code) ? badge('bg-rose-100 text-rose-700', '期間超過') : ''}</div>`;
}

function modalHtml(r, unitsByCode, draft) {
  const [label, cls] = STATUS[r.status];
  return `<div class="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="クーリングオフ依頼の詳細">
    <button class="absolute inset-0 bg-black/50 cursor-default" data-ret-close aria-label="閉じる"></button>
    <div class="relative bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
      <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-b"><b class="text-lg">${esc(r.customerName)} 様</b>${badge(cls, label)}${alertBadges(r)}<span class="text-xs text-slate-500">依頼 ${esc(r.id)}${r.phone ? `／${esc(r.phone)}` : ''}</span><button class="ml-auto w-9 h-9 rounded-lg text-xl hover:bg-slate-100" data-ret-close aria-label="閉じる">✕</button></div>
      <div class="px-4 py-3 space-y-3 overflow-y-auto">
        ${stepsHtml(r)}
        <div class="space-y-1">${r.codes.map((c) => unitLine(r, unitsByCode.get(c) ?? { code: c })).join('')}</div>
        ${r.status === 'unavailable' ? '' : `<div class="text-sm">お客様から返していただく買取代金 <b>${yen(r.refund)}</b>${r.groupRefund && r.groupRefund !== r.refund ? `<span class="text-xs text-slate-500">（同じ契約の、他の保管場所の分を含めた合計 ${yen(r.groupRefund)}）</span>` : ''}</div>`}
        <div class="rounded-lg border bg-slate-50 p-2"><div class="text-xs font-bold text-slate-500 mb-1">やり取り（コールセンター ⇄ 倉庫）</div>
          <div id="ret-chat" class="space-y-2 max-h-72 overflow-y-auto pr-1">${bubblesHtml(r)}</div></div>
        ${messageBoxHtml(r.id, draft, { msg: 'ret-msg', send: 'ret-send', placeholder: r.status === 'inquiring' ? 'メッセージ／回答のメモ（Enterで送信）' : undefined })}
        ${actionsHtml(r)}
      </div>
    </div></div>`;
}

// state は自分の倉庫の分。依頼は、コールセンターの「クーリングオフ」タブで受電して作る（full は全倉庫の状態）。ui.rt: { q, filter, open（開いている依頼）, draft（送信前のメッセージ）}
export function returnTab(state, ui, now = Date.now(), { full }) {
  const rt = { q: '', filter: 'all', open: '', draft: {}, ...ui.rt };
  const unitsByCode = new Map(full.units.map((u) => [u.code, u]));
  const opened = state.returns.find((r) => r.id === rt.open);
  return `<div class="space-y-3">
    <p class="text-xs text-slate-500">クーリングオフは、お客様の電話（専用の番号）をコールセンターが受けて、依頼を作ります。倉庫は、依頼を開いて、コールセンターとやり取りしながら、問い合わせに回答し、返送して、お客様から買取代金の返還を確認したら完了にします。お客様は書面を受け取った日から8日間、無条件で契約を解除できます（当社は、郵送の余裕を見て、買取から10日間は商品を販売せずに保管します）。</p>
    ${listHtml(state.returns, full.units, rt)}
    ${opened ? modalHtml(opened, unitsByCode, rt.draft[opened.id]) : ''}
  </div>`;
}
