// 経費精算（営業サポートの一次チェック）: 日ごと・鑑定士ごとに、経費・お客様への支払・現金（前日繰越金と終業時の所持金）を確認する
import { loadDays, typeOf, summaryOf } from '../src/workday.js';
import { onlyOffice } from '../src/accounting.js';
import { checkRows, checkCounts, loadChecks, loadItemChecks, dayBadges, monthGrid, bulkTargets as bulkOf, CHECK_STATUS, shiftDate } from '../src/dailyCheck.js';
import { userById } from '../src/dashboard.js';
import { helpIcon } from '../src/help.js';
import { fmtTime, esc } from '../src/format.js';
import { LEVEL, badge, card, signed, signedYen as yen, mdw, thumb } from './ui.js';

const TH = 'text-left text-slate-700 bg-slate-200 border-b-2 border-slate-300'; // 表の見出し行
const ZEBRA = '[&>tr:nth-child(even)]:bg-slate-50'; // 1行おきに薄い背景

const FILTERS = [['pending', '未チェック'], ['ok', 'チェック済み'], ['returned', '差戻し'], ['all', 'すべて']];

const rowsOf = (c, checks = loadChecks()) => checkRows(onlyOffice(Object.values(loadDays()), c.scopedIds(), Boolean(c.st.office)), c.st.checkDate, checks, loadItemChecks());
export const dayRows = (c) => rowsOf(c);
// 前日までに提出された記録のうち、まだチェックしていない鑑定士の数（メニューの件数）。今日の分は、まだ提出前なので数えない
export function pendingBefore(c, today) {
  const days = onlyOffice(Object.values(loadDays()), c.scopedIds(), Boolean(c.st.office));
  const checks = loadChecks();
  return [...new Set(days.filter((d) => d.date < today && d.startedAt).map((d) => d.date))]
    .reduce((n, date) => n + checkRows(days, date, checks, loadItemChecks()).filter((r) => r.status === 'pending').length, 0);
}
export const bulkTargets = bulkOf;

// 日付を選ぶカレンダー。日ごとに、要対応（赤）・未チェック（黄）の人数、すべてチェック済み（緑）の印を付ける
function calendar(c) {
  const today = c.today();
  const badges = dayBadges(onlyOffice(Object.values(loadDays()), c.scopedIds(), Boolean(c.st.office)), loadChecks(), loadItemChecks());
  const cell = (date) => {
    if (!date) return '<div></div>';
    const b = badges[date];
    const future = date > today;
    const sel = date === c.st.checkDate;
    const marks = !b ? '' : [
      b.urgent ? `<span class="rounded bg-rose-600 text-white text-[10px] font-bold px-1 leading-4" title="要対応（赤の指摘がある未チェック）">要${b.urgent}</span>` : '',
      b.pending - b.urgent > 0 ? `<span class="rounded bg-amber-400 text-slate-900 text-[10px] font-bold px-1 leading-4" title="未チェック">未${b.pending - b.urgent}</span>` : '',
      !b.pending ? '<span class="rounded bg-emerald-600 text-white text-[10px] font-bold px-1 leading-4" title="すべてチェック済み">✓</span>' : '',
    ].join('');
    return `<button class="rounded border min-h-[56px] flex flex-col items-center justify-start gap-0.5 py-1 ${sel ? 'border-teal-700 bg-teal-100 ring-2 ring-teal-600' : 'border-slate-200 bg-white hover:bg-slate-50'} ${future ? 'opacity-30' : ''}" data-cal-pick="${date}" ${future ? 'disabled' : ''}><span class="text-sm font-bold ${date === today ? 'underline' : ''}">${Number(date.slice(8))}</span><span class="flex flex-wrap justify-center gap-0.5">${marks}</span></button>`;
  };
  const month = c.st.calMonth;
  return `<div class="absolute z-30 top-full left-0 mt-1 w-[26rem] max-w-[90vw] bg-white rounded-xl border border-slate-300 shadow-xl p-3">
    <div class="flex items-center justify-between mb-2"><button class="b b-sec !min-h-0 !py-1" data-cal-shift="-1" aria-label="前の月">◀</button><span class="font-bold">${month.slice(0, 4)}年${Number(month.slice(5))}月</span><button class="b b-sec !min-h-0 !py-1" data-cal-shift="1" aria-label="次の月">▶</button></div>
    <div class="grid grid-cols-7 gap-1 text-center text-xs font-bold mb-1">${['日', '月', '火', '水', '木', '金', '土'].map((w, i) => `<div class="${i === 0 ? 'text-rose-600' : i === 6 ? 'text-sky-600' : 'text-slate-600'}">${w}</div>`).join('')}</div>
    <div class="grid grid-cols-7 gap-1">${monthGrid(month).flat().map(cell).join('')}</div>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-600"><span><span class="rounded bg-rose-600 text-white text-[10px] font-bold px-1">要n</span> 要対応の未チェック</span><span><span class="rounded bg-amber-400 text-slate-900 text-[10px] font-bold px-1">未n</span> 未チェック</span><span><span class="rounded bg-emerald-600 text-white text-[10px] font-bold px-1">✓</span> すべてチェック済み</span></div>
  </div>`;
}

