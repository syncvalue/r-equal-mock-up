// 補充の依頼（鑑定士タブレット・経費管理）。経理部に、補充金の振込を頼む。依頼の状況（依頼中・振込済み・却下）も見られる。
import { esc, yen, fmtTime } from './format.js';
import { moneyInputHtml } from './moneyInput.js';
import { requestReady, REQUEST_STATUS } from './advanceRequest.js';

const md = (at) => { const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()}`; };

// 送信ボタン（入力のたびに差し替え）
export function advLiveView(s) {
  const ok = requestReady(s.advForm);
  return `<button class="btn btn-primary !px-4 whitespace-nowrap" data-action="adv-send" ${ok ? '' : 'disabled'}>${ok ? '補充を依頼する' : '金額を入力'}</button>`;
}

export function advanceRequestView(s) {
  const list = (s.advRequests ?? []).slice(0, 4);
  const pending = (s.advRequests ?? []).filter((r) => r.status === 'pending').length;
  return `<div class="rounded-xl border-2 p-2 mb-2 space-y-1.5"><div class="font-bold text-sm">🙋 補充を依頼する${pending ? `<span class="ml-1 rounded bg-amber-400 text-slate-900 text-xs px-1.5 py-0.5">依頼中 ${pending}</span>` : ''}</div>
    <div class="text-xs text-slate-500">買取資金が足りなくなりそうなときに、経理部へ補充金の振込を頼みます。振り込まれても、引き出して登録するまで、所持金には入りません。</div>
    <div class="flex gap-2"><div class="flex-1">${moneyInputHtml({ attrs: 'data-wd="adv-amount"', value: s.advForm.amount, cls: 'field', placeholder: '補充してほしい金額' })}</div><div id="adv-live">${advLiveView(s)}</div></div>
    <input class="field !py-2" data-wd="adv-memo" value="${esc(s.advForm.memo)}" placeholder="理由・用途（任意）例: 高額案件の予定があるため" />
    ${list.length ? `<div class="space-y-1 pt-1">${list.map((r) => `<div class="flex items-center gap-2 rounded-lg border px-2 py-1 text-sm ${r.status === 'rejected' ? 'border-rose-300 bg-rose-50' : ''}"><span class="text-xs text-slate-500">${md(r.at)} ${fmtTime(r.at).slice(0, 5)}</span><b>${yen(r.amount)}</b>
      <span class="flex-1 min-w-0 text-xs text-slate-600 truncate">${esc(r.memo)}${r.status === 'rejected' ? `<span class="block text-rose-700 font-bold whitespace-normal">却下の理由：${esc(r.reason)}</span>` : ''}</span>
      <span class="rounded text-[11px] font-bold px-1.5 py-0.5 ${REQUEST_STATUS[r.status].cls}">${REQUEST_STATUS[r.status].label}${r.status === 'done' ? ` ${yen(r.paidAmount)}` : ''}</span>
      ${r.status === 'pending' ? `<button class="text-xs underline text-slate-500" data-action="adv-withdraw" data-id="${r.id}">取り下げる</button>` : ''}</div>`).join('')}</div>` : ''}</div>`;
}
