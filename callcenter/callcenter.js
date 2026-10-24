// コールセンター 受付・配車画面（ダミー・PC想定）。受電内容を聞き取り、訪問先のエリアの営業から、
// 希望日時に空いていて、女性のお客様の担当が偏らない人を選んで、訪問を確定する。確定した予約は営業アプリの予定に出る。
import { EVENTS } from '../src/schedule.js';
import { USERS } from '../src/dashboard.js';
import { areaById, areaOfAddress, areaOfUser, rankCandidates, findWeekSlots, fairnessStats, fairerAlternative } from '../src/dispatch.js';
import { RESERVATION_KEY, addReservation, loadReservations, removeReservation, nextReceptionNo, minToHHMM, ymdOf } from '../src/reservations.js';
import { RESET_CONFIRM, clearTransactions } from '../src/store.js';
import { initTheme, themeToggleHtml } from '../src/theme.js';
import { esc } from '../src/format.js';
import { OPERATORS, flyerOf, isFlyerIndex, normalizeFlyerId, triggerText } from './master.js';
import { boardHtml, dispatchHtml, doneHtml, formHtml, hintHtml, mapUrl, transcriptHtml, flyerResultHtml } from './view.js';
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
const shiftWeek = (n) => { const [y, m, d] = weekStart.split('-').map(Number); const next = ymdOf(new Date(y, m - 1, d + n)); const today = ymdOf(new Date()); return next < today ? today : next; };
const digits = (s) => String(s ?? '').replace(/\D/g, '');

const blankForm = () => ({
  phone: '', name: '', kana: '', gender: '', zip: '', address: '', chirashi: null, flyerId: '', cats: [], wants: '', attendee: 'ご本人', large: '', notes: '',
  date: addDays(1), start: 10 * 60, dur: 90, userId: null,
});

let tab = 'new';
let operator = pref('rq-mock-cc-operator', OPERATORS[0]);
let form = blankForm();
let done = null; // 確定した直後の予約（確定画面を表示している間）
let quoted = false; // 過去のお客様情報を引用済みか
let showOthers = false;
let weekStart = addDays(0); // 空きカレンダーの先頭の日（1週間ずつ動かす）
let boardDate = addDays(1);
let toast = '';
let lines = []; // 文字起こし（{ who, text, got: 入力欄にセットした項目 }）
let playing = false;
let finished = false;
let timer = null;

// 電話番号が一致する、過去のお客様（既存の訪問予定・コールセンターの予約から探す）
function findPast(phone) {
  const d = digits(phone);
  if (d.length < 10) return null;
  const fromEvents = EVENTS.map((e) => e.customer);
  const fromRes = loadReservations().map((r) => r.customer);
  return [...fromRes, ...fromEvents].find((c) => digits(c.phone) === d) ?? null;
}

function compute() {
  const reservations = loadReservations();
  const area = areaOfAddress(form.address);
  const ranking = rankCandidates({ gender: form.gender, areaId: area?.id ?? null, date: form.date, start: form.start, dur: form.dur, reservations });
  const all = [...ranking.inArea, ...ranking.others];
  const manual = all.find((c) => c.user.id === form.userId && c.free);
  const selected = manual ?? ranking.inArea.find((c) => c.recommended) ?? null; // 手動で選ばなければ、おすすめを自動で選ぶ
  const today = ymdOf(new Date());
  const calendar = ranking.inArea.length
    ? { week: findWeekSlots({ userIds: ranking.inArea.map((c) => c.user.id), startDate: weekStart, dur: form.dur, reservations }), form, today, names: Object.fromEntries(USERS.map((u) => [u.id, u.name])), canPrev: weekStart > today }
    : null;
  const missing = [];
  if (!/^0\d{9,10}$/.test(digits(form.phone))) missing.push('電話番号');
  if (!form.name.trim()) missing.push('お名前');
  if (!form.gender) missing.push('性別');
  if (!area) missing.push('訪問先の住所（都道府県から）');
  if (form.chirashi === null) missing.push(form.flyerId.trim() ? 'チラシのID（該当なし）' : '来電のきっかけ（チラシのID）');
  if (!form.cats.length && !form.wants.trim()) missing.push('売りたいもの');
  if (!form.date || form.date < ymdOf(new Date())) missing.push('希望日（今日以降）');
  if (!selected) missing.push('担当の営業');
  return {
    area, hasAddress: Boolean(form.address.trim()), ranking, calendar, form, selectedId: selected?.user.id ?? null, showOthers: showOthers || area?.outside,
    alt: fairerAlternative(form.gender, selected, ranking.inArea), missing, selected, reservations,
  };
}

