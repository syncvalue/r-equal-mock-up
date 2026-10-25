// クーリングオフ依頼の、やり取り（チャット）の表示。倉庫の詳細（モーダル）と、コールセンターの進捗で共通。
import { returnTimeline } from '../src/warehouse.js';
import { esc } from '../src/format.js';
import { mdTime } from './ui.js';

const SIDE = {
  callcenter: { label: 'コールセンター', wrap: 'justify-start', bubble: 'bg-teal-50 border-teal-300' },
  warehouse: { label: '倉庫', wrap: 'justify-end', bubble: 'bg-sky-100 border-sky-300' },
};

// 時系列の吹き出し。コールセンターは左・倉庫は右・システムの記録は中央
export const bubblesHtml = (ret) => returnTimeline(ret).map((m) => (m.side === 'system'
  ? `<div class="flex justify-center" data-side="system"><span class="rounded-full bg-slate-200 px-3 py-0.5 text-xs text-slate-700">${esc(m.text)}（${mdTime(m.at)}）</span></div>`
  : `<div class="flex ${SIDE[m.side].wrap}" data-side="${m.side}"><div class="max-w-[85%] rounded-xl border px-3 py-1.5 text-sm ${SIDE[m.side].bubble}">
    <div class="text-[11px] text-slate-500">${SIDE[m.side].label}${m.by ? ` ${esc(m.by)}` : ''}・${mdTime(m.at)}</div>
    <div class="whitespace-pre-line break-words">${esc(m.text)}</div></div></div>`)).join('');

// メッセージの入力欄。attr: 入力欄・送信ボタンの data 属性名（例: ret-msg → data-ret-msg / data-ret-send）
export const messageBoxHtml = (id, draft, { msg, send, placeholder = 'メッセージを入力（Enterで送信）' }) => `<div class="flex gap-2 items-end">
  <input class="inp font-normal flex-1" data-${msg}="${esc(id)}" value="${esc(draft ?? '')}" placeholder="${esc(placeholder)}" autocomplete="off" />
  <button class="b b-pri" data-${send}="${esc(id)}">送信</button></div>`;
