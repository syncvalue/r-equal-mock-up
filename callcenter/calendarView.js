// 訪問カレンダー（オペレーター向け）。エリアごとに、縦=時間・横=日付の週の表（訪問が集中している時間は濃く、空いている時間は薄く）。
// 日を選ぶと、その日だけを、営業ごとの列で出す。日別では、訪問を選んで、前日確認の連絡を記録する。
import { esc } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { AREAS, WORK_START, WORK_END, SLOT_STEP } from '../src/dispatch.js';
import { CALL_RESULTS, confirmStatus, confirmDateOf, confirmPending } from '../src/confirmCall.js';
import { slotStarts, weekHeat, dayColumns, heatStyle, areaStaffOver } from '../src/visitCalendar.js';
import { minToHHMM } from '../src/reservations.js';
import { dateLabel, statusBadge, attTag, attShade, blockCls, blockMark } from './view.js';
import { avatarHtml } from './avatar.js';

const STATUS_CLS = { none: 'bg-slate-200 text-slate-700', noanswer: 'bg-amber-400 text-slate-900', reached: 'bg-emerald-600 text-white' };
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const stamp = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const parts = (date) => { const [y, m, d] = date.split('-').map(Number); return { m, d, w: new Date(y, m - 1, d).getDay() }; };
const shift = (date, n) => { const { m, d } = parts(date); const y = Number(date.slice(0, 4)); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const headCls = (w) => (w === 0 ? 'text-rose-600' : w === 6 ? 'text-sky-600' : '');
const DAY_ROW = 28; // 30分あたりの高さ（px）
const topOf = (m) => ((m - WORK_START) / SLOT_STEP) * DAY_ROW;
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

export const statusChip = (r) => { const s = confirmStatus(r); return `<span class="rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_CLS[s.key]}">${s.label}</span>`; };
const miniMark = (r) => ({ none: '・未連絡', noanswer: '△不通', reached: '✔連絡済み' })[confirmStatus(r).key];
// 日別の帯の色: 連絡済みは緑、不通は橙。未連絡は、訪問の色（確定＝濃い青・仮確定＝薄い青）のまま
const callCls = (b, r) => ({ reached: 'bg-emerald-600', noanswer: 'bg-amber-500 !text-slate-900' })[confirmStatus(r ?? {}).key] ?? blockCls(b);

// 上の操作（エリア・週／日の移動）
function barHtml({ areaId, mode, weekStart, date, staff = [], staffSel = [], staffOpen = false }) {
  const areas = AREAS.map((a) => `<button class="chip ${a.id === areaId ? 'on' : ''}" data-calarea="${a.id}">${esc(a.name)}</button>`).join('');
  const nav = mode === 'week'
    ? `<button class="b b-sec !min-h-0 !py-1" data-calshift="-7" title="前の週">◀</button><b class="text-sm">${dateLabel(weekStart)}〜${dateLabel(shift(weekStart, 6))}</b><button class="b b-sec !min-h-0 !py-1" data-calshift="7" title="次の週">▶</button>`
    : `<button class="b b-sec !min-h-0 !py-1" data-calshift="-1" title="前の日">◀</button><b class="text-sm">${dateLabel(date)}</b><button class="b b-sec !min-h-0 !py-1" data-calshift="1" title="次の日">▶</button><button class="b b-sec !min-h-0 !py-1 text-xs" data-calweek>週の表に戻る</button>`;
  return `<div class="flex flex-wrap items-center gap-2"><span class="flex flex-wrap items-center gap-1"><span class="text-xs font-bold text-slate-500">エリア</span>${areas}</span>
    <span class="flex items-center gap-2">${nav}<button class="b b-sec !min-h-0 !py-1 text-xs" data-caltoday>今日</button></span></div>
    <div><div class="flex flex-wrap items-center gap-2"><button class="chip ${staffSel.length ? 'on' : ''}" data-calstaffpanel>👥 営業を絞る ${staffOpen ? '▲' : '▼'}</button>
      <span class="text-xs ${staffSel.length ? 'font-bold text-teal-800' : 'text-slate-500'}">${staffSel.length ? `絞り込み中（${staffSel.length}名）：${staff.filter((u) => staffSel.includes(u.id)).map((u) => esc(u.name)).join('・')}` : `全員（${staff.length}名）を表示`}</span>
      ${staffSel.length ? '<button class="text-xs underline text-slate-500" data-calstaffclear>解除</button>' : ''}</div>
      ${staffOpen ? `<div class="mt-1 flex flex-wrap gap-1 rounded-lg border bg-white p-1.5">${staff.map((u) => `<button class="chip ${staffSel.includes(u.id) ? 'on' : ''}" data-calstaff="${u.id}">${esc(u.name)}</button>`).join('')}</div>` : ''}</div>`;
}

const legendHtml = () => `<span class="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">濃さ（訪問が入っている営業の割合）
  <span class="inline-flex items-center gap-0.5">薄い（空き）${[0, 0.25, 0.5, 0.75, 1].map((r) => `<i class="inline-block h-3 w-5 rounded-sm" style="background:${heatStyle(r).bg}"></i>`).join('')}濃い（埋まっている）</span>
  <span>枠の中＝その時間の訪問（お客様のお名前と、住所の先頭10文字）</span></span>`;

// 週の表: 縦=時間、横=日付。セルは、訪問が入っている営業の人数。日付や枠を押すと、その日だけ（営業ごとの列）
function weekHtml({ areaId, weekStart, reservations, today, now, staffSel = [] }) {
  const dates = Array.from({ length: 7 }, (_, i) => shift(weekStart, i));
  const heat = weekHeat({ areaId, dates, reservations, now, userIds: staffSel });
  const inArea = reservations.filter((r) => r.areaId === areaId && (!staffSel.length || staffSel.includes(r.userId)));
  const pending = confirmPending(inArea, today);
  const head = heat.map((d) => { const p = parts(d.date); const n = pending.filter((r) => r.date === d.date).length;
    return `<th class="px-0.5 py-0.5 text-center text-xs font-bold leading-tight ${headCls(p.w)} ${d.date === today ? 'bg-teal-100' : ''}"><button class="w-full rounded hover:bg-slate-100" data-calday="${d.date}" title="この日だけを、営業ごとに見る">${p.m}/${p.d}<br /><span class="text-[10px]">${WEEK[p.w]}${d.total ? '' : '（営業なし）'}</span></button>${n ? `<div class="text-[10px] font-bold text-rose-600" title="今日、前日確認の連絡をする訪問（まだつながっていない）">前日確認 未${n}</div>` : ''}</th>`; }).join('');
  const rows = slotStarts().map((start, i) => `<tr><th class="pr-1 text-right text-[11px] font-normal text-slate-500 whitespace-nowrap">${minToHHMM(start)}</th>${heat.map((d) => {
    const s = d.slots[i]; const h = heatStyle(s.ratio);
    const lines = s.visits.map((v) => `<span class="block truncate text-left text-[11px] leading-tight"><b>${esc(v.name)}</b> ${esc(Array.from(v.place).slice(0, 10).join(''))}</span>`).join('');
    return `<td class="p-0.5 align-top"><button class="block min-h-7 w-full space-y-0.5 rounded px-1 py-0.5 ${h.fg} hover:ring-2 hover:ring-teal-600" style="background:${h.bg}" data-calday="${d.date}" title="${esc(`${dateLabel(d.date)} ${minToHHMM(start)}〜　訪問中 ${s.busy}名／働く営業 ${s.total}名（空き ${s.total - s.busy}名）${s.visits.map((v) => `\n${v.name}　${v.place}`).join('')}`)}">${lines}</button></td>`;
  }).join('')}</tr>`).join('');
  return `<div class="rounded-lg border bg-white p-2"><div class="overflow-x-auto"><table class="w-full table-fixed border-separate border-spacing-0" style="min-width:${3.2 + 7 * 11}rem"><colgroup><col style="width:3.2rem" />${heat.map(() => '<col />').join('')}</colgroup>
    <thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div><div class="mt-1">${legendHtml()}</div></div>`;
}

// 日別の表: 縦=時間、横=営業。訪問の帯を押すと、右の一覧でその訪問が開く
function dayGridHtml({ cols, date, calSel }) {
  const h = ((WORK_END - WORK_START) / SLOT_STEP) * DAY_ROW;
  const grid = `grid-template-columns:2.5rem repeat(${cols.length},minmax(6.5rem,1fr));min-width:${2.5 + cols.length * 6.5}rem`;
  const head = cols.map((c) => `<div class="border-b px-1 py-0.5 text-center ${c.absent ? 'opacity-60' : ''}"><div>${avatarHtml(c.user, 26)}</div><b class="text-xs">${esc(c.user.name)}</b>${attTag(c.att)}${c.absent ? '<div class="text-[10px] font-bold text-slate-600">欠勤</div>' : `<div class="text-[10px] text-slate-500">${c.blocks.length}件</div>`}</div>`).join('');
  const axis = `<div class="relative sticky left-0 z-30 bg-white" style="height:${h}px">${Array.from({ length: (WORK_END - WORK_START) / 60 }, (_, i) => `<span class="absolute right-1 -translate-y-1/2 text-[10px] text-slate-400" style="top:${i * 2 * DAY_ROW}px">${WORK_START / 60 + i}:00</span>`).join('')}</div>`;
  const body = cols.map((c) => {
    const blocks = c.blocks.map((b) => {
      const sel = b.rid && b.rid === calSel;
      const inner = `<b>${blockMark(b.source === 'reservation' ? b : { source: 'reservation', status: 'confirmed' })}${esc(b.label)}</b> ${minToHHMM(b.start)}–${minToHHMM(b.end)}${b.place ? `<br /><span class="opacity-90">${esc(b.place)}</span>` : ''}`;
      const style = `top:${topOf(b.start)}px;height:${topOf(b.end) - topOf(b.start) - 1}px`;
      const r = b.rid ? c.reservationOf?.(b.rid) : null;
      return b.rid
        ? `<button class="absolute inset-x-0.5 z-10 overflow-hidden rounded px-1 text-left text-[10px] leading-[1.15] text-white ${callCls(b, r)} ${sel ? 'ring-2 ring-amber-300' : ''}" style="${style}" data-callopen="${b.rid}" title="前日確認：${confirmStatus(r ?? {}).label}（押して記録）"><span class="mr-0.5 rounded bg-white px-1 font-bold text-slate-800">${miniMark(r ?? {})}</span>${inner}</button>`
        : `<div class="absolute inset-x-0.5 z-10 overflow-hidden rounded px-1 text-[10px] leading-[1.15] text-white ${blockCls({ source: 'reservation', status: 'confirmed' })}" style="${style}" title="${esc(b.label)}">${inner}</div>`;
    }).join('');
    const away = c.absent ? '<div class="pointer-events-none absolute inset-0 z-20 flex items-start justify-center pt-2"><span class="rounded bg-slate-600 px-2 py-0.5 text-xs font-bold text-white">欠勤</span></div>' : '';
    return `<div class="relative border-l" style="height:${h}px;background-image:${c.absent ? 'repeating-linear-gradient(135deg,#e2e8f0 0,#e2e8f0 6px,#f1f5f9 6px,#f1f5f9 12px)' : `repeating-linear-gradient(to bottom,transparent 0,transparent ${DAY_ROW - 1}px,#e2e8f0 ${DAY_ROW - 1}px,#e2e8f0 ${DAY_ROW}px)`}">${blocks}${attShade(c.att, DAY_ROW)}${away}</div>`;
  }).join('');
  return `<div class="rounded-lg border bg-white p-1.5"><div class="overflow-auto"><div class="grid" style="${grid}"><div class="sticky left-0 z-30 border-b bg-white"></div>${head}${axis}${body}</div></div>
    <div class="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-600">前日確認：<span><i class="inline-block h-2.5 w-3 rounded-sm bg-emerald-600 align-middle"></i> 連絡済み</span><span><i class="inline-block h-2.5 w-3 rounded-sm bg-amber-500 align-middle"></i> 不通（つながっていない）</span><span><i class="inline-block h-2.5 w-3 rounded-sm bg-indigo-700 align-middle"></i> 未連絡（濃い青＝確定、薄い青＝仮確定）</span></div></div>`;
}

// 連絡の記録（これまでの履歴と、新しく記録する入力）
function callPanelHtml(r, draft) {
  const calls = r.confirmCalls ?? [];
  const history = calls.length
    ? calls.map((c) => `<li class="flex flex-wrap gap-x-2"><span class="text-slate-500">${stamp(c.at)}</span><b class="${c.result === 'reached' ? 'text-emerald-700' : 'text-amber-700'}">${CALL_RESULTS[c.result]}</b><span class="text-slate-500">（${esc(c.by)}）</span>${c.memo ? `<span class="w-full whitespace-pre-wrap rounded bg-slate-50 px-2 py-1">${esc(c.memo)}</span>` : ''}</li>`).join('')
    : '<li class="text-slate-500">まだ連絡していません</li>';
  return `<div class="mt-2 space-y-2 rounded border border-teal-300 bg-teal-50/50 p-2 text-xs">
    <div><div class="mb-0.5 font-bold text-slate-600">これまでの連絡</div><ul class="space-y-1">${history}</ul></div>
    <div class="space-y-1"><div class="font-bold text-slate-600">連絡の結果を記録</div>
      <div class="flex gap-1">${Object.entries(CALL_RESULTS).map(([k, v]) => `<button class="chip ${draft.result === k ? 'on' : ''}" data-callresult="${k}">${v}</button>`).join('')}</div>
      <textarea class="inp" rows="3" data-callmemo placeholder="お客様から告げられたこと（時間の変更・同席者・駐車場・キャンセルの意向など）">${esc(draft.memo)}</textarea>
      <div class="flex flex-wrap items-center gap-2"><button class="b b-pri" data-callsave="${r.id}">記録する</button>
        <button class="b b-sec" data-chg="${r.id}" title="お客様から、日時の変更・取消を告げられたとき">受付を変更・取消する</button>
        ${helpIcon('つながらなかったときも「つながらなかった」を記録します（再連絡のたびに足せます）。日時の変更・取消を告げられたら、メモに残したうえで、「受付を変更・取消する」で受付を直します。')}</div></div></div>`;
}

// 右の一覧: その日の、このエリアの訪問（受付）。ひとりずつ前日確認を記録する
function dayListHtml({ areaId, date, reservations, today, calSel, draft, staffSel = [] }) {
  const list = reservations.filter((r) => r.areaId === areaId && r.status !== 'cancelled' && r.date === date && (!staffSel.length || staffSel.includes(r.userId))).sort((a, b) => toMin(a.start) - toMin(b.start));
  const due = confirmDateOf(date) === today;
  const row = (r) => `<div class="rounded-lg border p-2 ${confirmStatus(r).key === 'reached' ? 'border-emerald-400 bg-emerald-50' : 'bg-white'} ${calSel === r.id ? 'border-teal-600 ring-2 ring-teal-200' : ''}">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1"><b>${esc(r.start)}〜${esc(r.end)}</b><b>${esc(r.customer.name)} 様</b>${statusBadge(r)}${statusChip(r)}
      <button class="b b-sec ml-auto !min-h-0 !py-1 text-xs" data-callopen="${r.id}">${calSel === r.id ? '閉じる' : '前日確認を記録'}</button></div>
    <div class="mt-1 text-xs text-slate-600">${esc(r.customer.address)} ／ ${esc([r.customer.phone, r.customer.phone2].filter(Boolean).join(' ／ '))}</div>
    <div class="mt-0.5 text-xs text-slate-600">前日確認の連絡時間 <b>${esc(r.hearing?.contact ?? '未確認')}</b></div>
    ${calSel === r.id ? callPanelHtml(r, draft) : ''}</div>`;
  return `<div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2"><b>${dateLabel(date)}の受付 ${list.length}件</b>
      ${due ? '<span class="rounded bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">今日、前日確認の連絡をする日</span>' : `<span class="text-xs text-slate-500">前日確認の日は ${dateLabel(confirmDateOf(date))}</span>`}
      ${helpIcon('訪問の前日に、オペレーターが、お客様へ1人ずつ電話で確認します。連絡したか・つながらなかったか・お客様から告げられたことを、訪問ごとに記録します。')}</div>
    ${list.length ? list.map(row).join('') : '<div class="rounded-lg bg-slate-100 py-8 text-center text-sm text-slate-500">この日の受付した訪問はありません</div>'}</div>`;
}

export function calendarHtml(x0) {
  const { areaId, mode, reservations, now = new Date() } = x0;
  const span = mode === 'week' ? Array.from({ length: 7 }, (_, i) => shift(x0.weekStart, i)) : [x0.date];
  const x = { ...x0, staff: areaStaffOver(areaId, span, reservations, now) };
  const body = mode === 'week'
    ? `<div class="min-h-0 flex-1 overflow-y-auto">${weekHtml({ ...x, now })}</div>`
    : `<div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] gap-3"><div class="min-h-0 overflow-y-auto">${dayGridHtml({ cols: dayColumns({ areaId, date: x.date, reservations, now, userIds: x.staffSel ?? [] }).map((c) => ({ ...c, reservationOf: (id) => reservations.find((r) => r.id === id) })), date: x.date, calSel: x.calSel })}</div>
      <div class="min-h-0 overflow-y-auto pr-1">${dayListHtml(x)}</div></div>`;
  return `<div class="flex h-[calc(100vh-52px)] flex-col gap-2 p-3">${barHtml(x)}${body}</div>`;
}
