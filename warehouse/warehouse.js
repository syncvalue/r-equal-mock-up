// 倉庫・物流デスク画面（ダミー・PC想定）。商品の管理、販売（出品）、売上管理、クーリングオフによる返品の対応。
import { STOCK_KEY, WAREHOUSE_KEY, RETURN_KEY } from '../src/store.js';
import {
  MASTER_KEY, loadMaster, saveMaster, saveWarehouse, saveStaff, setWarehouseActive, warehouseById,
} from '../src/warehouseMaster.js';
import {
  loadState, saveState, buildRows, listItem, reprice, delist, recall, sell, requestReturn, shipReturn, completeReturn, returnableContracts, suggestPrice, scopeState, holdingByWarehouse,
} from '../src/warehouse.js';
import { loadUnits, saveUnits, receive, receiveCodes, resultMessage, codeFromQr } from '../src/stock.js';
import { seedSample } from '../src/warehouseSample.js';
import { login, loadSession, saveSession, clearSession } from '../src/warehouseStaff.js';
import { initTheme, themeToggleHtml } from '../src/theme.js';
import { formatMoneyInput } from '../src/moneyInput.js';
import { esc } from '../src/format.js';
import { stockTab } from './stockTab.js';
import { listTab } from './listTab.js';
import { salesTab } from './salesTab.js';
import { returnTab } from './returnTab.js';
import { receiveTab } from './receiveTab.js';
import { masterTab } from './masterTab.js';
import { loginView } from './loginView.js';
import { startScanner, cameraErrorText } from './camera.js';

const $ = (s) => document.querySelector(s);
const TABS = [['stock', '📦 商品管理'], ['receive', '📥 入庫'], ['list', '🛒 販売（出品）'], ['sales', '💹 売上管理'], ['return', '↩ クーリングオフ返品'], ['master', '🏭 倉庫マスタ']];
const blankList = () => ({ code: '', channel: 'mercari', price: 0, vendor: '' });
const blankSell = () => ({ code: '', price: 0, shipping: 0, buyer: '' });
const blankReturn = () => ({ visitId: '', codes: [], reason: 'family', memo: '' });
const MASTER_TEXT = {
  noName: '名前を入力してください', noLocations: '保管場所（棚）を1つ以上入力してください', badOffice: '営業所の指定が正しくありません', dupName: '同じ名前の倉庫がすでにあります', notFound: '対象が見つかりません',
  badLoginId: 'ログインIDは、英数字・ハイフン・アンダースコアの3〜20文字にしてください', dupLoginId: '同じログインIDの担当者がすでにいます', noWarehouse: '所属する倉庫を選んでください',
  inUse: 'この倉庫には、保管中の商品（在庫・出品中・委託中・返品対応中）があるため、無効にできません', hasStaff: 'この倉庫には有効な担当者がいるため、無効にできません（担当者を別の倉庫に移すか、無効にしてください）',
};
const REASON_TEXT = { notListable: '出品できない商品です（クーリングオフ期間中・返品対応中など）', badInput: '販売先と、1円以上の価格を入力してください', notListed: '出品中の商品ではありません', alreadySold: 'すでに売却済みです', notShipped: '返送済みにしてから完了してください' };
const REJECT_TEXT = { unknown: '登録のない商品', notStored: '入庫前の商品', expired: '保管期間（10日間）を過ぎた商品', inProgress: 'すでに返品対応中の商品', notReturnable: '返品できない状態の商品' };

let tab = 'stock';
let staff = loadSession(); // ログイン中の担当者（操作した人として記録する。所属する倉庫が、入庫先・表示の初期値になる）
let loginError = '';
const blankWh = () => ({ id: '', name: '', address: '', officeId: '', locations: '' });
const blankStaff = () => ({ id: '', name: '', loginId: '', warehouseId: '' });
const ui = { scope: staff?.warehouseId ?? 'all', mw: blankWh(), ms: blankStaff(), scan: { raw: '' }, rc: { location: '', last: null, checks: [] }, filter: 'all', q: '', period: 'day', lf: blankList(), sf: blankSell(), rf: blankReturn() };
let dirty = false; // 入力中に届いた更新を、入力完了後に反映するためのフラグ

let master = loadMaster();
const myWarehouse = () => warehouseById(master, staff.warehouseId);