const table = (head, body, empty) => `<table class="w-full text-sm border border-slate-200 rounded"><thead><tr class="${TH}">${head}</tr></thead><tbody class="${ZEBRA}">${body || `<tr><td colspan="9" class="text-slate-400">${empty}</td></tr>`}</tbody></table>`;
const chips = (flags) => flags.map((f) => badge(LEVEL[f.level], esc(f.text))).join(' ');

function reconcileTable(r, s) {
  const x = r.rec;
  const line = (label, value, note = '', strong = false) => `<tr class="border-b ${strong ? 'font-bold !bg-slate-100' : ''}"><td>${label}</td><td class="text-right">${value}</td><td class="!whitespace-normal text-xs">${note}</td></tr>`;
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

// 経費とお客様への支払の表は、同じ列の幅にして、縦をそろえる
const COLS = '<colgroup><col class="w-36" /><col class="w-16" /><col class="w-36" /><col class="w-28" /><col /><col class="w-28" /><col class="w-28" /><col class="w-64" /></colgroup>';
const ITEM_HEAD = '<th>確認</th><th>時刻</th><th>種類</th><th class="text-right">金額</th><th class="pl-4">内容</th><th>領収書</th><th>インボイス</th><th>確認のポイント</th>';
const itemTable = (head, body, empty) => `<table class="w-full table-fixed text-sm border border-slate-200 rounded"><thead><tr class="${TH}">${head}</tr></thead><tbody class="${ZEBRA}">${body || `<tr><td colspan="8" class="text-slate-400">${empty}</td></tr>`}</tbody></table>`.replace('<thead>', `${COLS}<thead>`);

// 1件ずつの確認ボタン（チェック済み・差戻しの後は、押せない）
function checkBtn(c, r, item, label = '確認') {
  const done = Boolean(item.checked);
  const locked = r.status !== 'pending';
  return `<button class="rounded border px-2 py-1 text-xs font-bold whitespace-nowrap ${done ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-400 text-slate-700'} ${locked ? 'opacity-50' : ''}" data-item-toggle="${esc(item.id)}" ${locked ? 'disabled' : ''} aria-pressed="${done}" ${done ? `title="${esc(item.checked.by)}が確認"` : ''}>${done ? '☑' : '☐'} ${done ? '確認済' : label}</button>`;
}
const cell = 'align-middle';

function expenseTable(c, r) {
  const body = r.expenses.map((e) => `<tr class="border-b"><td class="${cell}">${checkBtn(c, r, e)}</td><td class="${cell}">${fmtTime(e.at).slice(0, 5)}</td><td class="${cell}">${typeOf(e.type).icon} ${typeOf(e.type).label}</td><td class="${cell} text-right font-bold">${yen(e.amount)}</td>
    <td class="${cell} pl-4 !whitespace-normal">${esc(e.memo) || '<span class="text-slate-400">（記入なし）</span>'}</td>
    <td class="${cell}">${e.photo ? thumb(e.photo, '領収書') : e.proxy ? '<span class="text-teal-700 text-xs">経理代行</span>' : '<span class="text-rose-600 font-bold">なし</span>'}</td>
    <td class="${cell}">${e.invoice ? '<span class="text-xs font-bold rounded bg-sky-100 text-sky-800 px-2 py-0.5">インボイス</span>' : '<span class="text-xs text-slate-500">対象外</span>'}</td>
    <td class="${cell} !whitespace-normal">${chips(e.flags) || '<span class="text-emerald-700 text-xs font-bold">問題なし</span>'}</td></tr>`).join('');
  return itemTable(ITEM_HEAD, body, '経費の記録はありません。');
}

// お客様への支払: 行の＋－で、買取の内訳（商品ごとの金額）を開閉する
function purchaseTable(c, r) {
  const open = c.st.openPurchase ?? [];
  const detail = (e) => {
    const items = e.items ?? [];
    const rows = items.map((i) => `<tr class="border-b border-slate-200"><td class="!whitespace-normal">${esc(i.name)}</td><td class="text-center">${esc(i.rank ?? '')}</td><td class="text-right">${i.qty}点</td><td class="text-right font-bold">${yen(i.price)}</td></tr>`).join('');
    return `<tr class="bg-slate-50 border-b"><td></td><td colspan="7" class="!py-2"><div class="font-bold text-xs text-slate-600 mb-1">買取の内訳</div>${items.length
      ? `<table class="w-full max-w-3xl text-sm bg-white border border-slate-200"><thead><tr class="bg-slate-100 text-slate-700 text-left"><th>商品</th><th class="text-center">ランク</th><th class="text-right">点数</th><th class="text-right">金額</th></tr></thead><tbody>${rows}<tr class="font-bold bg-slate-100"><td colspan="2">合計</td><td class="text-right">${items.reduce((n, i) => n + i.qty, 0)}点</td><td class="text-right">${yen(items.reduce((n, i) => n + i.price, 0))}</td></tr></tbody></table>`
      : '<div class="text-xs text-slate-500">内訳の記録がありません（以前の記録）。</div>'}</td></tr>`;
  };
  const body = r.purchases.map((e) => `<tr class="border-b"><td class="${cell}"><div class="flex items-center gap-1"><button class="w-7 h-7 rounded border border-slate-400 bg-white font-bold leading-none" data-purchase-toggle="${esc(e.id)}" aria-expanded="${open.includes(e.id)}" aria-label="買取の内訳を${open.includes(e.id) ? '閉じる' : '開く'}">${open.includes(e.id) ? '－' : '＋'}</button>${checkBtn(c, r, e)}</div></td><td class="${cell}">${fmtTime(e.at).slice(0, 5)}</td><td class="${cell}">${typeOf(e.type).icon} ${typeOf(e.type).label}</td><td class="${cell} text-right font-bold">${yen(e.amount)}</td>
    <td class="${cell} pl-4 !whitespace-normal">${esc(e.memo)}</td><td class="${cell} text-slate-400">－</td><td class="${cell} text-slate-400">－</td><td class="${cell} text-slate-400 text-xs">（確認のポイントなし）</td></tr>${open.includes(e.id) ? detail(e) : ''}`).join('');
  return itemTable(ITEM_HEAD.replace('>内容<', '>お客様・内容<'), body, 'お客様への支払はありません。');
}

// 終業時に数えた現金: 写真と金額が一致していることの確認（証跡）
function cashCheck(c, r) {
  const x = r.rec;
  const photo = r.day.close?.cashPhoto;
  if (!photo) return '';
  return `<div class="flex flex-wrap items-center gap-4 rounded border border-slate-200 p-3"><div><div class="font-bold text-sm mb-1">終業時に数えた現金の写真</div>${thumb(photo, '数えた現金', 'h-24')}</div>
    <div class="space-y-2"><div class="text-sm">終業時に数えた金額 <span class="font-bold text-lg">${yen(x.closeCounted)}</span></div>${checkBtn(c, r, r.cash, '写真と金額が一致していることを確認')}
    ${r.cash.checked ? `<div class="text-xs text-slate-500">${esc(r.cash.checked.by)}が確認</div>` : ''}</div></div>`;
}

function actions(c, r) {
  if (r.status !== 'pending') return `<button class="b b-sec" data-claim-reopen="${r.userId}">未チェックに戻す</button>`;
  const returning = c.st.returning?.id === r.userId;
  return `<div class="flex flex-wrap items-center gap-2"><button class="b b-pri" data-claim-ok="${r.userId}" ${r.canOk ? '' : 'disabled'}>チェック済みにする</button><span class="text-sm font-bold ${r.allChecked ? 'text-emerald-700' : 'text-slate-600'}">1件ずつの確認 ${r.progress.done}／${r.progress.total}</span><button class="b b-sec" data-claim-ret="${r.userId}">差戻す</button>
    ${r.canCheck ? (r.allChecked ? '' : '<span class="text-xs text-slate-600">経費・お客様への支払・現金を、1件ずつ確認してください</span>') : '<span class="text-xs text-rose-700 font-bold">赤の指摘（領収書・現金の写真・日報）は、鑑定士に直してもらう必要があります。差戻してください</span>'}</div>
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
    <div class="max-w-3xl overflow-x-auto">${reconcileTable(r, s)}</div>
    <div class="overflow-x-auto space-y-6"><div><div class="font-bold text-sm mb-1">経費（ガソリン代など）</div>${expenseTable(c, r)}</div><div><div class="font-bold text-sm mb-1">お客様への支払</div>${purchaseTable(c, r)}</div></div>
    ${cashCheck(c, r)}
    ${actions(c, r)}</section>`;
}

function listRow(c, r, selected) {
  const st = CHECK_STATUS[r.status];
  const x = r.rec;
  const danger = r.issues.filter((i) => i.level === 'danger').length;
  const warn = r.issues.filter((i) => i.level === 'warn').length;
  return `<tr class="border-b cursor-pointer ${selected ? '!bg-teal-100' : 'hover:bg-slate-50'}" data-claim-user="${r.userId}"><td class="font-bold">${esc(c.withOffice(userById(r.userId)))}</td>
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
    <span class="font-bold">対象日</span><div class="relative"><button class="b b-sec min-w-[10rem] text-left" data-cal-toggle aria-expanded="${c.st.calOpen}">📅 ${c.st.checkDate.replaceAll('-', '/')}</button>${c.st.calOpen ? calendar(c) : ''}</div>
    <button class="b b-sec" data-check-shift="1" ${c.st.checkDate >= today ? 'disabled' : ''} aria-label="次の日">▶</button>
    <button class="b b-sec" data-check-yesterday>前日（${mdw(shiftDate(today, -1))}）</button>
    <span class="font-bold text-slate-600">${mdw(c.st.checkDate)}の提出分</span>
    ${helpIcon('営業サポートの一次チェックです。日ごと・鑑定士ごとに、経費（ガソリン代など）・お客様への支払・現金（前日繰越金と終業時の所持金）を確認し、入力漏れや入力ミスがなければ「チェック済み」、あれば理由をつけて「差戻し」にします。経費・お客様への支払・現金の写真は、1件ずつ「確認」を押し、すべて確認すると「チェック済み」にできます。領収書・現金の写真・日報（終業）がないときは、チェック済みにできません。差戻しの理由は、モックのため鑑定士の画面にはまだ表示しません。')}
  </div>
  <div class="flex flex-wrap gap-3">
    ${card('提出された鑑定士', `${n.total} 人`)}${card('未チェック', `${n.pending} 人`, n.pending ? 'text-amber-700' : 'text-emerald-700')}${card('チェック済み', `${n.ok} 人`, 'text-emerald-700')}${card('差戻し', `${n.returned} 人`, n.returned ? 'text-rose-600' : '')}${card('指摘のある未チェック', `${n.withIssues} 人`, n.withIssues ? 'text-rose-600' : '')}
  </div>
  <div class="flex flex-wrap items-center gap-2">
    ${FILTERS.map(([k, l]) => `<button class="b b-sec ${c.st.claimFilter === k ? 'on' : ''}" data-claim-filter="${k}">${l}</button>`).join('')}
    <button class="b b-sec ml-auto" data-claim-bulk ${bulk.length ? '' : 'disabled'}>指摘のない未チェック ${bulk.length}人を一括でチェック済み</button>
  </div>
  <div class="overflow-x-auto"><table class="w-full text-sm bg-white rounded-xl border border-slate-300 overflow-hidden"><thead><tr class="${TH}"><th>鑑定士</th><th class="text-right">前日繰越金</th><th class="text-right">終業時の所持金</th><th class="text-right">過不足</th><th class="text-right">経費</th><th class="text-right">お客様への支払</th><th>指摘</th><th>状況</th></tr></thead><tbody class="${ZEBRA}">
    ${list.length ? list.map((r) => listRow(c, r, r === picked)).join('') : `<tr><td colspan="8" class="text-slate-400">${all.length ? '該当する鑑定士はいません。' : 'この日に提出された記録はありません。'}</td></tr>`}
  </tbody></table></div>
  ${picked ? detail(c, picked) : ''}`;
}
