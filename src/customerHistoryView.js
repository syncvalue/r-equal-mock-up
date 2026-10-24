// お客様が初めてか／リピーターか（何回目か）の表示と、過去の評価・ご利用履歴
import { esc, yen } from './format.js';
import { visitLines, lineTotal } from './customerHistory.js';

const dateStr = (ms) => new Date(ms).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });

export const repeatBadge = (h, { small = false } = {}) => h.isRepeat
  ? `<span class="inline-block rounded-full bg-indigo-600 text-white font-bold ${small ? 'text-[11px] px-2 py-0' : 'text-sm px-3 py-0.5'}">🔁 リピーター ${h.ordinal}回目</span>`
  : `<span class="inline-block rounded-full bg-sky-100 text-sky-800 font-bold ${small ? 'text-[11px] px-2 py-0' : 'text-sm px-3 py-0.5'}">🆕 初めてのお客様</span>`;

// アポごとの評価と、ご利用履歴（営業の内部情報。お客様には見せない）。評価は、アポごとに営業が入力したもの。お客様情報に紐づく評価（ランク・厄介度）は、別のカードで出す
const row = (k, v) => (v && v.length ? `<div><span class="text-xs text-slate-500">${k}</span> <b>${Array.isArray(v) ? v.map(esc).join('・') : esc(v)}</b></div>` : '');
const starsHtml = (n) => `<span class="text-amber-400 tracking-tight">${'★'.repeat(n)}<span class="text-slate-300">${'★'.repeat(5 - n)}</span></span>`;

function visitEvalHtml(e) {
  if (!e) return '<div class="text-sm text-slate-400">このアポの評価は、記録されていません。</div>';
  const warn = (e.flags ?? []).includes('クレーム注意');
  return `<div class="rounded-lg border ${warn ? 'border-rose-300' : 'border-indigo-200'} bg-indigo-50/40 p-2 space-y-1">
    <div class="flex items-center gap-2 text-sm">${starsHtml(e.overall)}<span class="text-xs text-slate-500">${esc(e.by)} ／ ${dateStr(e.savedAt)} 記録</span></div>
    <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">${row('態度', e.attitude)}${row('リピート見込み', e.repeat)}${row('資力', e.wealth)}${row('次回時期', e.timing)}</div>
    <div class="text-sm">${row('次回の商材', e.cats)}${row('特記事項', e.flags)}</div>
    ${e.memo ? `<div class="text-sm whitespace-pre-wrap rounded bg-white border px-2 py-1">${esc(e.memo)}</div>` : ''}</div>`;
}

export function pastEvalView(h) {
  if (!h.isRepeat) return '<div class="rounded-xl border bg-slate-50 p-3 text-sm text-slate-500">初めてのお客様です。</div>';
  const visit = (v, open) => {
    const lines = visitLines(v);
    return `<details class="rounded-lg border bg-white" ${open ? 'open' : ''}>
      <summary class="cursor-pointer px-2 py-1.5 text-sm"><div class="flex items-center gap-2"><span class="shrink-0 text-slate-500">${dateStr(v.at)}</span><span class="min-w-0 flex-1 truncate">${esc(lines[0].name)}${lines.length > 1 ? `<span class="text-slate-500"> ほか${lines.length - 1}品目</span>` : ''}</span>${v.eval ? starsHtml(v.eval.overall) : ''}<b class="shrink-0">${yen(v.total)}</b></div>
        ${v.eval?.memo ? `<div class="truncate text-xs text-slate-500">${esc(String(v.eval.by).replace(/^営業\s*/, ''))}：${esc(v.eval.memo)}</div>` : ''}</summary>
      <div class="space-y-2 border-t px-2 py-1.5"><div class="max-h-40 overflow-y-auto"><table class="w-full text-sm"><tbody>${lines.map((l) => `<tr class="border-t first:border-t-0"><td class="py-0.5">${esc(l.name)}</td><td class="w-10 text-right text-slate-500">${(l.qty ?? 1) > 1 ? `×${l.qty}` : ''}</td><td class="w-24 text-right">${yen(lineTotal(l))}</td></tr>`).join('')}</tbody></table></div>
        ${visitEvalHtml(v.eval)}</div></details>`;
  };
  const RECENT = 5;
  return `
  <div class="rounded-xl border-2 border-indigo-300 bg-indigo-50/30 p-3 space-y-2">
    <div class="font-bold">⭐ 過去のアポごとの評価（${h.count}回）<span class="ml-2 text-xs font-normal text-slate-500">（お客様には見せないでください）</span></div>
    <div class="space-y-1">${h.visits.slice(0, RECENT).map((v, i) => visit(v, i === 0)).join('')}
      ${h.visits.length > RECENT ? `<details class="rounded-lg border border-dashed bg-white"><summary class="cursor-pointer px-2 py-1.5 text-sm font-bold text-slate-600">さらに以前の ${h.visits.length - RECENT}回分</summary><div class="max-h-72 space-y-1 overflow-y-auto p-1">${h.visits.slice(RECENT).map((v) => visit(v, false)).join('')}</div></details>` : ''}</div>
  </div>`;
}
