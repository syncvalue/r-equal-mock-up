// マスタ管理画面（ダミー・PC想定）。ユーザー・営業所・倉庫・委託先の一覧、登録・変更、有効/無効。
import { USERS_KEY, DEFAULT_USERS, loadUsers, saveUsers, saveUser, setUserActive, isReadOnlyRole } from '../src/users.js';
import { OFFICES_KEY, DEFAULT_OFFICES, loadOffices, saveOffices, saveOffice, setOfficeActive } from '../src/offices.js';
import { MASTER_KEY, loadMaster, saveMaster, saveWarehouse, saveVendor, setVendorActive, saveHighValueRule, setWarehouseActive, warehouseById, vendorById, activeWarehouses, DEFAULT_MASTER } from '../src/warehouseMaster.js';
import { loadState, holdingByWarehouse } from '../src/warehouse.js';
import { initTheme, themeToggleHtml } from '../src/theme.js';
import { masterHtml, REASON_TEXT } from './view.js';
import { listHtml, blankForm, formFromUser } from './usersPanel.js';
import { blankOffice, formFromOffice } from './officesPanel.js';

const $ = (s) => document.querySelector(s);
const blankWh = () => ({ id: '', name: '', zip: '', address: '', phone: '', officeId: '', locations: '', highValue: false });
const blankVendor = () => ({ id: '', name: '', zip: '', address: '', phone: '' });
const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };

let users = loadUsers();
let offices = loadOffices();
let tab = ['users', 'offices', 'warehouses', 'vendors'].includes(pref('rq-mock-master-tab', '')) ? pref('rq-mock-master-tab', '') : 'users';
let ui = { users: { role: '', q: '', status: '', form: null }, offices: { mo: blankOffice() }, warehouses: { mw: blankWh(), hv: null }, vendors: { mv: blankVendor() } };
const setUi = (name, patch) => { ui = { ...ui, [name]: { ...ui[name], ...patch } }; };

const ctx = () => {
  const wmaster = loadMaster();
  return { tab, users, offices, wmaster, holding: holdingByWarehouse(loadState(), wmaster), ui, themeHtml: themeToggleHtml() };
};
const render = () => { $('#root').innerHTML = masterHtml(ctx()); };
const renderList = () => { const el = $('[data-list]'); if (el) el.innerHTML = listHtml({ users, warehouses: loadMaster().warehouses, ui: ui.users }); };
const warn = (reason) => alert(REASON_TEXT[reason] ?? '保存できませんでした');
const commitWh = (next) => { if (!saveMaster(next)) alert('保存できませんでした（容量超過）'); };

// ---- ユーザー ---------------------------------------------------------------------
function commitUsers(next) {
  if (!saveUsers(next)) return alert('保存できませんでした（容量超過）');
  users = next;
}
function saveUserForm() {
  const f = ui.users.form;
  const current = users.find((u) => u.id === f.id)?.warehouseId; // いま所属している倉庫は、無効でも保てる
  const warehouseIds = [...activeWarehouses(loadMaster()).map((w) => w.id), ...(current ? [current] : [])];
  const r = saveUser(users, { ...f, id: f.id || undefined }, { warehouseIds });
  if (!r.ok) return warn(r.reason);
  commitUsers(r.users);
  setUi('users', { form: null });
}
function toggleUser(id) {
  const r = setUserActive(users, id, !users.find((x) => x.id === id).active);
  if (!r.ok) return warn(r.reason);
  commitUsers(r.users);
}

// ---- 営業所 -----------------------------------------------------------------------
function saveOfficeForm() {
  const f = ui.offices.mo;
  const r = saveOffice(offices, { ...f, id: f.id || undefined });
  if (!r.ok) return warn(r.reason);
  if (!saveOffices(r.offices)) return alert('保存できませんでした（容量超過）');
  offices = r.offices;
  setUi('offices', { mo: blankOffice() });
}
function toggleOffice(id) {
  const r = setOfficeActive(offices, id, !offices.find((o) => o.id === id).active);
  if (!r.ok) return warn(r.reason);
  if (saveOffices(r.offices)) offices = r.offices;
}

// ---- 倉庫・高額品・委託先 -------------------------------------------------------------
function saveWarehouseForm() {
  const f = ui.warehouses.mw;
  const officeIds = [...offices.filter((o) => o.active).map((o) => o.id), ...(f.officeId ? [f.officeId] : [])]; // いま併設の営業所は、無効でも保てる
  const r = saveWarehouse(loadMaster(), { ...f, id: f.id || undefined }, { officeIds });
  if (!r.ok) return warn(r.reason);
  commitWh(r.master);
  setUi('warehouses', { mw: blankWh() });
}
function toggleWarehouse(id) {
  const master = loadMaster();
  const holding = holdingByWarehouse(loadState(), master)[id]?.count ?? 0;
  const r = setWarehouseActive(master, id, !warehouseById(master, id).active, { holding });
  if (!r.ok) return warn(r.reason);
  commitWh(r.master);
}
function saveHighValue() {
  const master = loadMaster();
  const r = saveHighValueRule(master, { colors: ui.warehouses.hv ?? master.highValue.colors });
  if (!r.ok) return warn(r.reason);
  commitWh(r.master);
  setUi('warehouses', { hv: null });
}
function saveVendorForm() {
  const f = ui.vendors.mv;
  const r = saveVendor(loadMaster(), { ...f, id: f.id || undefined });
  if (!r.ok) return warn(r.reason);
  commitWh(r.master);
  setUi('vendors', { mv: blankVendor() });
}
function toggleVendor(id) {
  const master = loadMaster();
  const r = setVendorActive(master, id, !vendorById(master, id).active);
  if (r.ok) commitWh(r.master);
}

