// 経費の修正（鑑定士タブレット）。営業サポートが「差戻し」にした日・まだチェックしていない日の経費を、鑑定士が直せる。チェック済みの日は直せない。
import { esc, yen, fmtTime } from './format.js';
import { moneyInputHtml } from './moneyInput.js';
import { EXPENSE_TYPES, typeOf, expenseReady, summaryOf } from './workday.js';
import { threadOf, unreadCount } from './expenseChat.js';
import { chatView } from './expenseChatView.js';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const mdw = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${WEEK[new Date(`${date}T00:00:00`).getDay()]}）`;
const returnedOf = (s) => (s.fixable ?? []).filter((r) => r.status === 'returned');

const newChat = (s, date) => { const n = unreadCount(s.chats ?? {}, s.user, date, 'sales'); return n ? `<span class="rounded-full bg-rose-600 text-white text-xs font-bold px-2 py-0.5">💬 新着 ${n}</span>` : ''; };

// ダッシュボード上部: 鑑定士の対応待ち（ボールを持っている）のお知らせ。差戻し・経理部からの質問。差戻しは理由つき
export function reviseBanner(s) {
  const list = s.balls ?? [];
  if (!list.length) return '';
  return `<div class="rounded-xl border-2 border-rose-400 bg-rose-50 p-3 space-y-2" role="alert">
    <div class="font-bold text-rose-800">🔔 経費精算で、あなたの対応待ちが ${list.length}件 あります</div>
    ${list.map((r) => { const reason = (s.fixable ?? []).find((f) => f.date === r.date)?.review?.reason; return `<div class="flex flex-wrap items-center gap-2 bg-white rounded-lg border border-rose-200 p-2"><b>${mdw(r.date)}</b><span class="flex-1 min-w-[12rem] text-sm text-rose-800">${esc(r.why)}${r.status === 'returned' && reason ? `<span class="block">理由：${esc(reason)}</span>` : ''}</span>
      ${r.age >= 2 ? `<span class="rounded bg-rose-600 text-white text-xs font-bold px-2 py-0.5">${r.age}日経過</span>` : ''}${newChat(s, r.date)}<button class="btn btn-primary !min-h-[44px] !py-1 !px-4" data-action="rv-open" data-date="${r.date}">開く</button></div>`; }).join('')}</div>`;
}

// 経費管理: 直せる日の一覧（差戻し・確認前）
export function reviseSection(s) {
  const list = s.fixable ?? [];
  if (!list.length) return '';
  return `<div class="card !p-3 space-y-2"><div class="font-bold">🛠 提出した経費の修正${'' /* 説明は下の文 */}</div>
    <div class="text-xs text-slate-500">営業サポートが確認するまでは、直せます。確認が済む（チェック済み）と、直せなくなります。差戻しになった日は、直すと、もう一度確認してもらえます。</div>
    ${list.map((r) => `<div class="flex flex-wrap items-center gap-2 rounded-lg border p-2 ${r.status === 'returned' ? 'border-rose-300 bg-rose-50' : ''}"><b>${mdw(r.date)}</b>
      ${r.status === 'returned' ? `<span class="rounded bg-rose-100 text-rose-700 text-xs font-bold px-2 py-0.5">差戻し</span><span class="flex-1 min-w-[10rem] text-sm text-rose-800">理由：${esc(r.review?.reason)}</span>` : '<span class="rounded bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5">確認待ち</span><span class="flex-1 text-sm text-slate-500">営業サポートの確認前です</span>'}
      ${newChat(s, r.date)}<button class="btn btn-secondary !min-h-[40px] !py-1 !px-4 text-sm" data-action="rv-open" data-date="${r.date}">修正する・経理部とやり取り</button></div>`).join('')}</div>`;
}

// 入力のたびに差し替える、保存ボタン
export function rvLiveView(s) {
  const d = s.rvDraft;
  const ok = expenseReady(d);
  const hint = !d.type ? '種別を選んでください' : !(d.amount > 0) ? '金額を入力してください' : d.type === 'other' && !d.memo.trim() ? '内容（メモ）を入力してください' : !d.photo ? 'レシートの写真を添付してください' : '';
  return `<button class="btn btn-primary w-full !py-3" data-action="rv-save" ${ok ? '' : 'disabled'}>${ok ? (d.id ? '修正を保存する' : '経費として追加する') : hint}</button>`;
}

function expRow(e, editing, locked) {
  const t = typeOf(e.type);
  return `<div class="flex items-center gap-2 px-2 py-1.5 rounded-lg border ${editing ? 'border-teal-500 bg-teal-50' : ''}">
    <span class="w-12 text-xs text-slate-500">${fmtTime(e.at).slice(0, 5)}</span><span class="text-xl">${t.icon}</span>
    <span class="flex-1 min-w-0"><b>${t.label}</b>${e.invoice ? '<span class="ml-1 text-[11px] rounded bg-emerald-100 text-emerald-800 px-1.5">インボイス</span>' : ''}${e.auto ? '<span class="ml-1 text-[11px] rounded bg-sky-100 text-sky-800 px-1.5">自動計上</span>' : ''}<span class="block text-xs text-slate-500 truncate">${esc(e.memo) || '<span class="text-rose-600 font-bold">（内容の記入なし）</span>'}</span></span>
    ${e.photo ? `<img src="${e.photo}" alt="レシート" class="w-10 h-10 rounded object-cover border" />` : e.auto ? '<span class="w-10"></span>' : '<span class="text-[11px] text-rose-600 font-bold w-10 text-center leading-tight">写真なし</span>'}
    <b class="w-24 text-right text-rose-600">−${yen(e.amount)}</b>
    ${e.auto || locked ? '<span class="w-[5.5rem]"></span>' : `<button class="btn btn-secondary !min-h-[36px] !py-0 !px-2 text-xs" data-action="rv-edit" data-id="${e.id}">編集</button><button class="w-9 h-9 rounded-lg text-slate-400 hover:bg-slate-100" data-action="rv-remove" data-id="${e.id}" aria-label="削除">🗑</button>`}</div>`;
}

export function reviseModalView(s) {
  if (s.modal?.type !== 'revise') return '';
  const date = s.modal.date;
  const row = (s.fixable ?? []).find((r) => r.date === date);
  const locked = !row; // チェック済みになった（または、提出前の）日は、直せない
  const day = row?.day ?? s.modal.day;
  if (!day) return '';
  const sm = summaryOf(day, s.user);
  const d = s.rvDraft;
  return `
  <div class="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-3" data-action="close-backdrop">
    <div class="bg-white rounded-2xl w-full max-w-5xl p-4 max-h-[96dvh] flex flex-col gap-3">
      <div class="flex justify-between items-center"><h2 class="text-xl font-bold">🛠 経費の修正　${mdw(date)}の提出分</h2><button class="btn btn-secondary !py-1 !min-h-[40px] !px-4" data-action="close-modal">閉じる</button></div>
      ${locked ? '<div class="rounded-lg bg-slate-100 border p-2 text-sm font-bold">この日は、営業サポートの確認が済んでいるため、直せません。</div>'
        : row.status === 'returned' ? `<div class="rounded-lg bg-rose-50 border-2 border-rose-300 p-2 text-sm"><b class="text-rose-800">営業サポートからの差戻し理由</b><div class="text-rose-800">${esc(row.review?.reason)}</div><div class="text-xs text-slate-500 mt-1">直して保存すると、もう一度確認してもらえます。</div></div>`
        : '<div class="rounded-lg bg-amber-50 border p-2 text-sm">営業サポートの確認前です。確認が済むと、直せなくなります。</div>'}
      <div class="flex-1 min-h-0 overflow-y-auto grid md:grid-cols-[3fr_2fr] gap-3 items-start" data-scroll="revise">
        <div class="space-y-1.5">
          <div class="flex flex-wrap gap-2 text-sm"><span class="rounded bg-slate-100 px-2 py-1">帳簿上の所持金 <b>${yen(sm.balance)}</b></span><span class="rounded bg-slate-100 px-2 py-1">終業時に数えた金額 <b>${yen(day.close?.counted ?? 0)}</b></span>
            <span class="rounded px-2 py-1 ${day.close?.diff ? 'bg-rose-100 text-rose-700 font-bold' : 'bg-emerald-100 text-emerald-800'}">過不足 ${day.close?.diff ? `${day.close.diff > 0 ? '+' : '−'}${yen(Math.abs(day.close.diff))}` : '一致'}</span></div>
          ${day.expenses.length ? day.expenses.map((e) => expRow(e, d.id === e.id, locked)).join('') : '<div class="text-slate-400 text-sm">経費の記録はありません。</div>'}
        </div>
        ${locked ? '' : `<div class="rounded-xl border p-3 space-y-2">
          <div class="flex items-center justify-between"><h3 class="font-bold">${d.id ? '✎ 経費を直す' : '➕ 経費を追加する'}</h3>${d.id ? '<button class="text-teal-700 font-bold underline text-sm" data-action="rv-new">追加に切り替える</button>' : ''}</div>
          <div><div class="font-bold text-sm mb-1">レシート<span class="text-rose-600 ml-1">必須</span></div>
            ${d.photo ? `<div class="flex items-center gap-3"><img src="${d.photo}" alt="レシート" class="h-20 rounded-lg border" /><button class="btn btn-secondary !min-h-[40px] !py-1 !px-3 text-sm" data-action="rv-photo-clear">撮り直す</button></div>`
              : `<div class="grid grid-cols-2 gap-2"><label class="btn btn-primary !min-h-[48px] !py-2 !px-2 text-center cursor-pointer flex items-center justify-center">📷 撮影する<input type="file" accept="image/*" capture="environment" class="hidden" data-rv-photo /></label>
                <button class="btn btn-secondary !min-h-[48px] !py-2 !px-2" data-action="rv-photo-dummy">（デモ用）ダミー写真</button></div>`}</div>
          <div><div class="font-bold text-sm mb-1">種別</div><div class="grid grid-cols-3 gap-1.5">${EXPENSE_TYPES.map((t) => `<button class="chip !px-1 !py-1 flex flex-col items-center leading-tight ${d.type === t.key ? 'active' : ''}" data-action="rv-type" data-value="${t.key}"><span class="text-xl">${t.icon}</span><span class="text-xs">${t.label}</span></button>`).join('')}</div></div>
          <label class="block"><span class="font-bold text-sm">金額</span>${moneyInputHtml({ attrs: 'data-wd="rv-amount"', value: d.amount, cls: 'field' })}</label>
          <label class="flex items-center gap-2 rounded-lg border p-2 cursor-pointer"><input type="checkbox" class="w-6 h-6" data-action="rv-invoice" ${d.invoice ? 'checked' : ''} /><span class="font-bold text-sm">インボイス対応のレシート</span></label>
          <label class="block"><span class="font-bold text-sm">内容・メモ${d.type === 'other' ? '<span class="text-rose-600 ml-1">必須</span>' : '<span class="font-normal text-xs text-slate-500">（任意）</span>'}</span><input class="field !py-2 mt-1" data-wd="rv-memo" value="${esc(d.memo)}" placeholder="例: 大阪→堺 往復分" /></label>
          <div id="rv-live">${rvLiveView(s)}</div></div>`}
        <div class="md:col-span-2"><div class="font-bold text-sm mb-1">💬 経理部とのやり取り${locked ? '' : ''}</div>
          ${chatView(threadOf(s.chats ?? {}, s.user, date), { inputAttrs: 'data-wd="rv-chat"', sendAttrs: 'data-action="rv-chat-send"', draft: s.rvChat ?? '', cls: 'field !py-2' })}</div>
      </div>
    </div>
  </div>`;
}
