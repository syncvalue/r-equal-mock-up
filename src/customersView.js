// 顧客検索の画面（鑑定士タブレット）。自分が担当したお客様の一覧と、お客様の詳細（電話の記録）。
import { esc, yen, fmtDateTime } from './format.js';
import { helpIcon } from './help.js';
import { customerRows, filterRows, sortRows, maskOtherSales, clip } from './myCustomers.js';
import { CALL_RESULTS, loadCallLog, makeCall, tooSoon, daysSince } from './callLog.js';
import { callHistory } from './callHistory.js';
import { loadReservations } from './reservations.js';
import { userById } from './dashboard.js';
import { loadCustNotes, notesOf } from './customerNotes.js';

export const NEAR_KM = 5;
const SORTS = [['days', '前回の訪問から長い順'], ['near', '近い順'], ['call', '電話していない順']];
const DAYS = [[0, 'すべて'], [30, '30日以上'], [90, '90日以上'], [180, '180日以上']];
const RESULT_CLS = { appo: 'bg-emerald-100 text-emerald-800', talked: 'bg-sky-100 text-sky-800', noanswer: 'bg-slate-200 text-slate-700', ng: 'bg-rose-100 text-rose-800' };
const date = (at) => new Date(at).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
const km = (n) => (n < 10 ? `${n.toFixed(1)}km` : `${Math.round(n)}km`);

const rowsOf = (s) => {
  const now = new Date();
  const all = customerRows(s.user, { now, from: s.geo?.ok ? s.geo : null, calls: loadCallLog(), notes: notesOf(loadCustNotes(), s.user) });
  const c = s.cust;
  return sortRows(filterRows(all, { q: c.q, minDays: c.minDays, nearKm: c.near ? NEAR_KM : 0, favOnly: c.favOnly }), c.sort);
};

// 直近の電話の印。最近電話していれば、しつこいと思われないよう、注意の色にする
function callBadge(r, now) {
  if (!r.lastCall) return '<span class="text-xs text-slate-400">電話の記録なし</span>';
  const soon = tooSoon(r.lastCall, now);
  return `<span class="text-xs font-bold rounded px-1.5 py-0.5 ${soon ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}">${soon ? '⚠ ' : ''}${daysSince(r.lastCall.at, now)}日前に電話（${esc(CALL_RESULTS[r.lastCall.result].split('（')[0])}）</span>`;
}

export function customerListHtml(s) {
  const now = new Date();
  const rows = rowsOf(s);
  if (!rows.length) return '<p class="text-center text-slate-400 py-10">条件に合うお客様はいません</p>';
  return `<div class="space-y-2">${rows.map((r) => `
    <div class="card !p-0 flex items-stretch overflow-hidden">
      <button class="min-w-0 flex-1 text-left flex items-center gap-3 p-3 active:bg-teal-50" data-action="cust-open" data-phone="${esc(r.phone)}" data-name="${esc(r.name)}">
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2 flex-wrap"><span class="text-lg font-bold">${esc(r.name)} 様</span><span class="text-xs text-slate-400">${esc(r.kana)}</span></div>
          <div class="text-sm text-slate-600 truncate">📍 ${esc(r.address)}</div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
            <span>前回 ${date(r.lastVisitAt)}（<b class="${r.days >= 90 ? 'text-teal-700' : ''}">${r.days}日前</b>）</span><span>訪問 ${r.visitCount}回</span><span>買取計 ${yen(r.total)}</span>${callBadge(r, now)}</div>
          ${r.memo ? `<div class="mt-1 text-xs rounded bg-yellow-50 border border-yellow-200 text-yellow-900 px-2 py-0.5 break-words">📝 自分用　${esc(clip(r.memo))}</div>` : ''}
          ${r.callMemo ? `<div class="mt-1 text-xs rounded bg-violet-50 border border-violet-200 text-violet-900 px-2 py-0.5 break-words">📞 ${new Date(r.callMemo.at).getMonth() + 1}/${new Date(r.callMemo.at).getDate()}の電話メモ　${esc(clip(r.callMemo.memo))}</div>` : ''}</div>
        <div class="text-right shrink-0">${r.distanceKm !== null ? `<div class="text-lg font-bold ${r.distanceKm <= NEAR_KM ? 'text-teal-700' : 'text-slate-500'}">${km(r.distanceKm)}</div><div class="text-[11px] text-slate-400">現在地から</div>` : ''}
          <div class="text-2xl">📞</div></div></button>
      <button class="w-14 shrink-0 text-3xl border-l ${r.favorite ? 'text-amber-400 bg-amber-50' : 'text-slate-300'} active:bg-amber-100" data-action="cust-fav" data-phone="${esc(r.phone)}" aria-label="${r.favorite ? 'お気に入りを外す' : 'お気に入りに登録'}">${r.favorite ? '★' : '☆'}</button></div>`).join('')}</div>`;
}

