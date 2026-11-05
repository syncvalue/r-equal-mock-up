// 経費精算のチャットの表示。鑑定士は左、経理部は右、システムの記録（差戻し・チェック済みなど）は中央。経理部の画面と鑑定士タブレットで共通
import { esc, fmtTime } from './format.js';

const SIDE_LABEL = { accounting: '経理部', sales: '鑑定士' };
const KIND = { returned: ['bg-rose-50 border-rose-300 text-rose-800', '↩ 差戻し'], ok: ['bg-emerald-50 border-emerald-300 text-emerald-800', '✓ チェック済み'], revised: ['bg-sky-50 border-sky-300 text-sky-800', '✎ 修正'] };
const clock = (at) => fmtTime(at).slice(0, 5);

function bubble(m) {
  if (m.kind && KIND[m.kind]) {
    return `<div class="flex justify-center"><div class="max-w-[85%] rounded-lg border px-3 py-1.5 text-xs ${KIND[m.kind][0]}"><b>${KIND[m.kind][1]}</b>　${esc(m.text)}<span class="ml-2 opacity-70">${esc(m.by)} ${clock(m.at)}</span></div></div>`;
  }
  const mine = m.from === 'accounting'; // 経理部は右、鑑定士は左
  return `<div class="flex ${mine ? 'justify-end' : 'justify-start'}"><div class="max-w-[80%]"><div class="text-[11px] text-slate-500 ${mine ? 'text-right' : ''}">${esc(m.by || SIDE_LABEL[m.from])}　${clock(m.at)}</div>
    <div class="rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${mine ? 'bg-teal-600 text-white rounded-tr-sm' : 'bg-slate-200 text-slate-800 rounded-tl-sm'}">${esc(m.text)}</div></div></div>`;
}

// inputAttrs・sendAttrs: 入力欄・送信ボタンにつける属性（画面ごとに違う）。draft: 入力中の文章
export function chatView(thread, { inputAttrs, sendAttrs, draft = '', cls = 'inp' }) {
  return `<div class="rounded-xl border bg-white">
    <div class="p-3 space-y-2 max-h-64 overflow-y-auto bg-slate-50 rounded-t-xl" data-chat>${thread.messages.length ? thread.messages.map(bubble).join('') : '<div class="text-center text-xs text-slate-400 py-4">まだやり取りはありません。</div>'}</div>
    <div class="flex gap-2 p-2 border-t"><input class="${cls} flex-1" ${inputAttrs} value="${esc(draft)}" placeholder="メッセージを入力" aria-label="メッセージ" /><button class="b btn btn-primary b-pri !px-4" ${sendAttrs} >送信</button></div></div>`;
}
