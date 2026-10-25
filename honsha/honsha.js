// 査定部デスク画面（ダミー・PC想定）。営業の買取明細をリアルタイムで見て、依頼への回答や提案を行う。
import {
  AP_STORAGE_KEY, APPROVAL_KEY, sendMessage, EVAL_KEY, loadEvals, newApprovalId, approvalState, latestApproval, loadApprovals, upsertApproval, COMMENT_KEY, RESET_CONFIRM, clearTransactions, COMMENT_TAGS, LIVE_KEY, loadAppraisals, loadComments, loadLive, newAppraisalId,
  newCommentId, upsertAppraisal, upsertComment,
} from '../src/store.js';
import { RANKS } from '../src/data.js';
import { threadFor, messagesOf, addMessage, closeThread, canApprove, hasUnread, markRead } from '../src/appraisalThread.js';
import { USERS } from '../src/dashboard.js';
import { loadEmployees, appraisersOf } from '../src/employees.js';
import { eventsOfDay } from '../src/schedule.js';
import { initTheme, themeToggleHtml } from '../src/theme.js';
import { initHelp, helpIcon } from '../src/help.js';
import { formatMoneyInput, moneyInputHtml } from '../src/moneyInput.js';
import { yen, fmtTime, fmtElapsed, esc } from '../src/format.js';

const $ = (s) => document.querySelector(s);
let visitId = null;
let sel = null; // { type: 'item' | 'req', id }
let draft = { tag: '', text: '', price: '', rank: null, reason: '' }; // 営業への送信内容（コメント＋任意で提案査定額）
const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 保存できなくても動作は継続（モック） */ } };
const appraisers = () => appraisersOf(loadEmployees()); // 査定員は、社員管理から読み込む（有効な人だけ）
let appraiserId = pref('rq-mock-hq-appraiser', appraisers()[0]?.id ?? ''); // 画面を使っている査定員（デモ用に切り替え可）
let hideDone = pref('rq-mock-hq-hidedone', '0') === '1'; // 訪問完了した予定を一覧から隠す
const appraiser = () => appraisers().find((a) => a.id === appraiserId) ?? appraisers()[0] ?? { id: '', name: '', groups: [] };
const scopeUsers = () => USERS.filter((u) => appraiser().groups.includes(u.group));
let compose = null; // 営業へのお知らせ（本社からのメッセージ）の作成中データ
let dirty = false; // 入力中に届いた更新を、入力完了後に反映するためのフラグ

const TEMPLATES = ['状態良好のため上限で査定しました。', '傷・使用感があるため減額しています。', '写真だけでは判断できません。型番・シリアルの写真を追加で送ってください。'];
const sum = (items) => items.filter((i) => i.sell).reduce((n, i) => n + i.price, 0);

const visitsSorted = () =>
  Object.values(loadLive()).filter((v) => scopeUsers().some((u) => u.id === (v.userId ?? 'u01'))).sort((a, b) => Number(Boolean(a.endedAt)) - Number(Boolean(b.endedAt)) || b.updatedAt - a.updatedAt);

const commentMark = (list) =>
  !list.length ? '<span class="text-slate-300">-</span>'
  : list.some((c) => !c.ack) ? `<span class="rounded bg-rose-100 text-rose-700 px-2 py-0.5 text-xs font-bold">💬${list.length}・未確認</span>`
  : `<span class="rounded bg-slate-100 text-slate-600 px-2 py-0.5 text-xs font-bold">💬${list.length}・確認済</span>`;

const APV = {
  none: ['未承認', 'bg-amber-100 text-amber-800'], stale: ['変更あり・再承認', 'bg-orange-100 text-orange-700'],
  ok: ['承認済', 'bg-emerald-100 text-emerald-800'], ng: ['差戻し', 'bg-rose-100 text-rose-700'],
};
const apvState = (v, item, approvals) => approvalState(latestApproval(approvals, v.visitId, item.id), item);
const apvBadge = (st) => `<span class="rounded px-2 py-0.5 text-xs font-bold ${APV[st][1]}">${APV[st][0]}</span>`;
// 承認作業が必要な商品（金額が入力済みで、未承認または承認後に変更されたもの）
const pendingApprovals = (v, approvals) => v.items.filter((i) => i.sell && i.price > 0 && ['none', 'stale'].includes(apvState(v, i, approvals)));

const AP_BADGE = { 依頼中: 'bg-amber-100 text-amber-800', 回答済み: 'bg-sky-100 text-sky-800', 完結: 'bg-emerald-100 text-emerald-800' };
// 承認作業が必要で、かつ査定依頼の条件を満たす（依頼がない、または完結している）商品
const approvable = (v, approvals, aps) => pendingApprovals(v, approvals).filter((i) => canApprove(aps, v.visitId, i.id).ok);