const chip = (on, label, attrs) => `<button class="rounded-full px-3 py-1.5 text-sm font-bold ${on ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}" ${attrs}>${label}</button>`;

export function customersView(s) {
  const c = s.cust;
  const total = customerRows(s.user, { now: new Date() }).length;
  return `
  <section class="h-full min-h-0 overflow-y-auto p-4 space-y-3" data-scroll="customers">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div><h2 class="text-2xl font-bold">📇 顧客検索${helpIcon('自分が担当したお客様だけが出ます。\n電話した結果は記録すると、オペレーターを含む他の人にも見えます（しつこいと思われないようにするため）。')}</h2>
        <p class="text-sm text-slate-500">自分のお客様 ${total}人　／　お客様に電話して、再訪のアポを取るための一覧です</p></div></div>
    <input class="field" id="cust-q" type="search" enterkeyhint="search" autocomplete="off" data-cust="q" placeholder="🔍 氏名・フリガナ・電話番号・住所で検索" value="${esc(c.q)}" />
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-slate-500">並び順</span>${SORTS.map(([k, l]) => chip(c.sort === k, l, `data-action="cust-sort" data-value="${k}"`)).join('')}</div>
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-slate-500">前回の訪問から</span>${DAYS.map(([d, l]) => chip(c.minDays === d, l, `data-action="cust-days" data-value="${d}"`)).join('')}
      <span class="mx-1 text-slate-300">|</span>${chip(c.near, `📍 近く（${NEAR_KM}km以内）`, 'data-action="cust-near"')}${chip(c.favOnly, '★ お気に入りだけ', 'data-action="cust-favonly"')}</div>
    ${s.geo?.pending ? '<p class="text-xs text-slate-500">現在地を確認しています…</p>' : !s.geo?.ok ? '<p class="text-xs text-amber-700 font-bold">現在地を取得できないため、距離は出せません（位置情報の許可を確認してください）</p>' : ''}
    <div id="cust-list">${customerListHtml(s)}</div>
  </section>`;
}

