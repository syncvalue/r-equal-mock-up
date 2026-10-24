// コールセンター画面の描画（状態 → HTML）。イベント処理は callcenter.js。
import { esc } from '../src/format.js';
import { USERS, isLeader } from '../src/dashboard.js';
import { AREAS, areaById, areaOfUser, busyBlocks, conflictText, WORK_START, WORK_END, DURATIONS, SLOT_STEP } from '../src/dispatch.js';
import { minToHHMM } from '../src/reservations.js';
import { CHIRASHI, CATEGORIES, MAIN_ITEMS, MAIN_BANDS, ATTENDEES, YESNO, CONTACT_TIMES, flyerOf, isFlyerIndex } from './master.js';
import { FIELD_LABELS } from './transcript.js';

export const mapUrl = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
const pct = (m) => Math.min(100, Math.max(0, ((m - WORK_START) / (WORK_END - WORK_START)) * 100));
const GENDER = { f: '女性', m: '男性' };
export const genderLabel = (g) => GENDER[g] ?? '';

// ---- 時間帯のバー ------------------------------------------------------------------
const SRC = { event: ['bg-slate-500', '予定'], dummy: ['bg-slate-400', '予定'], reservation: ['bg-indigo-600', 'コールセンター確定'] };

export const axis = () => `<div class="flex">${Array.from({ length: (WORK_END - WORK_START) / 60 }, (_, i) => `<span class="flex-1 text-[10px] text-slate-400">${9 + i}</span>`).join('')}</div>`;

export function strip(blocks, req = null, { labels = false } = {}) {
  const lines = Array.from({ length: 9 }, (_, i) => `<div class="absolute top-0 bottom-0 border-l border-slate-300/60" style="left:${(i + 1) * 10}%"></div>`).join('');
  const bars = blocks.map((b) => `<div class="absolute top-0 bottom-0 ${SRC[b.source][0]} text-white text-[10px] leading-6 px-1 truncate" style="left:${pct(b.start)}%;width:${pct(b.end) - pct(b.start)}%" title="${esc(`${minToHHMM(b.start)}–${minToHHMM(b.end)} ${b.label}（${SRC[b.source][1]}）`)}">${labels ? esc(b.label) : ''}</div>`).join('');
  const r = req ? `<div class="absolute top-0.5 bottom-0.5 rounded border-2 ${req.free ? 'border-emerald-500 bg-emerald-400/40' : 'border-rose-500 bg-rose-400/40'}" style="left:${pct(req.start)}%;width:${pct(req.end) - pct(req.start)}%" title="希望の時間帯"></div>` : '';
  return `<div class="relative h-6 rounded bg-slate-100 overflow-hidden">${lines}${bars}${r}</div>`;
}

// ---- 通話の文字起こし（デモ） -----------------------------------------------------------
export const demoWindowHtml = (pos) => `<div id="demo-win" class="fixed z-50 w-[26rem] max-w-[calc(100vw-1rem)] rounded-lg bg-white shadow-2xl border-2 border-amber-400" style="left:${pos.x}px;top:${pos.y}px">
  <div class="flex items-center justify-between bg-amber-400 text-slate-900 rounded-t px-3 py-1.5 cursor-move select-none" data-drag><b class="text-sm">🎙 音声入力デモ（文字起こし）</b><button class="text-lg leading-none px-1" data-demo="close" title="閉じる">✕</button></div>
  <div id="transcript" class="p-3"></div></div>`;

