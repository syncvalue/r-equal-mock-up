// コールセンター 受付・配車画面（ダミー・PC想定）。受電内容を聞き取り、訪問先のエリアの営業から、
// 希望日時に空いていて、女性のお客様の担当が偏らない人を選んで、訪問を確定する。確定した予約は営業アプリの予定に出る。
import { EVENTS } from '../src/schedule.js';
import { USERS } from '../src/dashboard.js';
import { areaById, areaOfAddress, locateAddress, rankCandidates, findWeekSlots, fairnessStats, fairerAlternative } from '../src/dispatch.js';
import { RESERVATION_KEY, addReservation, loadReservations, removeReservation, nextReceptionNo, minToHHMM, ymdOf } from '../src/reservations.js';
import { RESET_CONFIRM, clearTransactions } from '../src/store.js';
import { initTheme, themeToggleHtml } from '../src/theme.js';
import { esc } from '../src/format.js';
import { OPERATORS, blankMain, joinName, splitName, flyerOf, isFlyerIndex, normalizeFlyerId, triggerText, contactText } from './master.js';
import { boardHtml, dispatchHtml, doneHtml, formHtml, hintHtml, mapUrl, genderLabel, transcriptHtml, demoWindowHtml, checklistHtml, badgeHtml, dateLabel, flyerResultHtml } from './view.js';
import { missingFields, companionText, wantsText, hearingChecklist, REQUIRED_CHECKS, fullName, fullKana, profileText } from './intake.js';
import { DEMO_SCRIPT, extractFromUtterance, changedFields } from './transcript.js';

