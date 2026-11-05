// 経費精算（営業サポートの一次チェック）: 日ごと・鑑定士ごとに、経費・お客様への支払・現金（前日繰越金と終業時の所持金）を確認する
import { loadDays, typeOf, summaryOf } from '../src/workday.js';
import { onlyOffice } from '../src/accounting.js';
import { checkRows, checkCounts, loadChecks, bulkTargets as bulkOf, CHECK_STATUS, shiftDate } from '../src/dailyCheck.js';
import { userById } from '../src/dashboard.js';
import { helpIcon } from '../src/help.js';
import { yen, fmtTime, esc } from '../src/format.js';
import { LEVEL, badge, card, signed, mdw } from './ui.js';

const FILTERS = [['pending', '未チェック'], ['ok', 'チェック済み'], ['returned', '差戻し'], ['all', 'すべて']];

const rowsOf = (c, checks = loadChecks()) => checkRows(onlyOffice(Object.values(loadDays()), c.scopedIds(), Boolean(c.st.office)), c.st.checkDate, checks);
export const dayRows = (c) => rowsOf(c);
// 前日までに提出された記録のうち、まだチェックしていない鑑定士の数（メニューの件数）。今日の分は、まだ提出前なので数えない
export function pendingBefore(c, today) {
  const days = onlyOffice(Object.values(loadDays()), c.scopedIds(), Boolean(c.st.office));
  const checks = loadChecks();
  return [...new Set(days.filter((d) => d.date < today && d.startedAt).map((d) => d.date))]
    .reduce((n, date) => n + checkRows(days, date, checks).filter((r) => r.status === 'pending').length, 0);
}
export const bulkTargets = bulkOf;

const table = (head, body, empty) => `<table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b">${head}</tr></thead><tbody>${body || `<tr><td colspan="9" class="text-slate-400">${empty}</td></tr>`}</tbody></table>`;
const chips = (flags) => flags.map((f) => badge(LEVEL[f.level], esc(f.text))).join(' ');

function reconcileTable(r, s) {
  const x = r.rec;
  const line = (label, value, note = '', strong = false) => `<tr class="border-b ${strong ? 'font-bold bg-slate-50' : ''}"><td>${label}</td><td class="text-right">${value}</td><td class="!whitespace-normal text-xs">${note}</td></tr>`;
  const diff = (n) => (n ? `<span class="${n ? 'text-rose-600 font-bold' : ''}">${signed(n)}</span>` : '<span class="text-emerald-700">一致</span>');
  const closed = x.closeCounted !== null;
  const notes = [['始業時の理由', r.day.start?.note], ['終業時の理由', r.day.close?.note], ['鑑定士のコメント', r.day.close?.comment]].filter(([, t]) => t);
  return `${table('<th>現金の照合</th><th class="text-right">金額</th><th></th>', [
    line('前日繰越金（帳簿）', yen(x.carryover)),
    line('始業時に数えた金額', yen(x.startCounted), `前日繰越金との差異 ${diff(x.startDiff)}`),
    line('＋ 引き出し金額', yen(x.withdrawn), `補充金 ${yen(s.depositTotal)}`),
    line('− 経費', yen(x.expenses)),
    line('− お客様への支払（買取代金）', yen(x.customerPaid)),
    line('＝ 帳簿上の所持金', yen(x.book), '', true),
    line('終業時に数えた金額', closed ? yen(x.closeCounted) : '<span class="text-rose-600 font-bold">未提出</span>', closed ? `過不足 ${diff(x.closeDiff)}` : '終業・日報が未提出', true),
  ].join(''))}${notes.map(([l, t]) => `<div class="text-xs mt-1"><span class="text-slate-500">${l}：</span>${esc(t)}</div>`).join('')}`;
}

function expenseTable(r) {
  const body = r.expenses.map((e) => `<tr class="border-b align-top"><td>${fmtTime(e.at).slice(0, 5)}</td><td>${typeOf(e.type).icon} ${typeOf(e.type).label}</td><td class="text-right font-bold">${yen(e.amount)}</td>
    <td class="!whitespace-normal">${esc(e.memo) || '<span class="text-slate-400">（記入なし）</span>'}</td>
    <td>${e.photo ? `<img src="${e.photo}" alt="領収書" class="h-12 rounded border" />` : e.proxy ? '<span class="text-teal-700 text-xs">経理代行</span>' : '<span class="text-rose-600 font-bold">なし</span>'}${e.invoice ? ' <span class="text-xs rounded bg-sky-100 text-sky-800 px-1">インボイス</span>' : ''}</td>
    <td class="!whitespace-normal">${chips(e.flags) || '<span class="text-emerald-700 text-xs font-bold">問題なし</span>'}</td></tr>`).join('');
  return table('<th>時刻</th><th>種類</th><th class="text-right">金額</th><th>内容</th><th>領収書</th><th>確認のポイント</th>', body, '経費の記録はありません。');
}

