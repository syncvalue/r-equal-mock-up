// 倉庫・物流デスク画面（ダミー・PC想定）。商品の管理、販売（出品）、売上管理、クーリングオフによる返品の対応。
import { STOCK_KEY, WAREHOUSE_KEY, RETURN_KEY } from '../src/store.js';
import {
  loadState, saveState, buildRows, listItem, reprice, delist, recall, sell, requestReturn, shipReturn, completeReturn, returnableContracts, suggestPrice,
} from '../src/warehouse.js';
import { LOCATIONS, loadUnits, saveUnits, receive, receiveVisit, resultMessage } from '../src/stock.js';
import { seedSample } from '../src/warehouseSample.js';
import { initTheme, themeToggleHtml } from '../src/theme.js';
import { formatMoneyInput } from '../src/moneyInput.js';
import { stockTab } from './stockTab.js';
import { listTab } from './listTab.js';
import { salesTab } from './salesTab.js';
import { returnTab } from './returnTab.js';
import { receiveTab } from './receiveTab.js';

const $ = (s) => document.querySelector(s);
const BY = '倉庫担当'; // 入庫を受け付けた人として記録する名前
const TABS = [['stock', '📦 商品管理'], ['receive', '📥 入庫'], ['list', '🛒 販売（出品）'], ['sales', '💹 売上管理'], ['return', '↩ クーリングオフ返品']];
const blankList = () => ({ code: '', channel: 'mercari', price: 0, vendor: '' });
const blankSell = () => ({ code: '', price: 0, shipping: 0, buyer: '' });
const blankReturn = () => ({ visitId: '', codes: [], reason: 'family', memo: '' });
const REASON_TEXT = { notListable: '出品できない商品です（クーリングオフ期間中・返品対応中など）', badInput: '販売先と、1円以上の価格を入力してください', notListed: '出品中の商品ではありません', alreadySold: 'すでに売却済みです', notShipped: '返送済みにしてから完了してください' };
const REJECT_TEXT = { unknown: '登録のない商品', notStored: '入庫前の商品', expired: '保管期間（10日間）を過ぎた商品', inProgress: 'すでに返品対応中の商品', notReturnable: '返品できない状態の商品' };

let tab = 'stock';
const ui = { rc: { location: LOCATIONS[0], last: null }, filter: 'all', q: '', period: 'day', lf: blankList(), sf: blankSell(), rf: blankReturn() };
let dirty = false; // 入力中に届いた更新を、入力完了後に反映するためのフラグ

const tabBody = (state, now) => {
  const data = { ...state, rows: buildRows(state, now) };
  if (tab === 'receive') return receiveTab(state, ui);
  if (tab === 'list') return listTab(data, ui);
  if (tab === 'sales') return salesTab(state, ui, now);
  if (tab === 'return') return returnTab(state, ui, now);
  return stockTab(data, ui);
};

function render() {
  const now = Date.now();
  const state = loadState();
  const rows = buildRows(state, now);
  $('#root').innerHTML = `
  <header class="bg-sky-900 text-white px-6 py-3 flex justify-between items-center">
    <div class="font-bold text-xl">倉庫・物流 <span class="text-xs font-normal bg-white/20 rounded px-2 py-0.5 ml-2">ダミー画面（PC）</span></div>
    <div class="text-sm">入庫待ち <b class="text-lg">${state.units.filter((u) => u.status !== 'stored').length}</b>点 ／ 出品中 <b class="text-lg">${rows.filter((r) => r.stage === 'listed').length}</b>点 ／ 返品対応中 <b class="text-lg">${state.returns.filter((r) => r.status !== 'done').length}</b>件 <button class="ml-3 text-xs underline text-white/70" data-sample>サンプルデータを入れ直す</button> ${themeToggleHtml()}</div>
  </header>
  <nav class="bg-white border-b px-6 flex gap-1 items-center">${TABS.map(([k, l]) => `<button class="px-4 py-3 font-bold border-b-4 ${tab === k ? 'border-sky-700 text-sky-800' : 'border-transparent text-slate-500'}" data-tab="${k}">${l}</button>`).join('')}</nav>
  <main class="p-4 space-y-4 overflow-y-auto" style="height:calc(100vh - 112px)">${tabBody(state, now)}</main>`;
}

