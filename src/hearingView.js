// 受電時のヒアリング内容（コールセンターが電話口で聞き取った内容）。営業が訪問前に確認する情報。
import { esc } from './format.js';
import { hearingOf } from './schedule.js';

const FIELDS = [
  ['profile', '性別・年齢'], ['trigger', '来電のきっかけ'], ['attendee', '当日の立会い'], ['companion', 'ご同席者'], ['wants', '売りたいもの'], ['large', '大型品・その他の確認'],
  ['parking', '駐車スペース'], ['nameplate', '表札'], ['contact', '前日確認の連絡時間'], ['notes', '訪問時の注意'],
];
// 特に見落としたくない項目
const KEY = new Set(['attendee', 'large']);

// stack: 幅の狭い場所では、項目名を上に、内容を下に並べる
export function hearingRows(e, { stack = false } = {}) {
  const h = hearingOf(e);
  return FIELDS.filter(([k]) => h[k] != null).map(([k, label]) => `
    <div class="flex ${stack ? 'flex-col' : 'gap-2'} py-1.5 ${k === 'notes' ? 'rounded-lg bg-amber-50 px-2' : ''}"><dt class="${stack ? 'text-xs' : 'w-28 shrink-0'} text-slate-500">${label}</dt>
      <dd class="flex-1 min-w-0 ${KEY.has(k) || k === 'notes' ? 'font-bold' : ''}">${esc(h[k])}</dd></div>`).join('');
}

export const hearingMeta = (e) => `受付 ${esc(e.receptionNo)} ／ ${esc(e.receivedAt)} ／ 受電 ${esc(e.operator)}（コールセンター）`;

export const hearingModal = (e) => ({
  title: `📞 ${esc(e.customer.name)} 様　受電時のヒアリング`,
  body: `<div class="text-xs text-slate-500">${hearingMeta(e)}</div>
    <dl class="text-sm divide-y">${hearingRows(e)}</dl>
    <p class="text-xs text-slate-400">コールセンターがお客様から聞き取った内容です。訪問前に確認してください。</p>`,
});