function purchaseTable(r) {
  const body = r.purchases.map((e) => `<tr class="border-b"><td>${fmtTime(e.at).slice(0, 5)}</td><td class="!whitespace-normal">${esc(e.memo)}</td><td class="text-right font-bold">${yen(e.amount)}</td></tr>`).join('');
  return table('<th>時刻</th><th>お客様・内容</th><th class="text-right">支払った金額</th>', body, 'お客様への支払はありません。');
}

function actions(c, r) {
  if (r.status !== 'pending') return `<button class="b b-sec" data-claim-reopen="${r.userId}">未チェックに戻す</button>`;
  const returning = c.st.returning?.id === r.userId;
  return `<div class="flex flex-wrap items-center gap-2"><button class="b b-pri" data-claim-ok="${r.userId}" ${r.canCheck ? '' : 'disabled'}>チェック済みにする</button><button class="b b-sec" data-claim-ret="${r.userId}">差戻す</button>
    ${r.canCheck ? '' : '<span class="text-xs text-rose-700 font-bold">赤の指摘（領収書・現金の写真・日報）は、鑑定士に直してもらう必要があります。差戻してください</span>'}</div>
    ${returning ? `<div class="flex flex-wrap items-end gap-2 mt-2 bg-rose-50 rounded p-2"><label class="text-sm font-bold flex-1 min-w-[16rem]">差戻しの理由（必須・鑑定士に伝える内容）<input class="inp mt-1 font-normal" data-f="ret.reason" value="${esc(c.st.returning.reason)}" placeholder="例: ガソリン代の領収書がありません。撮影して再提出してください" /></label><button class="b b-pri" data-claim-ret-send>差戻す</button><button class="b b-sec" data-claim-ret-cancel>やめる</button></div>` : ''}`;
}

function detail(c, r) {
  const s = summaryOf(r.day, r.userId);
  const st = CHECK_STATUS[r.status];
  const by = r.review ? `<span class="text-xs text-slate-500">${esc(r.review.by)}・${r.review.date}</span>` : '';
  return `<section class="bg-white rounded-xl border p-4 space-y-4">
    <div class="flex flex-wrap items-center gap-2"><span class="text-lg font-bold">${esc(c.withOffice(userById(r.userId)))}</span><span class="text-slate-500">${mdw(r.date)}の提出分</span>${badge(st.cls, st.label)}${by}</div>
    ${r.review?.reason ? `<div class="text-sm text-rose-700 bg-rose-50 rounded p-2">差戻しの理由：${esc(r.review.reason)}</div>` : ''}
    <div class="flex flex-wrap gap-1">${chips(r.issues) || '<span class="text-emerald-700 text-sm font-bold">指摘なし（入力漏れ・入力ミスは見つかりませんでした）</span>'}</div>
    <div class="grid lg:grid-cols-2 gap-4"><div class="overflow-x-auto">${reconcileTable(r, s)}</div>
      <div class="overflow-x-auto space-y-4"><div><div class="font-bold text-sm mb-1">経費（ガソリン代など）</div>${expenseTable(r)}</div><div><div class="font-bold text-sm mb-1">お客様への支払</div>${purchaseTable(r)}</div></div></div>
    ${r.day.close?.cashPhoto ? `<div><div class="font-bold text-sm mb-1">終業時に数えた現金の写真</div><img src="${r.day.close.cashPhoto}" alt="数えた現金" class="h-24 rounded border" /></div>` : ''}
    ${actions(c, r)}</section>`;
}

