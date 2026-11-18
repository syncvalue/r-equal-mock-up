// 訪問カレンダー（オペレーター向け）。エリアごとに、縦=時間・横=日付の週の表（訪問が集中している時間は濃く、空いている時間は薄く）。
// 日を選ぶと、その日だけを、鑑定士ごとの列で出す。日別では、訪問を選んで、前日確認の連絡を記録する。
import { esc } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { AREAS, WORK_START, WORK_END, SLOT_STEP } from '../src/dispatch.js';
import { CALL_RESULTS, confirmStatus, confirmDateOf, confirmPending, sortByContactTime, notYetReached } from '../src/confirmCall.js';
import { slotStarts, weekHeat, dayColumns, heatStyle, areaStaffOver } from '../src/visitCalendar.js';
import { minToHHMM } from '../src/reservations.js';
import { dateLabel, statusBadge, attShade, blockCls, blockMark } from './view.js';
import { avatarHtml } from './avatar.js';
import { USERS } from '../src/dashboard.js';
import { staffColor, visitBlockStyle } from '../src/staffColor.js';

const STATUS_CLS = { none: 'bg-slate-200 text-slate-700', noanswer: 'bg-amber-400 text-slate-900', reached: 'bg-teal-600 text-white' };
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const stamp = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const parts = (date) => { const [y, m, d] = date.split('-').map(Number); return { m, d, w: new Date(y, m - 1, d).getDay() }; };
const shift = (date, n) => { const { m, d } = parts(date); const y = Number(date.slice(0, 4)); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const headCls = (w) => (w === 0 ? 'text-rose-700' : w === 6 ? 'text-slate-700' : '');
const DAY_ROW = 28; // 30分あたりの高さ（px）
const topOf = (m) => ((m - WORK_START) / SLOT_STEP) * DAY_ROW;
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

export const statusChip = (r) => { const s = confirmStatus(r); return `<span class="rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_CLS[s.key]}">${s.label}</span>`; };
// 帯の中に出す状態の文字は「不通」だけ（連絡済み／まだは、実線／点線で分かる。未連絡と不通は、線では同じ扱い）
const failMark = (r) => (confirmStatus(r ?? {}).key === 'noanswer' ? '<span class="mr-0.5 rounded bg-white px-1 font-bold text-slate-900">不通</span>' : '');
// 訪問の帯の見た目: 鑑定士ごとの色。前日確認が済んでいれば塗りつぶし、まだ（未連絡・不通）なら点線の枠
// 実線＝前日確認が終わった（連絡済み、または不通のまま終了）／点線＝まだ
const callDone = (r) => { const st = confirmStatus(r ?? {}); return st.key === 'reached' || st.closed; };
const callLook = (userId, r) => visitBlockStyle(userId, callDone(r));
const staffDot = (id) => `<i class="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style="background:${staffColor(id).solid}"></i>`;

// 上の操作（エリア・週／日の移動）
function barHtml({ areaId, mode, weekStart, date, staff = [], staffSel = [], staffOpen = false }) {
  const areas = AREAS.map((a) => `<button class="chip ${a.id === areaId ? 'on' : ''}" data-calarea="${a.id}">${esc(a.name)}</button>`).join('');
  const nav = mode === 'week'
    ? `<button class="b b-sec !min-h-0 !py-1" data-calshift="-7" title="前の週">◀</button><b class="text-sm">${dateLabel(weekStart)}〜${dateLabel(shift(weekStart, 6))}</b><button class="b b-sec !min-h-0 !py-1" data-calshift="7" title="次の週">▶</button>`
    : `<button class="b b-sec !min-h-0 !py-1" data-calshift="-1" title="前の日">◀</button><b class="text-sm">${dateLabel(date)}</b><button class="b b-sec !min-h-0 !py-1" data-calshift="1" title="次の日">▶</button><button class="b b-sec !min-h-0 !py-1 text-xs" data-calweek>週の表に戻る</button>`;
  return `<div class="flex flex-wrap items-center gap-2"><span class="flex flex-wrap items-center gap-1"><span class="text-xs font-bold text-slate-500">エリア</span>${areas}</span>
    <span class="flex items-center gap-2">${nav}<button class="b b-sec !min-h-0 !py-1 text-xs" data-caltoday>今日</button></span></div>
    <div><div class="flex flex-wrap items-center gap-2"><button class="chip ${staffSel.length ? 'on' : ''}" data-calstaffpanel>鑑定士を絞る ${staffOpen ? '▲' : '▼'}</button>
      <span class="text-xs ${staffSel.length ? 'font-bold text-teal-700' : 'text-slate-500'}">${staffSel.length ? `絞り込み中（${staffSel.length}名）：${staff.filter((u) => staffSel.includes(u.id)).map((u) => esc(u.name)).join('・')}` : `全員（${staff.length}名）を表示`}</span>
      ${staffSel.length ? '<button class="text-xs underline text-slate-500" data-calstaffclear>解除</button>' : ''}</div>
      <div class="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-700">${staff.filter((u) => !staffSel.length || staffSel.includes(u.id)).map((u) => `<span>${staffDot(u.id)}${esc(u.name)}</span>`).join('')}</div>
      ${staffOpen ? `<div class="mt-1 flex flex-wrap gap-1 rounded-lg border bg-white p-1.5">${staff.map((u) => `<button class="chip ${staffSel.includes(u.id) ? 'on' : ''}" data-calstaff="${u.id}">${staffDot(u.id)}${esc(u.name)}</button>`).join('')}</div>` : ''}</div>`;
}

// 前日確認の凡例（帯の色は、鑑定士ごと）
const callLegendHtml = () => `<div class="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-700">前日確認：<span><i class="inline-block h-2.5 w-4 rounded-sm bg-slate-600 align-middle"></i> 終わった（塗りつぶし。連絡済み・不通のまま終了）</span><span><i class="inline-block h-2.5 w-4 rounded-sm border-2 border-dashed border-slate-600 bg-slate-100 align-middle"></i> まだ（点線。未連絡・不通）</span><span class="text-slate-500">色＝鑑定士</span></div>`;
const legendHtml = () => `<span class="flex flex-wrap items-center gap-2 text-[11px] text-slate-700">濃さ（訪問が入っている鑑定士の割合）
  <span class="inline-flex items-center gap-0.5">薄い（空き）${[0, 0.25, 0.5, 0.75, 1].map((r) => `<i class="inline-block h-3 w-5 rounded-sm" style="background:${heatStyle(r).bg}"></i>`).join('')}濃い（埋まっている）</span>
</span>`;

// 週の表（Googleカレンダー風）: 縦=時間、横=日付。訪問は、開始から終了までの1つのブロック。同じ時間にかぶる訪問は、日の列の中で横に並べる。
// 背景は、訪問が入っている鑑定士の割合に応じた濃さ（集中は濃く、空きは薄く）。ブロックや枠を押すと、その日だけ（鑑定士ごとの列）
const WEEK_ROW = 36; // 30分あたりの高さ（px）
const weekTop = (m) => ((m - WORK_START) / SLOT_STEP) * WEEK_ROW;

function weekHtml({ areaId, weekStart, reservations, today, now, staffSel = [], calSel = null, draft }) {
  const dates = Array.from({ length: 7 }, (_, i) => shift(weekStart, i));
  const heat = weekHeat({ areaId, dates, reservations, now, userIds: staffSel });
  const inArea = reservations.filter((r) => r.areaId === areaId && (!staffSel.length || staffSel.includes(r.userId)));
  const pending = confirmPending(inArea, today);
  const h = ((WORK_END - WORK_START) / SLOT_STEP) * WEEK_ROW;
  const grid = `grid-template-columns:3rem repeat(7,minmax(9rem,1fr));min-width:${3 + 7 * 9}rem`;
  const head = heat.map((d) => { const p = parts(d.date); const n = pending.filter((r) => r.date === d.date).length;
    return `<div class="border-b px-0.5 py-0.5 text-center text-xs font-bold leading-tight ${headCls(p.w)} ${d.date === today ? 'bg-teal-100' : ''}"><button class="w-full rounded hover:bg-slate-100" data-calday="${d.date}" title="この日だけを、鑑定士ごとに見る">${p.m}/${p.d}<br /><span class="text-[10px]">${WEEK[p.w]}${d.total ? '' : '（鑑定士なし）'}</span></button>${n ? `<div class="text-[10px] font-bold text-rose-700" title="今日、前日確認の連絡をする訪問（まだつながっていない）">前日確認 未${n}</div>` : ''}</div>`; }).join('');
  const axis = `<div class="relative sticky left-0 z-30 bg-white" style="height:${h}px">${slotStarts().map((m, i) => `<span class="absolute right-1 text-[10px] text-slate-400" style="top:${i * WEEK_ROW + 1}px">${minToHHMM(m)}</span>`).join('')}</div>`;
  const body = heat.map((d) => {
    const bg = d.slots.map((s, i) => `<div class="absolute inset-x-0" style="top:${i * WEEK_ROW}px;height:${WEEK_ROW - 1}px;background:${heatStyle(s.ratio).bg}" title="${esc(`${dateLabel(d.date)} ${minToHHMM(s.start)}〜　訪問中 ${s.busy}名／働く鑑定士 ${s.total}名（空き ${s.total - s.busy}名）`)}"></div>`).join('');
    const blocks = d.blocks.map((b) => {
      const r = b.rid ? reservations.find((x) => x.id === b.rid) : null;
      const w = 100 / b.cols;
      const style = `top:${weekTop(b.start)}px;height:${weekTop(b.end) - weekTop(b.start) - 1}px;left:calc(${b.col * w}% + 1px);width:calc(${w}% - 2px)`;
      const tip = `${minToHHMM(b.start)}–${minToHHMM(b.end)} ${b.name} 様　${b.place}　担当：${USERS.find((u) => u.id === b.userId)?.name ?? ''}　前日確認：${confirmStatus(r ?? {}).label}（押すと、右に詳細）`;
      const sel = blockKey(b) === calSel;
      const look = callLook(b.userId, r);
      return `<button class="absolute z-10 overflow-hidden rounded px-1 py-0.5 text-left text-[10px] leading-tight ${look.cls} ${sel ? 'z-20 ring-2 ring-amber-300' : ''}" style="${style};${look.css}" data-calblock="${esc(blockKey(b))}" data-caluser="${b.userId}" data-caldate="${d.date}" title="${esc(tip)}"><b class="block truncate">${failMark(r)}${esc(b.name)}</b><span class="block truncate opacity-95">${esc(Array.from(b.place).slice(0, 10).join(''))}</span></button>`;
    }).join('');
    return `<div class="relative border-l" style="height:${h}px">${bg}${blocks}</div>`;
  }).join('');
  const picked = calSel ? heat.flatMap((d) => d.blocks.map((b) => ({ ...b, date: d.date }))).find((b) => blockKey(b) === calSel) : null;
  return `<div class="flex h-full min-h-0 gap-3"><div class="min-h-0 min-w-0 flex-1 overflow-y-auto"><div class="rounded-lg border bg-white p-1.5"><div class="overflow-auto"><div class="grid" style="${grid}"><div class="sticky left-0 z-30 border-b bg-white"></div>${head}${axis}${body}</div></div>
    <div class="mt-1 space-y-0.5">${legendHtml()}${callLegendHtml()}</div></div></div>
    ${picked ? `<div class="min-h-0 w-[min(26rem,40%)] shrink-0 overflow-y-auto pr-1">${visitDetailHtml(picked, reservations.find((r) => r.id === picked.rid), draft)}</div>` : ''}</div>`;
}

// 週の表で押した訪問の詳細（画面の右側）。受付した訪問は、前日確認の記録もここでできる
const blockKey = (b) => b.rid ?? b.gid ?? `${b.userId}/${b.start}`;
// 受付の操作（日時の変更・取消）。前日確認の記録とは別なので、詳細の上のほうに置く
const chgButton = (r) => `<button class="b b-sec !min-h-0 !py-1 text-xs" data-chg="${r.id}" title="お客様から、日時の変更・取消を告げられたとき">受付を変更・取消する</button>`;
// 受付に登録した内容を、すべて出す（週の表の右の詳細も、日別の右の一覧も、同じ項目）。受付の記録がない予定は、日時・住所・担当鑑定士だけ
function visitFieldsHtml(b, r) {
  const staff = USERS.find((u) => u.id === b.userId)?.name ?? '未定';
  const row = (k, v) => (v ? `<div class="flex gap-2"><dt class="w-24 shrink-0 text-slate-500">${k}</dt><dd class="min-w-0 break-words whitespace-pre-wrap">${esc(v)}</dd></div>` : '');
  const h = r?.hearing ?? {};
  const c = r?.customer ?? {};
  const rows = [
    row('日時', `${dateLabel(b.date)} ${minToHHMM(b.start)}〜${minToHHMM(b.end)}`), row('フリガナ', c.kana), row('性別・年齢', h.profile),
    row('郵便番号', c.zip), row('住所', c.address ?? b.place), row('電話番号', [c.phone, c.phone2].filter(Boolean).join(' ／ ')),
    row('担当鑑定士', staff), row('受付番号', r?.receptionNo), row('受付日時', r ? [r.receivedAt, r.operator && r.operator !== '—' ? `（${r.operator}）` : ''].filter(Boolean).join(' ') : ''), row('新規・再訪', r?.apType === '再' ? '再訪' : r?.apType === '新' ? '新規' : ''),
    row('問い合わせ', [h.inquiryType, h.adType].filter(Boolean).join(' ／ ')), row('来電のきっかけ', h.trigger ?? r?.chirashi),
    row('売りたいもの', h.wants), row('大型品・その他', h.large), row('当日の立会い', h.attendee), row('ご同席者', h.companion), row('駐車スペース', h.parking), row('表札', h.nameplate), row('前日確認の連絡時間', h.contact), row('訪問時の注意', h.notes),
  ].join('');
  return `<dl class="space-y-1 text-xs">${rows}</dl>`;
}

// 押した訪問の詳細。週の表では画面の右側、日別では右の一覧の中で開く
function visitDetailHtml(b, r, draft, { anchor = false } = {}) {
  return `<div ${anchor && r ? `data-calrow="${r.id}" ` : ''}class="space-y-2 rounded-lg border-2 border-teal-600 bg-white p-3 text-sm">
    <div class="flex items-start gap-2"><div class="flex min-w-0 flex-1 flex-wrap items-center gap-2"><b class="text-base">${esc(b.name)} 様</b>${r ? `${statusBadge(r)}${statusChip(r)}` : ''}</div>
      ${anchor ? '<button class="b b-sec shrink-0 !min-h-0 !py-1 text-xs" data-calblockclose aria-expanded="true" title="詳細を閉じる">▲ 閉じる</button>' : '<button class="shrink-0 text-lg leading-none text-slate-500 hover:text-slate-900" data-calblockclose title="閉じる" aria-label="詳細を閉じる">✕</button>'}</div>

    ${r ? chgButton(r) : ''}
    ${visitFieldsHtml(b, r)}
    ${r ? `<div><div class="mt-1 text-xs font-bold text-teal-700">前日確認</div>${callPanelHtml(r, draft)}</div>` : '<div class="rounded bg-slate-50 px-2 py-1 text-xs text-slate-500">この予定には、受付の記録がありません</div>'}</div>`;
}

// 日別の表: 縦=時間、横=鑑定士。訪問の帯を押すと、右の一覧でその訪問が開く
function dayGridHtml({ cols, date, calSel }) {
  const h = ((WORK_END - WORK_START) / SLOT_STEP) * DAY_ROW;
  const grid = `grid-template-columns:2.5rem repeat(${cols.length},minmax(6.5rem,1fr));min-width:${2.5 + cols.length * 6.5}rem`;
  const head = cols.map((c) => `<div class="border-b px-1 py-0.5 text-center ${c.absent ? 'opacity-60' : ''}"><div>${avatarHtml(c.user, 26)}</div><b class="text-xs">${esc(c.user.name)}</b>${c.absent ? '<div class="text-[10px] font-bold text-slate-700">欠勤</div>' : `<div class="text-[10px] text-slate-500">${c.blocks.length}件</div>`}</div>`).join('');
  const axis = `<div class="relative sticky left-0 z-30 bg-white" style="height:${h}px">${Array.from({ length: (WORK_END - WORK_START) / 60 }, (_, i) => `<span class="absolute right-1 -translate-y-1/2 text-[10px] text-slate-400" style="top:${i * 2 * DAY_ROW}px">${WORK_START / 60 + i}:00</span>`).join('')}</div>`;
  const body = cols.map((c) => {
    const blocks = c.blocks.map((b) => {
      const sel = b.rid && b.rid === calSel;
      const inner = `<b>${blockMark(b.source === 'reservation' ? b : { source: 'reservation', status: 'confirmed' })}${esc(b.label)}</b> ${minToHHMM(b.start)}–${minToHHMM(b.end)}${b.place ? `<br /><span class="opacity-90">${esc(b.place)}</span>` : ''}`;
      const style = `top:${topOf(b.start)}px;height:${topOf(b.end) - topOf(b.start) - 1}px`;
      const r = b.rid ? c.reservationOf?.(b.rid) : null;
      return b.rid
        ? `<button class="absolute inset-x-0.5 z-10 overflow-hidden rounded px-1 text-left text-[10px] leading-[1.15] ${callLook(c.user.id, r).cls} ${sel ? 'ring-2 ring-amber-300' : ''}" style="${style};${callLook(c.user.id, r).css}" data-callopen="${b.rid}" title="前日確認：${confirmStatus(r ?? {}).label}（押して記録）">${failMark(r)}${inner}</button>`
        : `<button class="absolute inset-x-0.5 z-10 overflow-hidden rounded px-1 text-left text-[10px] leading-[1.15] ${callLook(c.user.id, null).cls}" style="${style};${callLook(c.user.id, null).css}" data-calblock="${esc(blockKey(b))}" data-caluser="${c.user.id}" data-caldate="${date}" title="${esc(b.label)}（押すと、受付として取り込んで、前日確認・変更ができる）">${inner}</button>`;
    }).join('');
    const away = c.absent ? '<div class="pointer-events-none absolute inset-0 z-20 flex items-start justify-center pt-2"><span class="rounded bg-slate-600 px-2 py-0.5 text-xs font-bold text-white">欠勤</span></div>' : '';
    return `<div class="relative border-l" style="height:${h}px;background-image:${c.absent ? 'repeating-linear-gradient(135deg,#e2e8f0 0,#e2e8f0 6px,#f1f5f9 6px,#f1f5f9 12px)' : `repeating-linear-gradient(to bottom,transparent 0,transparent ${DAY_ROW - 1}px,#e2e8f0 ${DAY_ROW - 1}px,#e2e8f0 ${DAY_ROW}px)`}">${blocks}${attShade(c.att, DAY_ROW)}${away}</div>`;
  }).join('');
  return `<div class="rounded-lg border bg-white p-1.5"><div class="overflow-auto"><div class="grid" style="${grid}"><div class="sticky left-0 z-30 border-b bg-white"></div>${head}${axis}${body}</div></div>
    <div class="mt-1">${callLegendHtml()}</div></div>`;
}

// 何回かけてもつながらないとき、不通のまま、前日確認を終える（不通の記録が1回以上あるとき）
function closeHtml(r) {
  const st = confirmStatus(r);
  if (st.key !== 'noanswer') return '';
  if (st.closed) return `<span class="rounded bg-amber-100 px-2 py-1 font-bold text-amber-900">不通のまま終了（${esc(r.confirmClosed.by)}・${stamp(r.confirmClosed.at)}）</span>`;
  return `<button class="b b-sec" data-callclose="${r.id}" title="何回かけてもつながらないとき、不通のまま、前日確認を終えます（あとでつながったら、記録できます）">不通のまま終了する</button>`;
}

// 連絡の記録（これまでの履歴と、新しく記録する入力）
function callPanelHtml(r, draft) {
  const calls = r.confirmCalls ?? [];
  const history = calls.length
    ? calls.map((c) => `<li class="flex flex-wrap gap-x-2"><span class="text-slate-500">${stamp(c.at)}</span><b class="${c.result === 'reached' ? 'text-teal-700' : 'text-amber-800'}">${CALL_RESULTS[c.result]}</b><span class="text-slate-500">（${esc(c.by)}）</span>${c.memo ? `<span class="w-full whitespace-pre-wrap rounded bg-slate-50 px-2 py-1">${esc(c.memo)}</span>` : ''}</li>`).join('')
    : '<li class="text-slate-500">まだ連絡していません</li>';
  return `<div class="mt-2 space-y-2 rounded border border-teal-300 bg-teal-50/50 p-2 text-xs">
    <div><div class="mb-0.5 font-bold text-slate-700">これまでの連絡</div><ul class="space-y-1">${history}</ul></div>
    <div class="space-y-1"><div class="font-bold text-slate-700">連絡の結果を記録</div>
      <div class="flex gap-1">${Object.entries(CALL_RESULTS).map(([k, v]) => `<button class="chip ${draft.result === k ? 'on' : ''}" data-callresult="${k}">${v}</button>`).join('')}</div>
      <textarea class="inp" rows="3" data-callmemo placeholder="お客様から告げられたこと（時間の変更・同席者・駐車場・キャンセルの意向など）">${esc(draft.memo)}</textarea>
      <div class="flex flex-wrap items-center gap-2"><button class="b b-pri" data-callsave="${r.id}">記録する</button>
        ${closeHtml(r)}
        ${helpIcon('つながらなかったときも「つながらなかった」を記録します（再連絡のたびに足せます）。何回かけてもつながらないときは、「不通のまま終了する」で、前日確認を終えられます（カレンダーの枠には「不通」と出ます）。日時の変更・取消を告げられたら、メモに残したうえで、「受付を変更・取消する」で受付を直します。')}</div></div></div>`;
}

// 右の一覧: その日の、このエリアの訪問（受付）。ひとりずつ前日確認を記録する
function dayListHtml({ areaId, date, reservations, today, calSel, draft, staffSel = [], pendOnly = false, sortBy = 'visit' }) {
  const all = reservations.filter((r) => r.areaId === areaId && r.status !== 'cancelled' && r.date === date && (!staffSel.length || staffSel.includes(r.userId))).sort((a, b) => toMin(a.start) - toMin(b.start));
  const todo = notYetReached(all);
  const shown = pendOnly ? all.filter((r) => todo.includes(r) || r.id === calSel) : all; // 開いている行は、記録して連絡済みになっても、閉じるまで残す
  const list = sortBy === 'contact' ? sortByContactTime(shown) : shown;
  const due = confirmDateOf(date) === today;
  const asBlock = (r) => ({ userId: r.userId, date: r.date, start: toMin(r.start), end: toMin(r.end), name: r.customer.name, place: r.customer.address });
  const row = (r) => (calSel === r.id ? visitDetailHtml(asBlock(r), r, draft, { anchor: true }) : `<div class="rounded-lg border p-2 ${confirmStatus(r).key === 'reached' ? 'border-teal-400 bg-teal-50' : 'bg-white'}">
    <div class="flex items-start gap-2"><div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">${sortBy === 'contact' ? `<span class="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900" title="受付で聞いた、前日確認の電話をかける時間帯">📞 連絡 ${esc(r.hearing?.contact ?? '未確認')}</span>` : `<b>${esc(r.start)}〜${esc(r.end)}</b>`}<b>${esc(r.customer.name)} 様</b>${statusBadge(r)}${statusChip(r)}</div>
      <button class="b b-sec shrink-0 !min-h-0 !py-1 text-xs" data-callopen="${r.id}" aria-expanded="false" title="詳細と前日確認を開く">▼ 開く</button></div>
    <div class="mt-1 text-xs text-slate-700">${esc(r.customer.address)} ／ ${esc([r.customer.phone, r.customer.phone2].filter(Boolean).join(' ／ '))}</div>
    <div class="mt-0.5 text-xs text-slate-700">${sortBy === 'contact' ? `訪問 <b>${esc(r.start)}〜${esc(r.end)}</b>` : `前日確認の連絡時間 <b>${esc(r.hearing?.contact ?? '未確認')}</b>`}</div></div>`);
  return `<div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2"><b>${dateLabel(date)}の受付 ${all.length}件</b>
      ${due ? '<span class="rounded bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">今日、前日確認の連絡をする日</span>' : `<span class="text-xs text-slate-500">前日確認の日は ${dateLabel(confirmDateOf(date))}</span>`}
      ${helpIcon('訪問の前日に、オペレーターが、お客様へ1人ずつ電話で確認します。連絡したか・つながらなかったか・お客様から告げられたことを、訪問ごとに記録します。')}</div>
    <div class="flex flex-wrap items-center gap-1"><button class="chip ${pendOnly ? 'on' : ''}" data-calpend aria-pressed="${pendOnly}" title="つながっていない訪問（未連絡・不通）だけを出す">前日確認がまだだけ（${todo.length}件）</button>
      <button class="chip ${sortBy === 'contact' ? 'on' : ''}" data-calsort="${sortBy === 'contact' ? 'visit' : 'contact'}" title="押すたびに、並び順を切り替える（希望連絡時間帯順は、電話のかけ忘れを防ぐ）">並び順：${sortBy === 'contact' ? '希望連絡時間帯順' : '訪問時刻順'}</button></div>
    ${list.length ? list.map(row).join('') : `<div class="rounded-lg bg-slate-100 py-8 text-center text-sm text-slate-500">${all.length ? '前日確認がまだの訪問はありません（すべて連絡済み）' : 'この日の受付した訪問はありません'}</div>`}</div>`;
}

export function calendarHtml(x0) {
  const { areaId, mode, reservations, now = new Date() } = x0;
  const span = mode === 'week' ? Array.from({ length: 7 }, (_, i) => shift(x0.weekStart, i)) : [x0.date];
  const x = { ...x0, staff: areaStaffOver(areaId, span, reservations, now) };
  const body = mode === 'week'
    ? `<div class="min-h-0 flex-1">${weekHtml({ ...x, now })}</div>`
    : `<div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] gap-3"><div class="min-h-0 overflow-y-auto">${dayGridHtml({ cols: dayColumns({ areaId, date: x.date, reservations, now, userIds: x.staffSel ?? [] }).map((c) => ({ ...c, reservationOf: (id) => reservations.find((r) => r.id === id) })), date: x.date, calSel: x.calSel })}</div>
      <div class="min-h-0 overflow-y-auto pr-1">${dayListHtml(x)}</div></div>`;
  return `<div class="flex h-[calc(100vh-52px)] flex-col gap-2 p-3">${barHtml(x)}${body}</div>`;
}
