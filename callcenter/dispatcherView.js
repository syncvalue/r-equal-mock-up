// 配車係の画面（ダミー）。オペレーターが仮確定した訪問の、担当営業を確認・変更して、確定する。主に翌々日の予定を、毎日確定していく。
// 確定した訪問だけが、営業のタブレットの予定に出る。
import { esc } from '../src/format.js';
import { USERS, isLeader } from '../src/dashboard.js';
import { conflictText, salesDetail, AREAS, areaById, areaOfUser, busyBlocks, dispatchOptions, fairerAlternative, attendanceOf, locateAddress, rankOfUser, travelAround, WORK_START, WORK_END, SLOT_STEP } from '../src/dispatch.js';
import { isTentative, isCancelled, needsReview, reviewDiffs } from '../src/reservations.js';
import { dateLabel, genderLabel, genderParen, specTags, rankBadge, statusBadge, blockCls, legHtml, legendHtml, attTag, attShade, isTentativeBlock } from './view.js';
import { avatarHtml } from './avatar.js';

// 変更の内容（項目名 変更前→変更後）
const diffText = (r) => reviewDiffs(r).map((d) => `${esc(d.label)}：${esc(trunc(d.from, 24))} → <b>${esc(trunc(d.to, 24))}</b>`).join('　／　');

const trunc = (s, n) => (String(s).length > n ? `${String(s).slice(0, n)}…` : String(s));

// 担当の配分の基準。女性のお客様は女性の担当件数、男性のお客様は担当の計の件数（オペレーターの画面と同じ）
const metric = (o, gender) => (gender === 'f' ? o.stats.female : o.stats.total);
const statLabel = (st, gender) => (gender === 'f' ? `女性${st.female}・計${st.total}` : `計${st.total}・女性${st.female}`);

function assignee(r, reservations, now) {
  const name = USERS.find((u) => u.id === r.userId)?.name ?? '';
  if (!isTentative(r)) return `<b>${esc(name)}</b>`; // 確定済み・取消済みは、変更できない
  const opts = dispatchOptions(r, reservations, now);
  const pickable = opts.filter((o) => o.free || o.current);
  const fewest = Math.min(...pickable.map((o) => metric(o, r.gender)));
  const cur = opts.find((o) => o.current);
  const fairer = r.gender === 'f' && cur ? fairerAlternative(r.gender, cur, opts) : null; // 女性のお客様で、より担当の少ない空き営業がいれば知らせる
  const label = (o) => `${pickable.includes(o) && metric(o, r.gender) === fewest ? '⭐ ' : ''}${o.user.name}（${o.rank ?? '-'}）今月 ${statLabel(o.stats, r.gender)}${o.free || o.current ? '' : o.absent ? '　× 欠勤' : o.conflict?.kind === 'shift' ? `　× ${conflictText(o.conflict)}` : '　× 予定が重なる'}`;
  return `<select class="inp !w-auto" data-reassign="${r.id}" title="担当の営業を変更できます（⭐＝今月の担当が最も少ない人。欠勤・予定が重なる営業は選べません）">${opts.map((o) => `<option value="${o.user.id}" ${o.current ? 'selected' : ''} ${o.free || o.current ? '' : 'disabled'}>${esc(label(o))}</option>`).join('')}</select>
    ${cur ? `<div class="mt-0.5 flex items-center gap-1 text-xs text-slate-600">${avatarHtml(cur.user, 20)}${rankBadge(cur.rank)} 今月 ${statLabel(cur.stats, r.gender)}件</div>` : ''}
    ${fairer ? `<div class="mt-0.5 text-xs text-rose-700">⚖ <b>${esc(fairer.user.name)}</b>の方が女性担当が少ない（${fairer.stats.female}件／選択中 ${cur.stats.female}件）</div>` : ''}`;
}