const $ = (s) => document.querySelector(s);
const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 保存できなくても動作は継続（モック） */ } };
const addDays = (n) => { const d = new Date(); return ymdOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
// 日付が表示中の1週間に入っていればそのまま、外れていればその日を先頭にする（今日より前にはしない）
const weekStartFor = (date) => {
  const [y, m, d] = weekStart.split('-').map(Number);
  const end = ymdOf(new Date(y, m - 1, d + 6));
  const today = ymdOf(new Date());
  return date >= weekStart && date <= end ? weekStart : date < today ? today : date;
};
const shiftDay = (date, n) => { const [y, m, d] = date.split('-').map(Number); const next = ymdOf(new Date(y, m - 1, d + n)); const today = ymdOf(new Date()); return next < today ? today : next; };
const shiftWeek = (n) => { const [y, m, d] = weekStart.split('-').map(Number); const next = ymdOf(new Date(y, m - 1, d + n)); const today = ymdOf(new Date()); return next < today ? today : next; };
const digits = (s) => String(s ?? '').replace(/\D/g, '');

const blankForm = () => ({
  phone: '', phone2: '', lastName: '', firstName: '', lastKana: '', firstKana: '', gender: '', genderEst: false, age: '', ageEst: '', zip: '', address: '', areaId: null, areaAddr: '', chirashi: null, flyerId: '', cats: [], mainItems: blankMain(), wants: '', attendee: '', whenAsked: false, large: '', notes: '', companion: '', companionNote: '', parking: '', nameplate: '', contactFrom: '', contactTo: '',
  date: addDays(1), start: 10 * 60, dur: 90, userId: null,
});

let tab = 'new';
let operator = pref('rq-mock-cc-operator', OPERATORS[0]);
let form = blankForm();
let done = null; // 確定した直後の予約（確定画面を表示している間）
let quoted = false; // 過去のお客様情報を引用済みか
let showOthers = false;
let calMode = 'week'; // 空きカレンダーの表示: week=週 / day=日別（営業ごとの列）
let weekStart = addDays(0); // 空きカレンダーの先頭の日（1週間ずつ動かす）
let boardDate = addDays(1);
let toast = '';
let lines = []; // 文字起こし（{ who, text, got: 入力欄にセットした項目 }）
let playing = false;
let finished = false;
let scriptPos = 0; // 台本の進み位置（手で入力した発話は数えない）
let timer = null;
let demoOpen = false; // 通話デモのウィンドウ
let demoPos = { x: Math.max(8, window.innerWidth - 26 * 16 - 16), y: 64 };

// 電話番号が一致する、過去のお客様（既存の訪問予定・コールセンターの予約から探す）
function findPast(f) {
  const mine = [f.phone, f.phone2].map(digits).filter((d) => d.length >= 10);
  if (!mine.length) return null;
  const fromEvents = EVENTS.map((e) => e.customer);
  const fromRes = loadReservations().map((r) => r.customer);
  return [...fromRes, ...fromEvents].find((c) => [c.phone, c.phone2].some((p) => mine.includes(digits(p)))) ?? null;
}

function compute() {
  const reservations = loadReservations();
  // 住所からの判定は提案。オペレーターがGoogleマップで確認して選んだエリア（confirmed）が、その住所のものであれば、それを使う
  const proposal = areaOfAddress(form.address);
  const confirmed = form.areaId && form.areaAddr === form.address.trim() ? areaById(form.areaId) : null;
  const area = confirmed ?? proposal;
  const here = area?.lat != null ? locateAddress(form.address, area) : null; // 今回のお客様の住所の位置（概算）。前のアポからの距離に使う
  const ranking = rankCandidates({ gender: form.gender, areaId: area?.id ?? null, date: form.date, start: form.start, dur: form.dur, reservations, here });
  const all = [...ranking.inArea, ...ranking.others];
  const manual = all.find((c) => c.user.id === form.userId && c.free);
  const selected = manual ?? ranking.inArea.find((c) => c.recommended) ?? null; // 手動で選ばなければ、おすすめを自動で選ぶ
  const today = ymdOf(new Date());
  const calendar = ranking.inArea.length
    ? { week: findWeekSlots({ userIds: ranking.inArea.map((c) => c.user.id), startDate: weekStart, dur: form.dur, reservations }), form, today, names: Object.fromEntries(USERS.map((u) => [u.id, u.name])), canPrev: weekStart > today, mode: calMode, hasHere: Boolean(here) }
    : null;
  const missing = missingFields(form, { areaConfirmed: Boolean(confirmed), selected, today: ymdOf(new Date()) });
  return {
    area, proposal, confirmed, hasAddress: Boolean(form.address.trim()), ranking, calendar, form, selectedId: selected?.user.id ?? null, showOthers: showOthers || area?.outside,
    alt: fairerAlternative(form.gender, selected, ranking.inArea), missing, selected, reservations,
    unasked: hearingChecklist(form).filter((x) => !x.asked && !REQUIRED_CHECKS.has(x.key)).map((x) => x.label),
  };
}

function confirmReservation() {
  const x = compute();
  if (x.missing.length || !x.selected) return;
  const reservations = x.reservations;
  const past = findPast(form);
  const area = x.confirmed;
  const center = locateAddress(form.address, area) ?? area; // 予定の地図表示は、住所の概算位置で代用（モック）
  const record = {
    id: `RS-${Date.now().toString(36).toUpperCase()}`, receptionNo: nextReceptionNo(reservations), receivedAt: new Date().toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }),
    operator, userId: x.selected.user.id, date: form.date, start: minToHHMM(form.start), end: minToHHMM(form.start + form.dur), apType: past ? '再' : '新',
    gender: form.gender, areaId: area.id, lat: center.lat, lng: center.lng, flyerId: form.flyerId ? normalizeFlyerId(form.flyerId) : null, chirashi: triggerText(form.chirashi, flyerOf(form.flyerId)?.id),
    hearing: {
      trigger: triggerText(form.chirashi, flyerOf(form.flyerId)?.id), attendee: form.attendee || '未確認', wants: wantsText(form), mainItems: { ...form.mainItems },
      large: form.large.trim() || '未確認', notes: form.notes.trim() || '未確認',
      profile: profileText(form, genderLabel), companion: companionText(form), parking: form.parking || '未確認', nameplate: form.nameplate || '未確認', contact: contactText(form.contactFrom, form.contactTo),
    },
    customer: {
      name: fullName(form), lastName: form.lastName.trim(), firstName: form.firstName.trim(), kana: fullKana(form), lastKana: form.lastKana.trim(), firstKana: form.firstKana.trim(),
      phone: form.phone.trim(), phone2: form.phone2.trim(), zip: form.zip.trim(), address: form.address.trim(),
    },
  };
  addReservation(record);
  stopDemo();
  done = record;
  render();
}

