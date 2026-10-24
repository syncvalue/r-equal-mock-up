// コールセンター 受付・配車画面（ダミー・PC想定）。受電内容を聞き取り、訪問先のエリアの営業から、
// 希望日時に空いていて、女性のお客様の担当が偏らない人を選んで、訪問を仮確定する。担当の確定は配車係が行い（配車確定タブ）、確定した予約が営業アプリの予定に出る。
import { EVENTS, toMin } from '../src/schedule.js';
import { USERS } from '../src/dashboard.js';
import { areaById, areaOfAddress, locateAddress, salesDetail, rankCandidates, findWeekSlots, fairerAlternative } from '../src/dispatch.js';
import { RESERVATION_KEY, addReservation, loadReservations, updateReservation, isTentative, isCancelled, cancelReservation, amendReservation, needsReview, acknowledgeReservation, openReservationsFor, nextReceptionNo, minToHHMM, ymdOf } from '../src/reservations.js';
import { RESET_CONFIRM, clearTransactions } from '../src/store.js';
import { initTheme, themeToggleHtml } from '../src/theme.js';
import { esc } from '../src/format.js';
import { OPERATORS, CANCEL_REASONS, blankMain, joinName, splitName, flyerOf, isFlyerIndex, normalizeFlyerId, triggerText, contactText } from './master.js';
import { dispatchHtml, doneHtml, formHtml, hintHtml, openResHtml, callLogHtml, editBannerHtml, cancelModalHtml, mapUrl, genderLabel, dateLabel, transcriptHtml, demoWindowHtml, checklistHtml, badgeHtml, flyerResultHtml } from './view.js';
import { dispatcherHtml } from './dispatcherView.js';
import { blankForm as makeBlankForm } from './form.js';
import { sampleReservations } from './samples.js';
import { callHistory } from '../src/callHistory.js';
import { purchaseSummary, historyCustomers } from '../src/customerHistory.js';
import { buildRecordFields, formFromRecord, diffRecords } from './record.js';
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

const blankForm = () => makeBlankForm();

let tab = 'new';
let operator = pref('rq-mock-cc-operator', OPERATORS[0]);
let form = blankForm();
let done = null; // 確定した直後の予約（確定画面を表示している間）
let quoted = false; // 過去のお客様情報を引用済みか
let showOthers = false;
let calStaff = []; // 営業を絞り込む（空なら全員）。「この案件はAさんかBさんが適任」のときに、その人たちだけを表示する
let staffOpen = false;
let calOnlyFree = false; // 日別表示で、希望の時間に空いている営業だけを出す
let calMode = 'week'; // 空きカレンダーの表示: week=週 / day=日別（営業ごとの列）
let weekStart = addDays(0); // 空きカレンダーの先頭の日（1週間ずつ動かす）
let callLogOpen = false; // 受電履歴を開いているか
let editBy = null; // 変更を始めた人（オペレーター／配車係）
let editId = null; // 受付済みの予約の日時を変更しているとき、その予約
let cancelId = null; // 取消の確認を出している予約
let cancelReason = CANCEL_REASONS[0];
let dispDate = addDays(2); // 配車係が確定する日（主に翌々日の予定を、毎日確定する）
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
  return [...fromRes, ...fromEvents, ...historyCustomers()].find((c) => [c.phone, c.phone2].some((p) => mine.includes(digits(p)))) ?? null;
}