// ---- カレンダー（営業ごとの列）。オペレーターの日別表示と同じ見た目。予約の帯をドラッグして、別の営業・時間に動かす ----------------------------
// ---- 営業の詳細（顔写真を押すと、モーダルで出す） ---------------------------------------------------------
const wan = (n) => `${Math.round(n / 10000).toLocaleString('ja-JP')}万円`;
const pct = (x) => `${Math.round(x * 100)}%`;

export function staffModalHtml({ userId, date, reservations, now }) {
  const d = salesDetail({ userId, date, start: WORK_START, dur: 90, reservations, now });
  if (!d) return '';
  const { user, month, fairness: f } = d;
  const area = areaById(d.areaId);
  const box = (title, body) => `<section class="space-y-1 rounded-lg border bg-slate-50 p-2"><h3 class="text-xs font-bold text-slate-500">${title}</h3>${body}</section>`;
  const plans = d.blocks.length ? d.blocks.map((b) => `<div class="flex items-start gap-1.5 text-xs"><b class="w-24 shrink-0">${hhmm(b.start)}–${hhmm(b.end)}</b><span class="min-w-0"><span class="mr-1 rounded px-1 text-[10px] font-bold text-white ${blockCls(b)}">${isTentativeBlock(b) ? '仮' : '確'}</span>${esc(b.label)}${b.place ? `<span class="block truncate text-slate-500">${esc(b.place)}</span>` : ''}</span></div>`).join('') : '<div class="text-xs text-slate-500">予定なし</div>';
  return `<div class="fixed inset-0 z-[60] flex items-center justify-center p-4"><div class="absolute inset-0 bg-black/40" data-staffclose></div>
    <div class="relative z-10 max-h-[90vh] w-[40rem] max-w-full space-y-3 overflow-y-auto rounded-lg bg-white p-4 shadow-2xl">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3">${avatarHtml(user, 72)}<div class="space-y-0.5">
          <div class="text-lg font-bold">${esc(user.name)} ${rankBadge(d.rank)}${isLeader(user) ? '<span class="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[11px]">リーダー</span>' : ''}</div>
          <div class="text-sm text-slate-600">グループ${esc(user.group)}・${esc(area?.name ?? '')}</div>
          <div class="text-xs">${dateLabel(date)}：<b>${esc(d.att.label)}</b>${d.att.kind === 'pm' || d.att.kind === 'am' ? `（${hhmm(d.att.from)}〜${hhmm(d.att.to)}）` : ''}</div></div></div>
        <button class="b b-sec !min-h-0 !py-1" data-staffclose title="閉じる（Esc）">✕ 閉じる</button></div>
      ${box('得意分野', `<div class="flex flex-wrap gap-1">${specTags(user.id, {})}</div>`)}
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-3">
          ${box('今月の実績', `<div class="text-sm">訪問 <b>${month.visits}</b>件 ／ 成約 <b>${month.contracts}</b>件（${pct(month.rate)}）</div>
            <div class="text-sm">売上 <b>${wan(month.amount)}</b> ／ 目標 ${wan(month.target)}</div>
            <div class="relative h-2 rounded bg-slate-200"><div class="h-2 rounded ${month.achieve >= month.pace ? 'bg-emerald-500' : 'bg-amber-400'}" style="width:${Math.min(100, month.achieve * 100)}%"></div><div class="absolute -top-0.5 h-3 w-0.5 bg-slate-700" style="left:${Math.min(100, month.pace * 100)}%" title="今月の経過（${pct(month.pace)}）"></div></div>
            <div class="text-xs text-slate-500">達成 ${pct(month.achieve)}（今月の経過 ${pct(month.pace)}）　平均単価 ${wan(month.avg)}</div>`)}
          ${box('今月の担当件数', `<div class="text-sm">計 <b>${f.total}</b>件 ／ 女性 <b>${f.female}</b>件（${pct(f.femaleShare)}）／ 男性 ${f.male}件</div>`)}</div>
        <div class="space-y-3">
          ${box(`${dateLabel(date)}の予定（${d.blocks.length}件）`, `${plans}`)}
          ${box('90分で開始できる時刻', d.windows.length ? `<div class="text-sm">${d.windows.map((w) => `<b>${hhmm(w.from)}${w.to > w.from ? `〜${hhmm(w.to)}` : ''}</b>`).join('、')}</div>` : '<div class="text-sm text-rose-600">なし</div>')}</div></div>
    </div></div>`;
}