const apStatus = (t) => (t ? `<span class="rounded px-2 py-0.5 text-xs font-bold ${AP_BADGE[t.status]}">${t.status === '依頼中' ? '返信待ち' : t.status}</span>` : '<span class="text-slate-400">依頼なし</span>');
// 担当する営業の、今日の予定（時系列）と訪問状況。ダミーの営業は、予定ごとの見本の状況（demoStatus）を使う
const ST = {
  done: ['完了', 'bg-slate-200 text-slate-600'], visiting: ['訪問中', 'bg-emerald-100 text-emerald-800'], notyet: ['まだ訪問していない', 'bg-white border border-dashed border-slate-300 text-slate-400'],
};
function scheduleRows(visits) {
  const latest = {};
  visits.forEach((v) => { if (v.eventId && (!latest[v.eventId] || v.updatedAt > latest[v.eventId].updatedAt)) latest[v.eventId] = v; });
  const events = scopeUsers().flatMap((u) => eventsOfDay(0, u.id)).sort((a, b) => a.start.localeCompare(b.start));
  const rows = events.map((e) => {
    const v = latest[e.id] ?? null;
    let key = 'notyet';
    if (v) key = v.endedAt ? 'done' : 'visiting';
    else if (e.dummy) key = e.demoStatus;
    return { e, v, key, label: v?.outcome ? v.outcome.label : ST[key][0] };
  });
  const matched = new Set(rows.map((r) => r.v?.visitId));
  return { rows, extras: visits.filter((v) => !matched.has(v.visitId)) };
}

function sidebar(visits, aps, approvals) {
  const { rows, extras } = scheduleRows(visits);
  const doneN = rows.filter((r) => r.key === 'done').length;
  const shown = rows.filter((r) => !(hideDone && r.key === 'done'));
  const visitCard = (v) => {
    const pending = aps.filter((a) => a.visitId === v.visitId && a.status === '依頼中').length;
    return `<div class="flex justify-between text-sm mt-1"><span>${v.items.length}点 ／ ${yen(sum(v.items))}</span>
      <span>${pending ? `<span class="rounded-full bg-rose-600 text-white text-xs px-2 py-0.5">依頼${pending}</span>` : ''}${pendingApprovals(v, approvals).length ? `<span class="ml-1 rounded-full bg-amber-500 text-white text-xs px-2 py-0.5">未承認${pendingApprovals(v, approvals).length}</span>` : ''}</span></div>`;
  };
  const row = ({ e, v, key, label }) => {
    const inner = `
      <div class="flex justify-between items-center gap-2"><span class="font-bold">${e.start}–${e.end}　${esc(e.customer.name)} 様</span>
        <span class="text-xs rounded px-2 py-0.5 shrink-0 ${v?.outcome ? 'bg-amber-100 text-amber-800' : ST[key][1]}">${esc(label)}</span></div>
      <div class="text-xs text-slate-500">営業 ${esc(USERS.find((u) => u.id === e.userId)?.name ?? '')} ／ ${esc(e.items)}${v ? ` ／ 開始 ${fmtTime(v.startedAt)}` : ''}</div>
      ${v ? visitCard(v) : ''}`;
    return v
      ? `<button class="w-full text-left p-3 border-b hover:bg-indigo-50 ${v.visitId === visitId ? 'bg-indigo-50' : ''}" data-visit="${v.visitId}">${inner}</button>`
      : `<div class="p-3 border-b ${key === 'done' ? 'opacity-60' : ''}">${inner}</div>`;
  };
  const extra = extras.filter((v) => !(hideDone && v.endedAt)).map((v) => row({ e: { start: fmtTime(v.startedAt).slice(0, 5), end: '', customer: { name: v.customerName }, userId: v.userId ?? 'u01', items: '予定外・別日の訪問' }, v, key: v.endedAt ? 'done' : 'visiting', label: v.outcome ? v.outcome.label : v.endedAt ? '完了' : '訪問中' }));
  if (!shown.length && !extra.length) return `<p class="p-6 text-slate-400">${rows.length ? '表示する予定はありません（完了分を隠しています）' : '担当する営業の、今日の予定はありません'}</p>`;
  return shown.map(row).join('') + (extra.length ? `<div class="px-3 py-1 text-xs font-bold text-slate-500 bg-slate-50 border-b">予定外・別日の訪問</div>${extra.join('')}` : '');
}

