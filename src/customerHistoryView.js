// お客様が初めてか／リピーターか（何回目か）の表示と、過去の評価・ご利用履歴
import { esc, yen } from './format.js';

const dateStr = (ms) => new Date(ms).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });

export const repeatBadge = (h, { small = false } = {}) => h.isRepeat
  ? `<span class="inline-block rounded-full bg-indigo-600 text-white font-bold ${small ? 'text-[11px] px-2 py-0' : 'text-sm px-3 py-0.5'}">🔁 リピーター ${h.ordinal}回目</span>`
  : `<span class="inline-block rounded-full bg-sky-100 text-sky-800 font-bold ${small ? 'text-[11px] px-2 py-0' : 'text-sm px-3 py-0.5'}">🆕 初めてのお客様</span>`;

// 過去の評価とご利用履歴（営業の内部情報。お客様には見せない）
export function pastEvalView(h) {
  if (!h.isRepeat) return '<div class="rounded-xl border bg-slate-50 p-3 text-sm text-slate-500">初めてのお客様です。過去の評価・ご利用履歴はありません。</div>';
  const e = h.latestEval;
  const row = (k, v) => (v && v.length ? `<div><span class="text-xs text-slate-500">${k}</span> <b>${Array.isArray(v) ? v.map(esc).join('・') : esc(v)}</b></div>` : '');
  const warn = (e?.flags ?? []).some((f) => f === 'クレーム注意');
  return `
  <div class="rounded-xl border-2 ${warn ? 'border-rose-400' : 'border-indigo-300'} bg-indigo-50/40 p-3 space-y-2">
    <div class="font-bold">⭐ 前回までのお客様評価<span class="ml-2 text-xs font-normal text-slate-500">（営業の記録・お客様には見せないでください）</span></div>
    ${e ? `
    <div class="flex items-center gap-3"><span class="text-amber-400 text-2xl tracking-tight">${'★'.repeat(e.overall)}<span class="text-slate-300">${'★'.repeat(5 - e.overall)}</span></span>
      <span class="text-xs text-slate-500">${esc(e.by)} ／ ${dateStr(e.savedAt)} 記録</span></div>
    <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">${row('態度', e.attitude)}${row('リピート見込み', e.repeat)}${row('資力', e.wealth)}${row('次回時期', e.timing)}</div>
    <div class="text-sm">${row('次回の商材', e.cats)}${row('特記事項', e.flags)}</div>
    ${e.memo ? `<div class="text-sm whitespace-pre-wrap rounded bg-white border px-2 py-1">${esc(e.memo)}</div>` : ''}`
    : '<div class="text-sm text-slate-500">過去の評価は記録されていません。</div>'}
    <div><div class="text-xs font-bold text-slate-500 mb-0.5">これまでのご利用（${h.count}回）</div>
      <div class="text-sm divide-y bg-white rounded border">${h.visits.map((v) => `<div class="flex justify-between gap-2 px-2 py-1"><span>${dateStr(v.at)}　${esc(v.items)}</span><b>${yen(v.total)}</b></div>`).join('')}</div></div>
  </div>`;
}
