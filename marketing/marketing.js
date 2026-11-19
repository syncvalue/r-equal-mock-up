// マーケティング部の画面（ダミー・PC想定）。チラシの登録と、反響管理（どのチラシが効果的だったか）。
import { setScreenBadge, mktScreenId } from '../src/screenIds.js';
import { loadFlyers, saveFlyers, saveFlyer, setFlyerActive, advanceFlyer, flyersOnDay, receptionResult, demoResult } from '../src/flyers.js';
import { dueFlyers } from '../src/flyerDashboard.js';
import { loadLive } from '../src/store.js';
import { loadReservations, addReservation, ymdOf } from '../src/reservations.js';
import { sampleReservations } from '../callcenter/samples.js';
import { loadEmployees, marketingStaffOf } from '../src/employees.js';
import { login, loadSession, saveSession, clearSession } from '../src/marketingSession.js';
import { loginView } from './loginView.js';
import { initTheme, themeToggleHtml } from '../src/theme.js';
import { initHelp } from '../src/help.js';
import { esc } from '../src/format.js';
import { tabLabel, menuView } from './menu.js';
import { flyersTab, resultsHtml, blankFlyer, formFromFlyer, REASON_TEXT } from './flyersTab.js';
import { responseTab } from './responseTab.js';
import { calendarTab } from './calendarTab.js';
import { dashboardTab } from './dashboardTab.js';
import { shiftMonth } from '../src/flyerCalendar.js';

const $ = (s) => document.querySelector(s);
const today = () => ymdOf(new Date());
const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 保存できなくても動作は継続（モック） */ } };

let me = loadSession(loadEmployees()); // ログインしているマーケティング担当（なければ、ログイン画面）
let loginError = '';
let flyers = loadFlyers(today());
let tab = ['dashboard', 'flyers', 'calendar', 'response'].includes(pref('rq-mock-mkt-tab', '')) ? pref('rq-mock-mkt-tab', '') : 'dashboard';
let topLimit = 5; // ダッシュボードの、直近3か月の反響の上位の件数
let menuOpen = false;
let form = blankFlyer(today());
let selId = null; // 反響管理で、日ごとの受付を見ているチラシ
let mediaFilter = '';
let calMonth = today().slice(0, 7); // 配布カレンダーの月
const blankFilter = () => ({ stage: '', area: '', media: '', due: '', q: '' });
let flyerPage = 1; // チラシの一覧のページ（20件ごと）
let respPage = 1; // 反響管理の一覧のページ
let flyerFilter = blankFilter(); // チラシの一覧の検索条件
let calArea = ''; // 配布カレンダーの、エリアの絞り込み（'' ＝ すべて）
let calDay = today(); // 配布カレンダーで選んでいる日
let sortBy = 'efficiency'; // 反響管理の並び: efficiency（1件あたりの費用）／profit（損益）

// 反響の元になる受付（コールセンターの記録）。まだ何もなければ、見本の受付を入れる（コールセンターと同じ見本）
function ensureSamples() {
  if (loadReservations().length) return;
  sampleReservations().forEach(addReservation);
}

// 買取の実績: 訪問の記録があればそれを使い、なければ、確定した受付に見本の実績を入れる（デモ）
function resultsOf(receptions, visits) {
  return Object.fromEntries(receptions.map((r) => [r.id, receptionResult(r, visits) ?? demoResult(r)]).filter(([, v]) => v));
}

function render() {
  me = me ? loadSession(loadEmployees()) : null; // 無効になった人は、ログアウトになる
  if (!me) { $('#root').innerHTML = loginView(loginError, marketingStaffOf(loadEmployees())); setScreenBadge(mktScreenId({ staff: null })); return; }
  const onToday = flyersOnDay(flyers, today()).length;
  const due = dueFlyers(flyers, today());
  const dueNow = due.overdue.length + due.today.length; // 本日中に入稿するチラシ（期限切れを含む）
  const body = tab === 'dashboard' ? dashboardTab({ flyers, receptions: loadReservations(), results: resultsOf(loadReservations(), Object.values(loadLive())), today: today(), topLimit }) : tab === 'flyers' ? flyersTab({ flyers, form, today: today(), filter: flyerFilter, page: flyerPage }) : tab === 'calendar' ? calendarTab({ flyers, month: calMonth, today: today(), selDay: calDay, area: calArea }) : responseTab({ flyers, receptions: loadReservations(), visits: Object.values(loadLive()), results: resultsOf(loadReservations(), Object.values(loadLive())), selId, mediaFilter, sortBy, page: respPage });
  $('#root').innerHTML = `<div class="flex flex-col h-screen">
  <header class="bg-slate-800 text-white px-4 py-2 flex justify-between items-center">
    <div class="flex items-center gap-2"><button class="relative w-11 h-11 -ml-2 rounded-xl text-2xl leading-none hover:bg-white/10 active:bg-white/20" data-menu-open aria-label="メニューを開く">☰</button>
      <span class="font-bold text-xl">マーケティング部</span><span class="text-slate-500">›</span><span class="font-bold">${tabLabel(tab)}</span></div>
    <div class="text-sm"><span class="text-white/80">今日配布 <b class="text-base text-white">${onToday}</b>件</span>
      <span class="ml-3">${esc(me.name)}</span> ${themeToggleHtml()} <button class="underline text-white/80 text-xs ml-2" data-logout>ログアウト</button></div>
  </header>
  <main class="flex-1 min-h-0 overflow-y-auto">${body}</main>${menuOpen ? menuView({ tab, badges: { dashboard: dueNow, flyers: onToday } }) : ''}</div>`;
  setScreenBadge(mktScreenId({ staff: me, tab, selId }));
}