function compute() {
  const reservations = loadReservations().filter((r) => r.id !== editId); // 変更中の予約は、自分の枠を空けて考える
  // 住所からの判定は提案。オペレーターがGoogleマップで確認して選んだエリア（confirmed）が、その住所のものであれば、それを使う
  const proposal = areaOfAddress(form.address);
  const confirmed = form.areaId && form.areaAddr === form.address.trim() ? areaById(form.areaId) : null;
  const area = confirmed ?? proposal;
  const here = area?.lat != null ? locateAddress(form.address, area) : null; // 今回のお客様の住所の位置（概算）。前のアポからの距離に使う
  const full = rankCandidates({ gender: form.gender, areaId: area?.id ?? null, date: form.date, start: form.start, dur: form.dur, reservations, here });
  // 営業の絞り込み。絞ったときは、表示している営業の中で、おすすめ（担当が最も少ない人）を決め直す
  const staffSel = calStaff.filter((id) => full.inArea.some((c) => c.user.id === id));
  const shownIn = full.inArea.filter((c) => !staffSel.length || staffSel.includes(c.user.id)).map((c) => ({ ...c, recommended: false }));
  const firstFree = shownIn.find((c) => c.free);
  if (firstFree) firstFree.recommended = true;
  const ranking = { inArea: shownIn, others: full.others };
  const all = [...ranking.inArea, ...ranking.others];
  const manual = all.find((c) => c.user.id === form.userId && c.free);
  const selected = manual ?? ranking.inArea.find((c) => c.recommended) ?? null; // 手動で選ばなければ、おすすめを自動で選ぶ
  const today = ymdOf(new Date());
  const calendar = ranking.inArea.length
    ? { week: findWeekSlots({ userIds: ranking.inArea.map((c) => c.user.id), startDate: weekStart, dur: form.dur, reservations }), form, today, names: Object.fromEntries(USERS.map((u) => [u.id, u.name])), canPrev: weekStart > today, mode: calMode, hasHere: Boolean(here), onlyFree: calOnlyFree }
    : null;
  const missing = missingFields(form, { areaConfirmed: Boolean(confirmed), selected, today: ymdOf(new Date()) });
  return {
    detail: calMode === 'day' && selected ? salesDetail({ userId: selected.user.id, date: form.date, start: form.start, dur: form.dur, reservations, here }) : null,
    editing: editId ? loadReservations().find((r) => r.id === editId) ?? null : null,
    staff: [...full.inArea].sort((a, b) => a.user.id.localeCompare(b.user.id)), staffSel, staffOpen,
    area, proposal, confirmed, hasAddress: Boolean(form.address.trim()), ranking, calendar, form, selectedId: selected?.user.id ?? null, showOthers: showOthers || area?.outside,
    alt: fairerAlternative(form.gender, selected, ranking.inArea), missing, selected, reservations,
    unasked: hearingChecklist(form).filter((x) => !x.asked && !REQUIRED_CHECKS.has(x.key)).map((x) => x.label),
  };
}

// 受付済みの予約の日時・担当を変更する。お客様の情報はそのまま、右のカレンダーで新しい日時と担当を選ぶ
function startEdit(id) {
  const r = loadReservations().find((x) => x.id === id);
  if (!r || isCancelled(r)) return;
  stopDemo();
  editId = id;
  editBy = tab === 'dispatch' ? '配車係' : operator;
  form = formFromRecord(r, blankForm()); // 受付時の入力を、そのまま戻す（全項目を変更できる）
  quoted = false;
  weekStart = weekStartFor(r.date);
  tab = 'new';
  render();
}

