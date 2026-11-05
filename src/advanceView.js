// 補充の依頼（鑑定士タブレット・経費管理）。画面にはボタンだけを置き、押すと、依頼と、経理部とのやり取り（チャット）の画面が開く。
import { esc, yen, fmtTime } from './format.js';
import { moneyInputHtml } from './moneyInput.js';
import { requestReady, REQUEST_STATUS, advThread, advUnread } from './advanceRequest.js';
import { chatView } from './expenseChatView.js';

const md = (at) => { const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()}`; };
const unreadTotal = (s) => (s.advRequests ?? []).reduce((n, r) => n + advUnread(s.chats ?? {}, r.id, 'sales'), 0);

// 経費管理に置くボタン（依頼中の件数・新着のチャットの件数つき）
export function advanceButton(s) {
  const pending = (s.advRequests ?? []).filter((r) => r.status === 'open').length;
  const unread = unreadTotal(s);
  return `<button class="btn btn-secondary w-full !min-h-[52px] mb-2 flex items-center justify-center gap-2 flex-wrap" data-action="adv-open">🙋 補充を依頼する${pending ? `<span class="rounded bg-amber-400 text-slate-900 text-xs font-bold px-2 py-0.5">やり取り中 ${pending}</span>` : ''}${unread ? `<span class="rounded-full bg-rose-600 text-white text-xs font-bold px-2 py-0.5">💬 新着 ${unread}</span>` : ''}</button>`;
}

// 送信ボタン（入力のたびに差し替え）
export function advLiveView(s) {
  const ok = requestReady(s.advForm);
  return `<button class="btn btn-primary !px-4 whitespace-nowrap" data-action="adv-send" ${ok ? '' : 'disabled'}>${ok ? '依頼する' : '金額を入力'}</button>`;
}

export function advanceModalView(s) {
  if (s.modal?.type !== 'advance') return '';
  const list = s.advRequests ?? [];
  const sel = list.find((r) => r.id === s.advSel) ?? list[0] ?? null;
  const row = (r) => `<div class="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm cursor-pointer ${r.id === sel?.id ? 'border-teal-500 bg-teal-50' : ''}" data-action="adv-pick" data-id="${r.id}">
    <span class="text-xs text-slate-500">${md(r.at)} ${fmtTime(r.at).slice(0, 5)}</span><b>${yen(r.amount)}</b><span class="flex-1"></span>
    ${advUnread(s.chats ?? {}, r.id, 'sales') ? `<span class="rounded-full bg-rose-600 text-white text-[11px] font-bold px-1.5">💬 新着 ${advUnread(s.chats ?? {}, r.id, 'sales')}</span>` : ''}
    <span class="rounded text-[11px] font-bold px-1.5 py-0.5 ${REQUEST_STATUS[r.status].cls}">${REQUEST_STATUS[r.status].label}</span></div>`;
  return `
  <div class="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-3" data-action="close-backdrop">
    <div class="bg-white rounded-2xl w-full max-w-4xl p-4 max-h-[96dvh] flex flex-col gap-3">
      <div class="flex justify-between items-center"><h2 class="text-xl font-bold">🙋 補充の依頼</h2><button class="btn btn-secondary !py-1 !min-h-[40px] !px-4" data-action="close-modal">閉じる</button></div>
      <div class="flex-1 min-h-0 overflow-y-auto grid md:grid-cols-[2fr_3fr] gap-3 items-start" data-scroll="advance">
        <div class="space-y-2">
          <div class="rounded-xl border-2 p-3 space-y-2"><div class="font-bold text-sm">新しく依頼する</div>
            <div class="text-xs text-slate-500">買取資金が足りなくなりそうなときに、経理部へ補充金の振込を頼みます（実際の振込は、銀行システムで行われます）。振り込まれても、引き出して登録するまで、所持金には入りません。</div>
            <label class="block"><span class="font-bold text-sm">補充してほしい金額</span>${moneyInputHtml({ attrs: 'data-wd="adv-amount"', value: s.advForm.amount, cls: 'field', placeholder: '200,000' })}</label>
            <label class="block"><span class="font-bold text-sm">理由・用途<span class="font-normal text-xs text-slate-500">（任意）</span></span><input class="field !py-2 mt-1" data-wd="adv-memo" value="${esc(s.advForm.memo)}" placeholder="例: 高額案件の予定があるため" /></label>
            <div id="adv-live">${advLiveView(s)}</div></div>
          <div class="font-bold text-sm">これまでの依頼</div>
          <div class="space-y-1">${list.length ? list.map(row).join('') : '<div class="text-sm text-slate-400">まだ依頼はありません。</div>'}</div></div>
        <div class="space-y-2">${sel ? `
          <div class="rounded-lg border p-2 flex flex-wrap items-center gap-2"><b class="text-lg">${yen(sel.amount)}</b><span class="rounded text-xs font-bold px-2 py-0.5 ${REQUEST_STATUS[sel.status].cls}">${REQUEST_STATUS[sel.status].label}</span><span class="flex-1 text-sm text-slate-600 min-w-0">${esc(sel.memo)}</span>
            ${sel.status === 'open' ? `<button class="btn btn-primary !min-h-[40px] !py-1 !px-3 text-sm" data-action="adv-close" data-id="${sel.id}">✓ 完了にする</button>` : `<span class="text-xs text-slate-500">${md(sel.closedAt)} ${fmtTime(sel.closedAt).slice(0, 5)} に完了</span>`}</div>
          <div class="text-xs text-slate-500">経理部とのやり取りが終わったら（振り込まれた場合も、見送りになった場合も）、「完了にする」を押してください。実際の振込は、銀行システムで行われます。</div>
          <div class="font-bold text-sm">💬 経理部とのやり取り</div>
          ${sel.status === 'open'
            ? chatView(advThread(s.chats ?? {}, sel.id), { inputAttrs: 'data-wd="adv-chat"', sendAttrs: 'data-action="adv-chat-send"', draft: s.advChat ?? '', cls: 'field !py-2' })
            : chatView(advThread(s.chats ?? {}, sel.id), { inputAttrs: 'disabled', sendAttrs: 'disabled', draft: '', cls: 'field !py-2' })}` : '<div class="rounded-xl border p-6 text-center text-sm text-slate-500">依頼を送ると、ここで、経理部とチャットで相談できます。</div>'}</div>
      </div>
    </div>
  </div>`;
}