// 倉庫で絞り込んだ状態（scope）を、各タブに渡す。入庫タブは、全倉庫の入庫待ちを扱う。QR読取は、他の倉庫の商品も探す
const tabBody = (full, now) => {
  const state = scopeState(full, ui.scope, master);
  const data = { ...state, rows: buildRows(state, now), master, allRows: buildRows(full, now), full };
  if (tab === 'receive') return receiveTab(full, ui, myWarehouse());
  if (tab === 'list') return listTab(data, ui);
  if (tab === 'sales') return salesTab(state, ui, now);
  if (tab === 'return') return returnTab(state, ui, now);
  if (tab === 'master') return masterTab({ master, holding: holdingByWarehouse(full, master, now) }, ui, staff);
  return stockTab(data, ui);
};

const scopeSelect = () => `<label class="text-xs">対象の倉庫 <select class="rounded px-2 py-1 text-sm text-slate-800" data-scope><option value="all" ${ui.scope === 'all' ? 'selected' : ''}>全倉庫</option>
  ${master.warehouses.map((w) => `<option value="${esc(w.id)}" ${ui.scope === w.id ? 'selected' : ''}>${esc(w.name)}${w.id === staff.warehouseId ? '（自分の倉庫）' : ''}${w.active ? '' : '（無効）'}</option>`).join('')}</select></label>`;

function render() {
  master = loadMaster();
  staff = staff ? loadSession(master) : null; // マスタで無効になった担当者は、ログアウトになる
  if (!staff) { $('#root').innerHTML = loginView(loginError, master); return; }
  if (ui.scope !== 'all' && !warehouseById(master, ui.scope)) ui.scope = 'all';
  const wh = myWarehouse();
  if (!wh.locations.includes(ui.rc.location)) ui.rc = { ...ui.rc, location: wh.locations[0] };
  const now = Date.now();
  const full = loadState();
  const state = scopeState(full, ui.scope, master);
  const rows = buildRows(state, now);
  // タブレットの幅でも崩れないよう、見出しは折り返し、本文が残りの高さを使う
  $('#root').innerHTML = `<div class="flex flex-col h-screen">
  <header class="bg-sky-900 text-white px-4 md:px-6 py-3 flex flex-wrap gap-2 justify-between items-center">
    <div class="font-bold text-xl">倉庫・物流 <span class="text-xs font-normal bg-white/20 rounded px-2 py-0.5 ml-2">ダミー画面（PC）</span></div>
    <div class="text-sm flex flex-wrap items-center gap-x-3 gap-y-1">${scopeSelect()}<span>入庫待ち <b class="text-lg">${full.units.filter((u) => u.status !== 'stored').length}</b>点 ／ 出品中 <b class="text-lg">${rows.filter((r) => r.stage === 'listed').length}</b>点 ／ 返品対応中 <b class="text-lg">${state.returns.filter((r) => r.status !== 'done').length}</b>件</span><span>👤 ${esc(staff.name)}（${esc(wh.name)}）</span> <button class="text-xs underline text-white/70" data-logout>ログアウト</button> <button class="text-xs underline text-white/70" data-sample>サンプルデータを入れ直す</button> ${themeToggleHtml()}</div>
  </header>
  <nav class="bg-white border-b px-2 md:px-6 flex gap-1 items-center overflow-x-auto">${TABS.map(([k, l]) => `<button class="px-4 py-3 font-bold border-b-4 whitespace-nowrap ${tab === k ? 'border-sky-700 text-sky-800' : 'border-transparent text-slate-500'}" data-tab="${k}">${l}</button>`).join('')}</nav>
  <main class="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">${tabBody(full, now)}</main></div>`;
}

// ---- 操作 -----------------------------------------------------------------------
const commit = (state) => { if (!saveState(state)) alert('保存できませんでした（容量超過）'); };
const moneyOf = (el) => Number((el?.value ?? '').replace(/\D/g, '')) || 0;
const inputBy = (attr, value) => [...document.querySelectorAll(`[${attr}]`)].find((el) => el.getAttribute(attr) === value);
const unitOf = (code) => loadState().units.find((u) => u.code === code);