export function transcriptHtml({ lines, playing, finished, pos, total }) {
  const bubble = (l) => l.who === 'sys'
    ? `<div class="text-center text-xs font-bold rounded bg-emerald-50 border border-emerald-300 text-emerald-800 px-2 py-1">${esc(l.text)}</div>`
    : `<div class="flex ${l.who === 'op' ? 'justify-start' : 'justify-end'}"><div class="max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${l.who === 'op' ? 'bg-slate-100' : 'bg-teal-50 border border-teal-200'}">
      <div class="text-[10px] text-slate-500">${l.who === 'op' ? 'オペレーター' : 'お客様'}</div>${esc(l.text)}
      ${l.got?.length ? `<div class="mt-1 flex flex-wrap gap-1">${[...new Set(l.got.map((k) => FIELD_LABELS[k]))].map((t) => `<span class="rounded bg-amber-200 text-amber-900 text-[10px] font-bold px-1.5 py-0.5">✎ ${esc(t)}</span>`).join('')}</div>` : ''}</div></div>`;
  return `<div class="space-y-2">
    <div class="flex items-center justify-between gap-2"><span class="text-xs bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 font-bold">デモ</span>
      <div class="flex items-center gap-1"><span class="text-xs text-slate-500 mr-1">${pos}／${total}</span>
        ${playing ? '<button class="b b-sec !min-h-0 !py-1 text-sm" data-demo="stop">⏸ 止める</button>' : `<button class="b b-pri !min-h-0 !py-1 text-sm" data-demo="start">${lines.length && !finished ? '▶ 自動再生を再開' : '▶ 自動再生'}</button>`}
        <button class="b b-sec !min-h-0 !py-1 text-sm" data-demo="step" ${finished ? 'disabled' : ''} title="会話を1つずつ進めます">⏭ 次の発話</button>
        ${lines.length ? '<button class="b b-sec !min-h-0 !py-1 text-sm" data-demo="reset">やり直す</button>' : ''}</div></div>
    <p class="text-xs text-slate-500"><b>今後の拡張機能のデモです</b>（通常は、オペレーターが手で入力します）。会話が文字になり、お客様の発話から項目を拾って、画面の入力欄に自動でセットします（<span class="bg-amber-200 rounded px-1">黄色</span>が今入った項目）。エリアの確定と担当営業の選択も会話の中で行い、<b>電話を切ると同時に訪問を確定</b>します。</p>
    <div class="h-72 overflow-y-auto rounded border bg-white p-2 space-y-1.5" id="chat">${lines.length ? lines.map(bubble).join('') : '<p class="text-sm text-slate-400 text-center pt-24">「⏭ 次の発話」で1つずつ、「▶ 自動再生」で続けて、受電の会話が進みます</p>'}
      ${playing ? '<div class="text-xs text-slate-400 animate-pulse">● 通話中…</div>' : ''}</div>
    <form class="flex gap-1" data-utter-form><input class="inp" data-utter placeholder="お客様の発話を入力して試す（例: 来週の月曜、午後3時でお願いします）" /><button class="b b-sec shrink-0" type="submit">反映</button></form>
  </div>`;
}

// ---- 聞き取り状況（聞き忘れ防止） ------------------------------------------------------------
export const badgeHtml = (asked) => (asked
  ? '<span class="text-[10px] rounded px-1 font-bold bg-emerald-100 text-emerald-700">✔ 聞いた</span>'
  : '<span class="text-[10px] rounded px-1 font-bold bg-amber-300 text-amber-950">未</span>');

export function checklistHtml(list) {
  const done = list.filter((x) => x.asked).length;
  const rest = list.filter((x) => !x.asked);
  const all = !rest.length;
  return `<div class="rounded-lg border-2 bg-white px-2 py-1.5 shadow ${all ? 'border-emerald-500' : 'border-amber-400'}">
    <div class="flex items-center justify-between text-xs font-bold"><span>聞き取り状況　${done}／${list.length}</span>${all ? '<span class="text-emerald-700">✔ すべて聞きました</span>' : '<span class="text-amber-800">まだ聞いていない項目があります</span>'}</div>
    <div class="h-1.5 rounded bg-slate-200 mt-1"><div class="h-1.5 rounded ${all ? 'bg-emerald-500' : 'bg-amber-400'}" style="width:${(done / Math.max(1, list.length)) * 100}%"></div></div>
    ${all ? '' : `<div class="flex flex-wrap items-center gap-1 mt-1"><span class="text-[11px] text-amber-800 font-bold">未：</span>${rest.map((x) => `<button class="rounded bg-amber-200 text-amber-950 text-[11px] font-bold px-1.5 py-0.5 ${x.required ? 'ring-1 ring-rose-400' : ''}" data-goto="${x.key}" title="${x.required ? '必須の項目です' : 'クリックで入力欄へ'}">${esc(x.label)}</button>`).join('')}</div>`}
  </div>`;
}

// ---- 入力フォーム ------------------------------------------------------------------
const lbl = (text, inner, { req = false, cls = '' } = {}) => `<label class="block ${cls}"><span class="text-xs font-bold">${text}${req ? '<span class="text-rose-600 text-xs ml-1">必須</span>' : ''}</span>${inner}</label>`;
const inp = (key, v, { type = 'text', ph = '', extra = '' } = {}) => `<input class="inp mt-0.5" data-f="${key}" type="${type}" value="${esc(v)}" placeholder="${esc(ph)}" ${extra} />`;
const sec = (title, body) => `<section class="bg-white rounded-lg shadow p-3 space-y-2"><h2 class="font-bold text-teal-800 text-sm">${title}</h2>${body}</section>`;