// 営業が記録した、お客様の評価（次の営業活動用の記録）
function evalCard(e) {
  if (!e) return '';
  const row = (k, v) => (v && v.length ? `<div><span class="text-xs text-slate-500">${k}</span> <b>${Array.isArray(v) ? v.map(esc).join('・') : esc(v)}</b></div>` : '');
  return `
  <div class="rounded-lg border bg-white p-3 space-y-1">
    <div class="flex justify-between items-center"><b>⭐ お客様の評価（営業の記録）</b>
      <span class="text-amber-400 text-xl tracking-tight">${'★'.repeat(e.overall)}<span class="text-slate-300">${'★'.repeat(5 - e.overall)}</span></span></div>
    <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
      ${row('態度', e.attitude)}${row('リピート見込み', e.repeat)}${row('資力', e.wealth)}${row('次回時期', e.timing)}
    </div>
    <div class="text-sm">${row('次回の商材', e.cats)}${row('特記事項', e.flags)}</div>
    ${e.memo ? `<div class="text-sm whitespace-pre-wrap rounded bg-slate-50 px-2 py-1">${esc(e.memo)}</div>` : ''}
    <div class="text-xs text-slate-400">${esc(e.by)} ／ ${fmtTime(e.savedAt)} 記録</div>
  </div>`;
}

function itemsTable(v, aps, cs, approvals) {
  const rows = v.items.map((i) => {
    const t = threadFor(aps, v.visitId, i.id);
    const st = apvState(v, i, approvals);
    const gate = canApprove(aps, v.visitId, i.id);
    const apv = i.price > 0
      ? `${apvBadge(st)}${['none', 'stale'].includes(st) ? (gate.ok ? ` <button class="ml-1 rounded bg-emerald-600 text-white text-xs font-bold px-2 py-1" data-approve="${i.id}">承認</button>` : ' <span class="text-xs text-slate-500">査定の完結待ち</span>') : ''}`
      : '<span class="text-xs text-slate-400">金額未入力</span>';
    return `
    <tr class="border-t cursor-pointer hover:bg-indigo-50 ${sel?.type === 'item' && sel.id === i.id ? 'bg-indigo-100' : ''}" data-item="${i.id}">
      <td class="p-2 ${i.sell ? '' : 'text-slate-400 line-through'}"><b>${esc(i.name)}</b><div class="text-xs text-slate-500 no-underline">${esc(i.category)}</div></td>
      <td class="text-center ${i.sell ? '' : 'text-slate-400'}">${i.rank} ×${i.qty}</td>
      <td class="text-right ${i.sell ? 'font-bold' : 'text-slate-400 line-through'}">${yen(i.price)}</td>
      <td class="text-center ${i.sell ? '' : 'text-slate-400'}">${i.sell ? '売る' : '売らない'}</td>
      <td class="text-center">${apv}</td>
      <td class="text-center">${apStatus(t)}${t && hasUnread(t, 'hq') ? '<div class="mt-0.5 text-xs font-bold text-rose-600">💬 未読あり</div>' : ''}</td>
      <td class="text-center">${commentMark(cs.filter((c) => c.itemId === i.id))}</td></tr>`;
  }).join('');
  const orphans = aps.filter((a) => a.visitId === v.visitId && !v.items.some((i) => i.id === a.itemId));
  return `
  <div class="bg-white rounded-lg shadow overflow-hidden">
    <table class="w-full text-left text-sm"><thead class="bg-slate-100 text-slate-600"><tr>
      <th class="p-2">商品名</th><th>ランク×数</th><th class="text-right">小計</th><th>売却</th><th>承認</th><th>査定依頼</th><th>コメント</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="p-6 text-center text-slate-400">まだ商品が追加されていません</td></tr>'}</tbody></table>
  </div>
  ${orphans.length ? `<h3 class="font-bold mt-4 mb-1">明細に入っていない査定依頼</h3>
    <div class="bg-white rounded-lg shadow">${orphans.map((a) => `<button class="w-full text-left p-3 border-t first:border-0 hover:bg-indigo-50 flex justify-between ${sel?.type === 'req' && sel.id === a.id ? 'bg-indigo-100' : ''}" data-req="${a.id}"><span class="font-bold">${esc(a.name)}</span>${apStatus(a)}</button>`).join('')}</div>` : ''}`;
}

const emptyDraft = () => ({ tag: '', text: '', price: '', rank: null, reason: '' });

