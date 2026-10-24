// 配車係の画面（ダミー）。オペレーターが仮確定した訪問の、担当営業を確認・変更して、確定する。主に翌々日の予定を、毎日確定していく。
// 確定した訪問だけが、営業のタブレットの予定に出る。
import { esc } from '../src/format.js';
import { USERS, isLeader } from '../src/dashboard.js';
import { dayTravel, salesDetail, AREAS, areaById, areaOfUser, busyBlocks, attendanceOf, inOffTime, locateAddress, rankOfUser, travelAround, WORK_START, WORK_END, SLOT_STEP } from '../src/dispatch.js';
import { isTentative, isCancelled, isReverted, needsReview, reviewDiffs } from '../src/reservations.js';
import { customerProfile, customerDossier, visitLines, lineTotal } from '../src/customerHistory.js';
import { callHistory } from '../src/callHistory.js';
import { assignAdvice, declinedCardHtml } from '../src/customerProfileView.js';
import { customerProfileHtml, customerMarks, custRankBadge, troubleBadge, cooloffBadge, dateLabel, genderParen, specTags, rankBadge, statusBadge, blockCls, legHtml, legendHtml, attTag, attShade, isTentativeBlock, blockMark } from './view.js';
import { avatarHtml } from './avatar.js';

// 変更の内容（項目名 変更前→変更後）
const diffText = (r) => reviewDiffs(r).map((d) => `${esc(d.label)}：${esc(trunc(d.from, 24))} → <b>${esc(trunc(d.to, 24))}</b>`).join('　／　');

const trunc = (s, n) => (String(s).length > n ? `${String(s).slice(0, n)}…` : String(s));

// ---- カレンダー（営業ごとの列）。オペレーターの日別表示と同じ見た目。予約の帯をドラッグして、別の営業・時間に動かす ----------------------------
// ---- 営業の詳細（顔写真を押すと、モーダルで出す） ---------------------------------------------------------
const wan = (n) => `${Math.round(n / 10000).toLocaleString('ja-JP')}万円`;
const pct = (x) => `${Math.round(x * 100)}%`;