// ---- 通話の文字起こし（デモ） ---------------------------------------------------------------
const FLASH = { mainItems: '[data-main].sel', companion: '[data-yn^="companion|"].on', parking: '[data-yn^="parking|"].on', nameplate: '[data-yn^="nameplate|"].on', flyerId: '[data-f="flyerId"]', gender: '[data-gender].on', chirashi: '[data-chirashi].on', cats: '[data-cat].on', start: '[data-f="start"]', dur: '[data-dur].on' };
function flashFields(keys) {
  keys.forEach((k) => document.querySelectorAll(FLASH[k] ?? `[data-f="${k}"]`).forEach((el) => {
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    if (k === 'phone' || k === 'lastName') el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }));
}

// 発話を1つ追加し、お客様の発話なら項目を拾って入力欄にセットする
function addUtterance(who, text) {
  let got = [];
  if (who === 'cu') {
    const patch = extractFromUtterance(text, form, new Date(), form.dur);
    got = changedFields(patch, form);
    if (got.length) {
      form = { ...form, ...patch };
      if (patch.phone || patch.phone2) quoted = false;
      if (patch.flyerId) form = withFlyer(form, patch.flyerId);
      if (patch.date) weekStart = weekStartFor(patch.date);
      if (patch.date || patch.start !== undefined) form = { ...form, whenAsked: true };
    }
  }
  lines = [...lines, { who, text, got }];
  if (got.length) refresh();
  renderTranscript();
  flashFields(got);
}

// 台本の {area}{sales}{when} を、いまの入力内容の名前に置き換える
function fillScript(text) {
  const x = compute();
  return text.replace('{area}', x.area?.name ?? 'ご担当エリア').replace('{sales}', x.selected?.user.name ?? '担当').replace('{when}', `${dateLabel(form.date)} ${minToHHMM(form.start)}`);
}
const addSystem = (text) => { lines = [...lines, { who: 'sys', text, got: [] }]; renderTranscript(); };

// マップで位置を確認した → 住所の判定のエリアで、営業エリアを確定する
function confirmArea() {
  const p = compute().proposal;
  if (!p?.id) { addSystem('住所からエリアを判定できませんでした。エリアを選んでください'); return; }
  form = { ...form, areaId: p.id, areaAddr: form.address.trim() };
  renderDispatch();
  document.querySelectorAll('[data-area].on').forEach((el) => { el.classList.add('flash'); });
}

// 電話を切る。確定はしない（カレンダーの枠と担当を最終的に選ぶのは、オペレーター）。会話から決まった候補は、あらかじめ選んである
function hangUp() {
  playing = false; finished = true;
  const missing = compute().missing;
  addSystem(missing.length ? `通話終了。未入力：${missing.join('、')}` : '通話終了。カレンダーの枠と担当を確認して、「訪問を確定する」を押してください');
}

function stopDemo() { clearTimeout(timer); playing = false; }
// 台本を1つ進める。自動再生は次までの待ち時間（ミリ秒）を返し、終わりなら null。manual=「次の発話」ボタン（電話を切る発話は、待たずに通話を終える）
function advance(manual) {
  if (scriptPos >= DEMO_SCRIPT.length || done || finished) return null;
  const step = DEMO_SCRIPT[scriptPos];
  scriptPos += 1;
  addUtterance(step.who, fillScript(step.text));
  if (step.action === 'confirmArea') confirmArea();
  if (step.action === 'hangup') {
    if (manual) hangUp(); else timer = setTimeout(hangUp, 1500);
    return null;
  }
  return 1800 + step.text.length * 25;
}
function playNext() {
  const wait = advance(false);
  if (wait !== null) timer = setTimeout(playNext, wait);
}
// 1発話ずつ手で進める（自動再生中なら、止めてから進める）
function stepDemo() {
  stopDemo();
  advance(true);
  renderTranscript();
}
function startDemo() {
  if (done) return;
  if (finished) { lines = []; finished = false; scriptPos = 0; }
  playing = true; renderTranscript();
  timer = setTimeout(playNext, 400);
}
function resetDemo() { stopDemo(); lines = []; finished = false; scriptPos = 0; form = blankForm(); weekStart = addDays(0); quoted = false; refresh(); renderTranscript(); }