// 営業への送信フォーム（コメント＋任意で提案査定額）。回答・意見の区別なく、これ1つで送る
function sendForm(itemId, item, hasThread = false) {
  const rank = draft.rank ?? item?.rank ?? 'A';
  return `
  <div class="rounded-lg border bg-white p-3 space-y-2">
    <div class="font-bold">💬 ${hasThread ? '営業に返信' : '営業へ送信'} ${itemId ? '' : `（訪問全体）${helpIcon('明細の商品を選ぶと、その商品について営業とやり取りできます。')}`}</div>
    <div class="flex flex-wrap gap-1">${COMMENT_TAGS.map((t) => `<button class="px-3 py-1 rounded border text-sm font-bold ${t === draft.tag ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white'}" data-tag="${t}">${t}</button>`).join('')}</div>
    <textarea class="w-full border rounded px-3 py-2" rows="3" data-f="text" placeholder="例: 状態Aで9万円は安すぎます。実績は12万円前後です。">${esc(draft.text)}</textarea>
    <div class="flex flex-wrap gap-1">${TEMPLATES.map((t, i) => `<button class="px-2 py-1 rounded border text-xs bg-white" data-tpl="${i}">${esc(t.slice(0, 14))}…</button>`).join('')}</div>
    ${item ? `
    <div class="border-t pt-2 space-y-2">
      ${item.price > 0 ? `<button class="w-full rounded border-2 border-emerald-600 text-emerald-700 font-bold py-2 hover:bg-emerald-50" data-fillprice="${item.price}" data-fillrank="${item.rank}">営業の査定額 ${yen(item.price)}（ランク${item.rank}）をそのまま入力</button>` : ''}
      <div class="text-sm font-bold">提案する査定額（円・数量分の合計・任意）
        <div class="mt-1">${moneyInputHtml({ attrs: 'data-f="price"', value: Number(draft.price) || 0, placeholder: '入力すると、営業が買取金額に反映できます', cls: 'w-full border rounded px-3 py-2 text-lg' })}</div></div>
      ${draft.price ? `<div class="flex flex-wrap gap-1">${RANKS.map((r) => `<button class="px-2 py-1 rounded border text-sm font-bold ${r.value === rank ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white'}" data-rank="${r.value}">${r.label}</button>`).join('')}</div>` : ''}
    </div>` : ''}
    <button class="w-full bg-indigo-700 text-white font-bold rounded py-3" data-send="${itemId ?? ''}">${hasThread ? '返信する' : '営業に送信'}</button>
  </div>`;
}

// 営業とのやり取り履歴（時系列）
function thread(cs, itemId) {
  const list = cs.filter((c) => c.itemId === itemId).sort((a, b) => a.createdAt - b.createdAt);
  if (!list.length) return '';
  return `<div class="space-y-2">${list.map((c) => `
    <div class="text-sm rounded-lg p-2 ${c.ack ? 'bg-white border' : 'bg-rose-50 border border-rose-200'}">
      <div class="flex justify-between"><b>${c.tag ? esc(c.tag) : '査定部'}</b><span class="text-xs text-slate-500">${fmtTime(c.createdAt)}</span></div>
      <div class="whitespace-pre-wrap">${esc(c.text)}</div>
      ${c.price ? `<div class="mt-1 font-bold text-indigo-800">提案査定額 ${yen(c.price)}（ランク${c.rank}）${c.adopted ? '<span class="text-emerald-700">／ 営業が買取金額に反映済み</span>' : ''}</div>` : ''}
      <div class="text-xs mt-1 font-bold ${c.ack ? 'text-emerald-700' : 'text-rose-600'}">${c.ack ? `✓ 営業が確認済み（${fmtTime(c.ackAt)}）` : '⏳ 営業は未確認'}</div>
    </div>`).join('')}</div>`;
}

// 営業とのチャット（査定依頼）。営業は左、査定員（自分）は右
function chatPanel(t) {
  const bubbles = messagesOf(t).map((m) => {
    const mine = m.from === 'hq';
    return `<div class="flex ${mine ? 'justify-end' : 'justify-start'}"><div class="max-w-[88%] rounded-2xl px-3 py-2 space-y-1 ${mine ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-900 rounded-bl-sm'}">
      <div class="text-xs ${mine ? 'text-indigo-100' : 'text-slate-500'}">${mine ? '査定部' : esc(t.sender ?? '営業')} ${fmtTime(m.at)}${mine ? (t.salesReadAt >= m.at ? '　既読' : '　未読') : ''}</div>
      ${m.tag ? `<span class="rounded bg-white/90 text-indigo-800 px-2 py-0.5 text-xs font-bold">${esc(m.tag)}</span>` : ''}
      ${m.text ? `<div class="whitespace-pre-wrap ${mine ? '' : 'font-bold'}">${esc(m.text)}</div>` : ''}
      ${m.photos?.length ? `<div class="grid grid-cols-2 gap-1">${m.photos.map((p, i) => `<img src="${p}" alt="写真${i + 1}" class="w-full rounded border" />`).join('')}</div>` : ''}
      ${m.price ? `<div class="rounded bg-white text-indigo-800 font-bold text-sm px-2 py-1">提案査定額 ${yen(m.price)}（ランク${esc(m.rank)}）${m.adopted ? '<span class="text-emerald-700">／ 買取金額に反映済み</span>' : ''}</div>` : ''}
    </div></div>`;
  }).join('');
  const done = t.status === '完結';
  return `
  <div class="border-2 ${t.status === '依頼中' ? 'border-amber-400 shadow-md' : 'border-slate-200'} rounded-lg p-3 space-y-2 bg-white">
    <div class="flex justify-between items-center"><span class="font-bold">📨 査定依頼のやり取り</span>${apStatus(t)}</div>
    <div class="space-y-2">${bubbles}</div>
    ${done
      ? `<div class="text-sm font-bold text-emerald-700">✓ 完結しました（${fmtTime(t.closedAt)}）。続きを送ると再開します。</div>`
      : `<button class="w-full rounded border-2 border-emerald-600 text-emerald-700 font-bold py-2 hover:bg-emerald-50" data-close-thread="${t.id}">この査定依頼を完結する${helpIcon('完結すると、この商品を承認できます。営業が続けて送ると、再開します。')}</button>`}
  </div>`;
}