// 変更を保存する。仮確定の変更は仮確定のまま（誰にも知らせない）。確定済みの変更は仮確定に戻り、配車係に分かる
function saveEdit() {
  const x = compute();
  const before = loadReservations().find((r) => r.id === editId);
  if (!before || x.missing.length || !x.selected) return;
  const area = x.confirmed;
  const fields = { ...buildRecordFields(form, { area, pos: locateAddress(form.address, area) }), userId: x.selected.user.id };
  const nameOf = (id) => USERS.find((u) => u.id === id)?.name ?? id;
  const wasConfirmed = !isTentative(before);
  amendReservation(editId, fields, editBy, diffRecords(before, { ...before, ...fields }, nameOf), { notify: editBy !== '配車係' }); // 配車係自身の変更は、配車係に知らせない
  dispDate = form.date;
  editId = null;
  form = blankForm();
  weekStart = addDays(0);
  tab = 'dispatch';
  flash(wasConfirmed ? (editBy === '配車係' ? '変更しました。確定済みだったため、仮確定に戻りました' : '変更しました。確定済みだったため、仮確定に戻り、配車係に知らせました') : '変更しました（仮確定のままです）');
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
    receivedTs: Date.now(), status: 'tentative', operator, userId: x.selected.user.id, apType: past ? '再' : '新',
    ...buildRecordFields(form, { area, pos: center }),
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
  return text.replace('{area}', x.area?.name ?? 'ご担当エリア').replace('{when}', `${dateLabel(form.date)} ${minToHHMM(form.start)}`);
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
  addSystem(missing.length ? `通話終了。未入力：${missing.join('、')}` : '通話終了。カレンダーの枠と担当（仮）を確認して、「仮確定する」を押してください');
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
// 最後まで一気に進める（待たずに、残りの発話をすべて流す）
function finishDemo() {
  stopDemo();
  while (!finished && !done && scriptPos < DEMO_SCRIPT.length) advance(true);
  renderTranscript();
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
  const past = findPast(form);
  const calls = callHistory([form.phone, form.phone2, past?.phone, past?.phone2], loadReservations());
  if (el) el.innerHTML = hintHtml(past, quoted, past ? purchaseSummary([form.phone, form.phone2, past.phone, past.phone2]) : null) + callLogHtml(calls, callLogOpen) + openResHtml(openReservationsFor(loadReservations(), [form.phone, form.phone2], ymdOf(new Date())));
}

// 左に入力欄（①お客様 → ②日時 → ③ヒアリングを縦一列）、右に配車。それぞれ、はみ出す場合だけ縦にスクロールする
function renderNew() {
  return `
  <div class="grid gap-3 p-3 h-[calc(100vh-52px)] grid-rows-[minmax(0,1fr)] grid-cols-[minmax(24rem,28rem)_1fr]">
    <div id="form" class="flex flex-col gap-2 overflow-y-auto pr-1 ${done ? 'dim' : ''}">${formMarkup()}</div>
    <div class="overflow-y-auto" id="dispatch"></div>
  </div>`;
}

// 配車係が確定する日の候補（今日から5日分。翌々日に印）。日付ごとの、仮確定の件数を添える
function dispatchChips() {
  const list = loadReservations();
  return [0, 1, 2, 3, 4].map((n) => { const date = addDays(n); return { date, label: ['今日', '明日', '翌々日', '3日後', '4日後'][n], tentative: list.filter((r) => r.date === date && isTentative(r)).length, review: list.filter((r) => r.date === date && needsReview(r)).length }; });
}
const tentativeBadge = () => {
  const list = loadReservations();
  const n = list.filter(isTentative).length;
  const rv = list.filter(needsReview).length; // 確定済みが変更されて、仮確定に戻ったもの
  return `${n ? `<span class="ml-1 rounded-full bg-amber-300 px-1.5 text-xs text-amber-950" title="仮確定">${n}</span>` : ''}${rv ? `<span class="ml-1 rounded-full bg-rose-600 px-1.5 text-xs text-white" title="確定済みが変更されて、仮確定に戻りました">変更${rv}</span>` : ''}`;
};

function render() {
  $('#root').innerHTML = `
  <header class="bg-teal-800 text-white px-6 h-[52px] flex justify-between items-center">
    <div class="font-bold text-xl">📞 コールセンター 受付・配車 <span class="text-xs font-normal bg-white/20 rounded px-2 py-0.5 ml-2">ダミー画面（PC）</span></div>
    <nav class="flex gap-1">
      <button class="rounded px-4 py-1.5 font-bold ${tab === 'new' ? 'bg-white text-teal-800' : 'bg-white/10'}" data-tab="new">新規受付</button>
      <button class="rounded px-4 py-1.5 font-bold ${tab === 'dispatch' ? 'bg-white text-teal-800' : 'bg-white/10'}" data-tab="dispatch">配車確定（配車係）${tentativeBadge()}</button>
    </nav>
    <div class="text-sm flex items-center gap-3">
      <label class="text-xs text-white/80">受付者 <select class="rounded bg-white/20 text-white px-1 py-0.5 font-bold" data-operator>${OPERATORS.map((o) => `<option class="text-slate-800" ${o === operator ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
      ${tab === 'new' && !editId ? `<button class="rounded px-3 py-1 text-xs font-bold bg-amber-400 text-slate-900" data-demo="toggle">🎙 音声入力デモ${demoOpen ? 'を閉じる' : '（今後の拡張）'}</button>` : ''}
      <a class="underline text-white/80 text-xs" href="/" target="_blank" rel="noopener">営業アプリを開く</a>
      <button class="text-xs underline text-white/70" data-reset>データ初期化</button>${themeToggleHtml()}</div>
  </header>
  ${tab === 'new' ? renderNew() : dispatcherHtml({ date: dispDate, reservations: loadReservations(), now: new Date(), chips: dispatchChips() })}
  ${tab === 'new' && demoOpen && !editId ? demoWindowHtml(demoPos) : ''}
  ${cancelId ? cancelModalHtml(loadReservations().find((r) => r.id === cancelId), cancelReason) : ''}
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
  if (k === 'phone2' && e.target.value && form.phone2None) { form = { ...form, phone2None: false }; document.querySelector('[data-phone2none]')?.classList.remove('on'); } // 番号を入れたら、「なし」は外す
  if (k === 'age' && e.target.value) { form = { ...form, ageEst: '' }; const sel = document.querySelector('[data-f="ageEst"]'); if (sel) sel.value = ''; } // 年齢を聞けたら、推測の年代は外す
  if (k === 'ageEst' && e.target.value) { form = { ...form, age: '' }; refresh(); return; } // 年代を選んだら、年齢の欄は空にする
  if (k === 'flyerId') { form = withFlyer(form, e.target.value); renderFlyerResult(); renderDispatch(); return; }
  if (k === 'date' && e.target.value) weekStart = weekStartFor(e.target.value);
  if (LIVE.has(k)) renderDispatch(); else updateChecklist();
}
document.addEventListener('input', onField);
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-main]')) { form = { ...form, mainItems: { ...form.mainItems, [e.target.dataset.main]: Number(e.target.value) } }; e.target.classList.toggle('sel', Number(e.target.value) > 0); updateChecklist(); return; }
  if (e.target.matches('[data-operator]')) { operator = e.target.value; setPref('rq-mock-cc-operator', operator); return; }
  if (e.target.matches('[data-cancelreason]')) { cancelReason = e.target.value; return; }
  if (e.target.matches('[data-reassign]')) { updateReservation(e.target.dataset.reassign, { userId: e.target.value }); render(); return; }
  if (e.target.matches('[data-ddate-input]')) { dispDate = e.target.value || dispDate; render(); return; }
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

const formMarkup = () => (editId ? editBannerHtml(loadReservations().find((r) => r.id === editId)) : '') + formHtml(form, ymdOf(new Date()), hearingChecklist(form));
const refresh = () => { $('#form').innerHTML = formMarkup(); renderDispatch(); };

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
  if (d.demo) { ({ start: startDemo, stop: () => { stopDemo(); renderTranscript(); }, reset: resetDemo, step: stepDemo, finish: finishDemo, toggle: toggleDemo, close: toggleDemo })[d.demo](); return; }
  if (d.tab) { stopDemo(); tab = d.tab; render(); }
  else if (d.area) { form = { ...form, areaId: d.area, areaAddr: form.address.trim() }; renderDispatch(); }
  else if (d.gender) { form = { ...form, gender: d.gender }; refresh(); }
  else if ('phone2none' in d) { form = { ...form, phone2None: !form.phone2None, phone2: form.phone2None ? form.phone2 : '' }; refresh(); }
  else if ('genderest' in d) { form = { ...form, genderEst: !form.genderEst }; refresh(); }
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
  else if (d.gotoday) { form = { ...form, date: d.gotoday, whenAsked: true }; calMode = 'day'; weekStart = weekStartFor(d.gotoday); refresh(); }
  else if ('staffpanel' in d) { staffOpen = !staffOpen; renderDispatch(); }
  else if ('staffclear' in d) { calStaff = []; renderDispatch(); }
  else if (d.staff) { calStaff = calStaff.includes(d.staff) ? calStaff.filter((id) => id !== d.staff) : [...calStaff, d.staff]; renderDispatch(); }
  else if ('onlyfree' in d) { calOnlyFree = !calOnlyFree; renderDispatch(); }
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
  else if ('new' in d) { editId = null; stopDemo(); lines = []; finished = false; scriptPos = 0; form = blankForm(); weekStart = addDays(0); done = null; quoted = false; showOthers = false; render(); }
  else if ('calllog' in d) { callLogOpen = !callLogOpen; renderHint(); }
  else if (d.chg) startEdit(d.chg);
  else if ('editcancel' in d) { editId = null; form = blankForm(); weekStart = addDays(0); render(); }
  else if ('saveedit' in d) saveEdit();
  else if (d.cancelres) { cancelId = d.cancelres; cancelReason = CANCEL_REASONS[0]; render(); }
  else if ('cancelclose' in d) { cancelId = null; render(); }
  else if ('cancelgo' in d) {
    const r = loadReservations().find((x) => x.id === cancelId);
    if (r) cancelReservation(r.id, cancelReason, tab === 'dispatch' ? '配車係' : operator);
    cancelId = null;
    if (editId === (r?.id ?? null)) { editId = null; form = blankForm(); }
    if (r) flash(`${r.customer.name} 様の受付を取り消しました`); else render();
  }
  else if (d.ack) { acknowledgeReservation(d.ack); render(); }
  else if (d.showday) { dispDate = d.showday; render(); }
  else if (d.ddate) { dispDate = d.ddate; render(); }
  else if (d.fix) { updateReservation(d.fix, { status: 'confirmed', needsReview: false, confirmedAt: new Date().toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }), confirmedBy: '配車係' }); render(); }
  else if (d.unfix) { updateReservation(d.unfix, { status: 'tentative', confirmedAt: null, confirmedBy: null }); render(); }
  else if ('fixall' in d) {
    const targets = loadReservations().filter((r) => r.date === dispDate && isTentative(r));
    if (targets.length && confirm(`${dateLabel(dispDate)}の仮確定 ${targets.length}件を、すべて確定します。確定した訪問は、営業のタブレットの予定に出ます。`)) {
      const at = new Date().toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' });
      targets.forEach((r) => updateReservation(r.id, { status: 'confirmed', needsReview: false, confirmedAt: at, confirmedBy: '配車係' }));
      render();
    }
  }
  else if ('reset' in d) { if (confirm(RESET_CONFIRM)) { clearTransactions(); try { localStorage.removeItem(SAMPLE_KEY); } catch { /* 消せなくても動作は継続 */ } seedSamples(); stopDemo(); lines = []; finished = false; scriptPos = 0; form = blankForm(); weekStart = addDays(0); done = null; render(); } }
});

// 他のタブ（営業アプリ・本社）での変更を反映する。入力中は入力欄の内容を壊さないよう、配車の候補だけを更新する
window.addEventListener('storage', (e) => {
  if (e.key !== RESERVATION_KEY) return;
  if (tab === 'new') renderDispatch(); else render();
});

// 最初に開いたときと、データ初期化のあとに、サンプルの受付を入れる（配車確定の画面などを、すぐ見られるように）
const SAMPLE_KEY = 'rq-mock-cc-samples-v1';
function seedSamples() {
  if (pref(SAMPLE_KEY, '')) return;
  setPref(SAMPLE_KEY, '1');
  sampleReservations().forEach(addReservation);
}

initTheme();
seedSamples();
render();
