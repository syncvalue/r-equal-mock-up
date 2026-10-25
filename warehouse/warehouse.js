// 倉庫・物流デスク画面（ダミー・PC想定）。商品の管理、販売（出品）、売上管理、クーリングオフによる返品の対応。
import { STOCK_KEY, WAREHOUSE_KEY, RETURN_KEY, TRANSFER_KEY } from '../src/store.js';
import {
  MASTER_KEY, loadMaster, saveMaster, saveWarehouse, saveStaff, saveHighValueRule, destinationProblem, setWarehouseActive, warehouseById, warehouseIdOf,
} from '../src/warehouseMaster.js';
import {
  loadState, saveState, buildRows, relabelUnit, replacedCode, listItem, reprice, delist, recall, sell, requestReturn, shipReturn, completeReturn, returnableContracts, suggestPrice, scopeState, holdingByWarehouse,
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
import { transferTab } from './transferTab.js';
import { sendTransfer, receiveTransfer, cancelTransfer, incoming } from '../src/warehouseTransfer.js';
import { loginView } from './loginView.js';
import { startScanner, cameraErrorText } from './camera.js';

const $ = (s) => document.querySelector(s);
const TABS = [['stock', '📦 商品管理'], ['receive', '📥 入庫'], ['transfer', '🚚 倉庫間移動'], ['list', '🛒 販売（出品）'], ['sales', '💹 売上管理'], ['return', '↩ クーリングオフ返品'], ['master', '🏭 倉庫マスタ']];
const blankList = () => ({ code: '', channel: 'mercari', price: 0, vendor: '' });
const blankSell = () => ({ code: '', price: 0, shipping: 0, buyer: '' });
const blankReturn = () => ({ visitId: '', codes: [], reason: 'family', memo: '' });
const MASTER_TEXT = {
  dupHonsha: '本社（高額品の保管先）は、すでに登録されています（1か所だけです）', noRule: '本社に納入するシールの色を、1つ以上選んでください', badColor: 'シールの色が正しくありません', noName: '名前を入力してください', noLocations: '保管場所（棚）を1つ以上入力してください', badOffice: '営業所の指定が正しくありません', dupName: '同じ名前の倉庫がすでにあります', notFound: '対象が見つかりません',
  badLoginId: 'ログインIDは、英数字・ハイフン・アンダースコアの3〜20文字にしてください', dupLoginId: '同じログインIDの担当者がすでにいます', noWarehouse: '所属する倉庫を選んでください',
  inUse: 'この倉庫には、保管中の商品（在庫・出品中・委託中・返品対応中）があるため、無効にできません', hasStaff: 'この倉庫には有効な担当者がいるため、無効にできません（担当者を別の倉庫に移すか、無効にしてください）',
};
const REASON_TEXT = { notListable: '出品できない商品です（クーリングオフ期間中・返品対応中など）', badInput: '販売先と、1円以上の価格を入力してください', notListed: '出品中の商品ではありません', alreadySold: 'すでに売却済みです', notShipped: '返送済みにしてから完了してください' };
const REJECT_TEXT = { inTransit: '倉庫間を輸送中の商品（届いてから受け付けてください）', unknown: '登録のない商品', notStored: '入庫前の商品', expired: '保管期間（10日間）を過ぎた商品', inProgress: 'すでに返品対応中の商品', notReturnable: '返品できない状態の商品' };

let tab = 'stock';
let staff = loadSession(); // ログイン中の担当者（操作した人として記録する。所属する倉庫が、入庫先・表示の初期値になる）
let loginError = '';
const blankWh = () => ({ id: '', name: '', address: '', officeId: '', locations: '', highValue: false });
const blankStaff = () => ({ id: '', name: '', loginId: '', warehouseId: '' });
const ui = { rl: { code: '', newCode: '', color: '' }, hv: null, tf: { toId: '', codes: [] }, tr: { checks: [], locs: {} }, salesScope: '', scope: staff?.warehouseId ?? 'all', mw: blankWh(), ms: blankStaff(), scan: { raw: '' }, rc: { location: '', last: null, checks: [] }, filter: 'all', view: 'lot', q: '', period: 'day', lf: blankList(), sf: blankSell(), rf: blankReturn() };
let dirty = false; // 入力中に届いた更新を、入力完了後に反映するためのフラグ

let master = loadMaster();
const myWarehouse = () => warehouseById(master, staff.warehouseId);

// 倉庫で絞り込んだ状態（scope）を、各タブに渡す。入庫タブは、全倉庫の入庫待ちを扱う。QR読取は、他の倉庫の商品も探す
const tabBody = (full, now) => {
  const state = scopeState(full, ui.scope, master);
  const data = { ...state, rows: buildRows(state, now), master, allRows: buildRows(full, now), full, me: staff };
  // 出品・売却・返品は、自分の倉庫の商品だけ扱える（他の倉庫の商品は、先に移動する）
  const own = scopeState(full, staff.warehouseId, master);
  const ownNotice = `<div class="text-xs rounded bg-sky-50 border border-sky-200 p-2">この画面で扱えるのは、あなたの倉庫（${esc(myWarehouse().name)}）の商品だけです。他の倉庫の商品は、先に「🚚 倉庫間移動」で、自分の倉庫に移してください。</div>`;
  if (tab === 'receive') return receiveTab(full, ui, myWarehouse(), master);
  if (tab === 'transfer') return transferTab(full, master, ui, staff, now);
  if (tab === 'list') return ownNotice + listTab({ ...own, rows: buildRows(own, now) }, ui);
  if (tab === 'sales') return salesTab(full, master, ui, staff, now);
  if (tab === 'return') return `<div class="text-xs rounded bg-sky-50 border border-sky-200 p-2">返品の受付は、他の倉庫・本社の商品を含む契約全体で行えます。返送・完了の対応は、あなたの倉庫（${esc(myWarehouse().name)}）の商品だけです。</div>${returnTab(own, ui, now, { full, master })}`;
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
    <div class="text-sm flex flex-wrap items-center gap-x-3 gap-y-1">${['stock', 'master'].includes(tab) ? scopeSelect() : ''}<span>入庫待ち <b class="text-lg">${full.units.filter((u) => u.status !== 'stored').length}</b>点 ／ 出品中 <b class="text-lg">${rows.filter((r) => r.stage === 'listed').length}</b>点 ／ 返品対応中 <b class="text-lg">${state.returns.filter((r) => r.status !== 'done').length}</b>件 ／ 受け取り待ち <b class="text-lg">${incoming(full, staff.warehouseId).length}</b>件</span><span>👤 ${esc(staff.name)}（${esc(wh.name)}）</span> <button class="text-xs underline text-white/70" data-logout>ログアウト</button> <button class="text-xs underline text-white/70" data-sample>サンプルデータを入れ直す</button> ${themeToggleHtml()}</div>
  </header>
  <nav class="bg-white border-b px-2 md:px-6 flex gap-1 items-center overflow-x-auto">${TABS.map(([k, l]) => `<button class="px-4 py-3 font-bold border-b-4 whitespace-nowrap ${tab === k ? 'border-sky-700 text-sky-800' : 'border-transparent text-slate-500'}" data-tab="${k}">${l}</button>`).join('')}</nav>
  <main class="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">${tabBody(full, now)}</main></div>`;
}

// ---- 操作 -----------------------------------------------------------------------
const commit = (state) => { if (!saveState(state)) alert('保存できませんでした（容量超過）'); };
const moneyOf = (el) => Number((el?.value ?? '').replace(/\D/g, '')) || 0;
const inputBy = (attr, value) => [...document.querySelectorAll(`[${attr}]`)].find((el) => el.getAttribute(attr) === value);
const unitOf = (code) => loadState().units.find((u) => u.code === code);

// 他の倉庫の商品は扱えない（出品・売却・価格変更・返品など）。扱えるときは true
const NOT_OWN = '他の倉庫の商品は扱えません。先に「倉庫間移動」で、自分の倉庫に移してください。';
function ownsAll(codes) {
  const ok = codes.every((c) => { const u = unitOf(c); return u && warehouseIdOf(u, master) === staff.warehouseId; });
  if (!ok) alert(NOT_OWN);
  return ok;
}

function addListing() {
  if (!ownsAll([ui.lf.code])) return;
  const r = listItem(loadState(), ui.lf.code, { channel: ui.lf.channel, price: ui.lf.price, vendor: ui.lf.vendor, by: staff.name });
  if (!r.ok) return alert(REASON_TEXT[r.reason]);
  commit(r.state);
  ui.lf = { ...blankList(), channel: ui.lf.channel, vendor: ui.lf.vendor };
}
function registerSale(code) {
  if (!ownsAll([code])) return;
  const r = sell(loadState(), code, { price: ui.sf.price, shipping: ui.sf.shipping, buyer: ui.sf.buyer.trim(), by: staff.name });
  if (!r.ok) return alert(REASON_TEXT[r.reason]);
  commit(r.state);
  ui.sf = blankSell();
}
function addReturn() {
  const state = loadState();
  const contract = returnableContracts(state).find((c) => c.visitId === ui.rf.visitId);
  if (!contract || !ui.rf.codes.length) return;
  const r = requestReturn(state, { customerName: contract.customerName, codes: ui.rf.codes, reason: ui.rf.reason, memo: ui.rf.memo.trim(), by: staff.name, master });
  if (!r.ok) return alert(`返品を受け付けられませんでした。\n${r.rejected.map((x) => `${x.code}: ${REJECT_TEXT[x.reason]}`).join('\n')}`);
  commit(r.state);
  ui.rf = blankReturn();
}
// 入庫（誰の商品でも入庫できる）。シールを読み取った場合は、読取で照合したものとして記録する
const DEST_TEXT = { highToHonsha: 'は高額品のため、本社に納入します（本社の担当者が入庫します）', normalToWarehouse: 'は高額品ではないため、本社ではなく倉庫に納入します' };
function storeCode(raw) {
  const unit = loadUnits().find((u) => u.code === String(raw ?? '').trim().toUpperCase());
  const problem = unit && unit.status !== 'stored' ? destinationProblem(master, unit, staff.warehouseId) : '';
  if (problem) { ui.rc = { ...ui.rc, last: { ok: false, text: `${unit.code} ${DEST_TEXT[problem]}` } }; return; }
  const { list, result } = receive(loadUnits(), null, raw, { location: ui.rc.location, by: staff.name, method: 'scan', warehouseId: staff.warehouseId });
  if (result.type === 'ok' && !saveUnits(list)) return alert('保存できませんでした（容量超過）');
  ui.rc = { ...ui.rc, last: resultMessage(result) };
}
// 明細と実物を見比べて☑した商品を入庫する（☑の記録は、入庫した商品に残る）
function storeChecked(codes) {
  const mine = new Map(loadUnits().map((u) => [u.code, u]));
  const targets = codes.filter((c) => ui.rc.checks.includes(c) && mine.has(c) && !destinationProblem(master, mine.get(c), staff.warehouseId));
  const { list, count } = receiveCodes(loadUnits(), targets, { location: ui.rc.location, by: staff.name, method: 'manual', warehouseId: staff.warehouseId });
  if (!count) return alert('明細と実物を見比べて、☑を付けた商品がありません');
  if (!saveUnits(list)) return alert('保存できませんでした（容量超過）');
  ui.rc = { ...ui.rc, checks: ui.rc.checks.filter((c) => !codes.includes(c)), last: { ok: true, text: `${count}点を ${ui.rc.location} に入庫しました（${myWarehouse().name}・照合: ${staff.name}）` } };
}
const visitCodes = (visitId) => loadUnits().filter((u) => u.visitId === visitId && u.status !== 'stored' && !destinationProblem(master, u, staff.warehouseId)).map((u) => u.code); // 自分の倉庫で入庫できる商品だけ
function toggleAll(visitId) {
  const codes = visitCodes(visitId);
  const all = codes.every((c) => ui.rc.checks.includes(c));
  ui.rc = { ...ui.rc, checks: all ? ui.rc.checks.filter((c) => !codes.includes(c)) : [...new Set([...ui.rc.checks, ...codes])] };
}
// QRシールを読み取って、商品の詳細・履歴を表示する（商品管理タブ）
function scanCode(raw) {
  const rep = replacedCode(loadUnits(), raw); // 貼り替え済みの古いシールなら、新しいシールの商品を表示する
  ui.scan = rep ? { raw: rep.to, notice: `${rep.from} は、貼り替え済みの古いシールです。新しいシールNo.（${rep.to}）の商品を表示しています。` } : { raw: String(raw ?? '').trim() };
  ui.rl = { code: '', newCode: '', color: '' };
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

// ---- シールの貼り替え（色の間違いなど。シールNo.も新しくなる）-----------------------------
const RELABEL_TEXT = {
  unknown: '商品が見つかりません', badCode: '新しいシールNo.を入力してください', sameCode: '新しいシールNo.が、いまと同じです', dupCode: 'そのシールNo.は、すでに使われています（貼り替え済みの古いNo.も使えません）',
  badColor: '新しいシールの色を選んでください', notRelabelable: '出品中・委託中・売却済み・返品対応中・輸送中の商品は、貼り替えられません',
};
function doRelabel(code) {
  const state = loadState();
  const unit = state.units.find((u) => u.code === code);
  if (unit?.status === 'stored' && !ownsAll([code])) return;
  const r = relabelUnit(state, code, { newCode: ui.rl.newCode, color: ui.rl.color, by: staff.name });
  if (!r.ok) return alert(RELABEL_TEXT[r.reason]);
  if (!saveUnits(r.state.units)) return alert('保存できませんでした（容量超過）');
  commit(r.state);
  const next = r.state.units.find((u) => u.sealColor === ui.rl.color && u.relabels?.at(-1)?.from === code);
  const problem = next.status === 'stored' ? destinationProblem(master, next, next.warehouseId ?? staff.warehouseId) : '';
  ui.rc = { ...ui.rc, checks: ui.rc.checks.filter((c) => c !== code) };
  ui.rl = { code: '', newCode: '', color: '' };
  if (ui.scan.raw === code) ui.scan = { raw: next.code };
  alert(`シールを貼り替えました。新しいシールNo.: ${next.code}${problem ? `\n\nシールの色が変わり、${problem === 'highToHonsha' ? '高額品になった' : '高額品でなくなった'}ため、${problem === 'highToHonsha' ? '本社' : '倉庫'}に移す必要があります。「🚚 倉庫間移動」で移してください。` : ''}`);
}

// ---- 倉庫間の移動 -----------------------------------------------------------------
const TRANSFER_TEXT = {
  sameWarehouse: '送り先は、別の倉庫を選んでください', badDestination: '送り先の倉庫が正しくありません', noItems: '送れる商品がありません（在庫のものだけ送れます）',
  notInTransit: 'すでに受け取り済み、または取り消し済みです', notDestination: 'あなたの倉庫あてではないため、受け取れません', badLocation: '保管場所を選んでください', notSender: '送った倉庫でなければ、取り消せません',
};
const SEND_REJECT = { unknown: '登録のない商品', notStock: '在庫ではない商品（出品中・委託中・返品対応中・輸送中など）', otherWarehouse: '他の倉庫の商品' };
function sendItems() {
  const r = sendTransfer(loadState(), master, { fromId: staff.warehouseId, toId: ui.tf.toId, codes: ui.tf.codes, by: staff.name });
  if (!r.ok) return alert(TRANSFER_TEXT[r.reason]);
  commit(r.state);
  if (r.rejected.length) alert(`送れなかった商品があります。\n${r.rejected.map((x) => `${x.code}: ${SEND_REJECT[x.reason]}`).join('\n')}`);
  ui.tf = { toId: ui.tf.toId, codes: [] };
}
function receiveItems(id) {
  const t = loadState().transfers.find((x) => x.id === id);
  const location = ui.tr.locs[id] ?? myWarehouse().locations[0];
  const r = receiveTransfer(loadState(), master, id, { receiverWarehouseId: staff.warehouseId, location, by: staff.name });
  if (!r.ok) return alert(TRANSFER_TEXT[r.reason]);
  if (!saveUnits(r.state.units)) return alert('保存できませんでした（容量超過）');
  commit(r.state);
  ui.tr = { ...ui.tr, checks: ui.tr.checks.filter((c) => !t.codes.includes(c)) };
}
function cancelItems(id) {
  if (!confirm('この移動を取り消して、商品を自分の倉庫の在庫に戻します。よろしいですか？')) return;
  const r = cancelTransfer(loadState(), id, { byWarehouseId: staff.warehouseId });
  if (!r.ok) return alert(TRANSFER_TEXT[r.reason]);
  commit(r.state);
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
  view: (v) => { ui.view = v; },
  qrSubmit: () => scanCode($('[data-qr]')?.value),
  camSearch: () => { openCamera('search'); return false; },
  camReceive: () => { openCamera('receive'); return false; },
  mwSave: saveWh,
  mwEdit: (v) => { const w = warehouseById(master, v); ui.mw = { id: w.id, name: w.name, address: w.address, officeId: w.officeId, locations: w.locations.join('\n'), highValue: Boolean(w.highValue) }; },
  hvSave: () => {
    const r = saveHighValueRule(master, { colors: ui.hv ?? master.highValue.colors });
    if (!r.ok) return alert(MASTER_TEXT[r.reason]);
    commitMaster(r.master);
    ui.hv = null;
  },
  mwCancel: () => { ui.mw = blankWh(); },
  mwToggle: toggleWh,
  msSave: saveSt,
  msEdit: (v) => { const st = master.staff.find((x) => x.id === v); ui.ms = { id: st.id, name: st.name, loginId: st.loginId, warehouseId: st.warehouseId }; },
  msCancel: () => { ui.ms = blankStaff(); },
  msToggle: toggleStaff,
  tfSend: sendItems,
  trReceive: receiveItems,
  trCancel: cancelItems,
  salesScope: (v) => { ui.salesScope = v; },
  rlOpen: (v) => { ui.rl = { code: v, newCode: '', color: '' }; },
  rlCancel: () => { ui.rl = { code: '', newCode: '', color: '' }; },
  rlColor: (v) => { ui.rl = { ...ui.rl, color: v }; },
  rlDo: doRelabel,
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
  reprice: (v) => ownsAll([v]) && commit(reprice(loadState(), v, moneyOf(inputBy('data-reprice-input', v)))),
  sellOpen: (v) => { ui.sf = { ...blankSell(), code: v, price: loadState().records[v]?.listPrice ?? 0 }; },
  sellCancel: () => { ui.sf = blankSell(); },
  sellDone: registerSale,
  delist: (v) => { if (ownsAll([v]) && confirm('この商品の出品を取り下げて、在庫に戻します。よろしいですか？')) commit(delist(loadState(), v)); },
  recall: (v) => { if (ownsAll([v]) && confirm('この商品は売れ残り、委託先から倉庫に戻ってきましたか？ 倉庫の在庫に戻します。')) commit(recall(loadState(), v)); },
  returnAdd: addReturn,
  ship: (v) => {
    if (!ownsAll(loadState().returns.find((r) => r.id === v)?.codes ?? [])) return;
    const state = loadState();
    const next = shipReturn(state, v, { tracking: inputBy('data-track', v)?.value, by: staff.name });
    if (next === state) return alert('追跡番号を入力してください');
    commit(next);
  },
  returnDone: (v) => {
    if (!ownsAll(loadState().returns.find((r) => r.id === v)?.codes ?? [])) return;
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

const FORMS = { rl: () => ui.rl, tf: () => ui.tf, lf: () => ui.lf, sf: () => ui.sf, rf: () => ui.rf, mw: () => ui.mw, ms: () => ui.ms };
const MONEY = new Set(['lf.price', 'sf.price', 'sf.shipping']);
function onField(e, isInput) {
  const f = e.target.dataset.f ?? '';
  const [form, key] = f.split('.');
  if (!FORMS[form]) return false;
  const isMoney = MONEY.has(f);
  if (isInput !== (isMoney || e.target.tagName === 'INPUT')) return true; // input欄は入力中に、選択欄は選択時に反映
  ui[form] = { ...FORMS[form](), [key]: isMoney ? formatMoneyInput(e.target) : e.target.type === 'checkbox' ? e.target.checked : e.target.value };
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
  if (e.target.matches?.('[data-hv-color]')) {
    const cur = ui.hv ?? master.highValue.colors;
    const c = e.target.dataset.hvColor;
    ui.hv = e.target.checked ? [...new Set([...cur, c])] : cur.filter((x) => x !== c);
    return;
  }
  if (e.target.matches?.('[data-tf-code]')) {
    const code = e.target.dataset.tfCode;
    ui.tf = { ...ui.tf, codes: e.target.checked ? [...ui.tf.codes, code] : ui.tf.codes.filter((c) => c !== code) };
    render();
    return;
  }
  if (e.target.matches?.('[data-tr-check]')) {
    const code = e.target.dataset.trCheck;
    ui.tr = { ...ui.tr, checks: e.target.checked ? [...ui.tr.checks, code] : ui.tr.checks.filter((c) => c !== code) };
    render();
    return;
  }
  if (e.target.matches?.('[data-tr-loc]')) { ui.tr = { ...ui.tr, locs: { ...ui.tr.locs, [e.target.dataset.trLoc]: e.target.value } }; return; }
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
  if (['lf.code', 'rf.visitId', 'tf.toId'].includes(e.target.dataset.f)) render(); // 金額・商品の一覧が変わるもの
});

// 営業のタブレット（入庫）や、別タブでの更新を反映。入力中なら、入力欄から離れたときに反映する
const isEditing = () => Boolean(document.activeElement?.matches?.('input, select, textarea'));
window.addEventListener('storage', (e) => {
  if (![STOCK_KEY, WAREHOUSE_KEY, RETURN_KEY, TRANSFER_KEY, MASTER_KEY].includes(e.key)) return;
  if (isEditing()) dirty = true;
  else render();
});
document.addEventListener('focusout', () => { if (dirty) setTimeout(() => !isEditing() && ((dirty = false), render()), 0); });

seedSample(); // 初めて開いたとき（記録が空のとき）だけ、サンプルデータを入れる
initTheme();
render();