function aiCard(item) {
  const r = item?.aiAppraisal;
  if (!r) return '';
  return `<div class="rounded-lg border-2 border-violet-300 bg-violet-50 p-3 text-sm space-y-1">
    <div class="font-bold">🤖 営業が実行したAI査定</div>
    <div>推定 <b class="text-lg text-violet-800">${yen(r.price)}</b>（目安 ${yen(r.min)}〜${yen(r.max)}）／ ランク${r.rank} ／ 信頼度 <b>${r.confidence}%</b></div>
    <div class="text-slate-700">${esc(r.reason)}</div></div>`;
}

function approvalBlock(v, item, approvals, aps) {
  const rec = latestApproval(approvals, v.visitId, item.id);
  const st = apvState(v, item, approvals);
  const gate = canApprove(aps, v.visitId, item.id);
  const canDecide = item.price > 0 && st !== 'ok';
  return `
  <div class="rounded-lg border-2 ${canDecide ? 'border-amber-400' : 'border-slate-200'} bg-white p-3 space-y-2">
    <div class="flex justify-between items-center"><b>✅ 買取の承認</b>${item.price > 0 ? apvBadge(st) : '<span class="text-xs text-slate-400">金額未入力</span>'}</div>
    <div class="text-sm">営業の査定：<b>${item.price > 0 ? yen(item.price) : '未入力'}</b>（${item.qty}点分の合計） ／ ランク${item.rank}${item.sell ? '' : '<span class="ml-2 text-slate-500">（売らない）</span>'}</div>
    ${st === 'stale' ? `<div class="text-sm text-orange-700 font-bold">前回の判断（${yen(rec.price)}・ランク${rec.rank}・${rec.qty}点）から変更されています。</div>` : ''}
    ${st === 'ok' ? `<div class="text-sm text-emerald-700 font-bold">承認済み（${fmtTime(rec.decidedAt)}）</div>` : ''}
    ${st === 'ng' ? `<div class="text-sm text-rose-700"><b>差戻し済み：</b>${esc(rec.comment)}（営業の見直しを待っています）</div>` : ''}
    ${canDecide && !gate.ok ? `<div class="rounded bg-amber-50 border border-amber-300 text-amber-800 text-sm font-bold px-2 py-1">${esc(gate.reason)}</div>` : ''}
    ${canDecide ? `
      <textarea class="w-full border rounded px-3 py-2 text-sm" rows="2" data-f="reason" placeholder="差戻しの場合は理由を入力（必須）">${esc(draft.reason)}</textarea>
      <div class="grid grid-cols-2 gap-2">
        <button class="bg-emerald-600 text-white font-bold rounded py-3 disabled:opacity-40 disabled:cursor-not-allowed" data-approve="${item.id}" ${gate.ok ? '' : 'disabled'}>承認する</button>
        <button class="bg-white border-2 border-rose-500 text-rose-600 font-bold rounded py-3" data-reject="${item.id}">差戻し</button></div>` : ''}
  </div>`;
}

function detailPanel(v, aps, cs, approvals) {
  if (!v) return '<p class="p-6 text-slate-400">訪問を選択してください</p>';
  if (!sel) return `<div class="space-y-3">${thread(cs, null)}${sendForm(null, null)}</div>`;
  const reqId = sel.type === 'req' ? sel.id : null;
  const orphan = reqId ? aps.find((x) => x.id === reqId) : null;
  const itemId = orphan ? orphan.itemId : sel.id;
  const item = v.items.find((i) => i.id === itemId);
  const t = orphan ?? threadFor(aps, v.visitId, itemId);
  return `
  <div class="space-y-3">
    <div><div class="text-xl font-bold">${esc(item?.name ?? orphan?.name ?? '')}</div>
      ${item ? `<div class="text-sm text-slate-500">ランク${item.rank} ／ ${item.qty}点 ／ 営業の査定（合計） ${yen(item.price)}</div>` : ''}</div>
    ${t ? chatPanel(t) : ''}
    ${item ? aiCard(item) : ''}
    ${t ? sendForm(item?.id ?? t.itemId, item, true) : ''}
    ${item ? approvalBlock(v, item, approvals, aps) : ''}
    ${thread(cs, itemId)}
    ${item && !t ? sendForm(item.id, item) : ''}
  </div>`;
}

