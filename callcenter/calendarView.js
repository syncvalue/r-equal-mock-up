// 訪問カレンダー（オペレーター向け）。月の表で訪問の件数を見て、日を選ぶと、その日の訪問の一覧と、前日確認の連絡の記録が出る。
import { esc } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { USERS } from '../src/dashboard.js';
import { CALL_RESULTS, confirmStatus, confirmDateOf, monthCells } from '../src/confirmCall.js';
import { dateLabel, statusBadge } from './view.js';

const STATUS_CLS = { none: 'bg-slate-200 text-slate-700', noanswer: 'bg-amber-400 text-slate-900', reached: 'bg-emerald-600 text-white' };
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const userName = (id) => USERS.find((u) => u.id === id)?.name ?? '未定';
const stamp = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export const statusChip = (r) => { const s = confirmStatus(r); return `<span class="rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_CLS[s.key]}">${s.label}</span>`; };

function monthHtml({ ym, date, reservations, today }) {
  const [y, m] = ym.split('-');
  const cell = (c) => `<button class="relative h-16 rounded border p-1 text-left ${c.inMonth ? 'bg-white' : 'bg-slate-50 text-slate-400'} ${c.date === date ? 'ring-2 ring-teal-600 border-teal-600' : ''} ${c.today ? 'font-bold' : ''}" data-calday="${c.date}">
    <span class="text-xs ${c.today ? 'rounded-full bg-teal-700 px-1.5 text-white' : ''}">${Number(c.date.slice(8))}</span>
    ${c.count ? `<span class="absolute right-1 top-1 rounded bg-sky-600 px-1.5 text-[11px] font-bold text-white" title="訪問の件数">${c.count}件</span>` : ''}
    ${c.tentative ? `<span class="block text-[10px] text-amber-700">仮確定 ${c.tentative}</span>` : ''}
    ${c.pending ? `<span class="block text-[10px] font-bold text-rose-600">前日確認 未${c.pending}</span>` : ''}</button>`;
  return `<div class="rounded-lg border bg-white p-2">
    <div class="mb-1 flex items-center justify-between gap-2">
      <button class="b b-sec !min-h-0 !py-1" data-calmonth="-1" title="前の月">◀</button>
      <b>${y}年${Number(m)}月</b>
      <span class="flex gap-1"><button class="b b-sec !min-h-0 !py-1 text-xs" data-caltoday>今日</button><button class="b b-sec !min-h-0 !py-1" data-calmonth="1" title="次の月">▶</button></span></div>
    <div class="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-500">${WEEK.map((w) => `<div>${w}</div>`).join('')}</div>
    <div class="mt-1 grid grid-cols-7 gap-1">${monthCells(ym, reservations, today).flat().map(cell).join('')}</div></div>`;
}

// 連絡の記録（これまでの履歴と、新しく記録する入力）
function callPanelHtml(r, draft) {
  const calls = r.confirmCalls ?? [];
  const history = calls.length
    ? calls.map((c) => `<li class="flex flex-wrap gap-x-2"><span class="text-slate-500">${stamp(c.at)}</span><b class="${c.result === 'reached' ? 'text-emerald-700' : 'text-amber-700'}">${CALL_RESULTS[c.result]}</b><span class="text-slate-500">（${esc(c.by)}）</span>${c.memo ? `<span class="w-full whitespace-pre-wrap rounded bg-slate-50 px-2 py-1">${esc(c.memo)}</span>` : ''}</li>`).join('')
    : '<li class="text-slate-500">まだ連絡していません</li>';
  return `<div class="mt-2 space-y-2 rounded border border-teal-300 bg-teal-50/50 p-2 text-xs">
    <div><div class="mb-0.5 font-bold text-slate-600">これまでの連絡</div><ul class="space-y-1">${history}</ul></div>
    <div class="space-y-1"><div class="font-bold text-slate-600">連絡の結果を記録</div>
      <div class="flex gap-1">${Object.entries(CALL_RESULTS).map(([k, v]) => `<button class="chip ${draft.result === k ? 'on' : ''}" data-callresult="${k}">${v}</button>`).join('')}</div>
      <textarea class="inp" rows="3" data-callmemo placeholder="お客様から告げられたこと（時間の変更・同席者・駐車場・キャンセルの意向など）">${esc(draft.memo)}</textarea>
      <div class="flex flex-wrap items-center gap-2"><button class="b b-pri" data-callsave="${r.id}">記録する</button>
        <button class="b b-sec" data-chg="${r.id}" title="お客様から、日時の変更・取消を告げられたとき">受付を変更・取消する</button>
        ${helpIcon('つながらなかったときも「つながらなかった」を記録します（再連絡のたびに足せます）。日時の変更・取消を告げられたら、メモに残したうえで、「受付を変更・取消する」で受付を直します。')}</div></div></div>`;
}

function dayHtml({ date, reservations, today, calSel, draft }) {
  const list = reservations.filter((r) => r.status !== 'cancelled' && r.date === date).sort((a, b) => a.start.localeCompare(b.start));
  const due = confirmDateOf(date) === today;
  const row = (r) => `<div class="rounded-lg border bg-white p-2 ${calSel === r.id ? 'border-teal-600 ring-2 ring-teal-200' : ''}">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <b class="text-base">${esc(r.start)}〜${esc(r.end)}</b><b>${esc(r.customer.name)} 様</b>${statusBadge(r)}${statusChip(r)}
      <button class="b b-sec ml-auto !min-h-0 !py-1 text-xs" data-callopen="${r.id}">${calSel === r.id ? '閉じる' : '前日確認を記録'}</button></div>
    <div class="mt-1 text-xs text-slate-600">${esc(r.customer.address)} ／ ${esc([r.customer.phone, r.customer.phone2].filter(Boolean).join(' ／ '))}</div>
    <div class="mt-0.5 flex flex-wrap gap-x-4 text-xs text-slate-600"><span>担当営業 <b>${esc(userName(r.userId))}</b></span><span>前日確認の連絡時間 <b>${esc(r.hearing?.contact ?? '未確認')}</b></span><span>売りたいもの ${esc(r.hearing?.wants ?? '')}</span></div>
    ${calSel === r.id ? callPanelHtml(r, draft) : ''}</div>`;
  return `<div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2"><b class="text-base">${dateLabel(date)}の訪問 ${list.length}件</b>
      ${due ? '<span class="rounded bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">今日、前日確認の連絡をする日</span>' : `<span class="text-xs text-slate-500">前日確認の日は ${dateLabel(confirmDateOf(date))}</span>`}
      ${helpIcon('訪問の前日に、オペレーターが、お客様へ1人ずつ電話で確認します。連絡したか・つながらなかったか・お客様から告げられたことを、訪問ごとに記録します。')}</div>
    ${list.length ? list.map(row).join('') : '<div class="rounded-lg bg-slate-100 py-8 text-center text-sm text-slate-500">この日の訪問はありません</div>'}</div>`;
}

export function calendarHtml(x) {
  return `<div class="grid h-[calc(100vh-52px)] grid-cols-[minmax(24rem,32rem)_1fr] gap-3 p-3">
    <div class="overflow-y-auto pr-1">${monthHtml(x)}</div>
    <div class="overflow-y-auto pr-1">${dayHtml(x)}</div></div>`;
}