// お客様の詳細（モーダルの中身）。基本情報・自分の訪問・電話の履歴（オペレーターの電話も含む）・電話の結果の記録
export function customerCallModal(s) {
  const now = new Date();
  const row = customerRows(s.user, { now, from: s.geo?.ok ? s.geo : null, calls: loadCallLog(), notes: notesOf(loadCustNotes(), s.user) }).find((r) => r.phone === s.modal.phone);
  if (!row) return { title: 'お客様', body: '<p class="text-slate-400">お客様が見つかりません</p>' };
  const f = s.cust.form;
  const history = maskOtherSales(callHistory([row.phone], loadReservations(), loadCallLog()), s.user);
  const last = history[0];
  const ng = history.find((h) => h.kind === '鑑定士が架電' && /今後の連絡は不要/.test(h.note));
  const soon = last && daysSince(last.at, now) <= 7;
  const ready = makeCall({ phone: row.phone, customerName: row.name, by: userById(s.user).name, result: f.result, wish: f.wish }).ok;
  const info = (k, v) => `<div class="flex gap-2"><dt class="w-20 shrink-0 text-slate-500">${k}</dt><dd class="flex-1 font-bold">${v}</dd></div>`;
  return {
    title: `<button class="text-3xl align-middle mr-1 ${row.favorite ? 'text-amber-400' : 'text-slate-300'}" data-action="cust-fav" data-phone="${esc(row.phone)}" aria-label="${row.favorite ? 'お気に入りを外す' : 'お気に入りに登録'}">${row.favorite ? '★' : '☆'}</button>${esc(row.name)} 様`,
    body: `
    <dl class="text-sm space-y-1">
      ${info('フリガナ', esc(row.kana) || '-')}${info('電話番号', esc(row.phone))}${info('住所', `${esc(row.address)} <a class="ml-1 underline text-teal-700 font-normal" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${row.lat},${row.lng}">地図</a>${row.distanceKm !== null ? `<span class="ml-2 text-teal-700">現在地から ${km(row.distanceKm)}</span>` : ''}`)}
      ${info('自分の訪問', `${row.visitCount}回・前回 ${date(row.lastVisitAt)}（${row.days}日前）・買取計 ${yen(row.total)}`)}</dl>
    ${ng ? '<div class="rounded-xl border-2 border-rose-400 bg-rose-50 p-2 text-sm font-bold text-rose-700">🚫 「今後の連絡は不要」と言われています（電話は控えてください）</div>'
      : soon ? `<div class="rounded-xl border-2 border-amber-400 bg-amber-50 p-2 text-sm font-bold text-amber-800">⚠ ${daysSince(last.at, now)}日前に電話しています（${esc(last.kind)}・${esc(last.by ?? '')}）。しつこいと思われないよう、ご注意ください</div>` : ''}
    <a class="btn btn-primary w-full text-center !min-h-[52px] !py-2 text-lg" href="tel:${esc(row.phone.replace(/[^\d+]/g, ''))}">📞 ${esc(row.phone)} に電話をかける</a>
    <label class="block rounded-xl border border-yellow-300 bg-yellow-50 p-3"><span class="font-bold text-sm">📝 自分用のメモ<span class="ml-1 text-xs font-normal text-slate-500">自分だけに見えます・入力すると自動で保存されます</span></span>
      <textarea class="field mt-1" rows="2" data-cust="note" placeholder="電話しやすい時間・好み・次に提案したいもの など">${esc(row.memo)}</textarea></label>
    <div class="rounded-xl border p-3 space-y-2">
      <div class="font-bold">電話の結果を記録${helpIcon('記録すると、オペレーターを含む他の人にも見えます。\n電話をかけたら、必ず記録してください。')}</div>
      <div class="grid grid-cols-2 gap-2">${Object.entries(CALL_RESULTS).map(([k, l]) => `<button class="rounded-xl border-2 px-2 py-2 text-sm font-bold text-left ${f.result === k ? 'border-teal-600 bg-teal-50' : 'border-slate-200'}" data-action="cust-result" data-value="${k}">${f.result === k ? '✅ ' : ''}${l}</button>`).join('')}</div>
      ${f.result === 'appo' ? `<label class="block text-sm font-bold">再訪の希望日時<span class="text-rose-600 ml-1 text-xs">必須</span><input class="field mt-1" data-cust="wish" value="${esc(f.wish)}" placeholder="例: 12/5（金）午後" /></label>
        <p class="text-xs text-slate-500">オペレーターに共有されます。受付（日時の確定）は、オペレーターが行います。</p>` : ''}
      <label class="block text-sm font-bold">メモ（任意）<textarea class="field mt-1" rows="2" data-cust="memo" placeholder="お客様から伝えられたこと など">${esc(f.memo)}</textarea></label>
      <button class="btn btn-primary w-full !min-h-[48px] !py-2" data-action="cust-save" ${ready ? '' : 'disabled'}>電話の結果を記録する</button></div>
    <div><div class="font-bold text-sm mb-1">電話の履歴${helpIcon('鑑定士・オペレーターの電話と受付の記録です。ほかの鑑定士の名前は伏せています。')}</div>
      ${history.length ? `<div class="rounded-xl border divide-y text-sm">${history.map((h) => `<div class="flex items-start gap-2 px-2 py-1.5"><span class="w-32 shrink-0 text-xs text-slate-500">${fmtDateTime(h.at).replace(/:\d\d$/, '')}</span><span class="shrink-0 rounded px-1 text-xs font-bold bg-slate-100">${esc(h.kind)}</span><span class="flex-1 min-w-0">${esc(h.note)}<span class="ml-1 text-xs text-slate-400">（${esc(h.by ?? '')}）</span></span></div>`).join('')}</div>` : '<p class="text-sm text-slate-400">電話の記録はありません</p>'}</div>`,
  };
}