function commit(next) {
  if (!saveFlyers(next)) return alert('保存できませんでした（容量超過）');
  flyers = next;
}

function submitForm() {
  const r = saveFlyer(flyers, form);
  if (!r.ok) return alert(REASON_TEXT[r.reason] ?? '保存できませんでした');
  commit(r.flyers);
  form = blankFlyer(today());
  render();
}

function doLogin() {
  const r = login(document.querySelector('[data-login-id]').value, document.querySelector('[data-login-pw]').value, loadEmployees());
  if (!r.ok) { loginError = r.error; return render(); }
  loginError = '';
  saveSession(r.staff.id);
  me = r.staff;
  tab = 'dashboard'; // ログイン後は、いつも、ダッシュボードから（前回開いていたタブは、引き継がない）
  menuOpen = false;
  setPref('rq-mock-mkt-tab', tab);
  render();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-login-id],[data-login-pw]')) doLogin(); });
// フリーワードは、入力しながら、結果の表だけを作り直す（入力欄は、作り直さない）
function renderResults() {
  const el = document.querySelector('[data-flyer-results]');
  if (el) el.innerHTML = resultsHtml(flyers, today(), flyerFilter, flyerPage);
}
document.addEventListener('input', (e) => {
  if (e.target.matches('[data-flyer-q]')) { flyerFilter = { ...flyerFilter, q: e.target.value }; flyerPage = 1; renderResults(); return; }
  const k = e.target.dataset?.f;
  if (k) form = { ...form, [k]: e.target.value }; // 入力中は、画面を作り直さない（入力欄の文字・カーソルを壊さない）
});
// 選んだデザインデータを、フォームに入れる（画像・PDF）
function readFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { form = { ...form, file: { name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result) } }; render(); };
  reader.onerror = () => alert('ファイルを読み込めませんでした');
  reader.readAsDataURL(file);
}
document.addEventListener('change', (e) => {
  const sel = { 'data-flyer-farea': 'area', 'data-flyer-fmedia': 'media', 'data-flyer-fdue': 'due' };
  const attr = Object.keys(sel).find((a) => e.target.hasAttribute?.(a));
  if (attr) { flyerFilter = { ...flyerFilter, [sel[attr]]: e.target.value }; flyerPage = 1; render(); return; }
  if (e.target.matches('[data-f="media"]')) { form = { ...form, media: e.target.value }; render(); return; } // 配布方法で、次のIDが変わる
  if (e.target.matches('[data-flyer-file]')) { readFile(e.target.files?.[0]); return; }
});
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-response-row]');
  if (!t) return;
  const d = t.dataset;
  if ('login' in d) return doLogin();
  if ('logout' in d) { clearSession(); me = null; menuOpen = false; return render(); }
  if ('menuOpen' in d) { menuOpen = true; return render(); }
  if ('menuClose' in d) { menuOpen = false; return render(); }
  if (d.tab) { tab = d.tab; menuOpen = false; setPref('rq-mock-mkt-tab', tab); return render(); }
  if ('flyerSave' in d) return submitForm();
  if (d.flyerAdvance || d.flyerBack) { const id = d.flyerAdvance ?? d.flyerBack; const r = advanceFlyer(flyers, id, d.flyerAdvance ? 1 : -1, today()); if (r.ok) commit(r.flyers); return render(); }
  if (d.dashTop) { topLimit = Number(d.dashTop); return render(); }
  if (d.flyerFstage !== undefined) { flyerFilter = { ...flyerFilter, stage: d.flyerFstage }; flyerPage = 1; return render(); }
  if ('flyerFclear' in d) { flyerFilter = blankFilter(); flyerPage = 1; return render(); }
  if (d.calArea !== undefined) { calArea = d.calArea; return render(); }
  if (d.calDay) { calDay = d.calDay; return render(); }
  if (d.calMove !== undefined) { calMonth = d.calMove === '0' ? today().slice(0, 7) : shiftMonth(calMonth, Number(d.calMove)); if (d.calMove === '0') calDay = today(); return render(); }
  if ('flyerFileClear' in d) { form = { ...form, file: null }; return render(); }
  if (d.respSort) { sortBy = d.respSort; respPage = 1; return render(); }
  if ('flyerCancel' in d) { form = blankFlyer(today()); return render(); }
  if (d.flyerEdit) { form = formFromFlyer(flyers.find((f) => f.id === d.flyerEdit)); return render(); }
  if (d.flyerToggle) { const f = flyers.find((x) => x.id === d.flyerToggle); const r = setFlyerActive(flyers, f.id, !f.active); if (r.ok) commit(r.flyers); return render(); }
  if ('mediaFilter' in d) { mediaFilter = d.mediaFilter; respPage = 1; return render(); }
  if (d.flyerPage) { flyerPage = Number(d.flyerPage); return render(); }
  if (d.respPage) { respPage = Number(d.respPage); return render(); }
  if (d.responseRow) { selId = selId === d.responseRow ? null : d.responseRow; return render(); }
});
window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('rq-mock-reservations') && tab === 'response') render(); }); // コールセンターの受付を、すぐ反映

initTheme();
initHelp();
ensureSamples();
render();