export const BOARD_ROW = 26; // 30分あたりの高さ（px）
const SLOTS = (WORK_END - WORK_START) / SLOT_STEP;
const topOf = (m) => ((m - WORK_START) / SLOT_STEP) * BOARD_ROW;
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minOf = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

function boardColumns(date, reservations, now, areaId) {
  const live = reservations.filter((r) => !isCancelled(r));
  return USERS.filter((u) => areaId === 'all' || areaOfUser(u.id) === areaId).sort((a, b) => a.id.localeCompare(b.id)).map((user) => ({
    user, att: attendanceOf(user.id, date, now), absent: attendanceOf(user.id, date, now).kind === 'absent', blocks: busyBlocks(user.id, date, live, now),
    mine: live.filter((r) => r.userId === user.id && r.date === date),
  }));
}

function blockHtml(b, selId, byId) {
  const top = topOf(b.start);
  const height = topOf(b.end) - top - 1;
  if (b.source !== 'reservation') { // 営業のスケジュールに元からある予定。確定済みの訪問と同じ見た目で出す。ドラッグすると、予約として取り込んで動かす（内部の仕組み）
    return `<div class="absolute inset-x-0.5 z-10 cursor-grab overflow-hidden rounded px-1 text-[10px] leading-[1.15] text-white ${blockCls(b)}" style="top:${top}px;height:${height}px" draggable="true" data-gid="${esc(b.gid)}" data-bsel="${esc(b.gid)}" data-mins="${b.end - b.start}" title="${esc(`${hhmm(b.start)}–${hhmm(b.end)} ${b.label}${b.place ? `（${b.place}）` : ''}　ドラッグで、別の営業・時間に動かせます`)}"><b>確 ${esc(b.label)}</b> ${hhmm(b.start)}–${hhmm(b.end)}${b.place ? `<br /><span class="opacity-90">${esc(b.place)}</span>` : ''}</div>`;
  }
  const r = byId[b.rid];
  const tent = b.status === 'tentative';
  return `<div class="absolute inset-x-0.5 z-10 cursor-grab overflow-hidden rounded px-1 text-[10px] leading-[1.15] text-white ${blockCls(b)} ${b.review ? 'ring-2 ring-rose-500' : ''} ${selId === b.rid ? 'ring-2 ring-amber-300' : ''}" style="top:${top}px;height:${height}px" draggable="true" data-rid="${b.rid}" data-bsel="${b.rid}" data-mins="${b.end - b.start}" title="${esc(`${hhmm(b.start)}–${hhmm(b.end)} ${b.label}（${r?.customer.address ?? ''}）　ドラッグで、別の営業・時間に動かせます`)}">
    <b>${b.review ? '⚠ ' : ''}${tent ? '仮 ' : '確 '}${esc(b.label)}</b> ${hhmm(b.start)}–${hhmm(b.end)}${r ? `<br /><span class="opacity-90">${esc(r.customer.address)}</span>` : ''}
    ${tent ? `<button class="absolute right-0.5 top-0.5 rounded bg-white/90 px-1 text-[10px] font-bold text-indigo-800" data-fix="${b.rid}" title="この予約を確定する">確定</button>` : ''}</div>`;
}