// ---- 操作の対応表（data-属性の名前 → 処理）。false を返すと、再描画しない --------------------
const CLICK = {
  master: (v) => { tab = v; try { localStorage.setItem('rq-mock-master-tab', v); } catch { /* 保存できなくても動作は継続（モック） */ } },
  role: (v) => setUi('users', { role: v }),
  new: () => setUi('users', { form: blankForm(ui.users.role && !isReadOnlyRole(ui.users.role) ? ui.users.role : 'operator') }),
  edit: (v) => setUi('users', { form: formFromUser(users.find((u) => u.id === v)) }),
  toggle: toggleUser,
  save: saveUserForm,
  cancel: () => setUi('users', { form: null }),
  moSave: saveOfficeForm,
  moEdit: (v) => setUi('offices', { mo: formFromOffice(offices.find((o) => o.id === v)) }),
  moCancel: () => setUi('offices', { mo: blankOffice() }),
  moToggle: toggleOffice,
  mwSave: saveWarehouseForm,
  mwEdit: (v) => { const w = warehouseById(loadMaster(), v); setUi('warehouses', { mw: { id: w.id, name: w.name, zip: w.zip ?? '', address: w.address, phone: w.phone ?? '', officeId: w.officeId, locations: w.locations.join('\n'), highValue: Boolean(w.highValue) } }); },
  mwCancel: () => setUi('warehouses', { mw: blankWh() }),
  mwToggle: toggleWarehouse,
  hvSave: saveHighValue,
  mvSave: saveVendorForm,
  mvEdit: (v) => { const x = vendorById(loadMaster(), v); setUi('vendors', { mv: { id: x.id, name: x.name, zip: x.zip ?? '', address: x.address ?? '', phone: x.phone ?? '' } }); },
  mvCancel: () => setUi('vendors', { mv: blankVendor() }),
  mvToggle: toggleVendor,
  reset: () => {
    if (!confirm('ユーザー・営業所・倉庫・委託先を、すべて初期値（見本のデータ）に戻します。登録・変更した内容は消えます。よろしいですか？')) return false;
    commitUsers(DEFAULT_USERS);
    saveOffices(DEFAULT_OFFICES); offices = DEFAULT_OFFICES;
    commitWh({ ...DEFAULT_MASTER, staff: undefined });
    ui = { users: { role: '', q: '', status: '', form: null }, offices: { mo: blankOffice() }, warehouses: { mw: blankWh(), hv: null }, vendors: { mv: blankVendor() } };
  },
};
const SELECTOR = Object.keys(CLICK).map((k) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`).join(',');

document.addEventListener('click', (e) => {
  const el = e.target.closest(SELECTOR);
  if (!el) return;
  const [name, value] = Object.entries(el.dataset).find(([k]) => k in CLICK);
  if (CLICK[name](value) !== false) render();
});

// 入力欄: 「ユーザー」は data-f="name"、ほかは data-f="mw.name" のように、フォームの名前つき。入力中は再描画しない（検索は一覧だけ更新）
const FORMS = { mo: ['offices', 'mo'], mw: ['warehouses', 'mw'], mv: ['vendors', 'mv'] };
function onField(e) {
  const [form, key] = (e.target.dataset.f ?? '').split('.');
  const target = FORMS[form];
  if (!target) return false;
  const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  setUi(target[0], { [target[1]]: { ...ui[target[0]][target[1]], [key]: value } });
  return true;
}
document.addEventListener('input', (e) => {
  if (e.target.matches('[data-q]')) { setUi('users', { q: e.target.value }); renderList(); return; }
  if (onField(e)) return;
  const key = e.target.dataset.f;
  if (key && e.target.tagName === 'INPUT') setUi('users', { form: { ...ui.users.form, [key]: e.target.value } });
});
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-status]')) { setUi('users', { status: e.target.value }); renderList(); return; }
  if (e.target.dataset.hvColor) { // 高額品にするシールの色
    const cur = ui.warehouses.hv ?? loadMaster().highValue.colors;
    const c = e.target.dataset.hvColor;
    setUi('warehouses', { hv: e.target.checked ? [...new Set([...cur, c])] : cur.filter((x) => x !== c) });
    return;
  }
  if (e.target.dataset.group) {
    const g = e.target.dataset.group;
    const groups = e.target.checked ? [...new Set([...ui.users.form.groups, g])] : ui.users.form.groups.filter((x) => x !== g);
    setUi('users', { form: { ...ui.users.form, groups } });
    return;
  }
  if (e.target.dataset.f === 'role') { setUi('users', { form: { ...blankForm(e.target.value), name: ui.users.form.name, loginId: ui.users.form.loginId } }); render(); return; } // 役割で、入力欄が変わる
  if (onField(e)) return;
  if (e.target.dataset.f === 'warehouseId') setUi('users', { form: { ...ui.users.form, warehouseId: e.target.value } });
});

// 別のタブで、マスタが変わったときに追従する（入力中の欄を壊さないよう、ユーザーの一覧だけ）
window.addEventListener('storage', (e) => {
  if (e.key === USERS_KEY) { users = loadUsers(); renderList(); }
  if (e.key === OFFICES_KEY) offices = loadOffices();
  if (e.key === MASTER_KEY) renderList();
});

initTheme();
render();