function confirmReservation() {
  const x = compute();
  if (x.missing.length || !x.selected) return;
  const reservations = x.reservations;
  const past = findPast(form.phone);
  const area = x.area?.id ? x.area : null;
  const center = area ?? areaById(areaOfUser(x.selected.user.id)); // 対応エリア外（例外対応）は、担当営業のエリアの中心で代用
  const record = {
    id: `RS-${Date.now().toString(36).toUpperCase()}`, receptionNo: nextReceptionNo(reservations), receivedAt: new Date().toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }),
    operator, userId: x.selected.user.id, date: form.date, start: minToHHMM(form.start), end: minToHHMM(form.start + form.dur), apType: past ? '再' : '新',
    gender: form.gender, areaId: area?.id ?? null, lat: center.lat, lng: center.lng, flyerId: form.flyerId ? normalizeFlyerId(form.flyerId) : null, chirashi: triggerText(form.chirashi, flyerOf(form.flyerId)?.id),
    hearing: {
      trigger: triggerText(form.chirashi, flyerOf(form.flyerId)?.id), attendee: form.attendee, wants: [form.cats.join('・'), form.wants.trim() && `（${form.wants.trim()}）`].filter(Boolean).join(''),
      large: form.large.trim() || 'なし', notes: form.notes.trim() || '特になし',
    },
    customer: { name: form.name.trim(), kana: form.kana.trim(), phone: form.phone.trim(), zip: form.zip.trim(), address: form.address.trim() },
  };
  addReservation(record);
  stopDemo();
  done = record;
  render();
}