export function boardHtml({ date, reservations, now, area, selId }) {
  const cols = boardColumns(date, reservations, now, area);
  const byId = Object.fromEntries(reservations.map((r) => [r.id, r]));
  const h = SLOTS * BOARD_ROW;
  const grid = `grid-template-columns:2.25rem repeat(${cols.length},minmax(7.5rem,1fr));min-width:${2.25 + cols.length * 7.5}rem`;
  const head = cols.map((c) => {
    const t = c.mine.filter(isTentative).length;
    return `<div class="border-b bg-slate-50 px-1 py-0.5 text-center"><button class="rounded-full hover:ring-2 hover:ring-teal-400" data-staffinfo="${c.user.id}" title="${esc(c.user.name)}の詳細を見る">${avatarHtml(c.user, 26)}</button><b class="text-xs">${esc(c.user.name)}</b> ${rankBadge(rankOfUser(c.user.id))}
      ${attTag(c.att) ? `<div>${attTag(c.att)}</div>` : ''}<div class="text-[10px] ${c.absent ? 'font-bold text-slate-600' : 'text-slate-500'}">${c.absent ? '欠勤' : `${c.mine.length}件${t ? `（仮${t}）` : ''}`}</div></div>`;
  }).join('');
  const axis = `<div class="relative sticky left-0 z-30 bg-white" style="height:${h}px">${Array.from({ length: SLOTS / 2 }, (_, i) => `<span class="absolute right-1 -translate-y-1/2 text-[10px] text-slate-400" style="top:${i * 2 * BOARD_ROW}px">${WORK_START / 60 + i}:00</span>`).join('')}</div>`;
  const body = cols.map((c) => `<div class="relative border-l" data-bcol="${c.user.id}" style="height:${h}px;background-image:${c.absent ? 'repeating-linear-gradient(135deg,#e2e8f0 0,#e2e8f0 6px,#f1f5f9 6px,#f1f5f9 12px)' : `repeating-linear-gradient(to bottom,transparent 0,transparent ${BOARD_ROW - 1}px,#e2e8f0 ${BOARD_ROW - 1}px,#e2e8f0 ${BOARD_ROW}px)`}">
    ${c.blocks.map((b) => blockHtml(b, selId, byId)).join('')}${attShade(c.att, BOARD_ROW)}
    ${c.absent ? '<div class="pointer-events-none absolute inset-x-0 top-2 z-20 text-center"><span class="rounded bg-slate-600 px-2 py-0.5 text-xs font-bold text-white">欠勤</span></div>' : ''}</div>`).join('');
  return `<div class="overflow-x-auto"><div class="grid" style="${grid}"><div class="border-b sticky left-0 z-30 bg-white"></div>${head}${axis}${body}</div></div>`;
}

// 選んだ予約の詳細と操作（確定・仮に戻す・詳細変更・取消）。前後のアポからの距離も出す
function boardDetailHtml(r, reservations, now) {
  if (!r) return '<p class="px-3 py-2 text-xs text-slate-500">予約の帯を押すと、詳細が出ます。ドラッグして、別の営業・時間に動かせます（30分刻み）。帯の「確定」ボタンで、その予約を確定します。</p>';
  const user = USERS.find((u) => u.id === r.userId);
  const area = areaById(r.areaId);
  const others = reservations.filter((x) => x.id !== r.id && !isCancelled(x));
  const travel = area ? travelAround(busyBlocks(r.userId, r.date, others, now), minOf(r.start), minOf(r.end), locateAddress(r.customer.address, area)) : null;
  return `<div class="grid grid-cols-[1fr_auto] gap-3 px-3 py-2 text-sm">
    <div class="space-y-0.5"><div><b>${esc(r.customer.name)}</b> 様${genderParen(r.gender)}　${esc(r.start)}〜${esc(r.end)}　${statusBadge(r)}</div>
      <div class="text-xs text-slate-600">${esc(r.customer.address)} ／ ${esc([r.customer.phone, r.customer.phone2].filter(Boolean).join(' ／ '))}</div>
      <div class="text-xs">売りたいもの：${esc(r.hearing.wants)}</div>
      <div class="flex items-center gap-1 text-xs">担当${isTentative(r) ? '（仮）' : ''}：${user ? avatarHtml(user, 20) : ''}<b>${esc(user?.name ?? '')}</b> ${rankBadge(rankOfUser(r.userId))}</div>
      ${travel ? `<div class="text-[11px] leading-tight text-slate-600">${legHtml(travel.prev, 'prev')}${travel.next ? `<br />${legHtml(travel.next, 'next')}` : ''}</div>` : ''}
      ${r.holdNote && isTentative(r) ? `<div class="text-xs text-violet-700">確認待ち：${esc(r.holdNote)}</div>` : ''}
      ${needsReview(r) ? `<div class="text-xs text-rose-700">変更：${diffText(r) || '—'}</div>` : ''}</div>
    <div class="flex flex-col items-end gap-1">${isTentative(r) ? `<button class="b b-pri !min-h-0 !py-1" data-fix="${r.id}">確定</button>` : `<button class="b b-sec !min-h-0 !py-1" data-unfix="${r.id}">仮に戻す</button>`}
      <div class="flex gap-3 text-xs"><button class="underline text-sky-700" data-chg="${r.id}">詳細を変更</button><button class="underline text-rose-700" data-cancelres="${r.id}">取消</button></div></div></div>`;
}

export function dispatcherHtml({ date, reservations, now, chips, view = 'board', area = 'osaka', selId = null }) {
  const rows = reservations.filter((r) => r.date === date).sort((a, b) => a.start.localeCompare(b.start) || a.receptionNo.localeCompare(b.receptionNo));
  const tent = rows.filter(isTentative).length;
  const reviews = reservations.filter(needsReview).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const actions = (r) => (isCancelled(r) ? `<span class="text-xs text-slate-500" title="${esc(`${r.cancelledAt ?? ''} ${r.cancelledBy ?? ''}`)}">${esc(r.cancelReason ?? '')}</span>`
    : `${isTentative(r) ? `<button class="b b-pri !min-h-0 !py-1" data-fix="${r.id}">確定</button>` : `<button class="text-xs underline text-slate-500" data-unfix="${r.id}">仮に戻す</button>`}
      <div class="mt-1 flex gap-2 text-xs"><button class="underline text-sky-700" data-chg="${r.id}">日時変更</button><button class="underline text-rose-700" data-cancelres="${r.id}">取消</button></div>`);
  const body = rows.map((r) => `<tr class="border-t align-top ${isCancelled(r) ? 'bg-slate-100 text-slate-400 line-through' : needsReview(r) ? 'bg-rose-50' : isTentative(r) ? '' : 'bg-emerald-50/50'}">
      <td class="whitespace-nowrap font-bold">${esc(r.start)}〜${esc(r.end)}</td>
      <td><b>${esc(r.customer.name)}</b> 様${genderParen(r.gender)}<div class="text-xs text-slate-500">${esc(r.receptionNo)} ／ ${esc(r.customer.phone)}</div>${needsReview(r) ? `<div class="mt-0.5 text-xs text-rose-700">変更：${diffText(r) || '—'}</div>` : ''}${r.holdNote && isTentative(r) ? `<div class="mt-0.5 text-xs text-violet-700">確認待ち：${esc(r.holdNote)}</div>` : ''}</td>
      <td class="max-w-[16rem]" title="${esc(r.customer.address)}">${esc(trunc(r.customer.address, 26))}<div class="text-xs text-slate-500">${esc(areaById(r.areaId)?.name ?? '例外対応')}</div></td>
      <td class="max-w-[14rem] text-xs" title="${esc(r.hearing.wants)}">${esc(trunc(r.hearing.wants, 40))}</td>
      <td>${assignee(r, reservations, now)}</td>
      <td>${statusBadge(r)}</td>
      <td class="whitespace-nowrap">${actions(r)}</td></tr>`).join('');
  const banner = reviews.length ? `<section class="space-y-1.5 rounded-lg border-2 border-rose-500 bg-rose-50 p-3">
      <b class="text-rose-800">⚠ 確定済みの予約が変更されて、仮確定に戻りました（${reviews.length}件）</b>
      ${reviews.map((r) => `<div class="flex flex-wrap items-center justify-between gap-2 rounded bg-white px-2 py-1 text-sm">
        <div><b>${dateLabel(r.date)} ${esc(r.start)}</b>　${esc(r.customer.name)} 様　<span class="text-xs text-slate-500">${esc(r.revertedAt ?? '')} 変更</span><div class="text-xs text-rose-700">${diffText(r) || '（変更内容なし）'}</div></div>
        <div class="flex gap-1"><button class="b b-sec !min-h-0 !py-0.5 text-xs" data-showday="${r.date}">この日を表示</button><button class="b b-sec !min-h-0 !py-0.5 text-xs" data-ack="${r.id}" title="内容を確認した（確定はそのまま、仮確定のまま残ります）">確認した</button></div></div>`).join('')}
    </section>` : '';
  return `
  <div class="p-4 space-y-3 h-[calc(100vh-52px)] overflow-y-auto">
    ${banner}
    <section class="bg-white rounded-lg shadow">
      <div class="p-3 flex items-center gap-2 flex-wrap"><b class="mr-2">配車確定（配車係）</b>
        ${chips.map((c) => `<button class="chip ${c.date === date ? 'on' : ''}" data-ddate="${c.date}">${esc(c.label)}　${dateLabel(c.date)}${c.tentative ? `<span class="ml-1 rounded-full bg-amber-300 px-1.5 text-[11px] text-amber-950">仮${c.tentative}</span>` : ''}${c.review ? `<span class="ml-1 rounded-full bg-rose-600 px-1.5 text-[11px] text-white">変更${c.review}</span>` : ''}</button>`).join('')}
        <input class="inp !w-auto" type="date" value="${date}" data-ddate-input />
        <div class="ml-2 flex gap-1">${[['board', 'カレンダー'], ['list', '一覧']].map(([k, t]) => `<button class="chip ${view === k ? 'on' : ''}" data-dview="${k}">${t}</button>`).join('')}</div>
        <button class="b b-pri ml-auto" data-fixall ${tent ? '' : 'disabled'}>この日の仮確定 ${tent}件を、すべて確定</button></div>
      <p class="px-3 pb-2 text-xs text-slate-500">オペレーターが仮確定した訪問を、1日分を見ながら調整して確定します。確定した訪問だけが、営業のタブレットの予定に出ます（主に翌々日の予定を、毎日確定します）。</p>
      ${view === 'board' ? `<div class="border-t px-3 py-1.5 flex flex-wrap items-center gap-2"><span class="text-xs font-bold text-slate-500">エリア</span>
        ${[...AREAS.map((a) => [a.id, a.name]), ['all', '全エリア']].map(([k, t]) => { const n = rows.filter((r) => !isCancelled(r) && (k === 'all' || r.areaId === k)).length; return `<button class="chip ${area === k ? 'on' : ''}" data-barea="${k}">${esc(t)}${n ? `<span class="ml-1 rounded-full bg-indigo-500 px-1.5 text-[11px] text-white">${n}</span>` : ''}</button>`; }).join('')}
        <span class="ml-2">${legendHtml({ want: false })}</span><span class="text-[11px] text-slate-500">帯は、どれもドラッグで動かせます</span></div>
        <div class="px-3 pb-2">${boardHtml({ date, reservations, now, area, selId })}</div>
        <div class="border-t">${boardDetailHtml(reservations.find((r) => r.id === selId), reservations, now)}</div>` : rows.length ? `<div class="overflow-x-auto"><table class="w-full text-sm text-left"><thead class="bg-slate-100 text-slate-600"><tr><th>訪問時間</th><th>お客様</th><th>訪問先</th><th>売りたいもの</th><th>担当営業</th><th>状態</th><th></th></tr></thead><tbody>${body}</tbody></table></div>`
        : `<p class="p-8 text-center text-slate-400">${dateLabel(date)}の受付はありません</p>`}
    </section>
  </div>`;
}
