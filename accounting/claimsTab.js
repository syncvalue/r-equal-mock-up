// 経費精算: 鑑定士の経費と領収書を確認し、精算する・差戻す
import { loadDays, typeOf } from '../src/workday.js';
import { onlyOffice } from '../src/accounting.js';
import { claimsFrom, claimCounts, loadReviews, REVIEW_STATUS, canApprove } from '../src/expenseReview.js';
import { userById } from '../src/dashboard.js';
import { helpIcon } from '../src/help.js';
import { yen, fmtTime, esc } from '../src/format.js';
import { LEVEL, badge, card, md } from './ui.js';

const FILTERS = [['pending', '未確認'], ['approved', '精算済み'], ['returned', '差戻し'], ['all', 'すべて']];

export const officeClaims = (c) => claimsFrom(onlyOffice(Object.values(loadDays()), c.scopedIds(), Boolean(c.st.office)), loadReviews());
// 一括で精算してよいもの: 領収書があり、確認のポイントが「情報」だけの未確認の経費
export const bulkTargets = (claims) => claims.filter((x) => x.status === 'pending' && canApprove(x) && x.flags.every((f) => f.level === 'info'));

function row(c, x) {
  const st = REVIEW_STATUS[x.status];
  const returning = c.st.returning?.id === x.id;
  const receipt = x.photo ? `<img src="${x.photo}" alt="領収書" class="h-12 rounded border" />` : x.proxy ? '<span class="text-teal-700 text-xs">経理代行</span>' : '<span class="text-rose-600 font-bold">なし</span>';
  const action = x.status === 'pending'
    ? `<div class="flex gap-1"><button class="b b-pri !min-h-0 !py-1 !px-2 text-xs" data-claim-ok="${x.id}" ${canApprove(x) ? '' : 'disabled title="領収書がないため、精算できません（差戻してください）"'}>精算する</button><button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-claim-ret="${x.id}">差戻す</button></div>`
    : `<button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-claim-reopen="${x.id}">未確認に戻す</button>`;
  return `<tr class="border-b align-top"><td>${md(x.date)} ${fmtTime(x.at).slice(0, 5)}</td><td class="font-bold">${esc(c.withOffice(userById(x.userId)))}</td>
    <td>${typeOf(x.type).icon} ${typeOf(x.type).label}</td><td class="text-right font-bold">${yen(x.amount)}</td><td class="!whitespace-normal">${esc(x.memo) || '<span class="text-slate-400">（記入なし）</span>'}</td><td>${receipt}</td>
    <td class="!whitespace-normal"><div class="flex flex-wrap gap-1">${x.flags.map((f) => badge(LEVEL[f.level], esc(f.text))).join('') || '<span class="text-emerald-700 text-xs font-bold">問題なし</span>'}</div></td>
    <td>${badge(st.cls, st.label)}${x.review?.reason ? `<div class="text-xs text-rose-700 !whitespace-normal mt-1 max-w-[14rem]">${esc(x.review.reason)}</div>` : ''}</td><td>${action}</td></tr>
    ${returning ? `<tr class="bg-rose-50"><td colspan="9"><div class="flex flex-wrap items-end gap-2 p-1"><label class="text-sm font-bold flex-1 min-w-[16rem]">差戻しの理由（必須・鑑定士に伝える内容）<input class="inp mt-1 font-normal" data-f="ret.reason" value="${esc(c.st.returning.reason)}" placeholder="例: 領収書の日付が読めません。再提出してください" /></label><button class="b b-pri" data-claim-ret-send>差戻す</button><button class="b b-sec" data-claim-ret-cancel>やめる</button></div></td></tr>` : ''}`;
}

export function claimsTab(c) {
  const all = officeClaims(c);
  const n = claimCounts(all);
  const list = c.st.claimFilter === 'all' ? all : all.filter((x) => x.status === c.st.claimFilter);
  const bulk = bulkTargets(all);
  return `
  <div class="flex flex-wrap gap-3">
    ${card('未確認', `${n.pending} 件`, n.pending ? 'text-amber-700' : 'text-emerald-700')}${card('未確認の金額', yen(n.pendingAmount))}${card('精算済み', `${n.approved} 件（${yen(n.approvedAmount)}）`, 'text-emerald-700')}${card('差戻し', `${n.returned} 件`, n.returned ? 'text-rose-600' : '')}
  </div>
  <div class="flex flex-wrap items-center gap-2">
    ${FILTERS.map(([k, l]) => `<button class="b b-sec ${c.st.claimFilter === k ? 'on' : ''}" data-claim-filter="${k}">${l}</button>`).join('')}
    ${helpIcon('鑑定士が入力した経費（買取代金は除く）の領収書を確認して、精算するか差し戻します。領収書のない経費は精算できず、差戻しになります。差戻しには理由が必要で、鑑定士に伝えます（モックのため、鑑定士の画面にはまだ表示しません）。')}
    <button class="b b-sec ml-auto" data-claim-bulk ${bulk.length ? '' : 'disabled'}>問題のない未確認 ${bulk.length}件を一括で精算</button>
  </div>
  <div class="overflow-x-auto"><table class="w-full text-sm bg-white rounded-xl border"><thead><tr class="text-left text-slate-500 border-b"><th>日時</th><th>鑑定士</th><th>種類</th><th class="text-right">金額</th><th>内容</th><th>領収書</th><th>確認のポイント</th><th>状況</th><th>操作</th></tr></thead><tbody>
    ${list.length ? list.map((x) => row(c, x)).join('') : '<tr><td colspan="9" class="text-slate-400">該当する経費はありません。</td></tr>'}
  </tbody></table></div>`;
}
