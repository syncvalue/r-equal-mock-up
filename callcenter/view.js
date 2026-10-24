// コールセンター画面の描画（状態 → HTML）。イベント処理は callcenter.js。
import { esc } from '../src/format.js';
import { USERS, isLeader } from '../src/dashboard.js';
import { AREAS, areaById, areaOfUser, busyBlocks, conflictText, WORK_START, WORK_END, DURATIONS, SLOT_STEP } from '../src/dispatch.js';
import { minToHHMM } from '../src/reservations.js';
import { CHIRASHI, CATEGORIES, ATTENDEES, flyerOf, isFlyerIndex } from './master.js';
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
  <div class="flex items-center justify-between bg-amber-400 text-slate-900 rounded-t px-3 py-1.5 cursor-move select-none" data-drag><b class="text-sm">📞 通話デモ（文字起こし）</b><button class="text-lg leading-none px-1" data-demo="close" title="閉じる">✕</button></div>
  <div id="transcript" class="p-3"></div></div>`;

export function transcriptHtml({ lines, playing, finished }) {
  const bubble = (l) => l.who === 'sys'
    ? `<div class="text-center text-xs font-bold rounded bg-emerald-50 border border-emerald-300 text-emerald-800 px-2 py-1">${esc(l.text)}</div>`
    : `<div class="flex ${l.who === 'op' ? 'justify-start' : 'justify-end'}"><div class="max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${l.who === 'op' ? 'bg-slate-100' : 'bg-teal-50 border border-teal-200'}">
      <div class="text-[10px] text-slate-500">${l.who === 'op' ? 'オペレーター' : 'お客様'}</div>${esc(l.text)}
      ${l.got?.length ? `<div class="mt-1 flex flex-wrap gap-1">${l.got.map((k) => `<span class="rounded bg-amber-200 text-amber-900 text-[10px] font-bold px-1.5 py-0.5">✎ ${esc(FIELD_LABELS[k])}</span>`).join('')}</div>` : ''}</div></div>`;
  return `<div class="space-y-2">
    <div class="flex items-center justify-between gap-2"><span class="text-xs bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 font-bold">デモ</span>
      <div class="flex gap-1">${playing ? '<button class="b b-sec !min-h-0 !py-1 text-sm" data-demo="stop">⏸ 止める</button>' : `<button class="b b-pri !min-h-0 !py-1 text-sm" data-demo="start">${lines.length && !finished ? '▶ 再開' : '▶ 通話デモを再生'}</button>`}
        ${lines.length ? '<button class="b b-sec !min-h-0 !py-1 text-sm" data-demo="reset">やり直す</button>' : ''}</div></div>
    <p class="text-xs text-slate-500">会話が文字になり、お客様の発話から項目を拾って、画面の入力欄に自動でセットします（<span class="bg-amber-200 rounded px-1">黄色</span>が今入った項目）。エリアの確定と担当営業の選択も会話の中で行い、<b>電話を切ると同時に訪問を確定</b>します。</p>
    <div class="h-72 overflow-y-auto rounded border bg-white p-2 space-y-1.5" id="chat">${lines.length ? lines.map(bubble).join('') : '<p class="text-sm text-slate-400 text-center pt-24">「通話デモを再生」を押すと、受電の会話が始まります</p>'}
      ${playing ? '<div class="text-xs text-slate-400 animate-pulse">● 通話中…</div>' : ''}</div>
    <form class="flex gap-1" data-utter-form><input class="inp" data-utter placeholder="お客様の発話を入力して試す（例: 来週の月曜、午後3時でお願いします）" /><button class="b b-sec shrink-0" type="submit">反映</button></form>
  </div>`;
}

// ---- 入力フォーム ------------------------------------------------------------------
const lbl = (text, inner, { req = false, cls = '' } = {}) => `<label class="block ${cls}"><span class="text-sm font-bold">${text}${req ? '<span class="text-rose-600 text-xs ml-1">必須</span>' : ''}</span>${inner}</label>`;
const inp = (key, v, { type = 'text', ph = '', extra = '' } = {}) => `<input class="inp mt-1" data-f="${key}" type="${type}" value="${esc(v)}" placeholder="${esc(ph)}" ${extra} />`;
const sec = (title, body) => `<section class="bg-white rounded-lg shadow p-4 space-y-3"><h2 class="font-bold text-teal-800">${title}</h2>${body}</section>`;

export function flyerResultHtml(id) {
  if (!String(id ?? '').trim()) return '<span class="text-slate-400">IDを入力すると、どのチラシか自動で表示します</span>';
  const f = flyerOf(id);
  return f ? `<span class="text-emerald-700 font-bold">✔ ${esc(CHIRASHI[f.chirashi])}</span>` : '<span class="text-amber-700 font-bold">該当するIDがありません。お客様にIDをもう一度ご確認ください</span>';
}

export function formHtml(f, today) {
  const times = [];
  for (let m = WORK_START; m < WORK_END; m += SLOT_STEP) times.push(m);
  return `
  ${sec('① お客様', `
    <div class="grid grid-cols-2 gap-3">
      ${lbl('電話番号', inp('phone', f.phone, { type: 'tel', ph: '090-0000-0000' }), { req: true, cls: 'col-span-2' })}
      <div id="hint" class="col-span-2"></div>
      ${lbl('お名前', inp('name', f.name, { ph: '山田 太郎' }), { req: true })}${lbl('フリガナ', inp('kana', f.kana, { ph: 'ヤマダ タロウ' }))}
    </div>
    <div><div class="text-sm font-bold">性別<span class="text-rose-600 text-xs ml-1">必須</span></div>
      <div class="flex gap-2 mt-1">${Object.entries(GENDER).map(([k, v]) => `<button class="b b-sec flex-1 text-lg ${f.gender === k ? 'on' : ''}" data-gender="${k}">${v}</button>`).join('')}</div>
      <p class="text-xs text-slate-500 mt-1">担当営業の公平な配分に使います（女性のお客様は、特定の営業に偏らないようにします）。</p></div>
    <div class="grid grid-cols-3 gap-3">
      ${lbl('郵便番号', inp('zip', f.zip, { ph: '545-6016' }))}
      ${lbl('訪問先の住所（都道府県から）', `<div class="flex gap-1">${inp('address', f.address, { ph: '大阪府大阪市阿倍野区…' })}<button class="b b-sec mt-1 shrink-0" data-map title="Googleマップで開く">🗺</button></div>`, { req: true, cls: 'col-span-2' })}
    </div>`)}
  ${sec('② ヒアリング', `
    <div><div class="text-sm font-bold">何を見て電話してきましたか？<span class="text-rose-600 text-xs ml-1">必須</span></div>
      <div class="mt-1">${lbl('チラシに印刷されているIDをお聞きください', inp('flyerId', f.flyerId, { ph: '例: N1019' }))}<div id="flyer-result" class="text-sm mt-1">${flyerResultHtml(f.flyerId)}</div></div>
      <div class="text-xs text-slate-500 mt-2">チラシ以外（IDがない場合）</div>
      <div class="flex flex-wrap gap-1.5 mt-1">${CHIRASHI.map((c, i) => (isFlyerIndex(i) ? '' : `<button class="chip ${f.chirashi === i ? 'on' : ''}" data-chirashi="${i}">${esc(c)}</button>`)).join('')}</div></div>
    <div><div class="text-sm font-bold">何を売りたいですか？<span class="text-rose-600 text-xs ml-1">必須</span></div>
      <div class="flex flex-wrap gap-1.5 mt-1">${CATEGORIES.map((c) => `<button class="chip ${f.cats.includes(c) ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      ${inp('wants', f.wants, { ph: '点数・ブランドなどの詳細（例: ヴィトン 3点、ロレックス 2本）' })}</div>
    <div class="grid grid-cols-2 gap-3">
      ${lbl('当日の立会い', `<select class="inp mt-1" data-f="attendee">${ATTENDEES.map((a) => `<option ${a === f.attendee ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>`)}
      ${lbl('大型品・その他の確認', inp('large', f.large, { ph: '例: ゴルフクラブも売れるか質問あり' }))}
    </div>
    ${lbl('訪問時の注意（営業のタブレットに表示されます）', `<textarea class="inp mt-1" rows="2" data-f="notes" placeholder="例: 1階エントランスで待ち合わせ。午前中が電話がつながりやすい">${esc(f.notes)}</textarea>`)}`)}
  ${sec('③ 訪問の希望日時', `
    <div class="grid grid-cols-2 gap-3">
      ${lbl('希望日', inp('date', f.date, { type: 'date', extra: `min="${today}"` }), { req: true })}
      ${lbl('開始時刻', `<select class="inp mt-1" data-f="start">${times.map((m) => `<option value="${m}" ${m === f.start ? 'selected' : ''}>${minToHHMM(m)}</option>`).join('')}</select>`, { req: true })}
    </div>
    <div><div class="text-sm font-bold">所要時間（目安） <span class="font-normal text-slate-500">→ ${minToHHMM(f.start)}〜${minToHHMM(f.start + f.dur)}</span></div>
      <div class="flex gap-1.5 mt-1">${DURATIONS.map((d) => `<button class="chip ${f.dur === d ? 'on' : ''}" data-dur="${d}">${d}分</button>`).join('')}</div></div>`)}`;
}

export function hintHtml(found, applied) {
  if (!found) return '';
  return `<div class="rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-sm flex justify-between items-center gap-2">
    <span>📇 <b>過去にご利用あり</b>：${esc(found.name)} 様（${esc(found.address)}）</span>
    ${applied ? '<span class="text-xs text-slate-500">反映済み</span>' : '<button class="b b-sec !min-h-0 !py-1 text-sm" data-quote>お客様情報を引用</button>'}</div>`;
}

// ---- 配車（候補・空き状況） ----------------------------------------------------------
const share = (s) => `${Math.round(s.femaleShare * 100)}%`;

function statsLine(c, maxFemale) {
  const w = maxFemale ? (c.stats.female / maxFemale) * 100 : 0;
  return `<div class="text-xs text-slate-600">今月の担当 ${c.stats.total}件（女性 <b>${c.stats.female}件</b>・${share(c.stats)}）
    <div class="h-1.5 w-40 rounded bg-slate-200 mt-0.5"><div class="h-1.5 rounded bg-rose-400" style="width:${w}%"></div></div></div>`;
}

function candidateCard(c, { selectedId, gender, req, maxFemale }) {
  const on = c.user.id === selectedId;
  const reason = gender === 'f' ? `女性のお客様の担当が今月${c.stats.female}件で、空いている候補の中で最も少ない` : `今月の担当が${c.stats.total}件で、空いている候補の中で最も少ない`;
  return `
  <div class="rounded-lg border-2 p-3 space-y-1.5 bg-white ${c.free ? 'cursor-pointer hover:border-teal-500' : 'opacity-70'} ${on ? 'border-teal-600 ring-2 ring-teal-300' : 'border-slate-200'}" ${c.free ? `data-pick="${c.user.id}"` : ''}>
    <div class="flex justify-between items-start gap-2">
      <div><b class="text-base">${esc(c.user.name)}</b>${isLeader(c.user) ? '<span class="ml-1 text-[10px] rounded bg-slate-200 px-1.5 py-0.5">リーダー</span>' : ''}
        <span class="ml-1 text-xs text-slate-500">${esc(areaById(c.areaId)?.name ?? '')}</span></div>
      <div class="flex gap-1 shrink-0">${c.recommended ? '<span class="rounded bg-amber-400 text-slate-900 text-xs font-bold px-2 py-0.5">⭐ おすすめ</span>' : ''}
        ${c.free ? '<span class="rounded bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5">空き</span>' : '<span class="rounded bg-rose-100 text-rose-700 text-xs font-bold px-2 py-0.5">不可</span>'}
        ${on ? '<span class="rounded bg-teal-600 text-white text-xs font-bold px-2 py-0.5">選択中</span>' : ''}</div></div>
    ${statsLine(c, maxFemale)}
    ${c.recommended ? `<div class="text-xs text-amber-700 font-bold">${reason}</div>` : ''}
    ${c.free ? '' : `<div class="text-xs text-rose-600">${esc(conflictText(c.conflict))}</div>`}
    ${strip(c.blocks, req)}
  </div>`;
}

const WEEK_DAYS = ['日', '月', '火', '水', '木', '金', '土'];
const dayHead = (date) => { const [y, m, d] = date.split('-').map(Number); const w = new Date(y, m - 1, d).getDay(); return { md: `${m}/${d}`, w: WEEK_DAYS[w], cls: w === 0 ? 'text-rose-600' : w === 6 ? 'text-sky-600' : '' }; };

// 1週間の空きカレンダー。縦=開始時刻、横=日付、セル=空いている営業の人数。タップで希望日時に反映する。◀▶で1週間ずつ動かす
export function weekCalendarHtml({ week, form, today, names, canPrev }) {
  const first = dayHead(week[0].date);
  const last = dayHead(week[week.length - 1].date);
  const head = week.map((d) => { const h = dayHead(d.date); return `<th class="px-0.5 py-1 text-center font-bold ${h.cls} ${d.date === form.date ? 'bg-teal-100' : ''}">${h.md}<div class="text-[10px] font-normal">${h.w}${d.date === today ? '・今日' : ''}</div></th>`; }).join('');
  const rows = week[0].slots.map((_, i) => `<tr><th class="pr-1 text-right text-[11px] font-normal text-slate-500 whitespace-nowrap">${minToHHMM(week[0].slots[i].start)}</th>${week.map((d) => {
    const s = d.slots[i];
    const n = s.freeIds.length;
    const past = d.date < today;
    const on = d.date === form.date && s.start === form.start;
    const tone = n === 0 || past ? 'bg-slate-100 text-slate-400' : n === 1 ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200';
    const who = s.freeIds.map((id) => names[id]).join('、');
    return `<td class="p-0.5"><button class="w-full rounded text-xs font-bold py-1 ${tone} ${on ? 'ring-2 ring-teal-600 !bg-teal-600 !text-white' : ''}" data-cell="${d.date}|${s.start}" ${n === 0 || past ? 'disabled' : ''} title="${esc(n ? `${dayHead(d.date).md} ${minToHHMM(s.start)}〜 空き: ${who}` : '空きなし')}">${n === 0 || past ? '×' : n === 1 ? '△1' : `◎${n}`}</button></td>`;
  }).join('')}</tr>`).join('');
  const pick = week.find((d) => d.date === form.date)?.slots.find((s) => s.start === form.start);
  return `<div class="rounded-lg border bg-white p-2">
    <div class="flex items-center justify-between gap-2 mb-1">
      <button class="b b-sec !min-h-0 !py-1 text-sm" data-week="-7" ${canPrev ? '' : 'disabled'}>◀ 前の週</button>
      <div class="text-sm font-bold">${first.md}（${first.w}）〜 ${last.md}（${last.w}）<span class="font-normal text-xs text-slate-500 ml-2">${form.dur}分で訪問した場合</span></div>
      <button class="b b-sec !min-h-0 !py-1 text-sm" data-week="7">次の週 ▶</button></div>
    <table class="w-full table-fixed border-separate border-spacing-0"><thead><tr><th class="w-11"></th>${head}</tr></thead><tbody>${rows}</tbody></table>
    <div class="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <span><b class="text-emerald-700">◎n</b> 空きがn人 ／ <b class="text-amber-700">△1</b> 残り1人 ／ × 空きなし　※開始時刻（営業の人数）</span>
      ${pick && pick.freeIds.length ? `<span>選択中 ${dayHead(form.date).md}（${dayHead(form.date).w}）${minToHHMM(form.start)}〜：<b class="text-slate-700">${esc(pick.freeIds.map((id) => names[id]).join('、'))}</b></span>` : ''}</div>
</div>`;
}

// 住所からのエリア判定は「提案」。オペレーターがGoogleマップで正確な位置を確認して、営業エリアを確定する
const areaBanner = ({ proposal, confirmed, hasAddress }) => {
  if (!hasAddress) return '<div class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-500">訪問先の住所を入力すると、Googleマップで位置を確認して、営業エリアを確定できます。</div>';
  const judge = !proposal ? '住所から都道府県を判定できません（都道府県から入力すると判定します）' : proposal.outside ? `<b>${esc(proposal.pref)}</b>は対応エリア外です（例外対応の場合は、エリアを選んでください）` : `住所の判定：<b>${esc(proposal.name)}</b>（${esc(proposal.pref)}）`;
  const btns = AREAS.map((a) => `<button class="chip ${confirmed?.id === a.id ? 'on' : ''}" data-area="${a.id}">${esc(a.name)}${proposal?.id === a.id ? '<span class="opacity-70 text-xs ml-1">住所の判定</span>' : ''}</button>`).join('');
  const differ = confirmed && proposal?.id !== confirmed.id ? '<span class="text-xs text-amber-700 ml-2">※住所の判定と異なります（マップの位置で確定）</span>' : '';
  return `<div class="rounded-lg border px-3 py-2 space-y-1.5 ${confirmed ? 'bg-teal-50 border-teal-300 text-teal-900' : 'bg-amber-50 border-amber-300 text-amber-900'}">
    <div class="flex justify-between items-center gap-2 text-sm"><span>${judge}</span><button class="b b-sec !min-h-0 !py-1 text-sm shrink-0 !text-slate-800" data-map>🗺 Googleマップで位置を確認</button></div>
    <div class="text-sm font-bold">${confirmed ? `✔ 営業エリア確定：<span class="text-base">${esc(confirmed.name)}</span>${differ}` : 'Googleマップで位置を確認して、営業エリアを選んで確定してください'}</div>
    <div class="flex flex-wrap gap-1.5">${btns}</div></div>`;
};

export function dispatchHtml(x) {
  const { area, proposal, confirmed, hasAddress, ranking, calendar, form, selectedId, alt, missing, showOthers } = x;
  const req = (c) => ({ start: form.start, end: form.start + form.dur, free: c.free });
  const maxFemale = Math.max(1, ...[...ranking.inArea, ...ranking.others].map((c) => c.stats.female));
  const card = (c) => candidateCard(c, { selectedId, gender: form.gender, req: req(c), maxFemale });
  const sel = [...ranking.inArea, ...ranking.others].find((c) => c.user.id === selectedId);
  return `
  <div class="space-y-3">
    ${areaBanner({ proposal, confirmed, hasAddress })}
    ${ranking.inArea.length ? `
      <div><div class="text-sm font-bold mb-1">候補日を選ぶ（${esc(area.name)}の営業の空き状況）<span class="font-normal text-xs text-slate-500 ml-2">お客様の希望日が埋まっていたら、前後の日をご提案ください</span></div>${weekCalendarHtml(calendar)}</div>
      <div><div class="text-sm font-bold mb-1">担当の候補（${esc(area.name)}）<span class="font-normal text-xs text-slate-500 ml-2">▮灰=既存の予定 ▮紺=コールセンター確定 □緑/赤=希望の時間帯</span></div>
        <div class="px-3">${axis()}</div>
        <div class="space-y-2">${ranking.inArea.map(card).join('')}</div></div>` : ''}
    <div><button class="text-sm underline text-slate-500" data-toggle-others>${showOthers ? '▼' : '▶'} 他エリアの営業から選ぶ（例外対応）</button>
      ${showOthers ? `<div class="px-3 mt-1">${axis()}</div><div class="space-y-2">${ranking.others.map(card).join('')}</div>` : ''}</div>
    ${alt ? `<div class="rounded-lg bg-rose-50 border border-rose-300 px-3 py-2 text-sm text-rose-800">⚖ 公平性の注意：<b>${esc(alt.user.name)}</b>の方が、女性のお客様の今月の担当が少ない（${alt.stats.female}件 ／ 選択中 ${sel.stats.female}件）です。変更する理由がなければ、${esc(alt.user.name)}を選んでください。</div>` : ''}
    <div class="rounded-lg border-2 border-teal-600 bg-white p-3 space-y-2 sticky bottom-0">
      ${sel ? `<div class="text-sm">担当：<b class="text-lg">${esc(sel.user.name)}</b>　${esc(form.date)} ${minToHHMM(form.start)}〜${minToHHMM(form.start + form.dur)}　${esc(form.name || 'お客様')} 様（${genderLabel(form.gender) || '性別未選択'}）</div>` : '<div class="text-sm text-slate-500">担当の営業が決まっていません。</div>'}
      ${missing.length ? `<div class="text-xs text-rose-600">未入力：${missing.map(esc).join('、')}</div>` : ''}
      <button class="b b-pri w-full text-lg" data-confirm ${missing.length ? 'disabled' : ''}>この内容で訪問を確定する</button>
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
