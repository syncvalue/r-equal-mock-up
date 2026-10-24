// コールセンター画面の描画（状態 → HTML）。イベント処理は callcenter.js。
import { esc, yen } from '../src/format.js';
import { CANCEL_REASONS } from './master.js';
import { avatarHtml } from './avatar.js';
import { matchedSpecialties } from './intake.js';
import { USERS, isLeader } from '../src/dashboard.js';
import { isTentative, isCancelled } from '../src/reservations.js';
import { specialtiesOf, AREAS, areaById, conflictOf, conflictText, WORK_START, WORK_END, DURATIONS, SLOT_STEP } from '../src/dispatch.js';
import { minToHHMM } from '../src/reservations.js';
import { CHIRASHI, CATEGORIES, AGE_BANDS, MAIN_ITEMS, MAIN_BANDS, ATTENDEES, YESNO, CONTACT_TIMES, flyerOf, isFlyerIndex } from './master.js';
import { FIELD_LABELS } from './transcript.js';
import { fullName } from './intake.js';

export const mapUrl = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
const pct = (m) => Math.min(100, Math.max(0, ((m - WORK_START) / (WORK_END - WORK_START)) * 100));
const GENDER = { f: '女性', m: '男性' };
export const genderLabel = (g) => GENDER[g] ?? '';
export const genderParen = (g) => (GENDER[g] ? `（${GENDER[g]}）` : ''); // 性別が分からない予約（営業の元からの予定）は、かっこごと出さない

// ---- 時間帯のバー ------------------------------------------------------------------
// 訪問の帯の色は、仮確定が薄い青、確定済みが濃い青。営業の元からの予定も、確定済みの訪問として、濃い青で出す（アポは、基本的にすべて電話でオペレーターが入れるため、出どころの区別はしない）
export const blockCls = (b) => (b.source === 'reservation' && b.status === 'tentative' ? 'bg-indigo-400' : 'bg-indigo-700');
export const isTentativeBlock = (b) => b.source === 'reservation' && b.status === 'tentative';
const blockKind = (b) => `訪問（${isTentativeBlock(b) ? '仮確定' : '確定済'}）`;

// 帯の色の意味（日別表示・担当候補で共通）
export const legendHtml = ({ want = true } = {}) => `<span class="font-normal text-[11px] text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-0.5">
  <span><i class="inline-block w-3 h-2.5 rounded-sm bg-indigo-400 align-middle"></i> 薄い青：仮確定</span><span><i class="inline-block w-3 h-2.5 rounded-sm bg-indigo-700 align-middle"></i> 濃い青：確定済み</span>
  ${want ? '<span><i class="inline-block w-3 h-2.5 rounded-sm border-2 border-emerald-600 bg-emerald-400/25 align-middle"></i> 緑：希望時間帯（空き）</span><span><i class="inline-block w-3 h-2.5 rounded-sm border-2 border-rose-500 bg-rose-400/25 align-middle"></i> 赤：予定と重なる</span>' : ''}</span>`;

// 営業のランク（S が最上位）
const RANK_CLS = { S: 'bg-amber-400 text-slate-900', A: 'bg-indigo-600 text-white', B: 'bg-slate-500 text-white', C: 'bg-slate-300 text-slate-800' };
export const rankBadge = (rank) => (rank ? `<span class="inline-block rounded px-1.5 text-[10px] font-bold leading-4 ${RANK_CLS[rank] ?? 'bg-slate-200'}" title="営業のランク">${esc(rank)}</span>` : '');