export function staffModalHtml({ userId, date, reservations, now }) {
  const d = salesDetail({ userId, date, start: WORK_START, dur: 90, reservations, now });
  if (!d) return '';
  const { user, month, fairness: f } = d;
  const dt = dayTravel(d.blocks);
  const area = areaById(d.areaId);
  const box = (title, body) => `<section class="space-y-1 rounded-lg border bg-slate-50 p-2"><h3 class="text-xs font-bold text-slate-500">${title}</h3>${body}</section>`;
  const plans = d.blocks.length ? d.blocks.map((b) => `<div class="flex items-start gap-1.5 text-xs"><b class="w-24 shrink-0">${hhmm(b.start)}–${hhmm(b.end)}</b><span class="min-w-0"><span class="mr-1 rounded px-1 text-[10px] font-bold text-white ${blockCls(b)}">${blockMark(b).trim()}</span>${esc(b.label)}${b.place ? `<span class="block truncate text-slate-500">${esc(b.place)}</span>` : ''}</span></div>`).join('') : '<div class="text-xs text-slate-500">予定なし</div>';
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
          ${box(`${dateLabel(date)}の移動（概算）`, dt.legs.length ? `<div class="text-sm">総移動 <b>${dt.km}km</b>（約${dt.min}分）</div>${dt.legs.map((l) => `<div class="text-xs ${l.tight ? 'text-rose-700' : 'text-slate-600'}">${hhmm(l.from.end)} ${esc(l.from.label)} → ${hhmm(l.to.start)} ${esc(l.to.label)}　<b>${l.km}km</b>・約${l.min}分${l.tight ? '　⚠ 間隔に収まらない' : ''}</div>`).join('')}` : '<div class="text-xs text-slate-500">移動なし（アポが2件未満）</div>')}
          ${box('今月の担当件数', `<div class="text-sm">計 <b>${f.total}</b>件 ／ 女性 <b>${f.female}</b>件（${pct(f.femaleShare)}）／ 男性 ${f.male}件</div>`)}</div>
        <div class="space-y-3">
          ${box(`${dateLabel(date)}の予定（${d.blocks.length}件）`, `${plans}`)}
          ${box('90分で開始できる時刻', d.windows.length ? `<div class="text-sm">${d.windows.map((w) => `<b>${hhmm(w.from)}${w.to > w.from ? `〜${hhmm(w.to)}` : ''}</b>`).join('、')}</div>` : '<div class="text-sm text-rose-600">なし</div>')}</div></div>
    </div></div>`;
}

// ---- お客様の詳細（配車係が、誰を当てるかを判断する材料。モーダルで出す） ------------------------------------
const ymd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };
const yenText = (n) => `¥${Number(n || 0).toLocaleString('ja-JP')}`;
const stars = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));

// お客様の評価の登録・変更（配車係）。営業が入力した、アポごとの評価（下の買取履歴の各回）を見て、お客様の評価を登録する
function customerEvalEditor(p, phone) {
  if (!phone) return '';
  const sel = (key, opts, cur) => `<select class="inp !py-0.5" data-ce="${key}">${opts.map(([v, t]) => `<option value="${v}" ${v === (cur ?? '') ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  return `<details class="rounded border bg-white p-1.5"><summary class="cursor-pointer text-xs font-bold text-fuchsia-800">✎ お客様の評価を登録・変更する</summary>
    <div class="mt-1.5 grid grid-cols-2 gap-2 text-xs" data-custeval="${esc(phone)}">
      <label class="space-y-0.5"><span class="text-slate-500">顧客ランク（資産・売却の見込み）</span>${sel('rank', [['', '（未設定）'], ['S', 'S'], ['A', 'A'], ['B', 'B'], ['C', 'C']], p.rank && !p.rankAuto ? p.rank : '')}</label>
      <label class="space-y-0.5"><span class="text-slate-500">厄介度</span>${sel('level', [['none', 'なし'], ['caution', '注意'], ['alert', '要注意']], p.trouble.level)}</label>
      <label class="col-span-2 space-y-0.5"><span class="text-slate-500">厄介な点（読点「、」で区切る）</span><input class="inp !py-0.5" data-ce="tags" value="${esc(p.trouble.tags.join('、'))}" placeholder="例: クレームが多い、売却に至らない" /></label>
      <label class="col-span-2 space-y-0.5"><span class="text-slate-500">お客様のメモ</span><textarea class="inp !py-0.5" rows="2" data-ce="memo" placeholder="例: 資産は多いが、成約まで時間がかかる">${esc(p.memo ?? '')}</textarea></label>
      <div class="col-span-2 flex items-center gap-2"><button class="b b-pri !min-h-0 !py-1" data-custeval-save>保存</button><span class="text-[11px] text-slate-500">アポごとの評価（営業が入力）を見て登録します。初めてのアポは、そのアポの評価が、初期値として設定されます。</span></div></div></details>`;
}

export function customerModalHtml({ rid, reservations, now }) {
  const r = reservations.find((x) => x.id === rid);
  if (!r) return '';
  const phones = [r.customer.phone, r.customer.phone2].filter(Boolean);
  const d = customerDossier(phones);
  const p = d.profile;
  const user = USERS.find((u) => u.id === r.userId);
  const h = r.hearing ?? {};
  const box = (title, body) => `<section class="space-y-1 rounded-lg border bg-slate-50 p-2"><h3 class="text-xs font-bold text-slate-500">${title}</h3>${body}</section>`;
  const row = (k, v) => `<div class="flex gap-2 text-xs"><span class="w-24 shrink-0 text-slate-500">${k}</span><span class="min-w-0">${v}</span></div>`;
  // 買取の履歴: アポ（訪問）ごとに折りたたみ、1回ごとに、品目の内訳（品名・数量・金額）を全件と、その回の営業の評価・メモを出す。
  // 評価・メモは、アポごとに登録されるので、アポが複数あれば、評価・メモも複数ある。直近の5回を先に、それ以前は「さらに…」にまとめる。品目が多い回は、枠の中でスクロールする
  const evalHtml = (e) => (e ? `<div class="rounded border border-slate-200 bg-slate-50 p-1.5 text-xs"><div class="flex flex-wrap items-center gap-x-2 gap-y-0.5"><b>営業の評価</b><span class="text-slate-500">${esc(e.by)}</span><span class="text-amber-500">${stars(e.overall)}</span>
      <span>態度：${esc(e.attitude)}</span><span>再依頼：${esc(e.repeat)}</span><span>資産：${esc(e.wealth)}</span><span>売却の時期：${esc(e.timing)}</span></div>
      ${e.flags?.length ? `<div class="mt-0.5">${e.flags.map((f) => `<span class="mr-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-900">${esc(f)}</span>`).join('')}</div>` : ''}${e.memo ? `<div class="mt-0.5 text-slate-700">${esc(e.memo)}</div>` : ''}</div>` : '<div class="text-xs text-slate-400">この回の営業の評価・メモは、まだありません</div>');
  const visitHtml = (v, open) => {
    const lines = visitLines(v);
    const count = lines.reduce((n, l) => n + (l.qty ?? 1), 0);
    const e = v.eval;
    return `<details class="rounded border bg-white" ${open ? 'open' : ''}>
      <summary class="cursor-pointer px-1.5 py-1 text-xs"><div class="flex items-center gap-2"><span class="w-20 shrink-0 text-slate-500">${ymd(v.at)}</span>
        <span class="min-w-0 flex-1 truncate" title="${esc(lines.map((l) => l.name).join('、'))}">${esc(lines[0].name)}${lines.length > 1 ? `<span class="text-slate-500"> ほか${lines.length - 1}品目</span>` : ''}</span>
        ${e ? `<span class="shrink-0 text-amber-500" title="営業の評価">${stars(e.overall)}</span>` : ''}<span class="shrink-0 text-slate-500">${count}点</span><b class="shrink-0">${yenText(v.total)}</b></div>
        ${e?.memo ? `<div class="ml-[5.5rem] truncate text-[11px] text-slate-500" title="${esc(e.memo)}">${esc(String(e.by).replace(/^営業\s*/, ''))}：${esc(e.memo)}</div>` : ''}</summary>
      <div class="space-y-1 border-t px-1.5 py-1"><div class="max-h-44 overflow-y-auto"><table class="w-full text-xs"><tbody>${lines.map((l) => `<tr class="border-t first:border-t-0"><td class="py-0.5">${esc(l.name)}</td><td class="w-10 text-right text-slate-500">${(l.qty ?? 1) > 1 ? `×${l.qty}` : ''}</td><td class="w-20 text-right">${yenText(lineTotal(l))}</td></tr>`).join('')}</tbody></table></div>
        ${evalHtml(e)}</div></details>`;
  };
  const RECENT = 5;
  const itemTotal = d.visits.reduce((n, v) => n + visitLines(v).reduce((m, l) => m + (l.qty ?? 1), 0), 0);
  const visits = d.visits.length ? `<div class="text-xs text-slate-600">${d.count}回 ／ ${itemTotal}点 ／ 総額 <b>${yenText(d.total)}</b> ／ 1回の平均 ${yenText(d.average)}</div>
    <div class="space-y-1">${d.visits.slice(0, RECENT).map((v, i) => visitHtml(v, i === 0)).join('')}
      ${d.visits.length > RECENT ? `<details class="rounded border border-dashed bg-white"><summary class="cursor-pointer px-1.5 py-1 text-xs font-bold text-slate-600">さらに以前の ${d.visits.length - RECENT}回分を表示</summary><div class="max-h-64 space-y-1 overflow-y-auto p-1">${d.visits.slice(RECENT).map((v) => visitHtml(v, false)).join('')}</div></details>` : ''}</div>` : '<div class="text-xs text-slate-500">買取の実績はありません（新規のお客様）</div>';
  const calls = callHistory(phones, reservations).slice(0, 5);
  return `<div class="fixed inset-0 z-[60] flex items-center justify-center p-4"><div class="absolute inset-0 bg-black/40" data-custclose></div>
    <div data-custmodal class="relative z-10 max-h-[92vh] w-[48rem] max-w-full space-y-3 overflow-y-auto rounded-lg bg-white p-4 shadow-2xl">
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-1"><div class="text-lg font-bold">${esc(r.customer.name)} 様 <span class="text-sm font-normal text-slate-500">${esc(r.customer.kana ?? '')}</span></div>
          <div class="flex flex-wrap items-center gap-1.5">${custRankBadge(p)}${troubleBadge(p)}${cooloffBadge(p)}${h.profile ? `<span class="text-xs ${String(h.profile).includes('未確認') ? 'text-slate-400' : 'text-slate-600'}" title="受電時に聞き取った、お客様の性別・年齢（聞けずに声から推測した場合は「推測」と付きます）">性別・年齢：${esc(h.profile)}</span>` : ''}</div>
          <div class="text-xs text-slate-600">${esc(r.customer.address)} ／ ${esc(phones.join(' ／ '))}</div></div>
        <button class="b b-sec !min-h-0 !py-1" data-custclose title="閉じる（Esc）">✕ 閉じる</button></div>
      ${box('お客様の評価（お客様情報に紐づく。アポごとの評価とは別）', `${customerProfileHtml(p)}${customerEvalEditor(p, r.customer.phone || r.customer.phone2)}`)}
      <section class="space-y-1 rounded-lg border-2 ${d.declined.length ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-slate-50'} p-2 ${d.declined.length ? 'shadow-sm' : ''}">
        <h3 class="text-xs font-bold ${d.declined.length ? 'text-violet-900' : 'text-slate-500'}">📦 査定したが売らなかったもの（お手元に持っている可能性）${d.declined.length ? `<span class="ml-2 rounded-full bg-violet-600 px-2 py-0.5 text-[11px] text-white">${d.declined.reduce((n, i) => n + (i.qty ?? 1), 0)}点</span>` : ''}</h3>
        ${declinedCardHtml(d.declined, { empty: true })}</section>
      ${box('誰を当てるかの判断の手がかり', `${assignAdvice(p) || '<div class="text-xs text-slate-500">特に注意する点はありません</div>'}
        <div class="text-xs"><span class="text-slate-500">これまでの担当：</span>${d.staff.length ? d.staff.map((n) => `<b>${esc(n)}</b>`).join('、') : '<span class="text-slate-500">なし（新規・担当の記録なし）</span>'}</div>`)}
      ${box('過去の買取履歴（アポごとの品目と、営業の評価・メモ）', visits)}
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-3">
          ${box('今回の予約', `${row('訪問', `${dateLabel(r.date)} ${esc(r.start)}〜${esc(r.end)}　${statusBadge(r)}`)}${row('担当', `${isTentative(r) ? '（仮）' : ''}${esc(user?.name ?? '')}`)}${row('売りたいもの', esc(h.wants ?? ''))}
            ${row('きっかけ', esc(h.trigger ?? ''))}${row('立会い・同席', `${esc(h.attendee ?? '')} ／ ${esc(h.companion ?? '')}`)}${row('駐車・表札', `${esc(h.parking ?? '')} ／ ${esc(h.nameplate ?? '')}`)}${row('大型品', esc(h.large ?? ''))}${row('前日連絡', esc(h.contact ?? ''))}${row('訪問時の注意', esc(h.notes ?? ''))}`)}</div>
        <div class="space-y-3">
          ${box('クーリングオフ歴', p.cooloff.length ? p.cooloff.map((c) => `<div class="text-xs text-rose-700"><b>${ymd(c.at)}</b> ${esc(c.items)}${c.memo ? `<span class="text-slate-600">　${esc(c.memo)}</span>` : ''}</div>`).join('') : '<div class="text-xs text-slate-500">なし</div>')}
          ${box('受電履歴', calls.length ? calls.map((c) => `<div class="flex gap-2 text-xs"><span class="w-24 shrink-0 text-slate-500">${ymd(c.at)}</span><span class="shrink-0 font-bold">${esc(c.kind)}</span><span class="min-w-0 truncate" title="${esc(c.note)}">${esc(c.note)}</span></div>`).join('') : '<div class="text-xs text-slate-500">履歴なし</div>')}</div></div>
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
  })).map((c) => ({ ...c, travel: dayTravel(c.blocks) }));
}