export function flyerResultHtml(id) {
  if (!String(id ?? '').trim()) return '<span class="text-slate-400">IDを入力すると、どのチラシか自動で表示します</span>';
  const f = flyerOf(id);
  return f ? `<span class="text-emerald-700 font-bold">✔ ${esc(CHIRASHI[f.chirashi])}</span>` : '<span class="text-amber-700 font-bold">該当するIDがありません。お客様にIDをもう一度ご確認ください</span>';
}

export function formHtml(f, today, list = []) {
  const st = Object.fromEntries(list.map((x) => [x.key, x.asked]));
  const b = (key) => `<span data-badge="${key}" class="ml-1">${badgeHtml(Boolean(st[key]))}</span>`;
  const none = (key, label) => `<button class="chip !py-0 !text-[11px]" data-none="${key}" title="聞いたが、特にない場合">${label}</button>`;
  const times = [];
  for (let m = WORK_START; m < WORK_END; m += SLOT_STEP) times.push(m);
  const customer = sec('① お客様', `
    <div class="grid grid-cols-2 gap-2">
      ${lbl(`電話番号${b('phone')}`, inp('phone', f.phone, { type: 'tel', ph: '090-0000-0000' }), { req: true, cls: 'col-span-2' })}
      <div id="hint" class="col-span-2 empty:hidden"></div>
      ${lbl(`お名前${b('name')}`, inp('name', f.name, { ph: '山田 太郎' }), { req: true })}${lbl(`フリガナ${b('kana')}`, inp('kana', f.kana, { ph: 'ヤマダ タロウ' }))}
    </div>
    <div class="flex items-center gap-2" title="担当営業の公平な配分に使います（女性のお客様は、特定の営業に偏らないようにします）">
      <span class="text-xs font-bold shrink-0">性別<span class="text-rose-600 text-xs ml-1">必須</span>${b('gender')}</span>
      <div class="flex gap-2 flex-1">${Object.entries(GENDER).map(([k, v]) => `<button class="b b-sec flex-1 ${f.gender === k ? 'on' : ''}" data-gender="${k}">${v}</button>`).join('')}</div></div>
    <div class="grid grid-cols-3 gap-2">
      ${lbl(`郵便番号${b('zip')}`, inp('zip', f.zip, { ph: '545-6016' }))}
      ${lbl(`訪問先の住所（都道府県から）${b('address')}`, `<div class="flex gap-1">${inp('address', f.address, { ph: '大阪府大阪市阿倍野区…' })}<button class="b b-sec mt-0.5 shrink-0 !px-2" data-map title="Googleマップで開く">🗺</button></div>`, { req: true, cls: 'col-span-2' })}
    </div>`);
  const when = sec('② 訪問の希望日時（右のカレンダーでも選べます）', `
    <div class="grid grid-cols-2 gap-2">
      ${lbl(`希望日${b('when')}`, inp('date', f.date, { type: 'date', extra: `min="${today}"` }), { req: true })}
      ${lbl('開始時刻', `<select class="inp mt-0.5" data-f="start">${times.map((m) => `<option value="${m}" ${m === f.start ? 'selected' : ''}>${minToHHMM(m)}</option>`).join('')}</select>`, { req: true })}
    </div>
    <div class="flex items-center gap-1.5 flex-wrap"><span class="text-xs font-bold">所要時間</span>${DURATIONS.map((d) => `<button class="chip ${f.dur === d ? 'on' : ''}" data-dur="${d}">${d}分</button>`).join('')}
      <span class="text-xs text-slate-500">→ ${minToHHMM(f.start)}〜${minToHHMM(f.start + f.dur)}</span></div>`);
  const hearing = sec('③ ヒアリング', `
    <div><div class="text-xs font-bold">何を見て電話してきましたか？<span class="text-rose-600 text-xs ml-1">必須</span>${b('flyer')}</div>
      <div class="flex items-center gap-2 mt-0.5"><div class="w-36 shrink-0">${inp('flyerId', f.flyerId, { ph: 'チラシのID 例: N1019' })}</div><div id="flyer-result" class="text-xs">${flyerResultHtml(f.flyerId)}</div></div>
      <div class="flex flex-wrap items-center gap-1 mt-1"><span class="text-xs text-slate-500">IDなし：</span>${CHIRASHI.map((c, i) => (isFlyerIndex(i) ? '' : `<button class="chip ${f.chirashi === i ? 'on' : ''}" data-chirashi="${i}">${esc(c)}</button>`)).join('')}</div></div>
    <div><div class="text-xs font-bold">何を売りたいですか？<span class="text-rose-600 text-xs ml-1">必須</span>${b('wants')}</div>
      <div class="text-[11px] text-slate-500 mt-0.5">メイン商材（数量を選択）</div>
      <div class="grid grid-cols-2 gap-1 mt-0.5">${MAIN_ITEMS.map((k) => `<div class="flex"><span class="w-14 shrink-0 flex items-center justify-center rounded-l border border-r-0 border-slate-400 bg-slate-100 text-xs font-bold">${k}</span>
        <select class="inp !rounded-l-none ${f.mainItems[k] ? 'sel' : ''}" data-main="${k}"><option value="0">(数量)</option>${MAIN_BANDS.map((b) => `<option value="${b.min}" ${f.mainItems[k] === b.min ? 'selected' : ''}>${b.label}</option>`).join('')}</select></div>`).join('')}</div>
      <div class="text-[11px] text-slate-500 mt-1.5">その他の商材（複数選択）</div>
      <div class="flex flex-wrap gap-1 mt-0.5">${CATEGORIES.map((c) => `<button class="chip ${f.cats.includes(c) ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <textarea class="inp mt-1" rows="4" data-f="wants" placeholder="ブランド・点数などの詳細（例: ヴィトン 3点、ロレックス 2本）">${esc(f.wants)}</textarea></div>
    <div class="grid grid-cols-2 gap-2">
      ${lbl(`当日の立会い（誰が立ち会うか）${b('attendee')}`, `<select class="inp mt-0.5" data-f="attendee"><option value="">（未確認）</option>${ATTENDEES.map((a) => `<option ${a === f.attendee ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>`)}
      <div><div class="flex items-center justify-between gap-1"><span class="text-xs font-bold">大型品・その他の確認${b('large')}</span>${none('large', '特になし')}</div>${inp('large', f.large, { ph: '例: ゴルフクラブも売れるか' })}</div>
    </div>
    <div><div class="flex items-center justify-between gap-1"><span class="text-xs font-bold">訪問時の注意（営業のタブレットに表示）${b('notes')}</span>${none('notes', '特になし')}</div><textarea class="inp mt-0.5" rows="2" data-f="notes" placeholder="例: 1階エントランスで待ち合わせ。午前中が電話がつながりやすい">${esc(f.notes)}</textarea></div>`);
  const yn = (key, label, hint = '') => `<div title="${hint}"><div class="text-xs font-bold whitespace-nowrap">${label}${b(key)}</div><div class="flex gap-1 mt-0.5">${YESNO.map((o) => `<button class="b b-sec flex-1 !px-1 ${f[key] === o ? 'on' : ''}" data-yn="${key}|${o}">${o}</button>`).join('')}</div></div>`;
  const time = (key) => `<select class="inp" data-f="${key}"><option value="">（未確認）</option><option value="none" ${f[key] === 'none' ? 'selected' : ''}>指定なし</option>${CONTACT_TIMES.map((t) => `<option ${t === f[key] ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const notes = sec('④ 備考・補足など', `
    <div class="grid grid-cols-3 items-end gap-2">${yn('companion', 'ご同席者', '立ち会う人のほかに、同席する人がいるか')}${yn('parking', '駐車スペース')}${yn('nameplate', '表札')}</div>
    ${f.companion === 'あり' ? inp('companionNote', f.companionNote, { ph: 'ご同席者は誰ですか？（例: ご主人、娘様）' }) : ''}
    <div><div class="text-xs font-bold">前日確認の連絡時間${b('contact')}</div><div class="flex items-center gap-1.5 mt-0.5">${time('contactFrom')}<span>〜</span>${time('contactTo')}</div></div>`);
  return `<div id="checklist" class="sticky top-0 z-10">${checklistHtml(list)}</div>${customer}${when}${hearing}${notes}`;
}

export function hintHtml(found, applied) {
  if (!found) return '';
  return `<div class="rounded-lg bg-amber-50 border border-amber-300 px-2 py-1 text-xs flex justify-between items-center gap-2">
    <span>📇 <b>過去にご利用あり</b>：${esc(found.name)} 様（${esc(found.address)}）</span>
    ${applied ? '<span class="text-xs text-slate-500">反映済み</span>' : '<button class="b b-sec !min-h-0 !py-1 text-sm" data-quote>お客様情報を引用</button>'}</div>`;
}

// ---- 配車（候補・空き状況） ----------------------------------------------------------
const share = (s) => `${Math.round(s.femaleShare * 100)}%`;

function statsLine(c, maxFemale) {
  const w = maxFemale ? (c.stats.female / maxFemale) * 100 : 0;
  return `<div class="text-[11px] leading-tight text-slate-600">今月 ${c.stats.total}件（女性 <b>${c.stats.female}件</b>・${share(c.stats)}）
    <div class="h-1 w-28 rounded bg-slate-200 mt-0.5"><div class="h-1 rounded bg-rose-400" style="width:${w}%"></div></div></div>`;
}

function candidateCard(c, { selectedId, gender, req, maxFemale }) {
  const on = c.user.id === selectedId;
  const reason = gender === 'f' ? `女性のお客様の担当が今月${c.stats.female}件で、空いている候補の中で最も少ない` : `今月の担当が${c.stats.total}件で、空いている候補の中で最も少ない`;
  const tag = (cls, t) => `<span class="rounded ${cls} text-[11px] font-bold px-1.5 py-0.5">${t}</span>`;
  return `
  <div class="rounded-lg border-2 px-2 py-1.5 space-y-1 bg-white ${c.free ? 'cursor-pointer hover:border-teal-500' : 'opacity-70'} ${on ? 'border-teal-600 ring-2 ring-teal-300' : 'border-slate-200'}" ${c.free ? `data-pick="${c.user.id}"` : ''}>
    <div class="flex justify-between items-center gap-2">
      <div><b>${esc(c.user.name)}</b>${isLeader(c.user) ? '<span class="ml-1 text-[10px] rounded bg-slate-200 px-1.5 py-0.5">リーダー</span>' : ''}
        <span class="ml-1 text-[11px] text-slate-500">${esc(areaById(c.areaId)?.name ?? '')}</span></div>
      <div class="flex gap-1 shrink-0">${c.recommended ? tag('bg-amber-400 text-slate-900', '⭐ おすすめ') : ''}
        ${c.free ? tag('bg-emerald-100 text-emerald-800', '空き') : tag('bg-rose-100 text-rose-700', '不可')}
        ${on ? tag('bg-teal-600 text-white', '選択中') : ''}</div></div>
    <div class="grid grid-cols-[9rem_1fr] gap-2 items-center">${statsLine(c, maxFemale)}${strip(c.blocks, req)}</div>
    ${c.recommended ? `<div class="text-[11px] text-amber-700 font-bold">${reason}</div>` : ''}
    ${c.free ? '' : `<div class="text-[11px] text-rose-600">${esc(conflictText(c.conflict))}</div>`}
  </div>`;
}

const WEEK_DAYS = ['日', '月', '火', '水', '木', '金', '土'];
const dayHead = (date) => { const [y, m, d] = date.split('-').map(Number); const w = new Date(y, m - 1, d).getDay(); return { md: `${m}/${d}`, w: WEEK_DAYS[w], cls: w === 0 ? 'text-rose-600' : w === 6 ? 'text-sky-600' : '' }; };

// 1週間の空きカレンダー。縦=開始時刻、横=日付、セル=空いている営業の人数。タップで希望日時に反映する。◀▶で1週間ずつ動かす
export function weekCalendarHtml({ week, form, today, names, canPrev }) {
  const first = dayHead(week[0].date);
  const last = dayHead(week[week.length - 1].date);
  const head = week.map((d) => { const h = dayHead(d.date); return `<th class="px-0.5 py-0.5 text-center text-xs font-bold leading-tight ${h.cls} ${d.date === form.date ? 'bg-teal-100' : ''}">${h.md}<div class="text-[10px] font-normal leading-none">${h.w}${d.date === today ? '・今日' : ''}</div></th>`; }).join('');
  const rows = week[0].slots.map((_, i) => `<tr><th class="pr-1 text-right text-[11px] font-normal text-slate-500 whitespace-nowrap">${minToHHMM(week[0].slots[i].start)}</th>${week.map((d) => {
    const s = d.slots[i];
    const n = s.freeIds.length;
    const past = d.date < today;
    const on = d.date === form.date && s.start === form.start;
    const tone = n === 0 || past ? 'bg-slate-100 text-slate-400' : n === 1 ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200';
    const who = s.freeIds.map((id) => names[id]).join('、');
    return `<td class="p-px"><button class="w-full rounded text-xs font-bold py-0 leading-5 ${tone} ${on ? 'ring-2 ring-teal-600 !bg-teal-600 !text-white' : ''}" data-cell="${d.date}|${s.start}" ${n === 0 || past ? 'disabled' : ''} title="${esc(n ? `${dayHead(d.date).md} ${minToHHMM(s.start)}〜 空き: ${who}` : '空きなし')}">${n === 0 || past ? '×' : n === 1 ? '△1' : `◎${n}`}</button></td>`;
  }).join('')}</tr>`).join('');
  const pick = week.find((d) => d.date === form.date)?.slots.find((s) => s.start === form.start);
  return `<div class="rounded-lg border bg-white p-1.5">
    <div class="flex items-center justify-between gap-2 mb-0.5">
      <button class="b b-sec !min-h-0 !py-1 text-sm" data-week="-7" ${canPrev ? '' : 'disabled'}>◀ 前の週</button>
      <div class="text-sm font-bold">${first.md}（${first.w}）〜 ${last.md}（${last.w}）<span class="font-normal text-xs text-slate-500 ml-2">${form.dur}分で訪問した場合</span></div>
      <button class="b b-sec !min-h-0 !py-1 text-sm" data-week="7">次の週 ▶</button></div>
    <table class="w-full table-fixed border-separate border-spacing-0"><thead><tr><th class="w-11"></th>${head}</tr></thead><tbody>${rows}</tbody></table>
    <div class="mt-0.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
      <span><b class="text-emerald-700">◎n</b> 空きがn人 ／ <b class="text-amber-700">△1</b> 残り1人 ／ × 空きなし　※開始時刻（営業の人数）</span>
      ${pick && pick.freeIds.length ? `<span>選択中 ${dayHead(form.date).md}（${dayHead(form.date).w}）${minToHHMM(form.start)}〜：<b class="text-slate-700">${esc(pick.freeIds.map((id) => names[id]).join('、'))}</b></span>` : ''}</div>
</div>`;
}

// 住所からのエリア判定は「提案」。オペレーターがGoogleマップで正確な位置を確認して、営業エリアを確定する
const areaBanner = ({ proposal, confirmed, hasAddress }) => {
  if (!hasAddress) return '<div class="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-500">訪問先の住所を入力すると、Googleマップで位置を確認して、営業エリアを確定できます。</div>';
  const judge = !proposal ? '住所から都道府県を判定できません（都道府県から入力すると判定します）' : proposal.outside ? `<b>${esc(proposal.pref)}</b>は対応エリア外です（例外対応の場合は、エリアを選んでください）` : `住所の判定：<b>${esc(proposal.name)}</b>（${esc(proposal.pref)}）`;
  const btns = AREAS.map((a) => `<button class="chip ${confirmed?.id === a.id ? 'on' : ''}" data-area="${a.id}">${esc(a.name)}${proposal?.id === a.id ? '<span class="opacity-70 text-[10px] ml-1">住所の判定</span>' : ''}</button>`).join('');
  const differ = confirmed && proposal?.id !== confirmed.id ? '<span class="text-[11px] text-amber-700">※住所の判定と異なります（マップの位置で確定）</span>' : '';
  return `<div class="rounded-lg border px-2 py-1.5 space-y-1 ${confirmed ? 'bg-teal-50 border-teal-300 text-teal-900' : 'bg-amber-50 border-amber-300 text-amber-900'}">
    <div class="flex justify-between items-center gap-2 text-xs"><span>${judge}</span><button class="b b-sec !min-h-0 !py-0.5 text-xs shrink-0 !text-slate-800" data-map>🗺 Googleマップで位置を確認</button></div>
    <div class="flex flex-wrap items-center gap-1.5"><span class="text-sm font-bold">${confirmed ? '✔ 営業エリア確定：' : 'マップで確認して、エリアを確定：'}</span>${btns}${differ}</div></div>`;
};

export function dispatchHtml(x) {
  const { area, proposal, confirmed, hasAddress, ranking, calendar, form, selectedId, alt, missing, unasked, showOthers } = x;
  const req = (c) => ({ start: form.start, end: form.start + form.dur, free: c.free });
  const maxFemale = Math.max(1, ...[...ranking.inArea, ...ranking.others].map((c) => c.stats.female));
  const card = (c) => candidateCard(c, { selectedId, gender: form.gender, req: req(c), maxFemale });
  const sel = [...ranking.inArea, ...ranking.others].find((c) => c.user.id === selectedId);
  return `
  <div class="space-y-2">
    ${areaBanner({ proposal, confirmed, hasAddress })}
    ${ranking.inArea.length ? `
      <div><div class="text-sm font-bold mb-0.5">候補日を選ぶ（${esc(area.name)}の営業の空き状況）<span class="font-normal text-xs text-slate-500 ml-2">お客様の希望日が埋まっていたら、前後の日をご提案ください</span></div>${weekCalendarHtml(calendar)}</div>
      <div><div class="text-sm font-bold mb-0.5">担当の候補（${esc(area.name)}）<span class="font-normal text-xs text-slate-500 ml-2">▮灰=既存の予定 ▮紺=コールセンター確定 □緑/赤=希望の時間帯</span></div>
        <div class="grid grid-cols-[9rem_1fr] gap-2 px-[10px]"><span></span>${axis()}</div>
        <div class="space-y-1.5">${ranking.inArea.map(card).join('')}</div></div>` : ''}
    <div><button class="text-sm underline text-slate-500" data-toggle-others>${showOthers ? '▼' : '▶'} 他エリアの営業から選ぶ（例外対応）</button>
      ${showOthers ? `<div class="grid grid-cols-[9rem_1fr] gap-2 px-[10px] mt-1"><span></span>${axis()}</div><div class="space-y-1.5">${ranking.others.map(card).join('')}</div>` : ''}</div>
    ${alt ? `<div class="rounded-lg bg-rose-50 border border-rose-300 px-3 py-1.5 text-xs text-rose-800">⚖ 公平性の注意：<b>${esc(alt.user.name)}</b>の方が、女性のお客様の今月の担当が少ない（${alt.stats.female}件 ／ 選択中 ${sel.stats.female}件）です。変更する理由がなければ、${esc(alt.user.name)}を選んでください。</div>` : ''}
    <div class="rounded-lg border-2 border-teal-600 bg-white p-2 space-y-1.5 sticky bottom-0">
      ${sel ? `<div class="text-sm">担当：<b class="text-base">${esc(sel.user.name)}</b>　${esc(form.date)} ${minToHHMM(form.start)}〜${minToHHMM(form.start + form.dur)}　${esc(form.name || 'お客様')} 様（${genderLabel(form.gender) || '性別未選択'}）</div>` : '<div class="text-sm text-slate-500">担当の営業が決まっていません。</div>'}
      ${missing.length ? `<div class="text-xs text-rose-600">未入力：${missing.map(esc).join('、')}</div>` : ''}
      ${unasked.length ? `<div class="text-xs text-amber-800">⚠ 聞き忘れ（任意の項目）：${unasked.map(esc).join('、')}</div>` : ''}
      <button class="b b-pri w-full" data-confirm ${missing.length ? 'disabled' : ''}>この内容で訪問を確定する</button>
    </div>
  </div>`;
}

export function doneHtml(r) {
  const u = USERS.find((x) => x.id === r.userId);
  return `
  <div class="rounded-lg border-2 border-emerald-500 bg-white p-5 space-y-3">
    <div class="text-2xl font-bold text-emerald-700">✅ 訪問を確定しました</div>
    <dl class="text-sm grid grid-cols-[7rem_1fr] gap-y-1">
      <dt class="text-slate-500">受付番号</dt><dd class="font-bold">${esc(r.receptionNo)}</dd>
      <dt class="text-slate-500">訪問日時</dt><dd class="font-bold">${esc(r.date)} ${esc(r.start)}〜${esc(r.end)}</dd>
      <dt class="text-slate-500">お客様</dt><dd class="font-bold">${esc(r.customer.name)} 様（${genderLabel(r.gender)}）　${esc(r.customer.phone)}</dd>
      <dt class="text-slate-500">訪問先</dt><dd>${esc(r.customer.address)}</dd>
      <dt class="text-slate-500">担当営業</dt><dd class="font-bold">${esc(u?.name)}（${esc(areaById(r.areaId)?.name ?? '例外対応')}）</dd>
    </dl>
    <p class="text-sm text-slate-600">営業のタブレットの予定に追加され、受電時のヒアリング内容も確認できます。お客様には、訪問日時と担当者名をお伝えください。</p>
    <div class="flex gap-2"><button class="b b-pri" data-new>次の受付へ</button><button class="b b-sec" data-map>🗺 訪問先をGoogleマップで開く</button></div>
  </div>`;
}

// ---- 配車ボード・履歴 ----------------------------------------------------------------
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
export const dateLabel = (s) => { const [y, m, d] = s.split('-').map(Number); return `${m}/${d}（${WEEK[new Date(y, m - 1, d).getDay()]}）`; };

export function boardHtml({ date, reservations, stats, now, days }) {
  const groups = AREAS.map((a) => ({ a, users: USERS.filter((u) => areaOfUser(u.id) === a.id) }));
  const rows = groups.map(({ a, users }) => `
    <div class="px-3 py-1 text-xs font-bold bg-slate-50 border-y text-slate-600">${esc(a.name)}（${esc(a.prefs.join('・'))}）</div>
    ${users.map((u) => {
      const s = stats[u.id];
      return `<div class="grid grid-cols-[11rem_1fr] gap-3 items-center px-3 py-2 border-b">
        <div><b>${esc(u.name)}</b>${isLeader(u) ? '<span class="ml-1 text-[10px] rounded bg-slate-200 px-1.5 py-0.5">リーダー</span>' : ''}
          <div class="text-xs text-slate-500">今月 ${s.total}件（女性 ${s.female}件・${share(s)}）</div></div>
        ${strip(busyBlocks(u.id, date, reservations, now), null, { labels: true })}</div>`;
    }).join('')}`).join('');
  const fair = USERS.map((u) => ({ u, s: stats[u.id] }));
  const maxF = Math.max(1, ...fair.map((x) => x.s.female));
  return `
  <div class="grid grid-cols-[1fr_24rem] gap-4 p-4 h-[calc(100vh-52px)] overflow-y-auto">
    <div class="space-y-4">
      <section class="bg-white rounded-lg shadow">
        <div class="p-3 flex items-center gap-2 flex-wrap"><b class="mr-2">営業の空き状況（Googleマップの代わりに、全員の予定を1画面で確認）</b>
          ${days.map((d) => `<button class="chip ${d.date === date ? 'on' : ''}" data-bdate="${d.date}">${dateLabel(d.date)}</button>`).join('')}
          <input class="inp !w-auto" type="date" value="${date}" data-bdate-input /></div>
        <div class="grid grid-cols-[11rem_1fr] gap-3 px-3"><span></span>${axis()}</div>
        ${rows}
      </section>
      <section class="bg-white rounded-lg shadow overflow-x-auto">
        <div class="p-3 font-bold">受付履歴（コールセンターで確定した訪問）</div>
        ${reservations.length ? `<table class="w-full text-sm text-left"><thead class="bg-slate-100 text-slate-600"><tr><th>受付番号</th><th>訪問日時</th><th>お客様</th><th>訪問先</th><th>きっかけ</th><th>担当営業</th><th>受付者</th><th></th></tr></thead><tbody>
          ${reservations.map((r) => `<tr class="border-t"><td>${esc(r.receptionNo)}</td><td>${dateLabel(r.date)} ${esc(r.start)}</td><td>${esc(r.customer.name)} 様（${genderLabel(r.gender)}）</td>
            <td class="max-w-[16rem] truncate" title="${esc(r.customer.address)}">${esc(r.customer.address)}</td><td>${esc(r.hearing.trigger)}</td><td>${esc(USERS.find((u) => u.id === r.userId)?.name)}</td><td>${esc(r.operator)}</td>
            <td><button class="text-rose-600 underline" data-cancel="${r.id}">取消</button></td></tr>`).join('')}</tbody></table>` : '<p class="p-6 text-center text-slate-400">まだ受付がありません</p>'}
      </section>
    </div>
    <aside class="bg-white rounded-lg shadow p-3 space-y-2 self-start">
      <b>⚖ 今月の担当件数（公平性の確認）</b>
      <p class="text-xs text-slate-500">女性のお客様は客単価が高いため、女性の担当件数が偏らないように配分します。件数は、これまでの実績（ダミー）に、この画面で確定した受付を加えた数です。</p>
      ${fair.map(({ u, s }) => `<div class="text-sm"><div class="flex justify-between"><span>${esc(u.name)}</span><span class="text-xs text-slate-500">計${s.total}件 ／ 女性 <b class="text-slate-800">${s.female}</b> ・ 男性 ${s.male} ・ 女性比率 ${share(s)}</span></div>
        <div class="h-2 rounded bg-slate-200"><div class="h-2 rounded bg-rose-400" style="width:${(s.female / maxF) * 100}%"></div></div></div>`).join('')}
    </aside>
  </div>`;
}
