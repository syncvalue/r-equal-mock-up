// マーケティング部の画面（ダミー・PC想定）。チラシの登録と、反響管理（どのチラシが効果的だったか）。
import { setScreenBadge, mktScreenId } from '../src/screenIds.js';
import { loadFlyers, saveFlyers, saveFlyer, setFlyerActive, flyersOnDay, receptionResult, demoResult } from '../src/flyers.js';
import { loadLive } from '../src/store.js';
import { loadReservations, addReservation, ymdOf } from '../src/reservations.js';
import { sampleReservations } from '../callcenter/samples.js';
import { loadEmployees } from '../src/employees.js';
import { initTheme, themeToggleHtml } from '../src/theme.js';
import { initHelp } from '../src/help.js';
import { esc } from '../src/format.js';
import { tabLabel, menuView } from './menu.js';
import { flyersTab, blankFlyer, formFromFlyer, REASON_TEXT } from './flyersTab.js';
import { responseTab } from './responseTab.js';

const $ = (s) => document.querySelector(s);
const today = () => ymdOf(new Date());
const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 保存できなくても動作は継続（モック） */ } };

const staff = () => loadEmployees().filter((u) => u.role === 'marketing' && u.active);
let staffId = pref('rq-mock-mkt-staff', staff()[0]?.id ?? '');
let flyers = loadFlyers(today());
let tab = ['flyers', 'response'].includes(pref('rq-mock-mkt-tab', '')) ? pref('rq-mock-mkt-tab', '') : 'flyers';
let menuOpen = false;
let form = blankFlyer(today());
let selId = null; // 反響管理で、日ごとの受付を見ているチラシ
let mediaFilter = '';
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
  const onToday = flyersOnDay(flyers, today()).length;
  const body = tab === 'flyers' ? flyersTab({ flyers, form, today: today() }) : responseTab({ flyers, receptions: loadReservations(), visits: Object.values(loadLive()), results: resultsOf(loadReservations(), Object.values(loadLive())), selId, mediaFilter, sortBy });
  const me = staff().find((u) => u.id === staffId) ?? staff()[0];
  $('#root').innerHTML = `<div class="flex flex-col h-screen">
  <header class="bg-slate-800 text-white px-4 py-2 flex justify-between items-center">
    <div class="flex items-center gap-2"><button class="relative w-11 h-11 -ml-2 rounded-xl text-2xl leading-none hover:bg-white/10 active:bg-white/20" data-menu-open aria-label="メニューを開く">☰</button>
      <span class="font-bold text-xl">マーケティング部</span><span class="text-slate-500">›</span><span class="font-bold">${tabLabel(tab)}</span></div>
    <div class="text-sm"><span class="text-white/80">今日配布 <b class="text-base text-white">${onToday}</b>件</span>
      <label class="ml-3 text-xs text-white/80">マーケティング担当 <select class="rounded bg-white/20 text-white px-1 py-0.5 font-bold" data-staff>${staff().map((u) => `<option class="text-slate-900" value="${esc(u.id)}" ${u.id === me?.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label> ${themeToggleHtml()}</div>
  </header>
  <main class="flex-1 min-h-0 overflow-y-auto">${body}</main>${menuOpen ? menuView({ tab, badges: { flyers: onToday } }) : ''}</div>`;
  setScreenBadge(mktScreenId({ tab, selId }));
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

document.addEventListener('input', (e) => {
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
  if (e.target.matches('[data-f="media"]')) { form = { ...form, media: e.target.value }; render(); return; } // 配布方法で、次のIDが変わる
  if (e.target.matches('[data-flyer-file]')) { readFile(e.target.files?.[0]); return; }
  if (e.target.matches('[data-staff]')) { staffId = e.target.value; setPref('rq-mock-mkt-staff', staffId); }
});
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-response-row]');
  if (!t) return;
  const d = t.dataset;
  if ('menuOpen' in d) { menuOpen = true; return render(); }
  if ('menuClose' in d) { menuOpen = false; return render(); }
  if (d.tab) { tab = d.tab; menuOpen = false; setPref('rq-mock-mkt-tab', tab); return render(); }
  if ('flyerSave' in d) return submitForm();
  if ('flyerFileClear' in d) { form = { ...form, file: null }; return render(); }
  if (d.respSort) { sortBy = d.respSort; return render(); }
  if ('flyerCancel' in d) { form = blankFlyer(today()); return render(); }
  if (d.flyerEdit) { form = formFromFlyer(flyers.find((f) => f.id === d.flyerEdit)); return render(); }
  if (d.flyerToggle) { const f = flyers.find((x) => x.id === d.flyerToggle); const r = setFlyerActive(flyers, f.id, !f.active); if (r.ok) commit(r.flyers); return render(); }
  if ('mediaFilter' in d) { mediaFilter = d.mediaFilter; return render(); }
  if (d.responseRow) { selId = selId === d.responseRow ? null : d.responseRow; return render(); }
});
window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('rq-mock-reservations') && tab === 'response') render(); }); // コールセンターの受付を、すぐ反映

initTheme();
initHelp();
ensureSamples();
render();