// ---- 通話の文字起こし（デモ） ---------------------------------------------------------------
const FLASH = { flyerId: '[data-f="flyerId"]', gender: '[data-gender].on', chirashi: '[data-chirashi].on', cats: '[data-cat].on', start: '[data-f="start"]', dur: '[data-dur].on' };
function flashFields(keys) {
  keys.forEach((k) => document.querySelectorAll(FLASH[k] ?? `[data-f="${k}"]`).forEach((el) => {
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    if (k === 'phone' || k === 'name') el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
      if (patch.phone) quoted = false;
      if (patch.flyerId) form = withFlyer(form, patch.flyerId);
      if (patch.date) weekStart = weekStartFor(patch.date);
    }
  }
  lines = [...lines, { who, text, got }];
  if (got.length) refresh();
  renderTranscript();
  flashFields(got);
}

function stopDemo() { clearTimeout(timer); playing = false; }
function playNext() {
  const idx = lines.length;
  if (idx >= DEMO_SCRIPT.length) { playing = false; finished = true; renderTranscript(); return; }
  addUtterance(DEMO_SCRIPT[idx].who, DEMO_SCRIPT[idx].text);
  timer = setTimeout(playNext, 1800 + DEMO_SCRIPT[idx].text.length * 25);
}
function startDemo() {
  if (done) return;
  if (finished) { lines = []; finished = false; }
  playing = true; renderTranscript();
  timer = setTimeout(playNext, 400);
}
function resetDemo() { stopDemo(); lines = []; finished = false; form = blankForm(); weekStart = addDays(0); quoted = false; refresh(); renderTranscript(); }

function renderTranscript() {
  const el = $('#transcript');
  if (!el) return;
  const typed = $('[data-utter]')?.value ?? '';
  el.innerHTML = transcriptHtml({ lines, playing, finished, total: DEMO_SCRIPT.length });
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
}
function renderHint() {
  const el = $('#hint');
  if (el) el.innerHTML = hintHtml(findPast(form.phone), quoted);
}

function renderNew() {
  return `
  <div class="grid grid-cols-[minmax(26rem,32rem)_1fr] gap-4 p-4 h-[calc(100vh-52px)]">
    <div class="overflow-y-auto space-y-3 pr-1">
      <div id="transcript" class="${done ? 'pointer-events-none opacity-60' : ''}"></div>
      <div class="space-y-3 ${done ? 'pointer-events-none opacity-60' : ''}" id="form">${formHtml(form, ymdOf(new Date()))}</div>
    </div>
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
      <a class="underline text-white/80 text-xs" href="/" target="_blank" rel="noopener">営業アプリを開く</a>
      <button class="text-xs underline text-white/70" data-reset>データ初期化</button>${themeToggleHtml()}</div>
  </header>
  ${tab === 'new' ? renderNew() : boardHtml({ date: boardDate, reservations: loadReservations(), stats: fairnessStats(loadReservations()), now: new Date(), days: [0, 1, 2, 3, 4, 5, 6].map((n) => ({ date: addDays(n) })) })}
  ${toast ? `<div class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-800 text-white rounded-lg px-4 py-2 shadow-lg">${esc(toast)}</div>` : ''}`;
  if (tab === 'new') { renderDispatch(); renderTranscript(); }
}

const flash = (msg) => { toast = msg; render(); setTimeout(() => { toast = ''; render(); }, 2500); };

// ---- イベント ------------------------------------------------------------------------
const LIVE = new Set(['address', 'date', 'start', 'dur', 'phone', 'name', 'wants']);
const NUMERIC = new Set(['start', 'dur']);
function onField(e) {
  const k = e.target.dataset.f;
  if (!k) return;
  form = { ...form, [k]: NUMERIC.has(k) ? Number(e.target.value) : e.target.value };
  if (k === 'phone') quoted = false;
  if (k === 'flyerId') { form = withFlyer(form, e.target.value); renderFlyerResult(); renderDispatch(); return; }
  if (k === 'date' && e.target.value) weekStart = weekStartFor(e.target.value);
  if (LIVE.has(k)) renderDispatch();
}
document.addEventListener('input', onField);
document.addEventListener('change', (e) => {
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

// チラシのIDが入力されたら、きっかけを自動で決める（IDがチラシに当たらなければ、チラシのきっかけは外す）
function withFlyer(f, id) {
  const hit = flyerOf(id);
  return { ...f, flyerId: id, chirashi: hit ? hit.chirashi : isFlyerIndex(f.chirashi) ? null : f.chirashi };
}
const renderFlyerResult = () => { const el = $('#flyer-result'); if (el) el.innerHTML = flyerResultHtml(form.flyerId); };

const refresh = () => { $('#form').innerHTML = formHtml(form, ymdOf(new Date())); renderDispatch(); };
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-pick]');
  if (!t) return;
  const d = t.dataset;
  if (d.demo) { ({ start: startDemo, stop: () => { stopDemo(); renderTranscript(); }, reset: resetDemo })[d.demo](); return; }
  if (d.tab) { tab = d.tab; render(); }
  else if (d.gender) { form = { ...form, gender: d.gender }; refresh(); }
  else if (d.chirashi) { form = { ...form, chirashi: Number(d.chirashi), flyerId: '' }; refresh(); }
  else if (d.cat) { form = { ...form, cats: form.cats.includes(d.cat) ? form.cats.filter((c) => c !== d.cat) : [...form.cats, d.cat] }; refresh(); }
  else if (d.dur) { form = { ...form, dur: Number(d.dur) }; refresh(); }
  else if (d.cell) { const [date, start] = d.cell.split('|'); form = { ...form, date, start: Number(start) }; refresh(); }
  else if (d.week) { weekStart = shiftWeek(Number(d.week)); renderDispatch(); }
  else if (d.pick) { form = { ...form, userId: d.pick }; renderDispatch(); }
  else if ('toggleOthers' in d) { showOthers = !showOthers; renderDispatch(); }
  else if ('map' in d) { const a = done?.customer.address ?? form.address.trim(); if (a) window.open(mapUrl(a), '_blank', 'noopener'); else flash('住所を入力してください'); }
  else if ('quote' in d) {
    const c = findPast(form.phone);
    if (c) { form = { ...form, name: c.name, kana: c.kana, zip: c.zip, address: c.address }; quoted = true; refresh(); }
  }
  else if ('confirm' in d) confirmReservation();
  else if ('new' in d) { stopDemo(); lines = []; finished = false; form = blankForm(); weekStart = addDays(0); done = null; quoted = false; showOthers = false; render(); }
  else if (d.bdate) { boardDate = d.bdate; render(); }
  else if (d.cancel) {
    const r = loadReservations().find((x) => x.id === d.cancel);
    if (r && confirm(`${r.receptionNo}（${r.customer.name} 様）の訪問を取り消します。営業の予定からも消えます。よろしいですか？`)) { removeReservation(r.id); render(); }
  }
  else if ('reset' in d) { if (confirm(RESET_CONFIRM)) { clearTransactions(); stopDemo(); lines = []; finished = false; form = blankForm(); weekStart = addDays(0); done = null; render(); } }
});

// 他のタブ（営業アプリ・本社）での変更を反映する。入力中は入力欄の内容を壊さないよう、配車の候補だけを更新する
window.addEventListener('storage', (e) => {
  if (e.key !== RESERVATION_KEY) return;
  if (tab === 'new') renderDispatch(); else render();
});

initTheme();
render();