// 本社からのメッセージ（営業のダッシュボードに表示される）
function composeModal() {
  if (!compose) return '';
  return `
  <div class="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" data-compose-backdrop>
    <div class="bg-white rounded-2xl w-full max-w-xl p-5 space-y-3">
      <div class="flex justify-between items-center"><h2 class="text-xl font-bold">📢 営業へのお知らせを送る${helpIcon('営業のダッシュボードの「本社からのメッセージ」に表示されます。')}</h2>
        <button class="px-3 py-1 rounded border font-bold" data-compose-close>閉じる</button></div>
            <label class="block font-bold text-sm">タイトル<input class="w-full border rounded px-3 py-2 mt-1 font-normal" data-m="title" value="${esc(compose.title)}" placeholder="例: 今月の買取強化商材について" /></label>
      <label class="block font-bold text-sm">本文<textarea class="w-full border rounded px-3 py-2 mt-1 font-normal" rows="4" data-m="body" placeholder="お知らせの内容">${esc(compose.body)}</textarea></label>
      <div class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 font-bold"><input type="checkbox" class="w-5 h-5" data-m-important ${compose.important ? 'checked' : ''} />重要として送る</label>
        <label class="flex items-center gap-2 font-bold text-sm">宛先
          <select class="border rounded px-2 py-1 font-normal" data-m="target">
            ${[['all', '全員'], ['A', 'グループA'], ['B', 'グループB']].map(([v, l]) => `<option value="${v}" ${compose.target === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <button class="w-full bg-indigo-700 text-white font-bold rounded py-3" data-compose-send>送信する</button>
    </div>
  </div>`;
}

// 開いている商品のやり取りは、読んだことにする（営業に「既読」が出る）
function readSelected() {
  if (!sel || !visitId) return;
  const itemId = sel.type === 'req' ? loadAppraisals().find((x) => x.id === sel.id)?.itemId : sel.id;
  const t = threadFor(loadAppraisals(), visitId, itemId);
  if (t && hasUnread(t, 'hq')) upsertAppraisal(markRead(t, 'hq', Date.now()));
}

function render() {
  readSelected();
  const visits = visitsSorted();
  const aps = loadAppraisals();
  const cs = loadComments().filter((c) => c.visitId === visitId);
  const approvals = loadApprovals();
  if (!visits.some((v) => v.visitId === visitId)) { visitId = visits[0]?.visitId ?? null; sel = null; }
  const v = visits.find((x) => x.visitId === visitId);
  const totalPending = aps.filter((a) => a.status === '依頼中').length;
  $('#root').innerHTML = `
  <header class="bg-indigo-800 text-white px-6 py-3 flex justify-between items-center">
    <div class="font-bold text-xl">査定部 <span class="text-xs font-normal bg-white/20 rounded px-2 py-0.5 ml-2">ダミー画面（PC）</span></div>
    <div class="text-sm">進行中 ${visits.filter((x) => !x.endedAt).length}件 ／ 未回答の依頼 <b class="text-lg">${totalPending}</b>件 <span class="ml-3 inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> LIVE <button class="ml-4 rounded bg-white/20 px-3 py-1 font-bold" data-compose-open>📢 お知らせ送信</button> <label class="ml-3 text-xs text-white/80">査定員 <select class="rounded bg-white/20 text-white px-1 py-0.5 font-bold" data-appraiser>${appraisers().map((a) => `<option class="text-slate-800" value="${esc(a.id)}" ${a.id === appraiser().id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label> <button class="ml-2 text-xs underline text-white/70" data-reset>データ初期化</button> ${themeToggleHtml()}</div>
  </header>
  <div class="grid grid-cols-[19rem_1fr_26rem] h-[calc(100vh-52px)]">
    <aside class="bg-white border-r overflow-y-auto">
      <div class="p-3 border-b bg-slate-50 space-y-1"><div class="flex justify-between items-center"><b>今日の予定・訪問状況</b><span class="text-xs text-slate-500">完了 ${scheduleRows(visits).rows.filter((r) => r.key === 'done').length} / ${scheduleRows(visits).rows.length}件</span></div>
        <div class="text-xs text-slate-500">担当：${scopeUsers().map((u) => esc(u.name)).join('、')}</div>
        <label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" class="w-4 h-4" data-hidedone ${hideDone ? 'checked' : ''} />訪問完了を隠す</label></div>
      ${sidebar(visits, aps, approvals)}
    </aside>
    <main class="p-5 overflow-y-auto space-y-4">
      ${v ? `
      <div class="flex justify-between items-end">
        <div><h1 class="text-2xl font-bold">${esc(v.customerName)} 様 <span class="text-base font-normal text-slate-500">${esc(v.staff)}</span></h1>
          <p class="text-sm text-slate-500">受付 ${esc(v.callInfo?.receptionNo ?? '')} ／ 開始 ${fmtTime(v.startedAt)} ／ 経過 <span data-elapsed="${v.startedAt}" data-end="${v.endedAt ?? ''}">${fmtElapsed(v.startedAt, v.endedAt ?? Date.now())}</span> ／ 最終更新 ${fmtTime(v.updatedAt)}</p></div>
        <div class="text-right">${approvable(v, approvals, aps).length ? `<button class="mr-3 bg-emerald-600 text-white font-bold rounded px-3 py-1 text-sm" data-approve-all>承認できる${approvable(v, approvals, aps).length}件を一括承認</button>` : ''}<button class="text-sm underline text-rose-600" data-cvisit>訪問全体にコメント</button><div class="text-sm text-slate-500">買取金額（「売る」のみ）</div><div class="text-3xl font-bold text-indigo-800">${yen(sum(v.items))}</div></div>
      </div>
      ${v.briefing?.propose ? `<div class="text-sm rounded-lg bg-slate-50 border px-3 py-1.5">査定前の説明：<b>実施済み</b> ／ 他商品の提案：<b class="${v.briefing.propose === 'yes' ? 'text-teal-700' : 'text-slate-600'}">${v.briefing.propose === 'yes' ? '提案してよい' : '提案は不要（お客様の希望）'}</b></div>` : ''}
      ${v.outcome ? `<div class="rounded-xl border-2 border-amber-400 bg-amber-50 p-3"><b>🚪 買取に至らず：${esc(v.outcome.label)}</b>${helpIcon('訪問実績として扱い、営業の業績には影響しません。')}${v.outcome.date || v.outcome.time ? `　希望日時 ${esc(v.outcome.date)} ${esc(v.outcome.time)}` : ''}${v.outcome.memo ? `<div class="text-sm whitespace-pre-wrap">${esc(v.outcome.memo)}</div>` : ''}</div>` : ''}
      ${evalCard(loadEvals().find((e) => e.visitId === v.visitId))}
      ${itemsTable(v, aps, cs, approvals)}` : '<p class="text-slate-400 p-10 text-center">左の一覧から訪問を選択してください</p>'}
    </main>
    <aside class="bg-slate-50 border-l p-4 overflow-y-auto">${detailPanel(v, aps, cs, approvals)}</aside>
  </div>${composeModal()}`;
  dirty = false;
}

// 承認／差戻し（営業の申請は不要。商品が登録された時点から、いつでも実行できる）。
// 差戻しは理由必須で、営業にはコメント（❗）としても届く
function decideItem(itemId, ok) {
  const v = loadLive()[visitId];
  const item = v?.items.find((i) => i.id === itemId);
  if (!item || !(item.price > 0)) return false;
  if (ok) {
    const gate = canApprove(loadAppraisals(), visitId, itemId);
    if (!gate.ok) { alert(gate.reason); return false; }
  }
  if (!ok && !draft.reason.trim()) { alert('差戻しの理由を入力してください'); return false; }
  const now = Date.now();
  upsertApproval({
    id: newApprovalId(), visitId, itemId, name: item.name, price: item.price, rank: item.rank, qty: item.qty,
    status: ok ? '承認' : '差戻し', requestedAt: now, decidedAt: now, comment: ok ? '' : draft.reason.trim(),
  });
  if (!ok) {
    upsertComment({
      id: newCommentId(), visitId, itemId, tag: '差戻し', text: draft.reason.trim(),
      price: null, rank: null, from: '査定部', createdAt: now, ack: false, ackAt: null,
    });
  }
  draft = { ...draft, reason: '' };
  return true;
}

function send(itemId) {
  const text = draft.text.trim();
  const price = Number(draft.price) || 0;
  if (!text && !price) return alert('コメントか査定額のどちらかを入力してください');
  const v = loadLive()[visitId];
  const item = itemId ? v.items.find((i) => i.id === itemId) : null;
  const rank = draft.rank ?? item?.rank ?? 'A';
  const now = Date.now();
  const t = itemId ? threadFor(loadAppraisals(), visitId, itemId) : null;
  if (t) {
    // 営業からの査定依頼があれば、そのチャットに返信する
    upsertAppraisal(addMessage(t, { from: 'hq', tag: draft.tag, text, price: price || null, rank: price ? rank : null, at: now }));
  } else {
    upsertComment({
      id: newCommentId(), visitId, itemId: itemId || null, tag: draft.tag, text: text || '（査定額の提案）',
      price: price || null, rank: price ? rank : null, from: '査定部', createdAt: now, ack: false, ackAt: null,
    });
  }
  draft = emptyDraft();
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-compose-backdrop]') && e.target.matches('[data-compose-backdrop]')) { compose = null; render(); return; }
  const t = e.target.closest('button, tr[data-item]');
  if (!t) return;
  if ('composeOpen' in t.dataset) { compose = { title: '', body: '', important: false, target: 'all' }; render(); return; }
  if ('composeClose' in t.dataset) { compose = null; render(); return; }
  if ('composeSend' in t.dataset) {
    if (!compose.title.trim() || !compose.body.trim()) return alert('タイトルと本文を入力してください');
    sendMessage({ id: `msg-${Date.now().toString(36)}`, title: compose.title.trim(), body: compose.body.trim(), important: compose.important, target: compose.target, sender: '査定部', sentAt: Date.now() });
    compose = null; render(); return;
  }
  if (t.dataset.visit) { visitId = t.dataset.visit; sel = null; draft = emptyDraft(); }
  else if (t.dataset.item) { sel = { type: 'item', id: t.dataset.item }; draft = emptyDraft(); }
  else if (t.dataset.req) { sel = { type: 'req', id: t.dataset.req }; draft = emptyDraft(); }
  else if ('cvisit' in t.dataset) { sel = null; draft = emptyDraft(); }
  else if (t.dataset.tag) draft = { ...draft, tag: draft.tag === t.dataset.tag ? '' : t.dataset.tag };
  else if (t.dataset.fillprice) draft = { ...draft, price: t.dataset.fillprice, rank: t.dataset.fillrank, text: draft.text || 'この査定額でOKです。' };
  else if (t.dataset.rank) draft = { ...draft, rank: t.dataset.rank };
  else if (t.dataset.tpl) draft = { ...draft, text: TEMPLATES[Number(t.dataset.tpl)] };
  else if ('send' in t.dataset) send(t.dataset.send);
  else if (t.dataset.closeThread) {
    const a = loadAppraisals().find((x) => x.id === t.dataset.closeThread);
    if (a) upsertAppraisal(closeThread(a, Date.now()));
  }
  else if (t.dataset.approve) decideItem(t.dataset.approve, true);
  else if (t.dataset.reject) { if (!decideItem(t.dataset.reject, false)) return; }
  else if ('approveAll' in t.dataset) {
    const v = loadLive()[visitId];
    const aps = loadAppraisals();
    pendingApprovals(v, loadApprovals()).filter((i) => canApprove(aps, visitId, i.id).ok).forEach((i) => decideItem(i.id, true));
  }
  else if ('reset' in t.dataset) { if (!confirm(RESET_CONFIRM)) return; clearTransactions(); visitId = null; sel = null; }
  else return;
  render();
});
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-hidedone]')) { hideDone = e.target.checked; setPref('rq-mock-hq-hidedone', hideDone ? '1' : '0'); render(); return; }
  if (e.target.matches('[data-appraiser]')) { appraiserId = e.target.value; setPref('rq-mock-hq-appraiser', appraiserId); visitId = null; sel = null; render(); return; }
  if (compose && e.target.matches('[data-m-important]')) compose = { ...compose, important: e.target.checked };
  if (compose && e.target.dataset.m === 'target') compose = { ...compose, target: e.target.value };
});
document.addEventListener('input', (e) => {
  if (compose && e.target.dataset.m && e.target.dataset.m !== 'target') { compose = { ...compose, [e.target.dataset.m]: e.target.value }; return; }
  if (e.target.dataset.f === 'price') {
    // 金額は3桁区切りで表示し、内部では数字のみ保持する（ランク選択欄の出し入れのため、入力有無が変わる時だけ再描画）
    const had = Boolean(draft.price);
    draft = { ...draft, price: String(formatMoneyInput(e.target) || '') };
    if (had !== Boolean(draft.price)) { const pos = e.target.selectionStart; render(); const el = document.querySelector('[data-f=price]'); el?.focus(); el?.setSelectionRange(pos, pos); }
  } else if (e.target.dataset.f) draft = { ...draft, [e.target.dataset.f]: e.target.value };
});

// 営業側の更新を即時反映。入力中なら、入力欄から離れたときに反映する
window.addEventListener('storage', (e) => {
  if (![LIVE_KEY, AP_STORAGE_KEY, COMMENT_KEY, APPROVAL_KEY, EVAL_KEY].includes(e.key)) return;
  if (isEditing()) dirty = true;
  else render();
});
const isEditing = () => Boolean(document.activeElement?.dataset?.f || document.activeElement?.dataset?.m);
document.addEventListener('focusout', () => { if (dirty) setTimeout(() => !isEditing() && render(), 0); });

setInterval(() => {
  document.querySelectorAll('[data-elapsed]').forEach((el) => {
    if (!el.dataset.end) el.textContent = fmtElapsed(Number(el.dataset.elapsed));
  });
}, 1000);

initTheme();
initHelp();
render();
