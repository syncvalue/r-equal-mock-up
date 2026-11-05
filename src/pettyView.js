// 鑑定士タブレット: 小口金。残りの確認と、使用の申請（経理部が承認する）。自分の申請の状況も見る。
import { esc, yen } from './format.js';
import { helpIcon } from './help.js';
import { moneyInputHtml } from './moneyInput.js';
import { dateKey } from './workday.js';
import { PETTY_STATUS, PETTY_LOW, pettyStatusOf } from './fixedCosts.js';
import { pettyOf, pettyReady } from './pettyRequest.js';

export function pettyView(s) {
  const { row, mine } = pettyOf(s.user);
  const f = s.petty;
  return `
  <section class="h-full min-h-0 p-3 flex gap-3 portrait:flex-col">
    <div class="card !p-3 flex-1 min-w-0 flex flex-col min-h-0"><h2 class="font-bold text-lg mb-2">👜 小口金${helpIcon(`現場で使う道具・交通費などに使う、少額の現金です。使ったら、ここから申請すると、経理部が承認します。残りが${yen(PETTY_LOW)}を下回ったら、経理部に補充を頼んでください。`)}</h2>
      <div class="rounded-xl bg-slate-50 p-3 mb-2"><div class="text-xs text-slate-500">残り（承認済みの分を引いた額）</div><div class="text-3xl font-bold ${row.low ? 'text-rose-600' : ''}">${yen(row.balance)}</div>
        ${row.low ? `<div class="text-sm font-bold text-rose-600">⚠ 残りが少なくなっています。経理部に補充を頼んでください</div>` : ''}${row.pendingCount ? `<div class="text-sm font-bold text-amber-700">承認待ち ${row.pendingCount}件（${yen(row.pendingAmount)}）</div>` : ''}</div>
      <div class="font-bold text-sm mb-1">自分の申請</div>
      <div class="space-y-1.5 overflow-y-auto min-h-0 flex-1">${mine.map((u) => `<div class="rounded-xl border p-2 flex items-start gap-2"><div class="flex-1 min-w-0"><div class="font-bold">${yen(u.amount)} <span class="text-xs font-normal text-slate-500">${u.date.slice(5).replace('-', '/')}${u.proxy ? '　経理代行' : ''}</span></div><div class="text-sm">${esc(u.memo)}</div>${u.reason ? `<div class="text-xs font-bold text-rose-700">却下の理由: ${esc(u.reason)}</div>` : ''}</div>
        <div class="text-right shrink-0"><span class="rounded px-2 py-0.5 text-xs font-bold ${PETTY_STATUS[pettyStatusOf(u)].cls}">${PETTY_STATUS[pettyStatusOf(u)].label}</span>${pettyStatusOf(u) === 'pending' ? `<div><button class="text-xs underline text-slate-500 mt-1" data-action="petty-withdraw" data-id="${u.id}">取り下げる</button></div>` : ''}</div></div>`).join('') || '<div class="text-slate-400 text-sm">申請はありません。</div>'}</div></div>
    <div class="card !p-3 w-[26rem] shrink-0 portrait:w-full portrait:flex-none flex flex-col gap-2 overflow-y-auto">
      <h2 class="font-bold text-lg">➕ 使用を申請する</h2>
      <label class="block"><span class="font-bold text-sm">金額</span>${moneyInputHtml({ attrs: 'data-wd="petty-amount"', value: f.amount, placeholder: '3,000', cls: 'field' })}</label>
      <label class="block"><span class="font-bold text-sm">使った日</span><input type="date" class="field !py-2 mt-1" data-wd="petty-date" value="${f.date}" max="${dateKey()}" /></label>
      <label class="block"><span class="font-bold text-sm">用途<span class="text-rose-600 ml-1">必須</span></span><input class="field !py-2 mt-1" data-wd="petty-memo" value="${esc(f.memo)}" placeholder="例: 梱包用のテープ・手袋" /></label>
      <button class="btn btn-primary w-full text-lg !py-3" data-action="petty-send" ${pettyReady(f) ? '' : 'disabled'}>申請する</button>
    </div>
  </section>`;
}