// アポとアポの間に、移動の距離と時間を出す（間隔に収まらないときは、赤で警告）
function legsHtml(legs) {
  return legs.map((l) => {
    const gapPx = Math.max(0, topOf(l.to.start) - topOf(l.from.end));
    const y = topOf(l.from.end) + gapPx / 2;
    return `<div class="pointer-events-none absolute left-1/2 z-[25] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-1.5 text-[10px] font-bold leading-4 shadow-sm ${l.tight ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-300 bg-white/95 text-slate-600'}" style="top:${y}px" title="${esc(`${l.from.label}から${l.to.label}へ ${l.km}km・約${l.min}分（アポの間隔 ${l.gap}分）${l.tight ? '　移動が間隔に収まりません' : ''}`)}">${l.tight ? '⚠ ' : '🚗 '}${l.km}km・${l.min}分</div>`;
  }).join('');
}

// お客様のランク・厄介度・クーリングオフ歴（電話番号から）
const profileOf = (c) => (c ? customerProfile([c.phone, c.phone2]) : null);

function blockHtml(b, selId, byId, att) {
  const off = att && inOffTime(att, b.start, b.end); // 休みと重なっている予定（あとから休みになった場合など）。配車係が動かして直す
  const offCls = off ? 'outline outline-2 outline-dashed outline-rose-500' : '';
  const top = topOf(b.start);
  const height = topOf(b.end) - top - 1;
  if (b.source !== 'reservation') { // 営業のスケジュールに元からある予定。確定済みの訪問と同じ見た目で出す。ドラッグすると、予約として取り込んで動かす（内部の仕組み）
    return `<div class="absolute inset-x-0.5 z-10 cursor-grab overflow-hidden rounded px-1 text-[10px] leading-[1.15] text-white ${blockCls(b)} ${offCls}" style="top:${top}px;height:${height}px" draggable="true" data-gid="${esc(b.gid)}" data-bsel="${esc(b.gid)}" data-mins="${b.end - b.start}" title="${esc(`${hhmm(b.start)}–${hhmm(b.end)} ${b.label}${b.place ? `（${b.place}）` : ''}　ドラッグで、別の営業・時間に動かせます`)}"><b>確 ${esc(b.label)}</b>${customerMarks(profileOf(b.ev?.customer))} ${hhmm(b.start)}–${hhmm(b.end)}${b.place ? `<br /><span class="opacity-90">${esc(b.place)}</span>` : ''}</div>`;
  }
  const r = byId[b.rid];
  const tent = b.status === 'tentative';
  return `<div class="absolute inset-x-0.5 z-10 cursor-grab overflow-hidden rounded px-1 text-[10px] leading-[1.15] text-white ${blockCls(b)} ${offCls} ${selId === b.rid ? 'ring-2 ring-amber-300' : ''}" style="top:${top}px;height:${height}px" draggable="true" data-rid="${b.rid}" data-bsel="${b.rid}" data-mins="${b.end - b.start}" title="${esc(`${hhmm(b.start)}–${hhmm(b.end)} ${b.label}（${r?.customer.address ?? ''}）　ドラッグで、別の営業・時間に動かせます`)}">
    <b>${off ? '⚠休み ' : ''}${blockMark(b)}${esc(b.label)}</b>${customerMarks(profileOf(r?.customer))} ${hhmm(b.start)}–${hhmm(b.end)}${r ? `<br /><span class="opacity-90">${esc(r.customer.address)}</span>` : ''}
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
      ${attTag(c.att) ? `<div>${attTag(c.att)}</div>` : ''}<div class="text-[10px] ${c.absent ? 'font-bold text-slate-600' : 'text-slate-500'}">${c.absent ? '欠勤' : `${c.mine.length}件${t ? `（仮${t}）` : ''}`}</div>${c.travel.legs.length ? `<div class="text-[10px] ${c.travel.km >= 40 ? 'font-bold text-amber-700' : 'text-slate-600'}" title="その日のアポからアポへの移動の合計（概算）">🚗 計${c.travel.km}km・約${c.travel.min}分</div>` : ''}</div>`;
  }).join('');
  const axis = `<div class="relative sticky left-0 z-30 bg-white" style="height:${h}px">${Array.from({ length: SLOTS / 2 }, (_, i) => `<span class="absolute right-1 -translate-y-1/2 text-[10px] text-slate-400" style="top:${i * 2 * BOARD_ROW}px">${WORK_START / 60 + i}:00</span>`).join('')}</div>`;
  const body = cols.map((c) => `<div class="relative border-l" data-bcol="${c.user.id}" style="height:${h}px;background-image:${c.absent ? 'repeating-linear-gradient(135deg,#e2e8f0 0,#e2e8f0 6px,#f1f5f9 6px,#f1f5f9 12px)' : `repeating-linear-gradient(to bottom,transparent 0,transparent ${BOARD_ROW - 1}px,#e2e8f0 ${BOARD_ROW - 1}px,#e2e8f0 ${BOARD_ROW}px)`}">
    ${c.blocks.map((b) => blockHtml(b, selId, byId, c.att)).join('')}${legsHtml(c.travel.legs)}${attShade(c.att, BOARD_ROW)}
    ${c.absent ? '<div class="pointer-events-none absolute inset-x-0 top-2 z-20 text-center"><span class="rounded bg-slate-600 px-2 py-0.5 text-xs font-bold text-white">欠勤</span></div>' : ''}</div>`).join('');
  return `<div class="overflow-x-auto"><div class="grid" style="${grid}"><div class="border-b sticky left-0 z-30 bg-white"></div>${head}${axis}${body}</div></div>`;
}

// 選んだ予約の詳細と操作（確定・仮に戻す・詳細変更・取消）。前後のアポからの距離も出す
// 一度確定したが、仮確定に戻された予約の、経緯と変更内容（カレンダーの帯を選んだときの詳細に出す）
function revertedHtml(r) {
  if (!isReverted(r)) return '';
  const diffs = diffText(r);
  const cause = r.holdNote && !needsReview(r) && !(r.changes ?? []).some((c) => c.wasConfirmed && !c.byDispatcher) ? `配車係が仮に戻しました${r.holdNote ? `（${esc(r.holdNote)}）` : ''}` : 'オペレーターの変更で、確定から仮確定に戻りました';
  return `<div class="mt-1 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-xs">
    <div class="font-bold text-amber-800">⟲ 一度確定したが、仮確定に戻っています${r.revertedAt ? `<span class="ml-2 font-normal text-slate-500">${esc(r.revertedAt)}</span>` : ''}</div>
    <div class="text-slate-700">${cause}</div>
    ${diffs ? `<div class="mt-0.5 text-rose-700"><b>変更内容</b>　${diffs}</div>` : ''}
    ${needsReview(r) ? `<button class="mt-1 b b-sec !min-h-0 !py-0.5 text-xs" data-ack="${r.id}" title="内容を確認した（仮確定のまま残ります）">確認した</button>` : ''}</div>`;
}

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
      ${r.customer.phone ? customerProfileHtml(profileOf(r.customer), { advice: true }) : ''}
      <div><button class="text-xs font-bold text-fuchsia-700 underline" data-custinfo="${r.id}">👤 お客様の詳細（買取履歴・評価・これまでの担当）</button></div>
      <div class="flex items-center gap-1 text-xs">担当${isTentative(r) ? '（仮）' : ''}：${user ? avatarHtml(user, 20) : ''}<b>${esc(user?.name ?? '')}</b> ${rankBadge(rankOfUser(r.userId))}</div>
      ${travel ? `<div class="text-[11px] leading-tight text-slate-600">${legHtml(travel.prev, 'prev')}${travel.next ? `<br />${legHtml(travel.next, 'next')}` : ''}</div>` : ''}
      ${revertedHtml(r)}</div>
    <div class="flex flex-col items-end gap-1">${isTentative(r) ? `<button class="b b-pri !min-h-0 !py-1" data-fix="${r.id}">確定</button>` : `<button class="b b-sec !min-h-0 !py-1" data-unfix="${r.id}">仮に戻す</button>`}
      <div class="flex gap-3 text-xs"><button class="underline text-sky-700" data-chg="${r.id}">詳細を変更</button><button class="underline text-rose-700" data-cancelres="${r.id}">取消</button></div></div></div>`;
}

export function dispatcherHtml({ date, reservations, now, chips, area = 'osaka', selId = null }) {
  const rows = reservations.filter((r) => r.date === date);
  const tent = rows.filter(isTentative).length;
  return `
  <div class="p-4 space-y-3 h-[calc(100vh-52px)] overflow-y-auto">
    <section class="bg-white rounded-lg shadow">
      <div class="p-3 flex items-center gap-2 flex-wrap"><b class="mr-2">配車確定（配車係）</b>
        ${chips.map((c) => `<button class="chip ${c.date === date ? 'on' : ''}" data-ddate="${c.date}">${esc(c.label)}　${dateLabel(c.date)}${c.tentative ? `<span class="ml-1 rounded-full bg-amber-300 px-1.5 text-[11px] text-amber-950">仮${c.tentative}</span>` : ''}${c.review ? `<span class="ml-1 rounded-full bg-rose-600 px-1.5 text-[11px] text-white">変更${c.review}</span>` : ''}</button>`).join('')}
        <input class="inp !w-auto" type="date" value="${date}" data-ddate-input />
        <button class="b b-pri ml-auto" data-fixall ${tent ? '' : 'disabled'}>この日の仮確定 ${tent}件を、すべて確定</button></div>
      <p class="px-3 pb-2 text-xs text-slate-500">オペレーターが仮確定した訪問を、1日分を見ながら調整して確定します。確定した訪問だけが、営業のタブレットの予定に出ます（主に翌々日の予定を、毎日確定します）。</p>
      <div class="border-t px-3 py-1.5 flex flex-wrap items-center gap-2"><span class="text-xs font-bold text-slate-500">エリア</span>
        ${[...AREAS.map((a) => [a.id, a.name]), ['all', '全エリア']].map(([k, t]) => { const n = rows.filter((r) => !isCancelled(r) && (k === 'all' || r.areaId === k)).length; return `<button class="chip ${area === k ? 'on' : ''}" data-barea="${k}">${esc(t)}${n ? `<span class="ml-1 rounded-full bg-indigo-500 px-1.5 text-[11px] text-white">${n}</span>` : ''}</button>`; }).join('')}
        <span class="ml-2">${legendHtml({ want: false })}</span><span class="text-[11px] text-slate-500">帯は、どれもドラッグで動かせます</span></div>
      <div class="px-3 pb-2">${boardHtml({ date, reservations, now, area, selId })}</div>
      <div class="border-t">${boardDetailHtml(reservations.find((r) => r.id === selId), reservations, now)}</div>
    </section>
  </div>`;
}