// ---- 操作 -----------------------------------------------------------------------
const commit = (state) => { if (!saveState(state)) alert('保存できませんでした（容量超過）'); };
const moneyOf = (el) => Number((el?.value ?? '').replace(/\D/g, '')) || 0;
const inputBy = (attr, value) => [...document.querySelectorAll(`[${attr}]`)].find((el) => el.getAttribute(attr) === value);
const unitOf = (code) => loadState().units.find((u) => u.code === code);

function addListing() {
  const r = listItem(loadState(), ui.lf.code, { channel: ui.lf.channel, price: ui.lf.price, vendor: ui.lf.vendor });
  if (!r.ok) return alert(REASON_TEXT[r.reason]);
  commit(r.state);
  ui.lf = { ...blankList(), channel: ui.lf.channel, vendor: ui.lf.vendor };
}
function registerSale(code) {
  const r = sell(loadState(), code, { price: ui.sf.price, shipping: ui.sf.shipping, buyer: ui.sf.buyer.trim() });
  if (!r.ok) return alert(REASON_TEXT[r.reason]);
  commit(r.state);
  ui.sf = blankSell();
}
function addReturn() {
  const state = loadState();
  const contract = returnableContracts(state).find((c) => c.visitId === ui.rf.visitId);
  if (!contract || !ui.rf.codes.length) return;
  const r = requestReturn(state, { customerName: contract.customerName, codes: ui.rf.codes, reason: ui.rf.reason, memo: ui.rf.memo.trim() });
  if (!r.ok) return alert(`返品を受け付けられませんでした。\n${r.rejected.map((x) => `${x.code}: ${REJECT_TEXT[x.reason]}`).join('\n')}`);
  commit(r.state);
  ui.rf = blankReturn();
}
// 入庫（誰の商品でも入庫できる）。結果は画面に表示する
function storeCode(raw) {
  const { list, result } = receive(loadUnits(), null, raw, { location: ui.rc.location, by: BY });
  if (result.type === 'ok' && !saveUnits(list)) return alert('保存できませんでした（容量超過）');
  ui.rc = { ...ui.rc, last: resultMessage(result) };
}
function storeVisit(visitId) {
  const { list, count } = receiveVisit(loadUnits(), visitId, { location: ui.rc.location, by: BY });
  if (!count) return;
  if (!saveUnits(list)) return alert('保存できませんでした（容量超過）');
  ui.rc = { ...ui.rc, last: { ok: true, text: `${count}点を ${ui.rc.location} に入庫しました` } };
}
function goReturn(visitId) {
  const contract = returnableContracts(loadState()).find((c) => c.visitId === visitId);
  ui.rf = { ...blankReturn(), visitId, codes: contract ? contract.units.map((u) => u.code) : [] };
  tab = 'return';
}

const ACTIONS = {
  tab: (v) => { tab = v; },
  filter: (v) => { ui.filter = v; },
  rcLoc: (v) => { ui.rc = { ...ui.rc, location: v }; },
  rcSubmit: () => storeCode($('[data-rc-code]')?.value),
  rcUnit: storeCode,
  rcVisit: storeVisit,
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
    const next = shipReturn(state, v, { tracking: inputBy('data-track', v)?.value });
    if (next === state) return alert('追跡番号を入力してください');
    commit(next);
  },
  returnDone: (v) => {
    if (!confirm('お客様から買取代金の返還を確認できましたか？ 完了すると、この商品は返品済みになります。')) return;
    const r = completeReturn(loadState(), v);
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

const FORMS = { lf: () => ui.lf, sf: () => ui.sf, rf: () => ui.rf };
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
  if (![STOCK_KEY, WAREHOUSE_KEY, RETURN_KEY].includes(e.key)) return;
  if (isEditing()) dirty = true;
  else render();
});
document.addEventListener('focusout', () => { if (dirty) setTimeout(() => !isEditing() && ((dirty = false), render()), 0); });

seedSample(); // 初めて開いたとき（記録が空のとき）だけ、サンプルデータを入れる
initTheme();
render();