function addListing() {
  const r = listItem(loadState(), ui.lf.code, { channel: ui.lf.channel, price: ui.lf.price, vendor: ui.lf.vendor, by: staff.name });
  if (!r.ok) return alert(REASON_TEXT[r.reason]);
  commit(r.state);
  ui.lf = { ...blankList(), channel: ui.lf.channel, vendor: ui.lf.vendor };
}
function registerSale(code) {
  const r = sell(loadState(), code, { price: ui.sf.price, shipping: ui.sf.shipping, buyer: ui.sf.buyer.trim(), by: staff.name });
  if (!r.ok) return alert(REASON_TEXT[r.reason]);
  commit(r.state);
  ui.sf = blankSell();
}
function addReturn() {
  const state = loadState();
  const contract = returnableContracts(state).find((c) => c.visitId === ui.rf.visitId);
  if (!contract || !ui.rf.codes.length) return;
  const r = requestReturn(state, { customerName: contract.customerName, codes: ui.rf.codes, reason: ui.rf.reason, memo: ui.rf.memo.trim(), by: staff.name });
  if (!r.ok) return alert(`返品を受け付けられませんでした。\n${r.rejected.map((x) => `${x.code}: ${REJECT_TEXT[x.reason]}`).join('\n')}`);
  commit(r.state);
  ui.rf = blankReturn();
}
// 入庫（誰の商品でも入庫できる）。シールを読み取った場合は、読取で照合したものとして記録する
function storeCode(raw) {
  const { list, result } = receive(loadUnits(), null, raw, { location: ui.rc.location, by: staff.name, method: 'scan', warehouseId: staff.warehouseId });
  if (result.type === 'ok' && !saveUnits(list)) return alert('保存できませんでした（容量超過）');
  ui.rc = { ...ui.rc, last: resultMessage(result) };
}
// 明細と実物を見比べて☑した商品を入庫する（☑の記録は、入庫した商品に残る）
function storeChecked(codes) {
  const { list, count } = receiveCodes(loadUnits(), codes.filter((c) => ui.rc.checks.includes(c)), { location: ui.rc.location, by: staff.name, method: 'manual', warehouseId: staff.warehouseId });
  if (!count) return alert('明細と実物を見比べて、☑を付けた商品がありません');
  if (!saveUnits(list)) return alert('保存できませんでした（容量超過）');
  ui.rc = { ...ui.rc, checks: ui.rc.checks.filter((c) => !codes.includes(c)), last: { ok: true, text: `${count}点を ${ui.rc.location} に入庫しました（${myWarehouse().name}・照合: ${staff.name}）` } };
}
const visitCodes = (visitId) => loadUnits().filter((u) => u.visitId === visitId && u.status !== 'stored').map((u) => u.code);
function toggleAll(visitId) {
  const codes = visitCodes(visitId);
  const all = codes.every((c) => ui.rc.checks.includes(c));
  ui.rc = { ...ui.rc, checks: all ? ui.rc.checks.filter((c) => !codes.includes(c)) : [...new Set([...ui.rc.checks, ...codes])] };
}
// QRシールを読み取って、商品の詳細・履歴を表示する（商品管理タブ）
function scanCode(raw) {
  ui.scan = { raw: String(raw ?? '').trim() };
  tab = 'stock';
  ui.filter = 'all';
  ui.q = '';
}
// ---- カメラでの読み取り（タブレット） -------------------------------------------------
// 全画面のカメラ表示は、画面の再描画（#root）で消えないよう、#root の外に作る。
// search: 1回読み取ったら閉じて、商品の詳細を表示する／receive: 開いたまま、続けて入庫する
let stopCamera = null;
function closeCamera() {
  stopCamera?.();
  stopCamera = null;
  document.querySelector('#cam')?.remove();
}
async function openCamera(mode) {
  closeCamera();
  const el = document.createElement('div');
  el.id = 'cam';
  el.className = 'fixed inset-0 z-50 bg-black text-white flex flex-col';
  el.innerHTML = `<div class="flex items-center gap-3 p-3 bg-black/70"><b class="text-lg">${mode === 'receive' ? '📥 読み取って入庫' : '🔳 読み取って探す'}</b>
    <span class="text-sm text-white/70">${mode === 'receive' ? `保管場所: ${esc(ui.rc.location)}` : 'シールのQRを枠に入れてください'}</span>
    <button class="ml-auto b b-sec !text-slate-800" data-cam-close>閉じる</button></div>
    <video class="flex-1 min-h-0 w-full object-cover" muted></video>
    <div class="p-3 text-center font-bold text-lg bg-black/70" data-cam-msg>カメラを起動しています…</div>`;
  document.body.appendChild(el);
  el.querySelector('[data-cam-close]').addEventListener('click', closeCamera);
  const msg = el.querySelector('[data-cam-msg]');
  const onCode = (text) => {
    const code = codeFromQr(text);
    if (mode === 'search') { closeCamera(); scanCode(code); render(); return; }
    storeCode(code);
    msg.textContent = `${ui.rc.last.ok ? '✓' : '⚠'} ${ui.rc.last.text}`;
    msg.className = `p-3 text-center font-bold text-lg ${ui.rc.last.ok ? 'bg-emerald-700' : 'bg-rose-700'}`;
    render();
  };
  try {
    stopCamera = await startScanner(el.querySelector('video'), onCode);
    msg.textContent = 'シールのQRを枠に入れてください';
  } catch (e) {
    closeCamera();
    alert(cameraErrorText(e));
  }
}