// 前後のアポから、今回のお客様の住所までの距離（概算）。prev=直前のアポ（なければ営業所から）／next=直後のアポ。short=営業ごとの列の見出し用の短い表記
const distText = (l) => `${l.km}km・約${l.min}分`;
const legText = (l, dir, short = false) => {
  if (!l) return dir === 'prev' ? '前のアポなし' : '';
  if (dir === 'prev') return short ? `前 ${l.label} ${minToHHMM(l.at)}終 ${distText(l)}` : `前のアポ ${l.label}（${minToHHMM(l.at)}終了）→ 今回のお客様宅まで ${distText(l)}`;
  return short ? `次 ${l.label} ${minToHHMM(l.at)}始 ${distText(l)}` : `次のアポ ${l.label}（${minToHHMM(l.at)}開始）← 今回のお客様宅から ${distText(l)}`;
};
export const travelTitle = (t) => (t ? [legText(t.prev, 'prev'), legText(t.next, 'next')].filter(Boolean).join('\n') : '');
// 担当候補の行に出す、色付きの見出し付きの表記
export const legHtml = (l, dir) => {
  const chip = (t, cls) => `<span class="mr-1 rounded px-1 text-[10px] font-bold ${cls}">${t}</span>`;
  if (!l) return dir === 'prev' ? chip('前のアポなし', 'bg-sky-100 text-sky-800') : ''; // 直前のアポがなければ、距離は出さない
  if (dir === 'prev') return `${chip('前のアポ', 'bg-slate-200 text-slate-700')}${esc(l.label)}（${minToHHMM(l.at)}終了）→ 今回のお客様宅まで <b class="text-slate-900">${l.km}km</b>・約${l.min}分`;
  return `${chip('次のアポ', 'bg-slate-200 text-slate-700')}${esc(l.label)}（${minToHHMM(l.at)}開始）まで <b class="text-slate-900">${l.km}km</b>・約${l.min}分`;
};

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
        <button class="b b-sec !min-h-0 !py-1 text-sm" data-demo="finish" ${finished ? 'disabled' : ''} title="残りの会話を、待たずに最後まで流します">⏩ 一気に最後まで</button>
        ${lines.length ? '<button class="b b-sec !min-h-0 !py-1 text-sm" data-demo="reset">やり直す</button>' : ''}</div></div>
    <p class="text-xs text-slate-500">※今後の拡張機能のデモです（通常は手入力）。<span class="bg-amber-200 rounded px-1">黄色</span>＝今入った項目。枠の選択と確定は、オペレーターが行います。</p>
    <div class="h-72 overflow-y-auto rounded border bg-white p-2 space-y-1.5" id="chat">${lines.length ? lines.map(bubble).join('') : '<p class="text-sm text-slate-400 text-center pt-24">「⏭ 次の発話」で1つずつ、「▶ 自動再生」で続けて、受電の会話が進みます</p>'}
      ${playing ? '<div class="text-xs text-slate-400 animate-pulse">● 通話中…</div>' : ''}</div>
    <form class="flex gap-1" data-utter-form><input class="inp" data-utter placeholder="お客様の発話を入力して試す（例: 来週の月曜、午後3時でお願いします）" /><button class="b b-sec shrink-0" type="submit">反映</button></form>
  </div>`;
}

// ---- 聞き取り状況（聞き忘れ防止） ------------------------------------------------------------
export const badgeHtml = (asked, estimated = false) => (estimated
  ? '<span class="text-[10px] rounded px-1 font-bold bg-sky-100 text-sky-800" title="声から推測">推</span>'
  : asked
  ? '<span class="text-[10px] rounded px-1 font-bold bg-emerald-100 text-emerald-700" title="聞いた">✔</span>'
  : '<span class="text-[10px] rounded px-1 font-bold bg-amber-300 text-amber-950" title="まだ聞いていない">未</span>');

export function checklistHtml(list) {
  const done = list.filter((x) => x.asked).length;
  const rest = list.filter((x) => !x.asked);
  const guess = list.filter((x) => x.estimated);
  const all = !rest.length;
  return `<div class="rounded-lg border-2 bg-white px-2 py-1.5 shadow ${all ? 'border-emerald-500' : 'border-amber-400'}">
    <div class="flex items-center justify-between text-xs font-bold"><span>聞き取り状況　${done}／${list.length}${guess.length ? `<span class="ml-2 font-normal text-sky-700">推測：${guess.map((x) => esc(x.label)).join('・')}</span>` : ''}</span>${all ? '<span class="text-emerald-700">✔</span>' : ''}</div>
    <div class="h-1.5 rounded bg-slate-200 mt-1"><div class="h-1.5 rounded ${all ? 'bg-emerald-500' : 'bg-amber-400'}" style="width:${(done / Math.max(1, list.length)) * 100}%"></div></div>
    ${all ? '' : `<div class="flex flex-wrap items-center gap-1 mt-1"><span class="text-[11px] text-amber-800 font-bold">未：</span>${rest.map((x) => `<button class="rounded bg-amber-200 text-amber-950 text-[11px] font-bold px-1.5 py-0.5 ${x.required ? 'ring-1 ring-rose-400' : ''}" data-goto="${x.key}" title="${x.required ? '必須の項目です' : 'クリックで入力欄へ'}">${esc(x.label)}</button>`).join('')}</div>`}
  </div>`;
}

// ---- 入力フォーム ------------------------------------------------------------------
const lbl = (text, inner, { req = false, cls = '' } = {}) => `<label class="block ${cls}"><span class="text-xs font-bold">${text}${req ? '<span class="text-rose-600 font-bold ml-0.5" title="必須">＊</span>' : ''}</span>${inner}</label>`;
const inp = (key, v, { type = 'text', ph = '', extra = '' } = {}) => `<input class="inp mt-0.5" data-f="${key}" type="${type}" value="${esc(v)}" placeholder="${esc(ph)}" ${extra} />`;
const sec = (title, body) => `<section class="bg-white rounded-lg shadow p-3 space-y-2"><h2 class="font-bold text-teal-800 text-sm">${title}</h2>${body}</section>`;

export function flyerResultHtml(id) {
  if (!String(id ?? '').trim()) return '';
  const f = flyerOf(id);
  return f ? `<span class="text-emerald-700 font-bold">✔ ${esc(CHIRASHI[f.chirashi])}</span>` : '<span class="text-amber-700 font-bold">該当なし。IDをご確認ください</span>';
}

export function formHtml(f, today, list = []) {
  const st = Object.fromEntries(list.map((x) => [x.key, x]));
  const b = (key) => `<span data-badge="${key}" class="ml-1">${badgeHtml(Boolean(st[key]?.asked), Boolean(st[key]?.estimated))}</span>`;
  const none = (key, label) => `<button class="chip !py-0 !text-[11px]" data-none="${key}" title="聞いたが、特にない場合">${label}</button>`;
  const times = [];
  for (let m = WORK_START; m < WORK_END; m += SLOT_STEP) times.push(m);
  const customer = sec('① お客様', `
    <div class="grid grid-cols-2 gap-2">
      ${lbl(`電話番号1${b('phone')}`, inp('phone', f.phone, { type: 'tel', ph: '090-0000-0000' }), { req: true })}<div><div class="flex items-center justify-between gap-1"><span class="text-xs font-bold">電話番号2${b('phone2')}</span><button class="chip !py-0 !text-[11px] ${f.phone2None ? 'on' : ''}" data-phone2none title="電話番号が1つだけの場合">なし</button></div>${inp('phone2', f.phone2, { type: 'tel', ph: '06-0000-0000' })}</div>
      <div id="hint" class="col-span-2 empty:hidden"></div>
      ${lbl(`姓${b('name')}`, inp('lastName', f.lastName, { ph: '山田' }), { req: true })}${lbl('名', inp('firstName', f.firstName, { ph: '太郎' }), { req: true })}
      ${lbl(`セイ${b('kana')}`, inp('lastKana', f.lastKana, { ph: 'ヤマダ' }), { req: true })}${lbl('メイ', inp('firstKana', f.firstKana, { ph: 'タロウ' }), { req: true })}
    </div>
    <div class="flex items-center gap-2" title="担当営業の公平な配分に使います（女性のお客様は、特定の営業に偏らないようにします）">
      <span class="text-xs font-bold shrink-0">性別<span class="text-rose-600 font-bold ml-0.5" title="必須">＊</span>${b('gender')}</span>
      <div class="flex gap-2 flex-1">${Object.entries(GENDER).map(([k, v]) => `<button class="b b-sec flex-1 ${f.gender === k ? 'on' : ''}" data-gender="${k}">${v}</button>`).join('')}</div>
      <button class="chip ${f.genderEst ? 'on' : ''}" data-genderest title="聞けず、声から推測した場合">推測</button></div>
    <div class="flex items-center gap-1.5 flex-wrap"><span class="text-xs font-bold shrink-0">年齢<span class="text-rose-600 font-bold ml-0.5" title="必須">＊</span>${b('age')}</span>
      <input class="inp !w-16" data-f="age" value="${esc(f.age)}" placeholder="62" inputmode="numeric" /><span class="text-xs">歳</span>
      <span class="text-xs text-slate-500 ml-1" title="年齢を聞けない場合は、声から推測した年代を選びます">推測</span>
      <select class="inp !w-auto" data-f="ageEst" title="年齢を聞けない場合は、声から推測した年代を選びます"><option value="">（年代を選ぶ）</option>${AGE_BANDS.map((a) => `<option ${f.ageEst === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
    <div class="grid grid-cols-3 gap-2">
      ${lbl(`郵便番号${b('zip')}`, inp('zip', f.zip, { ph: '545-6016' }))}
      ${lbl(`訪問先の住所${b('address')}`, `<div class="flex gap-1">${inp('address', f.address, { ph: '大阪府大阪市阿倍野区…' })}<button class="b b-sec mt-0.5 shrink-0 !px-2" data-map title="Googleマップで開く">🗺</button></div>`, { req: true, cls: 'col-span-2' })}
    </div>`);
  const when = sec('② 訪問の希望日時', `
    <div class="grid grid-cols-2 gap-2">
      ${lbl(`希望日${b('when')}`, inp('date', f.date, { type: 'date', extra: `min="${today}"` }), { req: true })}
      ${lbl('開始時刻', `<select class="inp mt-0.5" data-f="start">${times.map((m) => `<option value="${m}" ${m === f.start ? 'selected' : ''}>${minToHHMM(m)}</option>`).join('')}</select>`, { req: true })}
    </div>
    <div class="flex items-center gap-1.5 flex-wrap"><span class="text-xs font-bold">所要時間</span>${DURATIONS.map((d) => `<button class="chip ${f.dur === d ? 'on' : ''}" data-dur="${d}">${d}分</button>`).join('')}
      <span class="text-xs text-slate-500">→ ${minToHHMM(f.start)}〜${minToHHMM(f.start + f.dur)}</span></div>`);
  const hearing = sec('③ ヒアリング', `
    <div><div class="text-xs font-bold">来電のきっかけ<span class="text-rose-600 font-bold ml-0.5" title="必須">＊</span>${b('flyer')}</div>
      <div class="flex items-center gap-2 mt-0.5"><div class="w-36 shrink-0">${inp('flyerId', f.flyerId, { ph: 'チラシID（N1019）' })}</div><div id="flyer-result" class="text-xs">${flyerResultHtml(f.flyerId)}</div></div>
      <div class="flex flex-wrap items-center gap-1 mt-1"><span class="text-xs text-slate-500">IDなし</span>${CHIRASHI.map((c, i) => (isFlyerIndex(i) ? '' : `<button class="chip ${f.chirashi === i ? 'on' : ''}" data-chirashi="${i}">${esc(c)}</button>`)).join('')}</div></div>
    <div><div class="text-xs font-bold">売りたいもの<span class="text-rose-600 font-bold ml-0.5" title="必須">＊</span>${b('wants')}</div>
      <div class="text-[11px] text-slate-500 mt-0.5">メイン商材</div>
      <div class="grid grid-cols-2 gap-1 mt-0.5">${MAIN_ITEMS.map((k) => `<div class="flex"><span class="w-14 shrink-0 flex items-center justify-center rounded-l border border-r-0 border-slate-400 bg-slate-100 text-xs font-bold">${k}</span>
        <select class="inp !rounded-l-none ${f.mainItems[k] ? 'sel' : ''}" data-main="${k}"><option value="0">(数量)</option>${MAIN_BANDS.map((b) => `<option value="${b.min}" ${f.mainItems[k] === b.min ? 'selected' : ''}>${b.label}</option>`).join('')}</select></div>`).join('')}</div>
      <div class="text-[11px] text-slate-500 mt-1.5">その他の商材</div>
      <div class="flex flex-wrap gap-1 mt-0.5">${CATEGORIES.map((c) => `<button class="chip ${f.cats.includes(c) ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <textarea class="inp mt-1" rows="4" data-f="wants" placeholder="ブランド・点数などの詳細（例: ヴィトン 3点、ロレックス 2本）">${esc(f.wants)}</textarea></div>
    <div class="grid grid-cols-2 gap-2">
      ${lbl(`当日の立会い${b('attendee')}`, `<select class="inp mt-0.5" data-f="attendee"><option value="">（未確認）</option>${ATTENDEES.map((a) => `<option ${a === f.attendee ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>`)}
      <div><div class="flex items-center justify-between gap-1"><span class="text-xs font-bold">大型品・その他の確認${b('large')}</span>${none('large', '特になし')}</div>${inp('large', f.large, { ph: '例: ゴルフクラブも売れるか' })}</div>
    </div>
    <div><div class="flex items-center justify-between gap-1"><span class="text-xs font-bold">訪問時の注意${b('notes')}</span>${none('notes', '特になし')}</div><textarea class="inp mt-0.5" rows="2" data-f="notes" placeholder="例: 1階エントランスで待ち合わせ。午前中が電話がつながりやすい">${esc(f.notes)}</textarea></div>`);
  const yn = (key, label, hint = '') => `<div title="${hint}"><div class="text-xs font-bold whitespace-nowrap">${label}${b(key)}</div><div class="flex gap-1 mt-0.5">${YESNO.map((o) => `<button class="b b-sec flex-1 !px-1 ${f[key] === o ? 'on' : ''}" data-yn="${key}|${o}">${o}</button>`).join('')}</div></div>`;
  const time = (key) => `<select class="inp" data-f="${key}"><option value="">（未確認）</option><option value="none" ${f[key] === 'none' ? 'selected' : ''}>指定なし</option>${CONTACT_TIMES.map((t) => `<option ${t === f[key] ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const notes = sec('④ 備考・補足など', `
    <div class="grid grid-cols-3 items-end gap-2">${yn('companion', 'ご同席者', '立ち会う人のほかに、同席する人がいるか')}${yn('parking', '駐車スペース')}${yn('nameplate', '表札')}</div>
    ${f.companion === 'あり' ? inp('companionNote', f.companionNote, { ph: 'ご同席者は誰ですか？（例: ご主人、娘様）' }) : ''}
    <div><div class="text-xs font-bold">前日確認の連絡時間${b('contact')}</div><div class="flex items-center gap-1.5 mt-0.5">${time('contactFrom')}<span>〜</span>${time('contactTo')}</div></div>`);
  return `<div id="checklist" class="sticky top-0 z-10">${checklistHtml(list)}</div>${customer}${when}${hearing}${notes}`;
}

export function hintHtml(found, applied, summary = null) {
  if (!found) return '';
  const d = (t) => { const x = new Date(t); return `${x.getFullYear()}/${x.getMonth() + 1}/${x.getDate()}`; };
  const buy = !summary ? '' : summary.count
    ? `<div class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 border-t border-amber-200 pt-1"><span>直近の買取 <b class="text-sm">${yen(summary.latest.total)}</b><span class="text-slate-500">（${d(summary.latest.at)}・${esc(summary.latest.items)}）</span></span><span>過去の依頼 <b class="text-sm">${summary.count}</b>回</span><span>総買取額 <b class="text-sm">${yen(summary.total)}</b></span></div>`
    : '<div class="mt-1 border-t border-amber-200 pt-1 text-slate-500">買取の実績はまだありません</div>';
  return `<div class="rounded-lg bg-amber-50 border border-amber-300 px-2 py-1 text-xs">
    <div class="flex justify-between items-center gap-2"><span>📇 <b>過去にご利用あり</b>：${esc(found.name)} 様（${esc(found.address)}）</span>
      ${applied ? '<span class="text-xs text-slate-500">反映済み</span>' : '<button class="b b-sec !min-h-0 !py-1 text-sm shrink-0" data-quote>引用</button>'}</div>${buy}</div>`;
}

// ---- 配車（候補・空き状況） ----------------------------------------------------------
// 今月の担当件数。女性のお客様なら女性の件数、男性のお客様なら全体の件数が、配分の基準なので太字にする
const statText = (st, gender) => (gender === 'f' ? `今月 女性<b class="text-slate-900">${st.female}</b>件・計${st.total}件` : `今月 計<b class="text-slate-900">${st.total}</b>件・女性${st.female}件`);
const starTitle = (gender) => (gender === 'f' ? '空いている営業のうち、女性のお客様の担当が今月最も少ない人（公平な配分）' : '空いている営業のうち、担当が今月最も少ない人（公平な配分）');
// 午後出社・午後半休の表示。働けない時間帯を、斜線で塗る
export const attTag = (att) => (att && (att.kind === 'pm' || att.kind === 'am') ? `<span class="rounded bg-slate-200 px-1 text-[10px] font-bold text-slate-700" title="${att.kind === 'pm' ? '午前は休み。午後から出社' : '午後は休み。午前のみ出社'}">${att.label}</span>` : '');
export function attShade(att, rowH) {
  if (!att || (att.kind !== 'pm' && att.kind !== 'am')) return '';
  const y = (m) => ((m - WORK_START) / SLOT_STEP) * rowH;
  const [top, height] = att.kind === 'pm' ? [0, y(att.from)] : [y(att.to), y(WORK_END) - y(att.to)];
  return `<div class="pointer-events-none absolute inset-x-0 z-20 flex items-start justify-center pt-1" style="top:${top}px;height:${height}px;background-image:repeating-linear-gradient(135deg,rgba(148,163,184,.45) 0,rgba(148,163,184,.45) 6px,rgba(241,245,249,.7) 6px,rgba(241,245,249,.7) 12px)"><span class="rounded bg-slate-600 px-1.5 py-0.5 text-[10px] font-bold text-white">${att.kind === 'pm' ? '午前休' : '午後半休'}</span></div>`;
}

// 得意分野のタグ。お客様の売りたいものと合うものは、緑で強調する
export const specTags = (userId, form) => {
  const list = specialtiesOf(userId);
  const hit = new Set(matchedSpecialties(list, form));
  return list.map((s) => `<span class="rounded px-1 text-[10px] ${hit.has(s) ? 'bg-emerald-100 font-bold text-emerald-800' : 'bg-slate-100 text-slate-600'}" ${hit.has(s) ? 'title="お客様の売りたいものと合います"' : ''}>${hit.has(s) ? '◎ ' : ''}${esc(s)}</span>`).join('');
};
const leaderTag = (u) => (isLeader(u) ? '<span class="ml-0.5 text-[9px] rounded bg-slate-200 px-1">L</span>' : '');

// 担当候補の1行（週表示用）。日別表示では、同じ情報を営業ごとの列の見出しに出すので、この一覧は出さない
function candidateRow(c, { selectedId, gender, form, showArea = false }) {
  const on = c.user.id === selectedId;
  const tag = (cls, t, title = '') => `<span class="rounded ${cls} text-[11px] font-bold px-1.5 py-0.5" ${title ? `title="${esc(title)}"` : ''}>${t}</span>`;
  return `
  <div class="rounded-lg border-2 px-2 py-1 ${c.absent ? 'bg-slate-100 opacity-60' : 'bg-white'} ${c.free ? 'cursor-pointer hover:border-teal-500' : c.absent ? '' : 'opacity-70'} ${on ? 'border-teal-600 ring-2 ring-teal-300' : 'border-slate-200'}" ${c.free ? `data-pick="${c.user.id}"` : ''}>
    <div class="grid grid-cols-[8rem_6rem_9.5rem_1fr] items-center gap-2 text-xs">
      <div class="flex items-center gap-1.5 truncate">${avatarHtml(c.user, 28)}<span class="truncate"><b class="text-sm">${esc(c.user.name)}</b> ${rankBadge(c.rank)}${leaderTag(c.user)} ${attTag(c.att)}${showArea ? `<span class="ml-1 text-[10px] text-slate-500">${esc(areaById(c.areaId)?.name ?? '')}</span>` : ''}</span></div>
      <div class="flex gap-1">${c.recommended ? tag('bg-amber-400 text-slate-900', '⭐', starTitle(gender)) : ''}${c.absent ? tag('bg-slate-600 text-white', '欠勤', 'この日は欠勤のため、担当に選べません') : c.free ? tag('bg-emerald-100 text-emerald-800', '空き') : tag('bg-rose-100 text-rose-700', '不可')}</div>
      <div class="text-slate-600">${statText(c.stats, gender)}</div>
      <div class="min-w-0 text-[11px] leading-tight text-slate-600" title="${esc(travelTitle(c.travel))}">${c.travel ? `<div class="truncate">${legHtml(c.travel.prev, 'prev')}</div>${c.travel.next ? `<div class="truncate">${legHtml(c.travel.next, 'next')}</div>` : ''}` : ''}</div>
    </div>
    <div class="mt-0.5 flex flex-wrap items-center gap-1 pl-9"><span class="text-[10px] text-slate-400">得意</span>${specTags(c.user.id, form)}</div>
    ${c.free || c.absent ? '' : `<div class="text-[11px] text-rose-600">${esc(conflictText(c.conflict))}</div>`}
  </div>`;
}

const WEEK_DAYS = ['日', '月', '火', '水', '木', '金', '土'];
const dayHead = (date) => { const [y, m, d] = date.split('-').map(Number); const w = new Date(y, m - 1, d).getDay(); return { md: `${m}/${d}`, w: WEEK_DAYS[w], cls: w === 0 ? 'text-rose-600' : w === 6 ? 'text-sky-600' : '' }; };

// 1週間の空きカレンダー。縦=開始時刻、横=日付、セル=空いている営業の人数。タップで希望日時に反映する。◀▶で1週間ずつ動かす
export function weekCalendarHtml({ week, form, today, names, canPrev }) {
  const first = dayHead(week[0].date);
  const last = dayHead(week[week.length - 1].date);
  const head = week.map((d) => { const h = dayHead(d.date); return `<th class="px-0.5 py-0.5 text-center text-xs font-bold leading-tight ${h.cls} ${d.date === form.date ? 'bg-teal-100' : ''}"><button class="w-full rounded hover:bg-slate-100 ${d.date < today ? 'opacity-40 cursor-not-allowed' : 'underline decoration-dotted'}" data-gotoday="${d.date}" ${d.date < today ? 'disabled' : ''} title="この日の予定を、営業ごとに見る">${h.md}<div class="text-[10px] font-normal leading-none">${h.w}${d.date === today ? '・今日' : ''}</div></button></th>`; }).join('');
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
      <button class="b b-sec !min-h-0 !py-1 text-sm" data-week="-7" ${canPrev ? '' : 'disabled'} title="前の週">◀</button>
      <div class="text-sm font-bold">${first.md}（${first.w}）〜 ${last.md}（${last.w}）<span class="font-normal text-xs text-slate-500 ml-2">${form.dur}分</span></div>
      <button class="b b-sec !min-h-0 !py-1 text-sm" data-week="7" title="次の週">▶</button></div>
    <table class="w-full table-fixed border-separate border-spacing-0"><thead><tr><th class="w-11"></th>${head}</tr></thead><tbody>${rows}</tbody></table>
    <div class="mt-0.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
      <span><b class="text-emerald-700">◎</b>空き人数 <b class="text-amber-700">△</b>残り1人 ×なし</span>
      ${pick && pick.freeIds.length ? `<span>${dayHead(form.date).md}（${dayHead(form.date).w}）${minToHHMM(form.start)}〜 <b class="text-slate-700">${esc(pick.freeIds.map((id) => names[id]).join('、'))}</b></span>` : ''}</div>
</div>`;
}

// 日別の表示。営業ごとの列に、その日の予定を時間軸で並べる。空いている枠を押すと、その営業・その時刻を選ぶ
const DAY_ROW = 26; // 30分あたりの高さ（px）
const DAY_SLOTS = (WORK_END - WORK_START) / SLOT_STEP;
const topOf = (m) => ((m - WORK_START) / SLOT_STEP) * DAY_ROW;

export function dayViewHtml({ cols: allCols, form, selectedId, canPrev, onlyFree }) {
  const cols = onlyFree ? allCols.filter((c) => c.free) : allCols;
  const h = DAY_SLOTS * DAY_ROW;
  const dh = dayHead(form.date);
  const grid = `grid-template-columns:2.25rem repeat(${cols.length},minmax(6.5rem,1fr));min-width:${2.25 + cols.length * 6.5}rem`;
  const end = form.start + form.dur;
  const head = cols.map((c) => {
    const tag = c.free ? 'button' : 'div';
    return `<${tag} class="block w-full px-1 py-0.5 text-center border-b ${c.user.id === selectedId ? 'bg-teal-100' : 'bg-slate-50'} ${c.free ? 'cursor-pointer hover:bg-teal-50' : c.absent ? 'opacity-70' : 'opacity-80'}" ${c.free ? `data-pick="${c.user.id}" title="この営業を担当にする"` : `title="${esc(conflictText(c.conflict))}"`}>
      <div>${avatarHtml(c.user, 28)}</div><b class="text-xs">${esc(c.user.name)}</b> ${rankBadge(c.rank)}${leaderTag(c.user)}${c.recommended ? `<span class="ml-0.5 rounded bg-amber-400 px-1 text-[10px] font-bold" title="${esc(starTitle(form.gender))}">⭐</span>` : ''}
      ${attTag(c.att) ? `<div>${attTag(c.att)}</div>` : ''}<div class="text-[10px] font-bold ${c.absent ? 'text-slate-600' : c.free ? 'text-emerald-700' : 'text-rose-600'}">${c.absent ? '欠勤' : `${minToHHMM(form.start)}〜 ${c.free ? '空き' : '不可'}`}</div></${tag}>`;
  }).join('');
  const axisCol = `<div class="relative sticky left-0 z-30 bg-white" style="height:${h}px">${Array.from({ length: DAY_SLOTS / 2 }, (_, i) => `<span class="absolute right-1 text-[10px] text-slate-400 -translate-y-1/2" style="top:${i * 2 * DAY_ROW}px">${WORK_START / 60 + i}:00</span>`).join('')}</div>`;
  const body = cols.map((c) => {
    const slots = Array.from({ length: DAY_SLOTS }, (_, i) => {
      const m = WORK_START + i * SLOT_STEP;
      const free = !c.absent && m + form.dur <= WORK_END && !conflictOf(c.blocks, m, m + form.dur, c.att);
      return `<button class="block w-full text-left ${free ? 'hover:bg-emerald-200/70 cursor-pointer' : 'cursor-not-allowed'}" style="height:${DAY_ROW}px" ${free ? `data-dcell="${c.user.id}|${m}" title="${esc(`${c.user.name} ${minToHHMM(m)}〜${minToHHMM(m + form.dur)} で選ぶ`)}"` : 'disabled'}></button>`;
    }).join('');
    const blocks = c.blocks.map((b) => `<div class="absolute inset-x-0.5 z-10 overflow-hidden rounded px-1 text-[10px] leading-[1.15] text-white ${blockCls(b)}" style="top:${topOf(b.start)}px;height:${topOf(b.end) - topOf(b.start) - 1}px" title="${esc(`${minToHHMM(b.start)}–${minToHHMM(b.end)} ${b.label}${b.place ? `（${b.place}）` : ''}（${blockKind(b)}）`)}"><b>${isTentativeBlock(b) ? '仮 ' : '確 '}${esc(b.label)}</b> ${minToHHMM(b.start)}–${minToHHMM(b.end)}${b.place ? `<br /><span class="opacity-90">${esc(b.place)}</span>` : ''}</div>`).join('');
    const sel = c.user.id === selectedId;
    const away = c.absent ? '<div class="absolute inset-0 z-20 flex items-start justify-center pt-2 pointer-events-none"><span class="rounded bg-slate-600 px-2 py-0.5 text-xs font-bold text-white">欠勤</span></div>' : '';
    const want = sel && !c.absent ? `<div class="absolute inset-x-0 z-20 pointer-events-none rounded border-2 ${c.free ? 'border-emerald-600 bg-emerald-400/25' : 'border-rose-500 bg-rose-400/25'}" style="top:${topOf(form.start)}px;height:${topOf(end) - topOf(form.start)}px"><span class="absolute -top-px right-0 rounded-bl bg-white/80 px-1 text-[9px] font-bold ${c.free ? 'text-emerald-700' : 'text-rose-600'}">希望 ${minToHHMM(form.start)}〜</span></div>` : '';
    return `<div class="relative border-l ${sel ? 'bg-teal-50/60' : ''}" style="height:${h}px;background-image:${c.absent ? 'repeating-linear-gradient(135deg,#e2e8f0 0,#e2e8f0 6px,#f1f5f9 6px,#f1f5f9 12px)' : `repeating-linear-gradient(to bottom,transparent 0,transparent ${DAY_ROW - 1}px,#e2e8f0 ${DAY_ROW - 1}px,#e2e8f0 ${DAY_ROW}px)`}">${slots}${blocks}${attShade(c.att, DAY_ROW)}${away}${want}</div>`;
  }).join('');
  return `<div class="rounded-lg border bg-white p-1.5">
    <div class="flex items-center justify-between gap-2 mb-1">
      <button class="b b-sec !min-h-0 !py-1 text-sm" data-day="-1" ${canPrev ? '' : 'disabled'} title="前の日">◀</button>
      <div class="text-sm font-bold">${dh.md}（${dh.w}）<span class="font-normal text-xs text-slate-500 ml-2">${form.dur}分 ${minToHHMM(form.start)}〜${minToHHMM(end)}</span></div>
      <button class="b b-sec !min-h-0 !py-1 text-sm" data-day="1" title="次の日">▶</button>
      <button class="chip ${onlyFree ? 'on' : ''}" data-onlyfree title="希望の時間に空いている営業だけを表示">空きのみ</button></div>
    ${cols.length ? `<div class="overflow-x-auto"><div class="grid" style="${grid}"><div class="border-b sticky left-0 z-30 bg-white"></div>${head}${axisCol}${body}</div></div>` : '<div class="py-6 text-center text-sm text-slate-400">この時間に空いている営業がいません</div>'}
    <div class="mt-0.5">${legendHtml()}<span class="text-[11px] text-slate-500">空いている枠を押すと、その営業・その時刻を選べます</span></div>
  </div>`;
}

// 住所からのエリア判定は「提案」。オペレーターがGoogleマップで正確な位置を確認して、営業エリアを確定する
const areaBanner = ({ proposal, confirmed, hasAddress }) => {
  if (!hasAddress) return '<div class="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-500">住所を入力するとエリアを確認できます</div>';
  const judge = !proposal ? '都道府県を判定できません' : proposal.outside ? `<b>${esc(proposal.pref)}</b>は対応エリア外` : `${esc(proposal.pref)} → <b>${esc(proposal.name)}</b>`;
  const btns = AREAS.map((a) => `<button class="chip ${confirmed?.id === a.id ? 'on' : ''}" data-area="${a.id}">${esc(a.name)}${proposal?.id === a.id ? '<span class="opacity-70 ml-0.5" title="住所からの判定">●</span>' : ''}</button>`).join('');
  const differ = confirmed && proposal?.id !== confirmed.id ? '<span class="text-[11px] text-amber-700">※住所の判定と異なる</span>' : '';
  return `<div class="rounded-lg border px-2 py-1.5 space-y-1 ${confirmed ? 'bg-teal-50 border-teal-300 text-teal-900' : 'bg-amber-50 border-amber-300 text-amber-900'}">
    <div class="flex justify-between items-center gap-2 text-xs"><span>${judge}</span><button class="b b-sec !min-h-0 !py-0.5 text-xs shrink-0 !text-slate-800" data-map>🗺 マップで確認</button></div>
    <div class="flex flex-wrap items-center gap-1.5"><span class="text-sm font-bold">${confirmed ? '✔ エリア確定：' : 'エリア確定：'}</span>${btns}${differ}</div></div>`;
};

// 営業の絞り込み。この案件に適任の営業（たとえば、AさんとBさん）だけを選んで、その人たちだけを表示する
function staffFilterHtml({ staff, staffSel, staffOpen }) {
  const names = staff.filter((c) => staffSel.includes(c.user.id)).map((c) => c.user.name);
  return `<div class="mb-1">
    <div class="flex flex-wrap items-center gap-2">
      <button class="chip ${staffSel.length ? 'on' : ''}" data-staffpanel>👥 営業を絞る ${staffOpen ? '▲' : '▼'}</button>
      <span class="text-xs ${staffSel.length ? 'font-bold text-teal-800' : 'text-slate-500'}">${staffSel.length ? `絞り込み中（${staffSel.length}名）：${names.map(esc).join('・')}` : `全員（${staff.length}名）を表示`}</span>
      ${staffSel.length ? '<button class="text-xs underline text-slate-500" data-staffclear>解除</button>' : ''}</div>
    ${staffOpen ? `<div class="mt-1 flex flex-wrap gap-1 rounded-lg border bg-white p-1.5">${staff.map((c) => `<button class="chip ${staffSel.includes(c.user.id) ? 'on' : ''} ${c.absent ? 'opacity-60' : ''}" data-staff="${c.user.id}" title="${c.absent ? 'この日は欠勤（担当には選べません）' : ''}">${esc(c.user.name)} ${esc(c.rank ?? '')}${c.att && c.att.kind !== 'present' ? `　${c.att.label}` : ''}</button>`).join('')}
      <span class="w-full text-[11px] text-slate-500">表示したい営業を選びます（複数可）。選んだ営業だけが、カレンダー・担当候補に出ます。</span></div>` : ''}
  </div>`;
}

// 営業の詳細（日別表示で、営業の枠を選んだときに出す）
const wan = (n) => `${Math.round(n / 10000).toLocaleString('ja-JP')}万円`;
const pctText = (x) => `${Math.round(x * 100)}%`;

function salesDetailHtml(d, { form, fairIndex, freeCount, area }) {
  const { user, month, fairness: f } = d;
  const end = form.start + form.dur;
  const ok = !d.conflict;
  const box = (title, body) => `<div class="min-w-0"><div class="mb-0.5 text-[11px] font-bold text-slate-500">${title}</div><div class="space-y-0.5">${body}</div></div>`;
  const bar = (rate, pace) => `<div class="relative h-1.5 rounded bg-slate-200"><div class="h-1.5 rounded ${rate >= pace ? 'bg-emerald-500' : 'bg-amber-400'}" style="width:${Math.min(100, rate * 100)}%"></div><div class="absolute -top-0.5 h-2.5 w-0.5 bg-slate-700" style="left:${Math.min(100, pace * 100)}%" title="今月の経過（${pctText(pace)}）"></div></div>`;
  const plans = d.blocks.length
    ? d.blocks.map((b) => `<div class="truncate" title="${esc(`${minToHHMM(b.start)}–${minToHHMM(b.end)} ${b.label}${b.place ? `（${b.place}）` : ''}`)}"><b>${minToHHMM(b.start)}–${minToHHMM(b.end)}</b> ${b.source === 'reservation' ? '📞' : ''}${esc(b.label)}${b.place ? `<span class="text-slate-500">　${esc(b.place)}</span>` : ''}</div>`).join('')
    : '<div class="text-slate-500">予定なし</div>';
  return `<div class="rounded-lg border-2 border-teal-600 bg-white p-2 text-xs">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">${avatarHtml(user, 48)}<div><div><b class="text-sm">${esc(user.name)}</b> ${rankBadge(d.rank)}${isLeader(user) ? '<span class="ml-1 text-[10px] rounded bg-slate-200 px-1.5 py-0.5">リーダー</span>' : ''}<span class="ml-2 text-slate-500">グループ${esc(user.group)}・${esc(area?.name ?? '')}</span> ${attTag(d.att)}</div>
        <div class="mt-0.5 flex flex-wrap items-center gap-1"><span class="text-[11px] text-slate-500">得意分野</span>${specTags(user.id, form)}</div></div></div>
      <div class="font-bold ${ok ? 'text-emerald-700' : 'text-rose-600'}">${dateLabel(form.date)} ${d.absent ? '欠勤（担当に選べません）' : `${minToHHMM(form.start)}〜${minToHHMM(end)}　${ok ? '空き' : `不可（${esc(conflictText(d.conflict))}）`}`}</div></div>
    <div class="mt-1.5 grid grid-cols-3 gap-3">
      ${box('今月の実績', `<div>訪問 <b>${month.visits}</b>件 ／ 成約 <b>${month.contracts}</b>件（${pctText(month.rate)}）</div>
        <div>売上 <b>${wan(month.amount)}</b> ／ 目標 ${wan(month.target)}</div>${bar(month.achieve, month.pace)}
        <div class="text-slate-500">達成 ${pctText(month.achieve)}（今月の経過 ${pctText(month.pace)}）　平均単価 ${wan(month.avg)}</div>`)}
      ${box('今月の担当件数', `<div>計 <b>${f.total}</b>件 ／ 女性 <b>${f.female}</b>件（${pctText(f.femaleShare)}）／ 男性 ${f.male}件</div>
        ${fairIndex ? `<div>空いている営業 ${freeCount}人のうち、${form.gender === 'f' ? '女性の' : ''}担当が <b>${fairIndex}番目に少ない</b></div>` : '<div class="text-slate-500">この時間は空きがないため、配分の順位なし</div>'}`)}
      ${box(`${dateLabel(form.date)}の予定`, `${plans}
        <div class="pt-0.5"><span class="text-slate-500">${form.dur}分で開始できる時刻：</span>${d.windows.length ? d.windows.map((w) => `<b>${minToHHMM(w.from)}${w.to > w.from ? `〜${minToHHMM(w.to)}` : ''}</b>`).join('、') : '<span class="text-rose-600">なし</span>'}</div>
        ${d.travel ? `<div class="text-[11px] leading-tight">${legHtml(d.travel.prev, 'prev')}${d.travel.next ? `<br />${legHtml(d.travel.next, 'next')}` : ''}</div>` : ''}`)}
    </div>
  </div>`;
}

export function dispatchHtml(x) {
  const { area, proposal, confirmed, hasAddress, ranking, calendar, form, selectedId, alt, missing, unasked, showOthers, detail, staff, staffSel, staffOpen } = x;
  const card = (c) => candidateRow(c, { selectedId, gender: form.gender, form });
  const freeList = ranking.inArea.filter((c) => c.free); // 空いている営業（担当が少ない順）。選んだ人が、その何番目か
  const freeCount = freeList.length;
  const fairIndex = freeList.findIndex((c) => c.user.id === selectedId) + 1;
  const sel = [...ranking.inArea, ...ranking.others].find((c) => c.user.id === selectedId);
  return `
  <div class="space-y-2">
    ${areaBanner({ proposal, confirmed, hasAddress })}
    ${ranking.inArea.length ? `
      <div><div class="flex items-center justify-between mb-0.5"><div class="text-sm font-bold">空き状況（${esc(area.name)}）</div>
        <div class="flex gap-1">${[['week', '週'], ['day', '日別']].map(([k, t]) => `<button class="chip ${calendar.mode === k ? 'on' : ''}" data-calmode="${k}">${t}</button>`).join('')}</div></div>
        ${staffFilterHtml({ staff, staffSel, staffOpen })}
        ${calendar.mode === 'day' ? dayViewHtml({ cols: [...ranking.inArea, ...(showOthers ? ranking.others : [])].sort((a, b) => a.user.id.localeCompare(b.user.id)), form, selectedId, canPrev: form.date > calendar.today, onlyFree: calendar.onlyFree }) : weekCalendarHtml(calendar)}</div>
      ${calendar.mode === 'day' && detail ? salesDetailHtml(detail, { form, fairIndex, freeCount, area: areaById(detail.areaId) }) : ''}
      <div><div class="text-sm font-bold mb-0.5 flex flex-wrap items-baseline gap-x-3">担当候補<span class="font-normal text-[11px] text-slate-500">${minToHHMM(form.start)}〜 の空き　⭐＝空いている中で、${form.gender === 'f' ? '女性のお客様の担当' : '担当'}が今月最も少ない人</span></div>
        <div class="space-y-1">${ranking.inArea.map(card).join('')}</div></div>` : ''}
    <div><button class="text-sm underline text-slate-500" data-toggle-others>${showOthers ? '▼' : '▶'} 他エリア（例外）</button>
      ${showOthers ? `<div class="space-y-1 mt-1">${ranking.others.map((c) => candidateRow(c, { selectedId, gender: form.gender, form, showArea: true })).join('')}</div>` : ''}</div>
    ${alt ? `<div class="rounded-lg bg-rose-50 border border-rose-300 px-3 py-1.5 text-xs text-rose-800">⚖ <b>${esc(alt.user.name)}</b>の方が女性担当が少ない（${alt.stats.female}件／選択中 ${sel.stats.female}件）</div>` : ''}
    ${x.editing ? `<div class="rounded-lg border-2 border-sky-500 bg-white p-2 space-y-1.5 sticky bottom-0">
      <div class="text-xs text-slate-500">変更前：${dateLabel(x.editing.date)} ${esc(x.editing.start)}〜${esc(x.editing.end)}　${esc(USERS.find((u) => u.id === x.editing.userId)?.name ?? '')}</div>
      ${sel ? `<div class="text-sm">変更後：担当（仮）<b class="text-base">${esc(sel.user.name)}</b>　${dateLabel(form.date)} ${minToHHMM(form.start)}〜${minToHHMM(form.start + form.dur)}</div>` : '<div class="text-sm text-slate-500">担当未定</div>'}
      ${missing.length ? `<div class="text-xs text-rose-600">未入力：${missing.map(esc).join('、')}</div>` : ''}
      <button class="b b-pri w-full ${isTentative(x.editing) || x.editBy === '配車係' ? '!bg-sky-600' : '!bg-rose-600'}" data-saveedit ${sel && !missing.length ? '' : 'disabled'}>${x.editBy === '配車係' ? `変更を保存する（${isTentative(x.editing) ? '仮確定' : '確定'}のまま）` : isTentative(x.editing) ? '変更を保存する（仮確定のまま）' : '変更を保存する（仮確定に戻り、配車係に知らされます）'}</button>
    </div>` : `<div class="rounded-lg border-2 border-teal-600 bg-white p-2 space-y-1.5 sticky bottom-0">
      ${sel ? `<div class="text-sm">担当（仮）：<b class="text-base">${esc(sel.user.name)}</b>　${esc(form.date)} ${minToHHMM(form.start)}〜${minToHHMM(form.start + form.dur)}　${esc(fullName(form) || 'お客様')} 様（${genderLabel(form.gender) || '性別未選択'}）</div>` : '<div class="text-sm text-slate-500">担当未定</div>'}
      ${missing.length ? `<div class="text-xs text-rose-600">未入力：${missing.map(esc).join('、')}</div>` : ''}
      ${unasked.length ? `<div class="text-xs text-amber-800">⚠ 聞き忘れ：${unasked.map(esc).join('、')}</div>` : ''}
      <button class="b b-pri w-full" data-confirm ${missing.length ? 'disabled' : ''} title="オペレーターは仮確定まで。担当の確定は配車係が行います">仮確定する</button>
    </div>`}
  </div>`;
}

export function doneHtml(r) {
  const u = USERS.find((x) => x.id === r.userId);
  return `
  <div class="rounded-lg border-2 border-emerald-500 bg-white p-5 space-y-3">
    <div class="text-2xl font-bold text-emerald-700">✅ 仮確定しました</div>
    <dl class="text-sm grid grid-cols-[7rem_1fr] gap-y-1">
      <dt class="text-slate-500">受付番号</dt><dd class="font-bold">${esc(r.receptionNo)}</dd>
      <dt class="text-slate-500">訪問日時</dt><dd class="font-bold">${esc(r.date)} ${esc(r.start)}〜${esc(r.end)}</dd>
      <dt class="text-slate-500">お客様</dt><dd class="font-bold">${esc(r.customer.name)} 様${genderParen(r.gender)}　${esc(r.customer.phone)}${r.customer.phone2 ? ` ／ ${esc(r.customer.phone2)}` : ''}</dd>
      <dt class="text-slate-500">訪問先</dt><dd>${esc(r.customer.address)}</dd>
      <dt class="text-slate-500">担当営業（仮）</dt><dd class="font-bold">${esc(u?.name)}（${esc(areaById(r.areaId)?.name ?? '例外対応')}）</dd>
    </dl>
    <p class="text-sm text-slate-600">お客様には、<b>訪問日時だけ</b>お伝えください。担当営業は仮の決定のため、お名前は伝えません。配車係が確定すると（主に翌々日の予定を、毎日確定します）、営業のタブレットの予定に追加されます。</p>
    <div class="flex gap-2"><button class="b b-pri" data-new>次の受付へ</button><button class="b b-sec" data-map>🗺 訪問先をGoogleマップで開く</button></div>
  </div>`;
}

// ---- 配車ボード・履歴 ----------------------------------------------------------------
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
export const dateLabel = (s) => { const [y, m, d] = s.split('-').map(Number); return `${m}/${d}（${WEEK[new Date(y, m - 1, d).getDay()]}）`; };

export const statusBadge = (r) => {
  if (isCancelled(r)) return '<span class="rounded bg-slate-300 text-slate-700 text-xs font-bold px-1.5 py-0.5">取消</span>';
  const changed = r.needsReview ? '<span class="ml-1 rounded bg-rose-600 text-white text-[10px] font-bold px-1 py-0.5" title="確定済みの予約が変更されて、仮確定に戻りました">確定→変更</span>' : '';
  const hold = r.holdNote && isTentative(r) ? `<span class="ml-1 rounded bg-violet-100 text-violet-800 text-[10px] font-bold px-1 py-0.5" title="${esc(r.holdNote)}">確認待ち</span>` : '';
  return `${isTentative(r) ? '<span class="rounded bg-amber-100 text-amber-800 text-xs font-bold px-1.5 py-0.5">仮確定</span>' : '<span class="rounded bg-emerald-100 text-emerald-800 text-xs font-bold px-1.5 py-0.5">確定</span>'}${hold}${changed}`;
};

// ---- 受付済みの予約の変更・取消 ------------------------------------------------------------
// お客様から折り返しの電話があったとき（やめる・日を変えたい）に、その番号で受け付け済みの予約を出す
export function openResHtml(list) {
  if (!list.length) return '';
  return `<div class="space-y-1"><div class="text-xs font-bold text-sky-800">📅 この電話番号で、すでに受け付けている予約（変更・取消はここから）</div>${list.map((r) => `<div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-300 bg-sky-50 px-2 py-1 text-xs">
    <span>📅 <b>受付済み</b>：${dateLabel(r.date)} ${esc(r.start)}〜${esc(r.end)}　${statusBadge(r)}　担当${isTentative(r) ? '（仮）' : ''}${esc(USERS.find((u) => u.id === r.userId)?.name ?? '')}</span>
    <span class="flex gap-1"><button class="b b-sec !min-h-0 !py-0.5 text-xs" data-chg="${r.id}">日時を変更</button><button class="b b-sec !min-h-0 !py-0.5 text-xs !text-rose-700" data-cancelres="${r.id}">取消</button></span></div>`).join('')}</div>`;
}

// 受付済みの予約を変更中の、入力欄の上の表示。仮確定の変更と、確定済みの変更で、何が起きるかを伝える
export function editBannerHtml(r, by = '') {
  const confirmed = !isTentative(r) && by !== '配車係'; // 配車係の変更は、状態を変えない（確定権がある）
  return `<div class="rounded-lg border-2 ${confirmed ? 'border-rose-500 bg-rose-50' : 'border-sky-500 bg-sky-50'} px-3 py-2 text-xs">
    <div class="flex items-center justify-between gap-2"><b class="text-sm ${confirmed ? 'text-rose-800' : 'text-sky-800'}">✎ 受付済みの予約を変更中</b><button class="underline text-slate-600" data-editcancel>変更をやめる</button></div>
    <div class="mt-0.5">${esc(r.receptionNo)}　${dateLabel(r.date)} ${esc(r.start)}〜${esc(r.end)}　${statusBadge(r)}</div>
    <div class="mt-0.5 ${confirmed ? 'font-bold text-rose-700' : 'text-slate-600'}">${confirmed ? '確定済みの予約です。変更を保存すると<u>仮確定に戻り</u>、配車係に知らされます。' : by === '配車係' ? `配車係の変更です。保存しても、状態は変わりません（${isTentative(r) ? '仮確定' : '確定'}のまま）。` : '仮確定のため、保存しても仮確定のままです（誰にも知らせません）。'}</div></div>`;
}

// 取消の確認（理由を選ぶ）
export function cancelModalHtml(r, reason) {
  return `<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"><div class="w-[28rem] max-w-[calc(100vw-2rem)] space-y-3 rounded-lg bg-white p-4 shadow-2xl">
    <b>受付を取り消します</b>
    <div class="text-sm"><b>${esc(r.customer.name)}</b> 様　${dateLabel(r.date)} ${esc(r.start)}〜${esc(r.end)}　担当${isTentative(r) ? '（仮）' : ''}${esc(USERS.find((u) => u.id === r.userId)?.name ?? '')}</div>
    ${isTentative(r) ? '' : '<p class="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">配車係が確定済みです。営業のタブレットの予定からも消えます。担当営業への連絡が必要な場合があります。</p>'}
    <label class="block text-sm font-bold">理由<select class="inp mt-1 font-normal" data-cancelreason>${CANCEL_REASONS.map((x) => `<option ${x === reason ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
    <div class="flex justify-end gap-2"><button class="b b-sec" data-cancelclose>戻る</button><button class="b b-pri !bg-rose-600" data-cancelgo>取り消す</button></div></div></div>`;
}

// ---- 電話番号ごとの受電履歴 ----------------------------------------------------------------
const KIND_CLS = { 新規受付: 'bg-emerald-100 text-emerald-800', 日時変更: 'bg-sky-100 text-sky-800', 変更: 'bg-sky-100 text-sky-800', 取消: 'bg-slate-300 text-slate-700', 問合せ: 'bg-amber-100 text-amber-800' };
const stampText = (ms) => { const d = new Date(ms); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export function callLogHtml(list, open) {
  if (!list.length) return '';
  const last = list[0];
  return `<div class="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs">
    <button class="flex w-full items-center justify-between gap-2 text-left" data-calllog><span>📞 <b>この電話番号の受電履歴（${list.length}件）</b><span class="ml-2 text-slate-500">直近 ${stampText(last.at)} ${esc(last.kind)}</span></span><span>${open ? '▲' : '▼'}</span></button>
    ${open ? `<div class="mt-1 max-h-48 space-y-1 overflow-y-auto border-t pt-1">${list.map((c) => `<div class="flex items-start gap-2"><span class="w-28 shrink-0 text-slate-500">${stampText(c.at)}</span><span class="shrink-0 rounded px-1 font-bold ${KIND_CLS[c.kind] ?? 'bg-slate-100'}">${esc(c.kind)}</span><span class="min-w-0 flex-1">${esc(c.note)}<span class="ml-1 text-slate-400">（${esc(c.by ?? '')}）</span></span></div>`).join('')}</div>` : ''}</div>`;
}
