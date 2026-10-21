// 始業（点検）・終業（日報）・経費管理の画面。
import { esc, yen, fmtTime } from './format.js';
import { moneyInputHtml } from './moneyInput.js';
import { userById } from './dashboard.js';
import {
  START_CHECKS, END_CHECKS, EXPENSE_TYPES, typeOf, carryoverFor, summaryOf, closeDiff, startReady, closeReady, expenseReady, dateKey,
} from './workday.js';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const SEC = 'h-full min-h-0 p-4';
const isVisiting = (s) => Boolean(s.visitStartedAt && !s.visitEndedAt);
const dateLabel = (key) => { const d = new Date(`${key}T00:00:00`); return `${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`; };
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${yen(Math.abs(n))}`;

// 差異の表示（一致／過不足）
const diffBox = (diff, label) => diff === 0
  ? `<div class="rounded-xl bg-emerald-50 border-2 border-emerald-400 p-3 text-center font-bold text-emerald-800">✓ ${label}と一致しています</div>`
  : `<div class="rounded-xl bg-rose-50 border-2 border-rose-400 p-3 text-center text-rose-700"><div class="font-bold">⚠ ${label}と ${yen(Math.abs(diff))} ${diff > 0 ? '多い（過剰）' : '足りません（不足）'}</div><div class="text-xs">差異の理由を入力してください</div></div>`;

const checkRow = (form, c, done) => `
  <label class="flex items-center gap-3 rounded-xl border-2 px-3 py-2 min-h-[48px] ${form.checks[c.key] ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'} ${done ? 'opacity-60' : 'cursor-pointer'}">
    <input type="checkbox" class="w-7 h-7 shrink-0" data-action="wd-check" data-form="${form.name}" data-key="${c.key}" ${form.checks[c.key] ? 'checked' : ''} ${done ? 'disabled' : ''} />
    ${c.icon ? `<span class="text-2xl">${c.icon}</span>` : ''}<span class="flex-1 ${form.checks[c.key] ? '' : 'font-bold'}">${c.text}</span></label>`;

// 入力のたびに差し替える部分（差異の表示と、確定ボタン）
export function wdLiveView(s) {
  if (s.phase === 'before') {
    const carry = carryoverFor(s.user).amount;
    const ready = startReady(s.startForm, s.user);
    return `
    ${s.startForm.countedSet ? diffBox(s.startForm.counted - carry, '前日からの繰越金') : '<div class="rounded-xl bg-slate-50 border p-3 text-center text-sm text-slate-500">いま手元にある現金を数えて、入力してください</div>'}
    <button class="btn btn-primary w-full text-xl !py-3" data-action="wd-start" ${ready ? '' : 'disabled'}>${ready ? '☀ 始業する（点検結果を記録）' : startHint(s, carry)}</button>`;
  }
  const day = s.day;
  const ready = closeReady(s.closeForm, day, s.user, isVisiting(s));
  const diff = closeDiff(day, s.user, s.closeForm.counted);
  return `
    ${s.closeForm.countedSet ? diffBox(diff, '帳簿の残高') : '<div class="rounded-xl bg-slate-50 border p-3 text-center text-sm text-slate-500">いま手元にある現金を数えて、入力してください</div>'}
    <button class="btn btn-primary w-full text-xl !py-3" data-action="wd-close" ${ready ? '' : 'disabled'}>${ready ? '🌙 日報を提出して終業' : closeHint(s, diff)}</button>`;
}

const startHint = (s, carry) => {
  if (!s.startForm.countedSet) return '現金の確認が必要です';
  const left = START_CHECKS.filter((c) => !s.startForm.checks[c.key]).length;
  if (left) return `あと${left}項目の点検が必要です`;
  return s.startForm.counted - carry !== 0 && !s.startForm.note.trim() ? '差異の理由を入力してください' : '';
};
const closeHint = (s, diff) => {
  if (isVisiting(s)) return '訪問中です。訪問を終了してください';
  if (!s.closeForm.countedSet) return '現金の確認が必要です';
  const left = END_CHECKS.filter((c) => !s.closeForm.checks[c.key]).length;
  if (left) return `あと${left}項目の点検が必要です`;
  return diff !== 0 && !s.closeForm.note.trim() ? '差異の理由を入力してください' : '';
};

// ---- 始業 -------------------------------------------------------------------
function startScreen(s) {
  const u = userById(s.user);
  const carry = carryoverFor(s.user);
  const form = { ...s.startForm, name: 'start' };
  const left = START_CHECKS.filter((c) => !form.checks[c.key]).length;
  return `
  <section class="${SEC} flex gap-3">
    <div class="card !p-4 w-[28rem] shrink-0 flex flex-col gap-3 min-h-0 overflow-y-auto" data-scroll="wdStartL">
      <div><div class="text-sm text-slate-500">${dateLabel(dateKey())}</div>
        <h2 class="text-2xl font-bold">☀ 始業開始</h2>
        <p class="text-sm text-slate-600">${esc(u.name)} さん、おはようございます。始業点検を行い、記録してから業務を開始します。始業するまで、他の機能は使えません。</p></div>
      <div class="rounded-xl border-2 p-3 space-y-2">
        <div class="font-bold">💴 前日からの繰越金の確認</div>
        <div class="flex justify-between items-baseline"><span class="text-sm text-slate-600">${carry.from ? `前日（${dateLabel(carry.from)}）の終業時の所持金` : '繰越金（初回のため初期値）'}</span><b class="text-2xl">${yen(carry.amount)}</b></div>
        <label class="block"><span class="font-bold text-sm">いま手元にある現金（実際に数えた金額）</span>
          ${moneyInputHtml({ attrs: 'data-wd="start-counted"', value: form.counted, cls: 'field' })}</label>
        <label class="block"><span class="font-bold text-sm">差異の理由<span class="font-normal text-xs text-slate-500">（ずれがある場合は必須）</span></span>
          <textarea class="field !py-2 mt-1" rows="2" data-wd="start-note" placeholder="例: 前日の昼食代のレシートが未計上">${esc(form.note)}</textarea></label>
      </div>
      <div id="wd-live" class="space-y-2">${wdLiveView(s)}</div>
    </div>
    <div class="card !p-4 flex-1 min-w-0 flex flex-col gap-2 min-h-0">
      <div class="flex items-center justify-between"><h2 class="text-lg font-bold">✅ 始業点検</h2>
        <span class="font-bold ${left ? 'text-amber-700' : 'text-emerald-700'}">${START_CHECKS.length - left} / ${START_CHECKS.length}</span></div>
      <p class="text-xs text-slate-500">すべて確認してチェックしてください。点検した内容と時刻は、記録として残ります。</p>
      <div class="space-y-1.5 overflow-y-auto min-h-0 flex-1" data-scroll="wdChecks">${START_CHECKS.map((c) => checkRow(form, c, false)).join('')}</div>
      <div class="flex justify-end gap-3 text-xs text-slate-400"><button class="underline" data-action="wd-demo-start">（デモ用）すべてチェックして繰越金を一致させる</button></div>
    </div>
  </section>`;
}

// ---- 日報（終業前のプレビュー／終業後の確定版） ------------------------------------
function reportCard(s, day) {
  const sm = summaryOf(day, s.user);
  const closed = Boolean(day.closedAt);
  const visits = day.visits;
  const row = (label, val, cls = '') => `<div class="flex justify-between py-1 ${cls}"><span>${label}</span><b>${val}</b></div>`;
  return `
  <div class="card !p-4 flex flex-col gap-3 min-h-0 flex-1 min-w-0 overflow-y-auto" data-scroll="wdReport">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-bold">📝 日報 <span class="text-base font-normal text-slate-500">${dateLabel(day.date)} ${esc(userById(day.userId).name)}</span></h2>
      <span class="rounded-full px-3 py-0.5 text-sm font-bold ${closed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${closed ? '提出済み' : '集計中（終業で確定）'}</span></div>
    <div class="text-sm text-slate-600">勤務 ${fmtTime(day.startedAt)} 〜 ${closed ? fmtTime(day.closedAt) : '（業務中）'}</div>

    <div class="grid md:grid-cols-2 gap-3">
      <div class="rounded-xl border p-3"><div class="font-bold mb-1">💴 現金の収支</div>
        <div class="text-sm divide-y">
          ${row('前日繰越（始業時に確認）', yen(sm.opening))}
          ${row('本社からの入金', `<span class="text-emerald-700">+${yen(sm.depositTotal)}</span>`)}
          ${row('経費（買取代金を含む）', `<span class="text-rose-600">−${yen(sm.expenseTotal)}</span>`)}
          ${row('帳簿上の残高', yen(sm.balance), 'text-base')}
          ${closed ? row('実際の所持金（終業時）', yen(day.close.counted)) : ''}
          ${closed ? row('過不足', `<span class="${day.close.diff ? 'text-rose-600' : 'text-emerald-700'}">${day.close.diff ? signed(day.close.diff) : '一致 ✓'}</span>`) : ''}
        </div>
        ${closed && day.close.diff ? `<div class="text-xs rounded bg-rose-50 p-2 mt-1">差異の理由: ${esc(day.close.note)}</div>` : ''}
        ${day.start.diff ? `<div class="text-xs rounded bg-amber-50 p-2 mt-1">始業時の繰越差異 ${signed(day.start.diff)}: ${esc(day.start.note)}</div>` : ''}
      </div>
      <div class="rounded-xl border p-3"><div class="font-bold mb-1">🧾 経費の内訳</div>
        <div class="text-sm divide-y">
          ${sm.byType.length ? sm.byType.map((t) => row(`${t.icon} ${t.label}（${t.count}件）`, yen(t.amount))).join('') : '<div class="text-slate-400 py-2">経費の計上はありません</div>'}
          ${row('合計', yen(sm.expenseTotal), 'text-base')}
        </div>
      </div>
    </div>

    <div class="rounded-xl border p-3"><div class="font-bold mb-1">🏠 訪問・買取　<span class="font-normal text-sm">${visits.length}件 ／ ${visits.reduce((n, v) => n + v.itemCount, 0)}点 ／ 買取金額 <b>${yen(visits.reduce((n, v) => n + v.total, 0))}</b></span></div>
      <div class="text-sm divide-y">${visits.length ? visits.map((v) => row(`${fmtTime(v.at).slice(0, 5)}　${esc(v.customerName)} 様（${v.itemCount}点）`, yen(v.total))).join('') : '<div class="text-slate-400 py-2">完了した訪問はまだありません</div>'}</div></div>

    <div class="rounded-xl border p-3 text-sm"><div class="font-bold mb-1">✅ 始業点検</div>
      ${START_CHECKS.length}項目すべて確認済み（${fmtTime(day.startedAt)}）${START_CHECKS.map((c) => `<span class="inline-block mr-1" title="${esc(c.text)}">${c.icon}</span>`).join('')}</div>
    ${closed ? `<div class="rounded-xl border p-3 text-sm"><div class="font-bold mb-1">💬 所感・連絡事項</div>${day.close.comment ? `<p class="whitespace-pre-wrap">${esc(day.close.comment)}</p>` : '<span class="text-slate-400">なし</span>'}</div>` : ''}
    ${closed ? `<div class="rounded-xl bg-emerald-50 border-2 border-emerald-400 p-4 text-center font-bold text-emerald-800">本日の業務は終了しました。お疲れさまでした。<div class="text-sm font-normal">明日の始業時の繰越金は ${yen(day.close.counted)} です。</div></div>` : ''}
  </div>`;
}

// ---- 終業（日報のプレビュー ＋ 終業手続き） ---------------------------------------
function closeScreen(s) {
  const day = s.day;
  const sm = summaryOf(day, s.user);
  const form = { ...s.closeForm, name: 'close' };
  const left = END_CHECKS.filter((c) => !form.checks[c.key]).length;
  return `
  <section class="${SEC} flex gap-3">
    ${reportCard(s, day)}
    <div class="card !p-4 w-[28rem] shrink-0 flex flex-col gap-3 min-h-0 overflow-y-auto" data-scroll="wdCloseR">
      <h2 class="text-xl font-bold">🌙 終業手続き</h2>
      ${isVisiting(s) ? '<div class="rounded-xl bg-amber-50 border-2 border-amber-400 p-2 text-sm text-amber-800 font-bold">現在、訪問中です。訪問を終了してから終業してください。</div>' : ''}
      <div class="rounded-xl border-2 p-3 space-y-2">
        <div class="font-bold">💴 現金の締め</div>
        <div class="text-sm divide-y">
          <div class="flex justify-between py-0.5"><span>前日繰越</span><span>${yen(sm.opening)}</span></div>
          <div class="flex justify-between py-0.5"><span>＋ 入金</span><span>${yen(sm.depositTotal)}</span></div>
          <div class="flex justify-between py-0.5"><span>− 経費</span><span>${yen(sm.expenseTotal)}</span></div>
          <div class="flex justify-between py-1 font-bold text-lg"><span>帳簿上の残高</span><span>${yen(sm.balance)}</span></div></div>
        <label class="block"><span class="font-bold text-sm">実際に所持している現金</span>
          ${moneyInputHtml({ attrs: 'data-wd="close-counted"', value: form.counted, cls: 'field' })}</label>
        <label class="block"><span class="font-bold text-sm">差異の理由<span class="font-normal text-xs text-slate-500">（ずれがある場合は必須）</span></span>
          <textarea class="field !py-2 mt-1" rows="2" data-wd="close-note" placeholder="例: 駐車場代のレシートを紛失">${esc(form.note)}</textarea></label>
      </div>
      <div class="space-y-1.5">
        <div class="flex items-center justify-between"><b>終業点検</b><span class="font-bold ${left ? 'text-amber-700' : 'text-emerald-700'}">${END_CHECKS.length - left} / ${END_CHECKS.length}</span></div>
        ${END_CHECKS.map((c) => checkRow(form, c, false)).join('')}</div>
      <label class="block"><span class="font-bold text-sm">所感・本社への連絡事項<span class="font-normal text-xs text-slate-500">（任意）</span></span>
        <textarea class="field !py-2 mt-1" rows="2" data-wd="close-comment" placeholder="お客様の反応、困ったこと、明日の予定など">${esc(form.comment)}</textarea></label>
      <div id="wd-live" class="space-y-2">${wdLiveView(s)}</div>
      <button class="text-xs underline text-slate-400 self-end" data-action="wd-demo-close">（デモ用）帳簿どおりに入力して、すべてチェック</button>
    </div>
  </section>`;
}

export function workdayView(s) {
  if (s.phase === 'before') return startScreen(s);
  if (s.phase === 'closed') return `<section class="${SEC} flex justify-center"><div class="w-full max-w-4xl flex min-h-0">${reportCard(s, s.day)}</div></section>`;
  return closeScreen(s);
}

// ---- 経費管理 ---------------------------------------------------------------
const stat = (label, val, cls = '') => `<div class="card !p-3 flex-1"><div class="text-xs text-slate-500">${label}</div><div class="text-2xl font-bold ${cls}">${val}</div></div>`;

// 計上ボタン（入力のたびに差し替え）
export function expLiveView(s) {
  const d = s.expDraft;
  const ok = expenseReady(d);
  const hint = !d.type ? '種別を選んでください' : !(d.amount > 0) ? '金額を入力してください' : d.type === 'other' && !d.memo.trim() ? '内容（メモ）を入力してください' : !d.photo ? 'レシートの写真を添付してください' : '';
  return `<button class="btn btn-primary w-full !py-3" data-action="exp-submit" ${ok ? '' : 'disabled'}>${ok ? '経費として計上する' : hint}</button>`;
}

function ledgerRows(s) {
  const sm = summaryOf(s.day, s.user);
  const rows = [
    ...sm.deposits.map((d) => ({ at: d.at, kind: 'dep', d })),
    ...sm.expenses.map((e) => ({ at: e.at, kind: 'exp', e })),
  ].sort((a, b) => a.at - b.at);
  const base = `<div class="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg text-sm"><span class="w-12 text-slate-500">始業</span><span class="flex-1 font-bold">前日繰越（始業時に確認）</span><b>${yen(sm.opening)}</b></div>`;
  const line = (r) => {
    if (r.kind === 'dep') return `<div class="flex items-center gap-3 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50"><span class="w-12 text-xs text-slate-500">${fmtTime(r.at).slice(0, 5)}</span><span class="text-xl">🏦</span><span class="flex-1"><b>本社より入金</b><span class="block text-xs text-slate-500">${esc(r.d.memo || '')}</span></span><b class="text-emerald-700">+${yen(r.d.amount)}</b></div>`;
    const e = r.e;
    const t = typeOf(e.type);
    return `<div class="flex items-center gap-3 px-3 py-2 rounded-lg border">
      <span class="w-12 text-xs text-slate-500">${fmtTime(e.at).slice(0, 5)}</span><span class="text-xl">${t.icon}</span>
      <span class="flex-1 min-w-0"><b>${t.label}</b>${e.auto ? '<span class="ml-1 text-[11px] rounded bg-sky-100 text-sky-800 px-1.5">自動計上</span>' : ''}<span class="block text-xs text-slate-500 truncate">${esc(e.memo)}</span></span>
      ${e.photo ? `<button class="w-12 h-12 rounded-lg overflow-hidden border shrink-0" data-action="exp-view" data-id="${e.id}" aria-label="レシートを見る"><img src="${e.photo}" alt="レシート" class="w-full h-full object-cover" /></button>` : '<span class="w-12 text-[11px] text-slate-400 text-center leading-tight">契約書で確認</span>'}
      <b class="w-28 text-right text-rose-600">−${yen(e.amount)}</b>
      ${e.auto ? '<span class="w-9"></span>' : `<button class="w-9 h-9 rounded-lg text-slate-400 hover:bg-slate-100" data-action="exp-remove" data-id="${e.id}" aria-label="削除">🗑</button>`}</div>`;
  };
  return base + rows.map(line).join('');
}

export function expenseView(s) {
  const sm = summaryOf(s.day, s.user);
  const d = s.expDraft;
  return `
  <section class="${SEC} flex flex-col gap-3">
    <div class="flex gap-3">
      ${stat('前日繰越', yen(sm.opening))}${stat('本日の入金', `+${yen(sm.depositTotal)}`, 'text-emerald-700')}${stat('経費（買取代金を含む）', `−${yen(sm.expenseTotal)}`, 'text-rose-600')}
      <div class="card !p-3 flex-1 !bg-teal-600 text-white"><div class="text-xs text-teal-100">現在の所持金（帳簿）</div><div class="text-3xl font-bold">${yen(sm.balance)}</div>${sm.balance < 0 ? '<div class="text-xs font-bold text-amber-200">⚠ 残高がマイナスです。入金・計上漏れを確認してください</div>' : ''}</div>
    </div>
    <div class="flex gap-3 flex-1 min-h-0">
      <div class="card !p-3 flex-1 min-w-0 flex flex-col min-h-0"><h2 class="font-bold text-lg mb-2">📒 今日の入出金</h2>
        <div class="space-y-1.5 overflow-y-auto min-h-0 flex-1" data-scroll="expLedger">${ledgerRows(s)}</div></div>
      <div class="card !p-3 w-[26rem] shrink-0 flex flex-col gap-2 min-h-0 overflow-y-auto" data-scroll="expForm">
        <h2 class="font-bold text-lg">➕ 経費を計上する</h2>
        <div><div class="font-bold text-sm mb-1">種別</div><div class="grid grid-cols-3 gap-1.5">
          ${EXPENSE_TYPES.map((t) => `<button class="chip !px-1 !py-1 flex flex-col items-center leading-tight ${d.type === t.key ? 'active' : ''}" data-action="exp-type" data-value="${t.key}"><span class="text-xl">${t.icon}</span><span class="text-xs">${t.label}</span></button>`).join('')}</div></div>
        <label class="block"><span class="font-bold text-sm">金額</span>${moneyInputHtml({ attrs: 'data-wd="exp-amount"', value: d.amount, cls: 'field' })}</label>
        <label class="block"><span class="font-bold text-sm">内容・メモ${d.type === 'other' ? '<span class="text-rose-600 ml-1">必須</span>' : '<span class="font-normal text-xs text-slate-500">（任意）</span>'}</span>
          <input class="field !py-2 mt-1" data-wd="exp-memo" value="${esc(d.memo)}" placeholder="例: 大阪→堺 往復分" /></label>
        <div><div class="font-bold text-sm mb-1">レシートの写真<span class="text-rose-600 ml-1">必須</span></div>
          ${d.photo
            ? `<div class="flex items-center gap-3"><img src="${d.photo}" alt="レシート" class="h-24 rounded-lg border" /><button class="btn btn-secondary !min-h-[44px] !py-1 !px-3 text-sm" data-action="exp-photo-clear">撮り直す</button></div>`
            : `<div class="grid grid-cols-2 gap-2">
                <label class="btn btn-secondary !min-h-[56px] !py-2 !px-2 text-center text-base cursor-pointer flex items-center justify-center">📷 撮影する<input type="file" accept="image/*" capture="environment" class="hidden" data-exp-photo /></label>
                <button class="btn btn-secondary !min-h-[56px] !py-2 !px-2 text-base" data-action="exp-photo-dummy">（デモ）ダミー写真</button></div>`}</div>
        <div id="exp-live">${expLiveView(s)}</div>
      </div>
    </div>
  </section>`;
}

// レシートの拡大表示
export function receiptModalView(s) {
  if (s.modal?.type !== 'receipt') return '';
  const e = s.day?.expenses.find((x) => x.id === s.modal.id);
  if (!e?.photo) return '';
  const t = typeOf(e.type);
  return `
  <div class="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-3" data-action="close-backdrop">
    <div class="bg-white rounded-2xl p-4 max-w-xl w-full max-h-[96dvh] flex flex-col gap-2">
      <div class="flex justify-between items-center"><h3 class="font-bold text-lg">${t.icon} ${t.label}　${yen(e.amount)}</h3><button class="btn btn-secondary !min-h-[44px] !py-1" data-action="close-modal">閉じる</button></div>
      <div class="text-sm text-slate-500">${fmtTime(e.at)}　${esc(e.memo)}</div>
      <img src="${e.photo}" alt="レシート" class="rounded-lg border min-h-0 object-contain" />
    </div>
  </div>`;
}