// ---- 倉庫マスタ -------------------------------------------------------------------
function commitMaster(next) { if (!saveMaster(next)) alert('保存できませんでした（容量超過）'); }
function saveWh() {
  const r = saveWarehouse(master, { ...ui.mw, id: ui.mw.id || undefined });
  if (!r.ok) return alert(MASTER_TEXT[r.reason]);
  commitMaster(r.master);
  ui.mw = blankWh();
}
function toggleWh(id) {
  const w = warehouseById(master, id);
  const holding = holdingByWarehouse(loadState(), master)[id]?.count ?? 0;
  const r = setWarehouseActive(master, id, !w.active, { holding });
  if (!r.ok) return alert(MASTER_TEXT[r.reason]);
  commitMaster(r.master);
}
function saveSt() {
  const r = saveStaff(master, { ...ui.ms, id: ui.ms.id || undefined });
  if (!r.ok) return alert(MASTER_TEXT[r.reason]);
  commitMaster(r.master);
  ui.ms = blankStaff();
}
function toggleStaff(id) {
  const st = master.staff.find((x) => x.id === id);
  if (st.id === staff.id && st.active) return alert('ログイン中の自分自身は、無効にできません');
  const r = saveStaff(master, { ...st, active: !st.active });
  if (!r.ok) return alert(MASTER_TEXT[r.reason]);
  commitMaster(r.master);
}

function goReturn(visitId) {
  const contract = returnableContracts(loadState()).find((c) => c.visitId === visitId);
  ui.rf = { ...blankReturn(), visitId, codes: contract ? contract.units.map((u) => u.code) : [] };
  tab = 'return';
}

function doLogin() {
  const r = login($('[data-login-id]')?.value, $('[data-login-pw]')?.value, loadMaster());
  loginError = r.ok ? '' : r.error;
  if (r.ok) { staff = r.staff; saveSession(r.staff.id); ui.scope = r.staff.warehouseId; } // ログインすると、所属する倉庫が対象になる
}

const ACTIONS = {
  tab: (v) => { tab = v; },
  filter: (v) => { ui.filter = v; },
  qrSubmit: () => scanCode($('[data-qr]')?.value),
  camSearch: () => { openCamera('search'); return false; },
  camReceive: () => { openCamera('receive'); return false; },
  mwSave: saveWh,
  mwEdit: (v) => { const w = warehouseById(master, v); ui.mw = { id: w.id, name: w.name, address: w.address, officeId: w.officeId, locations: w.locations.join('\n') }; },
  mwCancel: () => { ui.mw = blankWh(); },
  mwToggle: toggleWh,
  msSave: saveSt,
  msEdit: (v) => { const st = master.staff.find((x) => x.id === v); ui.ms = { id: st.id, name: st.name, loginId: st.loginId, warehouseId: st.warehouseId }; },
  msCancel: () => { ui.ms = blankStaff(); },
  msToggle: toggleStaff,
  qrClose: () => { ui.scan = { raw: '' }; },
  rcLoc: (v) => { ui.rc = { ...ui.rc, location: v }; },
  rcSubmit: () => storeCode($('[data-rc-code]')?.value),
  rcUnit: (v) => storeChecked([v]),
  rcVisit: (v) => storeChecked(visitCodes(v)),
  rcAll: toggleAll,
  logout: () => { clearSession(); staff = null; loginError = ''; },
  login: doLogin,
  period: (v) => { ui.period = v; },
  goList: (v) => { ui.lf = { ...blankList(), code: v, price: suggestPrice(unitOf(v)) }; tab = 'list'; },
  goReturn,
  lfChannel: (v) => { ui.lf = { ...ui.lf, channel: v }; },
  listAdd: addListing,
  reprice: (v) => commit(reprice(loadState(), v, moneyOf(inputBy('data-reprice-input', v)))),
  sellOpen: (v) => { ui.sf = { ...blankSell(), code: v, price: loadState().records[v]?.listPrice ?? 0 }; },
  sellCancel: () => { ui.sf = blankSell(); },
  sellDone: registerSale,
  delist: (v) => { if (confirm('この商品の出品を取り下げて、在庫に戻します。よろしいですか？')) commit(delist(loadState(), v)); },
  recall: (v) => { if (confirm('この商品は売れ残り、委託先から倉庫に戻ってきましたか？ 倉庫の在庫に戻します。')) commit(recall(loadState(), v)); },
  returnAdd: addReturn,
  ship: (v) => {
    const state = loadState();
    const next = shipReturn(state, v, { tracking: inputBy('data-track', v)?.value, by: staff.name });
    if (next === state) return alert('追跡番号を入力してください');
    commit(next);
  },
  returnDone: (v) => {
    if (!confirm('お客様から買取代金の返還を確認できましたか？ 完了すると、この商品は返品済みになります。')) return;
    const r = completeReturn(loadState(), v, Date.now(), staff.name);
    if (!r.ok) return alert(REASON_TEXT[r.reason]);
    commit(r.state);
  },
  sample: () => {
    if (!confirm('倉庫の商品・出品・売上・返品のデータを、サンプルデータに置き換えます（営業が登録した入庫待ちの商品は残ります）。よろしいですか？')) return false;
    seedSample(Date.now(), true);
    ui.sf = blankSell();
    ui.rf = blankReturn();
    ui.lf = blankList();
    return true;
  },
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  const key = Object.keys(ACTIONS).find((k) => k in t.dataset); // data-go-list → dataset.goList のように、ACTIONS のキーになる
  if (!key) return;
  if (ACTIONS[key](t.dataset[key]) === false) return;
  render();
});

