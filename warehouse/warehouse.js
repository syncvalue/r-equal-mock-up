// 倉庫・物流デスク画面（ダミー・PC想定）。商品の管理、販売（出品）、売上管理、クーリングオフによる返品の対応。
import { STOCK_KEY, WAREHOUSE_KEY, RETURN_KEY, TRANSFER_KEY } from '../src/store.js';
import {
  MASTER_KEY, loadMaster, saveMaster, saveWarehouse, saveStaff, saveVendor, setVendorActive, vendorById, saveHighValueRule, destinationProblem, setWarehouseActive, warehouseById, warehouseIdOf,
} from '../src/warehouseMaster.js';
import {
  loadState, saveState, buildRows, relabelUnit, replacedCode, listItem, reprice, delist, recall, sell, answerInquiry, isOpenReturn, shipReturn, completeReturn, suggestPrice, scopeState, holdingByWarehouse,
} from '../src/warehouse.js';
import { loadUnits, saveUnits, receive, receiveCodes, resultMessage, setUnitPhoto, clearUnitPhoto } from '../src/stock.js';
import { shrinkImage, productPhoto } from '../src/image.js';
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
import { menuView, tabLabel } from './menu.js';
import { transferTab } from './transferTab.js';
import {
  receiveTransfer, cancelTransfer, incoming, sendableCheck, createPack, addToPack, removeFromPack, updatePack, markPrinted, shipPack, discardPack, drafts,
} from '../src/warehouseTransfer.js';
import { addToConsignPack, createConsignPack, setPackPrice, shipConsignPack } from '../src/warehouseConsign.js';
import { addToSalePack, createSalePack, shipSalePack, setBuyer, awaitingShipment } from '../src/warehouseSale.js';
import { packingListHtml, shippingLabelHtml, shippingCsv, csvFileName, addressProblems, carrierOf } from '../src/shipping.js';
import { openPrintWindow, downloadText } from './output.js';
import { loginView } from './loginView.js';
import { openMockCamera } from './camera.js';

const $ = (s) => document.querySelector(s);
const blankList = () => ({ code: '', channel: 'mercari', price: 0, vendor: '' });
const blankSell = () => ({ code: '', price: 0, shipping: 0, buyer: '' });
const MASTER_TEXT = {
  dupHonsha: '本社（高額品の保管先）は、すでに登録されています（1か所だけです）', noRule: '本社に納入するシールの色を、1つ以上選んでください', badColor: 'シールの色が正しくありません', noName: '名前を入力してください', noLocations: '保管場所（棚）を1つ以上入力してください', badOffice: '営業所の指定が正しくありません', badZip: '郵便番号は、123-4567 の形式で入力してください', dupName: '同じ名前の倉庫がすでにあります', notFound: '対象が見つかりません',
  badLoginId: 'ログインIDは、英数字・ハイフン・アンダースコアの3〜20文字にしてください', dupLoginId: '同じログインIDの担当者がすでにいます', noWarehouse: '所属する倉庫を選んでください',
  inUse: 'この倉庫には、保管中の商品（在庫・出品中・委託中・返品対応中）があるため、無効にできません', hasStaff: 'この倉庫には有効な担当者がいるため、無効にできません（担当者を別の倉庫に移すか、無効にしてください）',
};
const REASON_TEXT = { notListable: '出品できない商品です（クーリングオフ期間中・返品対応中など）', badInput: '販売先と、1円以上の価格を入力してください', notListed: '出品中の商品ではありません', alreadySold: 'すでに売却済みです', notShipped: '返送済みにしてから完了してください' };