function listRow(c, r, selected) {
  const st = CHECK_STATUS[r.status];
  const x = r.rec;
  const danger = r.issues.filter((i) => i.level === 'danger').length;
  const warn = r.issues.filter((i) => i.level === 'warn').length;
  return `<tr class="border-b cursor-pointer ${selected ? 'bg-teal-50' : 'hover:bg-slate-50'}" data-claim-user="${r.userId}"><td class="font-bold">${esc(c.withOffice(userById(r.userId)))}</td>
    <td class="text-right">${yen(x.carryover)}</td><td class="text-right">${x.closeCounted === null ? '<span class="text-rose-600 font-bold">未提出</span>' : yen(x.closeCounted)}</td>
    <td class="text-right ${x.closeDiff ? 'text-rose-600 font-bold' : ''}">${x.closeDiff === null ? '－' : signed(x.closeDiff)}</td>
    <td class="text-right">${yen(x.expenses)}</td><td class="text-right">${yen(x.customerPaid)}</td>
    <td>${danger ? badge(LEVEL.danger, `要対応 ${danger}`) : ''} ${warn ? badge(LEVEL.warn, `確認 ${warn}`) : ''} ${!r.issues.length ? '<span class="text-emerald-700 text-xs font-bold">問題なし</span>' : ''}</td><td>${badge(st.cls, st.label)}</td></tr>`;
}

export function claimsTab(c) {
  const all = rowsOf(c);
  const n = checkCounts(all);
  const list = c.st.claimFilter === 'all' ? all : all.filter((r) => r.status === c.st.claimFilter);
  const picked = list.find((r) => r.userId === c.st.claimUser) ?? list[0];
  const bulk = bulkOf(all);
  const today = c.today();
  return `
  <div class="flex flex-wrap items-center gap-2">
    <button class="b b-sec" data-check-shift="-1" aria-label="前の日">◀</button>
    <label class="font-bold">対象日 <input type="date" class="inp !w-auto inline-block" data-check-date value="${c.st.checkDate}" max="${today}" /></label>
    <button class="b b-sec" data-check-shift="1" ${c.st.checkDate >= today ? 'disabled' : ''} aria-label="次の日">▶</button>
    <button class="b b-sec" data-check-yesterday>前日（${mdw(shiftDate(today, -1))}）</button>
    <span class="font-bold text-slate-600">${mdw(c.st.checkDate)}の提出分</span>
    ${helpIcon('営業サポートの一次チェックです。日ごと・鑑定士ごとに、経費（ガソリン代など）・お客様への支払・現金（前日繰越金と終業時の所持金）を確認し、入力漏れや入力ミスがなければ「チェック済み」、あれば理由をつけて「差戻し」にします。領収書・現金の写真・日報（終業）がないときは、チェック済みにできません。差戻しの理由は、モックのため鑑定士の画面にはまだ表示しません。')}
  </div>
  <div class="flex flex-wrap gap-3">
    ${card('提出された鑑定士', `${n.total} 人`)}${card('未チェック', `${n.pending} 人`, n.pending ? 'text-amber-700' : 'text-emerald-700')}${card('チェック済み', `${n.ok} 人`, 'text-emerald-700')}${card('差戻し', `${n.returned} 人`, n.returned ? 'text-rose-600' : '')}${card('指摘のある未チェック', `${n.withIssues} 人`, n.withIssues ? 'text-rose-600' : '')}
  </div>
  <div class="flex flex-wrap items-center gap-2">
    ${FILTERS.map(([k, l]) => `<button class="b b-sec ${c.st.claimFilter === k ? 'on' : ''}" data-claim-filter="${k}">${l}</button>`).join('')}
    <button class="b b-sec ml-auto" data-claim-bulk ${bulk.length ? '' : 'disabled'}>指摘のない未チェック ${bulk.length}人を一括でチェック済み</button>
  </div>
  <div class="overflow-x-auto"><table class="w-full text-sm bg-white rounded-xl border"><thead><tr class="text-left text-slate-500 border-b"><th>鑑定士</th><th class="text-right">前日繰越金</th><th class="text-right">終業時の所持金</th><th class="text-right">過不足</th><th class="text-right">経費</th><th class="text-right">お客様への支払</th><th>指摘</th><th>状況</th></tr></thead><tbody>
    ${list.length ? list.map((r) => listRow(c, r, r === picked)).join('') : `<tr><td colspan="8" class="text-slate-400">${all.length ? '該当する鑑定士はいません。' : 'この日に提出された記録はありません。'}</td></tr>`}
  </tbody></table></div>
  ${picked ? detail(c, picked) : ''}`;
}