function renderTranscript() {
  const el = $('#transcript');
  if (!el) return;
  const typed = $('[data-utter]')?.value ?? '';
  el.innerHTML = transcriptHtml({ lines, playing, finished, pos: scriptPos, total: DEMO_SCRIPT.length });
  const input = $('[data-utter]');
  if (input) input.value = typed;
  const chat = $('#chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

// ---- 描画 -------------------------------------------------------------------------
function renderDispatch() {
  const el = $('#dispatch');
  if (!el) return;
  el.innerHTML = done ? doneHtml(done) : dispatchHtml(compute());
  renderHint();
  updateChecklist();
}
function renderHint() {
  const el = $('#hint');
  if (el) el.innerHTML = hintHtml(findPast(form), quoted);
}

// 左に入力欄（①お客様 → ②日時 → ③ヒアリングを縦一列）、右に配車。それぞれ、はみ出す場合だけ縦にスクロールする
function renderNew() {
  return `
  <div class="grid gap-3 p-3 h-[calc(100vh-52px)] grid-rows-[minmax(0,1fr)] grid-cols-[minmax(24rem,28rem)_1fr]">
    <div id="form" class="flex flex-col gap-2 overflow-y-auto pr-1 ${done ? 'dim' : ''}">${formHtml(form, ymdOf(new Date()), hearingChecklist(form))}</div>
    <div class="overflow-y-auto" id="dispatch"></div>
  </div>`;
}

function render() {
  $('#root').innerHTML = `
  <header class="bg-teal-800 text-white px-6 h-[52px] flex justify-between items-center">
    <div class="font-bold text-xl">📞 コールセンター 受付・配車 <span class="text-xs font-normal bg-white/20 rounded px-2 py-0.5 ml-2">ダミー画面（PC）</span></div>
    <nav class="flex gap-1">
      <button class="rounded px-4 py-1.5 font-bold ${tab === 'new' ? 'bg-white text-teal-800' : 'bg-white/10'}" data-tab="new">新規受付</button>
      <button class="rounded px-4 py-1.5 font-bold ${tab === 'board' ? 'bg-white text-teal-800' : 'bg-white/10'}" data-tab="board">空き状況・受付履歴</button>
    </nav>
    <div class="text-sm flex items-center gap-3">
      <label class="text-xs text-white/80">受付者 <select class="rounded bg-white/20 text-white px-1 py-0.5 font-bold" data-operator>${OPERATORS.map((o) => `<option class="text-slate-800" ${o === operator ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
      ${tab === 'new' ? `<button class="rounded px-3 py-1 text-xs font-bold bg-amber-400 text-slate-900" data-demo="toggle">🎙 音声入力デモ${demoOpen ? 'を閉じる' : '（今後の拡張）'}</button>` : ''}
      <a class="underline text-white/80 text-xs" href="/" target="_blank" rel="noopener">営業アプリを開く</a>
      <button class="text-xs underline text-white/70" data-reset>データ初期化</button>${themeToggleHtml()}</div>
  </header>
  ${tab === 'new' ? renderNew() : boardHtml({ date: boardDate, reservations: loadReservations(), stats: fairnessStats(loadReservations()), now: new Date(), days: [0, 1, 2, 3, 4, 5, 6].map((n) => ({ date: addDays(n) })) })}
  ${tab === 'new' && demoOpen ? demoWindowHtml(demoPos) : ''}
  ${toast ? `<div class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-800 text-white rounded-lg px-4 py-2 shadow-lg">${esc(toast)}</div>` : ''}`;
  if (tab === 'new') { renderDispatch(); renderTranscript(); }
}

const flash = (msg) => { toast = msg; render(); setTimeout(() => { toast = ''; render(); }, 2500); };

// ---- イベント ------------------------------------------------------------------------
const LIVE = new Set(['address', 'date', 'start', 'dur', 'phone', 'phone2', 'wants']);
const NUMERIC = new Set(['start', 'dur']);
function onField(e) {
  const k = e.target.dataset.f;
  if (!k) return;
  form = { ...form, [k]: NUMERIC.has(k) ? Number(e.target.value) : e.target.value };
  if (k === 'date' || k === 'start') form = { ...form, whenAsked: true };
  if (k === 'contactFrom' || k === 'contactTo') { form = syncContact(form, k); updateChecklist(); refresh(); return; }
  if (k === 'phone' || k === 'phone2') quoted = false;
  if (k === 'age' && e.target.value) { form = { ...form, ageEst: '' }; document.querySelectorAll('[data-ageest]').forEach((el) => el.classList.remove('on')); } // 年齢を聞けたら、推測の年代は外す
  if (k === 'flyerId') { form = withFlyer(form, e.target.value); renderFlyerResult(); renderDispatch(); return; }
  if (k === 'date' && e.target.value) weekStart = weekStartFor(e.target.value);
  if (LIVE.has(k)) renderDispatch(); else updateChecklist();
}
document.addEventListener('input', onField);
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-main]')) { form = { ...form, mainItems: { ...form.mainItems, [e.target.dataset.main]: Number(e.target.value) } }; e.target.classList.toggle('sel', Number(e.target.value) > 0); updateChecklist(); return; }
  if (e.target.matches('[data-operator]')) { operator = e.target.value; setPref('rq-mock-cc-operator', operator); return; }
  if (e.target.matches('[data-bdate-input]')) { boardDate = e.target.value || boardDate; render(); return; }
  onField(e);
});

document.addEventListener('submit', (e) => {
  if (!e.target.matches('[data-utter-form]')) return;
  e.preventDefault();
  const input = e.target.querySelector('[data-utter]');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addUtterance('cu', text);
});

// 前日確認の連絡時間: 「指定なし」を選んだら、両方を指定なしにする。時刻を選んだら、もう一方の指定なしは外す
function syncContact(f, k) {
  const other = k === 'contactFrom' ? 'contactTo' : 'contactFrom';
  if (f[k] === 'none') return { ...f, [other]: 'none' };
  return f[other] === 'none' ? { ...f, [other]: '' } : f;
}

// チラシのIDが入力されたら、きっかけを自動で決める（IDがチラシに当たらなければ、チラシのきっかけは外す）
function withFlyer(f, id) {
  const hit = flyerOf(id);
  return { ...f, flyerId: id, chirashi: hit ? hit.chirashi : isFlyerIndex(f.chirashi) ? null : f.chirashi };
}
const renderFlyerResult = () => { const el = $('#flyer-result'); if (el) el.innerHTML = flyerResultHtml(form.flyerId); };

function toggleDemo() { demoOpen = !demoOpen; if (!demoOpen) stopDemo(); render(); }

// 通話デモのウィンドウは、タイトル部分をつかんで動かせる（入力欄や候補を隠さないように）
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const h = e.target.closest('[data-drag]');
  if (!h || e.target.closest('button')) return;
  const win = $('#demo-win');
  drag = { dx: e.clientX - win.offsetLeft, dy: e.clientY - win.offsetTop, win };
  h.setPointerCapture(e.pointerId);
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  demoPos = { x: Math.min(Math.max(0, e.clientX - drag.dx), window.innerWidth - 80), y: Math.min(Math.max(0, e.clientY - drag.dy), window.innerHeight - 40) };
  drag.win.style.left = `${demoPos.x}px`; drag.win.style.top = `${demoPos.y}px`;
});
document.addEventListener('pointerup', () => { drag = null; });

const refresh = () => { $('#form').innerHTML = formHtml(form, ymdOf(new Date()), hearingChecklist(form)); renderDispatch(); };

// 聞き取り状況（✔聞いた／未）を、入力に合わせて更新する。入力欄は作り直さない（入力中の文字を壊さない）
function updateChecklist() {
  const list = hearingChecklist(form);
  const panel = $('#checklist');
  if (panel) panel.innerHTML = checklistHtml(list);
  list.forEach((x) => document.querySelectorAll(`[data-badge="${x.key}"]`).forEach((el) => { el.innerHTML = badgeHtml(x.asked, x.estimated); }));
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-pick]');
  if (!t) return;
  const d = t.dataset;
  if (d.demo) { ({ start: startDemo, stop: () => { stopDemo(); renderTranscript(); }, reset: resetDemo, step: stepDemo, toggle: toggleDemo, close: toggleDemo })[d.demo](); return; }
  if (d.tab) { stopDemo(); tab = d.tab; render(); }
  else if (d.area) { form = { ...form, areaId: d.area, areaAddr: form.address.trim() }; renderDispatch(); }
  else if (d.gender) { form = { ...form, gender: d.gender }; refresh(); }
  else if ('genderest' in d) { form = { ...form, genderEst: !form.genderEst }; refresh(); }
  else if (d.ageest) { form = { ...form, ageEst: form.ageEst === d.ageest ? '' : d.ageest, age: '' }; refresh(); }
  else if (d.chirashi) { form = { ...form, chirashi: Number(d.chirashi), flyerId: '' }; refresh(); }
  else if (d.cat) { form = { ...form, cats: form.cats.includes(d.cat) ? form.cats.filter((c) => c !== d.cat) : [...form.cats, d.cat] }; refresh(); }
  else if (d.yn) { const [k, v] = d.yn.split('|'); const on = form[k] !== v; form = { ...form, [k]: on ? v : '', ...(k === 'companion' && !(on && v === 'あり') ? { companionNote: '' } : {}) }; refresh(); }
  else if (d.dur) { form = { ...form, dur: Number(d.dur) }; refresh(); }
  else if (d.cell) { const [date, start] = d.cell.split('|'); form = { ...form, date, start: Number(start), whenAsked: true }; refresh(); }
  else if (d.none) { form = { ...form, [d.none]: d.none === 'notes' ? '特になし' : 'なし' }; refresh(); }
  else if (d.goto) {
    const el = document.querySelector(`[data-badge="${d.goto}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.closest('div, label')?.querySelector('input, select, textarea, button')?.focus({ preventScroll: true });
  }
  else if (d.calmode) { calMode = d.calmode; renderDispatch(); }
  else if (d.day) { form = { ...form, date: shiftDay(form.date, Number(d.day)), whenAsked: true }; weekStart = weekStartFor(form.date); refresh(); }
  else if (d.dcell) { const [userId, start] = d.dcell.split('|'); form = { ...form, userId, start: Number(start), whenAsked: true }; refresh(); }
  else if (d.week) { weekStart = shiftWeek(Number(d.week)); renderDispatch(); }
  else if (d.pick) { form = { ...form, userId: d.pick }; renderDispatch(); }
  else if ('toggleOthers' in d) { showOthers = !showOthers; renderDispatch(); }
  else if ('map' in d) { const a = done?.customer.address ?? form.address.trim(); if (a) window.open(mapUrl(a), '_blank', 'noopener'); else flash('住所を入力してください'); }
  else if ('quote' in d) {
    const c = findPast(form);
    if (c) {
      const [last, first] = c.lastName !== undefined ? [c.lastName, c.firstName] : splitName(c.name);
      const [lastK, firstK] = c.lastKana !== undefined ? [c.lastKana, c.firstKana] : splitName(c.kana);
      form = { ...form, lastName: last, firstName: first, lastKana: lastK, firstKana: firstK, phone2: form.phone2 || c.phone2 || '', zip: c.zip, address: c.address };
      quoted = true; refresh();
    }
  }
  else if ('confirm' in d) confirmReservation();
  else if ('new' in d) { stopDemo(); lines = []; finished = false; scriptPos = 0; form = blankForm(); weekStart = addDays(0); done = null; quoted = false; showOthers = false; render(); }
  else if (d.bdate) { boardDate = d.bdate; render(); }
  else if (d.cancel) {
    const r = loadReservations().find((x) => x.id === d.cancel);
    if (r && confirm(`${r.receptionNo}（${r.customer.name} 様）の訪問を取り消します。営業の予定からも消えます。よろしいですか？`)) { removeReservation(r.id); render(); }
  }
  else if ('reset' in d) { if (confirm(RESET_CONFIRM)) { clearTransactions(); stopDemo(); lines = []; finished = false; scriptPos = 0; form = blankForm(); weekStart = addDays(0); done = null; render(); } }
});

// 他のタブ（営業アプリ・本社）での変更を反映する。入力中は入力欄の内容を壊さないよう、配車の候補だけを更新する
window.addEventListener('storage', (e) => {
  if (e.key !== RESERVATION_KEY) return;
  if (tab === 'new') renderDispatch(); else render();
});

initTheme();
render();