const FORMS = { lf: () => ui.lf, sf: () => ui.sf, rf: () => ui.rf, mw: () => ui.mw, ms: () => ui.ms };
const MONEY = new Set(['lf.price', 'sf.price', 'sf.shipping']);
function onField(e, isInput) {
  const f = e.target.dataset.f ?? '';
  const [form, key] = f.split('.');
  if (!FORMS[form]) return false;
  const isMoney = MONEY.has(f);
  if (isInput !== (isMoney || e.target.tagName === 'INPUT')) return true; // input欄は入力中に、選択欄は選択時に反映
  ui[form] = { ...FORMS[form](), [key]: isMoney ? formatMoneyInput(e.target) : e.target.value };
  return true;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches?.('[data-login-id], [data-login-pw]')) { doLogin(); render(); return; }
  if (e.key === 'Enter' && e.target.matches?.('[data-qr]')) {
    scanCode(e.target.value);
    render();
    $('[data-qr]')?.focus(); // 続けて読み取れるように
    return;
  }
  if (e.key !== 'Enter' || !e.target.matches?.('[data-rc-code]')) return;
  storeCode(e.target.value);
  render();
  $('[data-rc-code]')?.focus(); // 続けて読み取れるように
});
document.addEventListener('input', (e) => {
  if (e.target.matches('[data-reprice-input]')) return void formatMoneyInput(e.target);
  if (e.target.matches('[data-q]')) {
    ui.q = e.target.value;
    render();
    const q = $('[data-q]');
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
    return;
  }
  onField(e, true);
});
document.addEventListener('change', (e) => {
  if (e.target.matches?.('[data-scope]')) { ui.scope = e.target.value; render(); return; }
  if (e.target.matches?.('[data-rc-check]')) {
    const code = e.target.dataset.rcCheck;
    ui.rc = { ...ui.rc, checks: e.target.checked ? [...ui.rc.checks, code] : ui.rc.checks.filter((c) => c !== code) };
    render();
    return;
  }
  if (e.target.matches('[data-rf-code]')) {
    const code = e.target.dataset.rfCode;
    ui.rf = { ...ui.rf, codes: e.target.checked ? [...ui.rf.codes, code] : ui.rf.codes.filter((c) => c !== code) };
    render();
    return;
  }
  if (!onField(e, false)) return;
  if (e.target.dataset.f === 'lf.code') ui.lf = { ...ui.lf, price: ui.lf.code ? suggestPrice(unitOf(ui.lf.code)) : 0 };
  if (e.target.dataset.f === 'rf.visitId') {
    const contract = returnableContracts(loadState()).find((c) => c.visitId === ui.rf.visitId);
    ui.rf = { ...ui.rf, codes: contract ? contract.units.map((u) => u.code) : [] };
  }
  if (['lf.code', 'rf.visitId'].includes(e.target.dataset.f)) render(); // 金額・商品の一覧が変わるもの
});

// 営業のタブレット（入庫）や、別タブでの更新を反映。入力中なら、入力欄から離れたときに反映する
const isEditing = () => Boolean(document.activeElement?.matches?.('input, select, textarea'));
window.addEventListener('storage', (e) => {
  if (![STOCK_KEY, WAREHOUSE_KEY, RETURN_KEY, MASTER_KEY].includes(e.key)) return;
  if (isEditing()) dirty = true;
  else render();
});
document.addEventListener('focusout', () => { if (dirty) setTimeout(() => !isEditing() && ((dirty = false), render()), 0); });

seedSample(); // 初めて開いたとき（記録が空のとき）だけ、サンプルデータを入れる
initTheme();
render();