let tab = 'stock';
let menuOpen = false; // 左側のメニューの開閉
let staff = loadSession(); // ログイン中の担当者（操作した人として記録する。所属する倉庫が、入庫先・表示の初期値になる）
let loginError = '';
const blankPk = () => ({ id: '', toId: '', q: '', last: null, tracking: '', bName: '', bZip: '', bAddress: '', bPhone: '' }); // 送るパックの作業（開いているパック）
const blankWh = () => ({ id: '', name: '', zip: '', address: '', phone: '', officeId: '', locations: '', highValue: false });
const blankVendor = () => ({ id: '', name: '', zip: '', address: '', phone: '' });
const blankStaff = () => ({ id: '', name: '', loginId: '', warehouseId: '' });
const ui = { mv: blankVendor(), rl: { code: '', newCode: '', color: '' }, hv: null, pk: blankPk(), tr: { checks: [], locs: {} }, salesScope: '', scope: staff?.warehouseId ?? 'all', mw: blankWh(), ms: blankStaff(), scan: { raw: '' }, rc: { location: '', last: null, checks: [] }, filter: 'all', view: 'list', page: 1, pageSize: 20, q: '', period: 'day', lf: blankList(), sf: blankSell() };
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
  if (tab === 'list') return ownNotice + listTab({ ...own, rows: buildRows(own, now) }, ui, now, { full, master, me: staff });
  if (tab === 'sales') return salesTab(full, master, ui, staff, now);
  if (tab === 'return') return `<div class="text-xs rounded bg-sky-50 border border-sky-200 p-2">ここで扱えるのは、あなたの倉庫（${esc(myWarehouse().name)}）の商品の依頼だけです。依頼は、コールセンターの「クーリングオフ」タブで受電して作ります。</div>${returnTab(own, ui, now, { full, master })}`;
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
  // メニューの項目に出す件数（入庫待ち・受け取り待ち・返品対応中）
  const badges = { receive: full.units.filter((u) => u.status !== 'stored').length, transfer: incoming(full, staff.warehouseId).length, return: state.returns.filter(isOpenReturn).length };
  const menuBadge = badges.receive + badges.transfer > 0;
  // タブレットの幅でも崩れないよう、見出しは折り返し、本文が残りの高さを使う
  $('#root').innerHTML = `<div class="flex flex-col h-screen">
  <header class="bg-sky-900 text-white px-4 md:px-6 py-2 flex flex-wrap gap-2 justify-between items-center">
    <div class="flex items-center gap-2"><button class="relative w-11 h-11 -ml-2 rounded-xl text-2xl leading-none hover:bg-white/10 active:bg-white/20" data-menu-open aria-label="メニューを開く">☰${menuBadge ? '<span class="absolute top-1 right-1 w-3 h-3 rounded-full bg-amber-400"></span>' : ''}</button>
      <span class="font-bold text-xl">倉庫・物流</span><span class="text-slate-300">›</span><span class="font-bold">${esc(tabLabel(tab))}</span><span class="text-xs font-normal bg-white/20 rounded px-2 py-0.5 ml-2">ダミー画面（PC）</span></div>
    <div class="text-sm flex flex-wrap items-center gap-x-3 gap-y-1">${['stock', 'master'].includes(tab) ? scopeSelect() : ''}<span>入庫待ち <b class="text-lg">${full.units.filter((u) => u.status !== 'stored').length}</b>点 ／ 出品中 <b class="text-lg">${rows.filter((r) => r.stage === 'listed').length}</b>点 ／ 返品対応中 <b class="text-lg">${state.returns.filter(isOpenReturn).length}</b>件 ／ 受け取り待ち <b class="text-lg">${incoming(full, staff.warehouseId).length}</b>件</span><span>👤 ${esc(staff.name)}（${esc(wh.name)}）</span> <button class="text-xs underline text-white/70" data-sample>サンプルデータを入れ直す</button> ${themeToggleHtml()}</div>
  </header>
  <main class="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">${tabBody(full, now)}</main>${menuOpen ? menuView({ tab, badges, staff, warehouseName: wh.name }) : ''}</div>`;
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
// 返品の依頼は、問い合わせを受けた倉庫（入庫前の商品の依頼も含む）の担当者だけが対応できる
function ownsReturn(id) {
  const r = loadState().returns.find((x) => x.id === id);
  if (!r) return false;
  if (r.warehouseId ? r.warehouseId === staff.warehouseId : r.codes.every((c) => { const u = unitOf(c); return u && warehouseIdOf(u, master) === staff.warehouseId; })) return true;
  alert('他の倉庫の依頼は扱えません。');
  return false;
}
// 倉庫が問い合わせに回答する（対応できない場合は、メモに理由が必要）
function answer(id, ok) {
  if (!ownsReturn(id)) return false;
  const state = loadState();
  const next = answerInquiry(state, id, { ok, note: inputBy('data-inq-note', id)?.value, by: staff.name });
  if (next === state) { alert('対応できない場合は、メモに理由を入力してください'); return false; }
  commit(next);
}
// 商品の写真の登録・削除（在庫の操作ではないので、どの倉庫の商品でも登録できる）
function savePhotos(list) {
  if (!saveUnits(list)) alert('保存できませんでした（容量超過）。写真を減らしてください');
  render();
}
const registerPhoto = (code, photo) => savePhotos(setUnitPhoto(loadUnits(), code, photo, { by: staff.name }));
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
  ui.q = ''; ui.page = 1;
}
// ---- カメラでの読み取り（モック。実際のカメラは使わない）-----------------------------------
// search: 1回読み取ったら閉じて、商品の詳細を表示する／receive: 開いたまま、続けて入庫する（自分の倉庫で入庫できる商品がなくなるまで）
let closeCamera = null;
function openCamera(mode) {
  closeCamera?.();
  if (mode === 'search') {
    const units = loadUnits();
    closeCamera = openMockCamera({
      title: '商品を探す', subtitle: 'シールのQRコードを読み取ります',
      pickNext: () => units[Math.floor(Math.random() * units.length)]?.code ?? '', // モック: 登録済みの商品から1点
      onFound: (code) => { scanCode(code); render(); },
    });
    return;
  }
  if (mode === 'pack') {
    closeCamera = openMockCamera({
      title: '読み取って、パックに入れる', subtitle: `送り元: ${myWarehouse().name}`, continuous: true,
      // モック: 自分の倉庫の在庫から、まだパックに入れていない商品を順に読み取る
      pickNext: () => {
        const state = loadState();
        const pack = packOf(state, ui.pk.id);
        if (pack.kind === 'sale') return awaitingShipment(state, master, staff.warehouseId).map((r) => r.unit.code).find((c) => !pack.codes.includes(c)) ?? ''; // 発送待ちの商品を順に
        return state.units.map((u) => u.code).find((c) => !pack.codes.includes(c) && sendableCheck(state, master, { fromId: staff.warehouseId, toId: pack.toId, code: c }).ok) ?? '';
      },
      onFound: (code) => { packAdd(code); render(); },
      getMessage: () => ui.pk.last,
    });
    return;
  }
  closeCamera = openMockCamera({
    title: '読み取って入庫', subtitle: `入庫先: ${myWarehouse().name}／保管場所: ${ui.rc.location}`, continuous: true,
    pickNext: () => loadUnits().find((u) => u.status !== 'stored' && !destinationProblem(master, u, staff.warehouseId))?.code ?? '', // モック: 入庫待ちの商品を、順に読み取る
    onFound: (code) => { storeCode(code); render(); },
    getMessage: () => ui.rc.last,
  });
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
const PACK_TEXT = {
  notDraft: 'このパックは、すでに発送済み・破棄済みです', unknown: '登録のないシールです', notStock: '在庫ではないため、入れられません（入庫前・出品中・委託中・返品対応中・輸送中など）',
  otherWarehouse: '他の倉庫の商品です（あなたの倉庫の商品だけ送れます）', inOtherPack: '別のパックに入っています', wrongDestination: '送り先の規則に合いません（高額品は本社へ、それ以外は本社以外の倉庫へ）',
  noBuyer: '購入者名を入力してください', badZip: '郵便番号は、123-4567 の形式で入力してください', notSold: '売れた商品ではありません（在庫・委託中など）', alreadyShipped: 'すでに発送済みです',
  noPrice: '希望価格が未設定の商品があります', badVendor: '委託先（業者）が正しくありません（無効になっているか、登録がありません）', badWarehouse: '送り元の倉庫が正しくありません', wrongKind: 'このパックは、ここでは発送できません',
  noItems: '商品が入っていません', noCarrier: '配送業者を選んでください', sameWarehouse: '送り先は、別の倉庫を選んでください', badDestination: '送り先の倉庫が正しくありません',
};
const packOf = (state, id) => (state.transfers ?? []).find((t) => t.id === id && t.status === 'draft');
// パックの種類ごとの、商品の入れ方（委託は希望価格の目安が入り、販売は売れた商品の売価が入る）
const adderOf = (pack) => (pack?.kind === 'consign' ? addToConsignPack : pack?.kind === 'sale' ? addToSalePack : addToPack);
const say = (ok, text) => { ui.pk = { ...ui.pk, last: { ok, text } }; };

// ① 商品を探して、パックに入れる（検索の一覧・QR読取（スキャナ・手入力・カメラ））
function packAdd(raw) {
  const adder = adderOf(packOf(loadState(), ui.pk.id));
  const r = adder(loadState(), master, ui.pk.id, raw);
  if (!r.ok) return say(false, `${r.code || '（空）'}：${r.reason === 'replaced' ? `貼り替え済みの古いシールです。新しいシール（${r.newCode}）を読み取ってください` : PACK_TEXT[r.reason]}`);
  if (r.already) return say(true, `${r.code} は、すでにパックに入っています`);
  commit(r.state);
  const u = loadState().units.find((x) => x.code === r.code);
  return say(true, `${u?.name ?? ''}（${r.code}）を、パックに入れました`);
}
// 同じ契約（同じ訪問）で買い取った商品を、まとめて入れる
function packAddLot(visitId) {
  const state = loadState();
  const codes = state.units.filter((u) => u.visitId === visitId).map((u) => u.code);
  const { state: next, added } = codes.reduce((acc, code) => {
    const r = adderOf(packOf(acc.state, ui.pk.id))(acc.state, master, ui.pk.id, code);
    return r.ok && !r.already ? { state: r.state, added: acc.added + 1 } : acc;
  }, { state, added: 0 });
  if (added) commit(next);
  say(added > 0, added ? `同じ契約の ${added} 点を、パックに入れました` : '同じ契約で、入れられる商品はありません');
}
function packSet(patch) {
  const state = loadState();
  const next = updatePack(state, ui.pk.id, patch);
  if (next === state) return alert('その値は設定できません（個口数は1以上の整数にしてください）');
  commit(next);
}
// ③④ 明細・発送伝票・CSVを出力する（出力した日時を、パックに残す）
function packPrint(kind) {
  const state = loadState();
  const pack = packOf(state, ui.pk.id);
  if (kind === 'label') {
    const problems = addressProblems(pack, master);
    if (problems.length) return alert(`発送伝票に必要な情報が足りません。\n・${problems.join('\n・')}\n「倉庫マスタ」で登録してください。`);
  }
  const html = kind === 'list' ? packingListHtml(pack, state.units, master) : shippingLabelHtml(pack, state.units, master);
  if (!openPrintWindow(html)) return alert('印刷用のウィンドウを開けませんでした（ポップアップがブロックされています）');
  commit(markPrinted(state, pack.id, kind));
}
function packCsv(carrierKey, packs) {
  const state = loadState();
  const problems = packs.flatMap((p) => addressProblems(p, master));
  if (problems.length) return alert(`CSVに必要な情報が足りません。\n・${[...new Set(problems)].join('\n・')}\n「倉庫マスタ」で登録してください。`);
  downloadText(csvFileName(carrierKey), shippingCsv(carrierKey, packs, state.units, master));
  commit(packs.reduce((acc, p) => markPrinted(acc, p.id, 'label'), state)); // CSVを取り込んで、配送業者の送り状を出力する＝発送伝票の出力
}
function packShip() {
  const state = loadState();
  const pack = packOf(state, ui.pk.id);
  if ((!pack.listPrintedAt || !pack.labelPrintedAt) && !confirm('明細または発送伝票が、まだ出力されていません。このまま発送しますか？')) return;
  const consign = pack.kind === 'consign';
  const r = consign ? shipConsignPack(state, master, pack.id, { tracking: ui.pk.tracking, by: staff.name })
    : pack.kind === 'sale' ? shipSalePack(state, pack.id, { tracking: ui.pk.tracking, by: staff.name })
      : shipPack(state, pack.id, { tracking: ui.pk.tracking, by: staff.name, master });
  if (!r.ok) return alert(`${PACK_TEXT[r.reason]}${r.rejected?.length ? `\n${r.rejected.map((x) => `${x.code}: ${PACK_TEXT[x.reason]}`).join('\n')}` : ''}`);
  commit(r.state);
  ui.pk = blankPk();
  alert(consign ? `委託しました。${pack.vendorName}に委託中の商品として、「委託中」に載ります。`
    : pack.kind === 'sale' ? `発送しました。${pack.buyer.name} 様へ。発送待ちから、発送済みになります。` : `発送しました。${pack.toName}で「受け取り待ち」になります。`);
}
function packNew(kind, firstCode = '') {
  const buyer = { name: ui.pk.bName, zip: ui.pk.bZip, address: ui.pk.bAddress, phone: ui.pk.bPhone };
  const r = kind === 'sale'
    ? createSalePack(loadState(), master, { fromId: staff.warehouseId, buyer, by: staff.name })
    : kind === 'consign'
    ? createConsignPack(loadState(), master, { fromId: staff.warehouseId, vendorId: ui.pk.toId, by: staff.name })
    : createPack(loadState(), master, { fromId: staff.warehouseId, toId: ui.pk.toId, by: staff.name });
  if (!r.ok) return alert(PACK_TEXT[r.reason]);
  commit(r.state);
  ui.pk = { ...ui.pk, id: r.pack.id, q: '', last: null, tracking: '' };
  if (firstCode) packAdd(firstCode); // 発送待ちの商品から、そのまま入れる
}
// 発送待ちの商品から、発送のパックを作る（購入者の欄が空なら、売却のときの購入者名を使う）
function packNewForSale(code) {
  const rec = loadState().records[code];
  if (!ui.pk.bName.trim() && rec?.buyer) ui.pk = { ...ui.pk, bName: rec.buyer };
  packNew('sale', code);
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
function saveVd() {
  const r = saveVendor(master, { ...ui.mv, id: ui.mv.id || undefined });
  if (!r.ok) return alert(MASTER_TEXT[r.reason]);
  commitMaster(r.master);
  ui.mv = blankVendor();
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

function doLogin() {
  const r = login($('[data-login-id]')?.value, $('[data-login-pw]')?.value, loadMaster());
  loginError = r.ok ? '' : r.error;
  if (r.ok) { staff = r.staff; saveSession(r.staff.id); ui.scope = r.staff.warehouseId; } // ログインすると、所属する倉庫が対象になる
}

const ACTIONS = {
  tab: (v) => { tab = v; menuOpen = false; ui.page = 1; },
  menuOpen: () => { menuOpen = true; },
  menuClose: () => { menuOpen = false; },
  filter: (v) => { ui.filter = v; ui.page = 1; },
  view: (v) => { ui.view = v; ui.page = 1; },
  page: (v) => { ui.page = Number(v); },
  camSearch: () => { openCamera('search'); return false; },
  camReceive: () => { openCamera('receive'); return false; },
  mwSave: saveWh,
  mwEdit: (v) => { const w = warehouseById(master, v); ui.mw = { id: w.id, name: w.name, zip: w.zip ?? '', address: w.address, phone: w.phone ?? '', officeId: w.officeId, locations: w.locations.join('\n'), highValue: Boolean(w.highValue) }; },
  hvSave: () => {
    const r = saveHighValueRule(master, { colors: ui.hv ?? master.highValue.colors });
    if (!r.ok) return alert(MASTER_TEXT[r.reason]);
    commitMaster(r.master);
    ui.hv = null;
  },
  mwCancel: () => { ui.mw = blankWh(); },
  mwToggle: toggleWh,
  mvSave: saveVd,
  mvEdit: (v) => { const x = vendorById(master, v); ui.mv = { id: x.id, name: x.name, zip: x.zip ?? '', address: x.address ?? '', phone: x.phone ?? '' }; },
  mvCancel: () => { ui.mv = blankVendor(); },
  mvToggle: (v) => { const x = vendorById(master, v); const r = setVendorActive(master, v, !x.active); if (r.ok) commitMaster(r.master); },
  msSave: saveSt,
  msEdit: (v) => { const st = master.staff.find((x) => x.id === v); ui.ms = { id: st.id, name: st.name, loginId: st.loginId, warehouseId: st.warehouseId }; },
  msCancel: () => { ui.ms = blankStaff(); },
  msToggle: toggleStaff,
  trReceive: receiveItems,
  trCancel: cancelItems,
  salesScope: (v) => { ui.salesScope = v; },
  rlOpen: (v) => { ui.rl = { code: v, newCode: '', color: '' }; },
  rlCancel: () => { ui.rl = { code: '', newCode: '', color: '' }; },
  rlColor: (v) => { ui.rl = { ...ui.rl, color: v }; },
  rlDo: doRelabel,
  pkNew: (v) => packNew(v),
  pkNewSale: packNewForSale,
  pkOpen: (v) => { ui.pk = { ...blankPk(), id: v, toId: ui.pk.toId, tracking: packOf(loadState(), v)?.tracking ?? '' }; },
  pkClose: () => { ui.pk = { ...blankPk(), toId: ui.pk.toId }; },
  pkDiscard: (v) => { if (confirm('この梱包中のパックを破棄します（商品は在庫に戻ります）。よろしいですか？')) { const r = discardPack(loadState(), v); if (r.ok) commit(r.state); if (ui.pk.id === v) ui.pk = blankPk(); } },
  pkScan: () => packAdd($('[data-pk-scan-input]')?.value),
  pkAdd: packAdd,
  pkAddLot: packAddLot,
  pkRemove: (v) => commit(removeFromPack(loadState(), ui.pk.id, v)),
  pkCarrier: (v) => packSet({ carrier: v }),
  pkPrintList: () => packPrint('list'),
  pkPrintLabel: () => packPrint('label'),
  pkCsv: (v) => packCsv(v, [packOf(loadState(), ui.pk.id)]),
  pkCsvAll: (v) => { const [kind, carrier] = v.split(':'); packCsv(carrier, drafts(loadState(), staff.warehouseId, kind).filter((p) => p.carrier === carrier)); },
  pkShip: packShip,
  camPack: () => { openCamera('pack'); return false; },
  qrClose: () => { ui.scan = { raw: '' }; },
  rcLoc: (v) => { ui.rc = { ...ui.rc, location: v }; },
  rcSubmit: () => storeCode($('[data-rc-code]')?.value),
  rcUnit: (v) => storeChecked([v]),
  rcVisit: (v) => storeChecked(visitCodes(v)),
  rcAll: toggleAll,
  logout: () => { clearSession(); staff = null; loginError = ''; menuOpen = false; },
  login: doLogin,
  period: (v) => { ui.period = v; },
  goList: (v) => { ui.lf = { ...blankList(), code: v, price: suggestPrice(unitOf(v)) }; tab = 'list'; },
  lfChannel: (v) => { ui.lf = { ...ui.lf, channel: v }; },
  listAdd: addListing,
  reprice: (v) => ownsAll([v]) && commit(reprice(loadState(), v, moneyOf(inputBy('data-reprice-input', v)))),
  sellOpen: (v) => { ui.sf = { ...blankSell(), code: v, price: loadState().records[v]?.listPrice ?? 0 }; },
  sellCancel: () => { ui.sf = blankSell(); },
  sellDone: registerSale,
  delist: (v) => { if (ownsAll([v]) && confirm('この商品の出品を取り下げて、在庫に戻します。よろしいですか？')) commit(delist(loadState(), v)); },
  recall: (v) => { if (ownsAll([v]) && confirm('この商品は売れ残り、委託先から倉庫に戻ってきましたか？ 倉庫の在庫に戻します。')) commit(recall(loadState(), v)); },
  photoSample: (v) => { const u = unitOf(v); if (u) registerPhoto(v, productPhoto(u.name, u.category)); return false; },
  photoClear: (v) => { if (confirm('登録した写真を削除します（表示は、仮の絵に戻ります）。よろしいですか？')) savePhotos(clearUnitPhoto(loadUnits(), v)); return false; },
  inqOk: (v) => answer(v, true),
  inqNg: (v) => answer(v, false),
  ship: (v) => {
    if (!ownsReturn(v)) return;
    const state = loadState();
    const next = shipReturn(state, v, { tracking: inputBy('data-track', v)?.value, by: staff.name });
    if (next === state) return alert('追跡番号を入力してください');
    commit(next);
  },
  returnDone: (v) => {
    if (!ownsReturn(v)) return;
    if (!confirm('お客様から買取代金の返還を確認できましたか？ 完了すると、この商品は返品済みになります。')) return;
    const r = completeReturn(loadState(), v, Date.now(), staff.name);
    if (!r.ok) return alert(REASON_TEXT[r.reason]);
    commit(r.state);
  },
  sample: () => {
    if (!confirm('倉庫の商品・出品・売上・返品のデータを、サンプルデータに置き換えます（営業が登録した入庫待ちの商品は残ります）。よろしいですか？')) return false;
    seedSample(Date.now(), true);
    ui.sf = blankSell();
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

const FORMS = { mv: () => ui.mv, rl: () => ui.rl, pk: () => ui.pk, lf: () => ui.lf, sf: () => ui.sf, mw: () => ui.mw, ms: () => ui.ms };
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
  if (e.key === 'Enter' && e.target.matches?.('[data-pk-scan-input]')) {
    packAdd(e.target.value);
    render();
    $('[data-pk-scan-input]')?.focus(); // 続けて読み取れるように
    return;
  }
  // 検索欄でEnter: シールNo.（QR読取・手入力）なら、その商品の詳細を表示する。それ以外は、入力のまま一覧を絞り込む
  if (e.key === 'Enter' && e.target.matches?.('[data-q]')) {
    const raw = e.target.value.trim();
    if (!raw || !(loadUnits().some((u) => u.code === raw.toUpperCase()) || replacedCode(loadUnits(), raw) || /^RQ-/i.test(raw))) return;
    scanCode(raw);
    render();
    $('[data-q]')?.focus(); // 続けて読み取れるように
    return;
  }
  if (e.key !== 'Enter' || !e.target.matches?.('[data-rc-code]')) return;
  storeCode(e.target.value);
  render();
  $('[data-rc-code]')?.focus(); // 続けて読み取れるように
});
document.addEventListener('input', (e) => {
  if (e.target.matches?.('[data-pk-tracking]')) { ui.pk = { ...ui.pk, tracking: e.target.value }; return; }
  if (e.target.matches?.('[data-pk-price-input]')) return void formatMoneyInput(e.target);
  if (e.target.matches?.('[data-pk-q]')) {
    ui.pk = { ...ui.pk, q: e.target.value };
    render();
    const el = $('[data-pk-q]');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    return;
  }
  if (e.target.matches('[data-reprice-input]')) return void formatMoneyInput(e.target);
  if (e.target.matches('[data-q]')) {
    ui.q = e.target.value;
    ui.page = 1;
    render();
    const q = $('[data-q]');
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
    return;
  }
  onField(e, true);
});
document.addEventListener('change', (e) => {
  if (e.target.matches?.('[data-photo-file]')) { // 商品の写真を撮影・選択して登録する
    const file = e.target.files?.[0];
    const code = e.target.dataset.photoFile;
    if (file) shrinkImage(file).then((img) => registerPhoto(code, img)).catch(() => alert('画像を読み込めませんでした'));
    return;
  }
  if (e.target.matches?.('[data-page-size]')) { ui.pageSize = Number(e.target.value); ui.page = 1; render(); return; }
  if (e.target.matches?.('[data-hv-color]')) {
    const cur = ui.hv ?? master.highValue.colors;
    const c = e.target.dataset.hvColor;
    ui.hv = e.target.checked ? [...new Set([...cur, c])] : cur.filter((x) => x !== c);
    return;
  }
  if (e.target.matches?.('[data-pk-price-input]')) { // 希望価格（委託のパック）。入力欄から出たときに保存する
    const state = loadState();
    const next = setPackPrice(state, ui.pk.id, e.target.dataset.pkPriceInput, e.target.value);
    if (next === state) alert('希望価格は、1円以上の数字で入力してください');
    else commit(next);
    render();
    return;
  }
  if (e.target.matches?.('[data-pack-buyer]')) { // 梱包中のパックの、購入者の情報
    const state = loadState();
    const next = setBuyer(state, ui.pk.id, { [e.target.dataset.packBuyer]: e.target.value });
    if (next === state && e.target.dataset.packBuyer !== 'phone' && e.target.dataset.packBuyer !== 'address') alert('購入者名は空にできません。郵便番号は 123-4567 の形式で入力してください');
    else commit(next);
    render();
    return;
  }
  if (e.target.matches?.('[data-pack-field]')) {
    const field = e.target.dataset.packField;
    packSet({ [field]: e.target.value });
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
  if (e.target.matches?.('[data-scope]')) { ui.scope = e.target.value; ui.page = 1; render(); return; }
  if (e.target.matches?.('[data-rc-check]')) {
    const code = e.target.dataset.rcCheck;
    ui.rc = { ...ui.rc, checks: e.target.checked ? [...ui.rc.checks, code] : ui.rc.checks.filter((c) => c !== code) };
    render();
    return;
  }
  if (!onField(e, false)) return;
  if (e.target.dataset.f === 'lf.code') ui.lf = { ...ui.lf, price: ui.lf.code ? suggestPrice(unitOf(ui.lf.code)) : 0 };
  if (['lf.code', 'pk.toId'].includes(e.target.dataset.f)) render(); // 金額・商品の一覧が変わるもの
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
