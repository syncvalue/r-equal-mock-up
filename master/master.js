// マスタ管理画面（ダミー・PC想定）。社員・営業所・倉庫・委託先の一覧、登録・変更、有効/無効。
import { EMPLOYEES_KEY, DEFAULT_EMPLOYEES, loadEmployees, saveEmployees, saveEmployee, setEmployeeActive, isReadOnlyRole } from '../src/employees.js';
import { DEPARTMENTS_KEY, DEFAULT_DEPARTMENTS, loadDepartments, saveDepartments, saveDepartment, setDepartmentActive, activeDepartments, defaultDepartmentOf } from '../src/departments.js';
import { OFFICES_KEY, DEFAULT_OFFICES, loadOffices, saveOffices, saveOffice, setOfficeActive } from '../src/offices.js';
import { STORES_KEY, DEFAULT_STORES, loadStores, saveStores, saveStore, setStoreActive, activeStores } from '../src/stores.js';
import { loadCurrentTrips, saveTrips, saveTrip, setTripActive } from '../src/trips.js';
import { USERS } from '../src/dashboard.js';
import { ymdOf } from '../src/reservations.js';
import { MASTER_KEY, loadMaster, saveMaster, saveWarehouse, saveVendor, setVendorActive, saveHighValueRule, setWarehouseActive, warehouseById, vendorById, activeWarehouses, DEFAULT_MASTER } from '../src/warehouseMaster.js';
import { loadState, holdingByWarehouse } from '../src/warehouse.js';
import { initTheme, themeToggleHtml } from '../src/theme.js';
import { initHelp } from '../src/help.js';
import { masterHtml, REASON_TEXT } from './view.js';
import { listHtml, blankForm, formFromEmployee } from './employeesPanel.js';
import { blankDepartment, formFromDepartment } from './departmentsPanel.js';
import { blankOffice, formFromOffice } from './officesPanel.js';
import { blankTrip, formFromTrip } from './tripsPanel.js';
import { blankStore, formFromStore } from './storesPanel.js';

const $ = (s) => document.querySelector(s);
const blankWh = () => ({ id: '', name: '', zip: '', address: '', phone: '', officeId: '', locations: '', highValue: false });
const blankVendor = () => ({ id: '', name: '', zip: '', address: '', phone: '' });
const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };

let employees = loadEmployees();
let departments = loadDepartments();
let offices = loadOffices();
let stores = loadStores();
const salesIds = USERS.map((u) => u.id);
let trips = loadCurrentTrips();
let menuOpen = false; // 左側のメニューの開閉
let tab = ['employees', 'departments', 'offices', 'trips', 'stores', 'warehouses', 'vendors'].includes(pref('rq-mock-master-tab', '')) ? pref('rq-mock-master-tab', '') : 'employees';
let ui = { employees: { role: '', q: '', status: '', departmentId: '', form: null }, departments: { md: blankDepartment() }, offices: { mo: blankOffice() }, trips: { mt: blankTrip() }, stores: { ms: blankStore() }, warehouses: { mw: blankWh(), hv: null }, vendors: { mv: blankVendor() } };
const setUi = (name, patch) => { ui = { ...ui, [name]: { ...ui[name], ...patch } }; };

// 店舗ごとの、有効な店舗スタッフの人数
const storeStaffCount = () => employees.filter((u) => u.role === 'store' && u.active).reduce((n, u) => ({ ...n, [u.storeId]: (n[u.storeId] ?? 0) + 1 }), {});

const ctx = () => {
  const wmaster = loadMaster();
  return { tab, menuOpen, employees, departments, offices, trips, stores, storeStaffCount: storeStaffCount(), salesUsers: USERS.map(({ id, name }) => ({ id, name })), today: ymdOf(new Date()), wmaster, holding: holdingByWarehouse(loadState(), wmaster), ui, themeHtml: themeToggleHtml() };
};
const render = () => { $('#root').innerHTML = masterHtml(ctx()); };
const renderList = () => { const el = $('[data-list]'); if (el) el.innerHTML = listHtml({ employees, departments, warehouses: loadMaster().warehouses, stores, ui: ui.employees }); };
const warn = (reason) => alert(REASON_TEXT[reason] ?? '保存できませんでした');
const commitWh = (next) => { if (!saveMaster(next)) alert('保存できませんでした（容量超過）'); };

// ---- 社員 ---------------------------------------------------------------------
function commitUsers(next) {
  if (!saveEmployees(next)) return alert('保存できませんでした（容量超過）');
  employees = next;
}
function saveUserForm() {
  const f = ui.employees.form;
  const current = employees.find((u) => u.id === f.id)?.warehouseId; // いま所属している倉庫は、無効でも保てる
  const warehouseIds = [...activeWarehouses(loadMaster()).map((w) => w.id), ...(current ? [current] : [])];
  const currentStore = employees.find((u) => u.id === f.id)?.storeId; // いま所属している店舗は、無効でも保てる
  const storeIds = [...activeStores(stores).map((x) => x.id), ...(currentStore ? [currentStore] : [])];
  const currentDept = employees.find((u) => u.id === f.id)?.departmentId; // いま所属している部署は、無効でも保てる
  const departmentIds = [...activeDepartments(departments).map((d) => d.id), ...(currentDept ? [currentDept] : [])];
  const r = saveEmployee(employees, { ...f, id: f.id || undefined }, { warehouseIds, storeIds, departmentIds });
  if (!r.ok) return warn(r.reason);
  commitUsers(r.employees);
  setUi('employees', { form: null });
}
function toggleUser(id) {
  const r = setEmployeeActive(employees, id, !employees.find((x) => x.id === id).active);
  if (!r.ok) return warn(r.reason);
  commitUsers(r.employees);
}

// ---- 部署 -------------------------------------------------------------------------
function saveDepartmentForm() {
  const f = ui.departments.md;
  const r = saveDepartment(departments, { ...f, id: f.id || undefined });
  if (!r.ok) return warn(r.reason);
  if (!saveDepartments(r.departments)) return alert('保存できませんでした（容量超過）');
  departments = r.departments;
  setUi('departments', { md: blankDepartment() });
}
function toggleDepartment(id) {
  const r = setDepartmentActive(departments, id, !departments.find((d) => d.id === id).active, { employees });
  if (!r.ok) return warn(r.reason);
  if (saveDepartments(r.departments)) departments = r.departments;
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

// ---- 店舗 -------------------------------------------------------------------------
function saveStoreForm() {
  const f = ui.stores.ms;
  const current = stores.find((x) => x.id === f.id)?.warehouseId; // いま納入先の倉庫は、無効でも保てる
  const warehouseIds = [...activeWarehouses(loadMaster()).filter((w) => !w.highValue).map((w) => w.id), ...(current ? [current] : [])];
  const r = saveStore(stores, { ...f, id: f.id || undefined }, { warehouseIds });
  if (!r.ok) return warn(r.reason);
  if (!saveStores(r.stores)) return alert('保存できませんでした（容量超過）');
  stores = r.stores;
  setUi('stores', { ms: blankStore() });
}
function toggleStore(id) {
  const r = setStoreActive(stores, id, !stores.find((x) => x.id === id).active, { staffCount: storeStaffCount()[id] ?? 0 });
  if (!r.ok) return warn(r.reason);
  if (saveStores(r.stores)) stores = r.stores;
}

// ---- 出張 -------------------------------------------------------------------------
function saveTripForm() {
  const f = ui.trips.mt;
  const r = saveTrip(trips, { ...f, id: f.id || undefined }, { userIds: salesIds });
  if (!r.ok) return warn(r.reason);
  if (!saveTrips(r.trips)) return alert('保存できませんでした（容量超過）');
  trips = r.trips;
  setUi('trips', { mt: blankTrip() });
}
function toggleTrip(id) {
  const r = setTripActive(trips, id, !trips.find((t) => t.id === id).active);
  if (r.ok && saveTrips(r.trips)) trips = r.trips;
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
  menuOpen: () => { menuOpen = true; },
  menuClose: () => { menuOpen = false; },
  master: (v) => { tab = v; menuOpen = false; try { localStorage.setItem('rq-mock-master-tab', v); } catch { /* 保存できなくても動作は継続（モック） */ } },
  role: (v) => setUi('employees', { role: v }),
  new: () => setUi('employees', { form: blankForm(ui.employees.role && !isReadOnlyRole(ui.employees.role) ? ui.employees.role : 'operator') }),
  edit: (v) => setUi('employees', { form: formFromEmployee(employees.find((u) => u.id === v)) }),
  toggle: toggleUser,
  save: saveUserForm,
  cancel: () => setUi('employees', { form: null }),
  mdSave: saveDepartmentForm,
  mdEdit: (v) => setUi('departments', { md: formFromDepartment(departments.find((d) => d.id === v)) }),
  mdCancel: () => setUi('departments', { md: blankDepartment() }),
  mdToggle: toggleDepartment,
  moSave: saveOfficeForm,
  moEdit: (v) => setUi('offices', { mo: formFromOffice(offices.find((o) => o.id === v)) }),
  moCancel: () => setUi('offices', { mo: blankOffice() }),
  moToggle: toggleOffice,
  msSave: saveStoreForm,
  msEdit: (v) => setUi('stores', { ms: formFromStore(stores.find((x) => x.id === v)) }),
  msCancel: () => setUi('stores', { ms: blankStore() }),
  msToggle: toggleStore,
  mtSave: saveTripForm,
  mtEdit: (v) => setUi('trips', { mt: formFromTrip(trips.find((t) => t.id === v)) }),
  mtCancel: () => setUi('trips', { mt: blankTrip() }),
  mtToggle: toggleTrip,
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
    if (!confirm('社員・部署・営業所・出張・店舗・倉庫・委託先を、すべて初期値（見本のデータ）に戻します。登録・変更した内容は消えます。よろしいですか？')) return false;
    commitUsers(DEFAULT_EMPLOYEES);
    saveDepartments(DEFAULT_DEPARTMENTS); departments = DEFAULT_DEPARTMENTS;
    saveOffices(DEFAULT_OFFICES); offices = DEFAULT_OFFICES;
    saveStores(DEFAULT_STORES); stores = DEFAULT_STORES;
    try { localStorage.removeItem('rq-mock-trips'); } catch { /* 消せなくても動作は継続（モック） */ }
    trips = loadCurrentTrips();
    commitWh({ ...DEFAULT_MASTER, staff: undefined });
    ui = { employees: { role: '', q: '', status: '', departmentId: '', form: null }, departments: { md: blankDepartment() }, offices: { mo: blankOffice() }, trips: { mt: blankTrip() }, stores: { ms: blankStore() }, warehouses: { mw: blankWh(), hv: null }, vendors: { mv: blankVendor() } };
  },
};
const SELECTOR = Object.keys(CLICK).map((k) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`).join(',');

document.addEventListener('click', (e) => {
  const el = e.target.closest(SELECTOR);
  if (!el) return;
  const [name, value] = Object.entries(el.dataset).find(([k]) => k in CLICK);
  if (CLICK[name](value) !== false) render();
});

// 入力欄: 「社員」は data-f="name"、ほかは data-f="mw.name" のように、フォームの名前つき。入力中は再描画しない（検索は一覧だけ更新）
const FORMS = { md: ['departments', 'md'], mo: ['offices', 'mo'], mt: ['trips', 'mt'], ms: ['stores', 'ms'], mw: ['warehouses', 'mw'], mv: ['vendors', 'mv'] };
function onField(e) {
  const [form, key] = (e.target.dataset.f ?? '').split('.');
  const target = FORMS[form];
  if (!target) return false;
  const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  setUi(target[0], { [target[1]]: { ...ui[target[0]][target[1]], [key]: value } });
  return true;
}
document.addEventListener('input', (e) => {
  if (e.target.matches('[data-q]')) { setUi('employees', { q: e.target.value }); renderList(); return; }
  if (onField(e)) return;
  const key = e.target.dataset.f;
  if (key && e.target.tagName === 'INPUT') setUi('employees', { form: { ...ui.employees.form, [key]: e.target.value } });
});
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-dept]')) { setUi('employees', { departmentId: e.target.value }); renderList(); return; }
  if (e.target.matches('[data-status]')) { setUi('employees', { status: e.target.value }); renderList(); return; }
  if (e.target.dataset.tripMember) { // 出張メンバー
    const id = e.target.dataset.tripMember;
    const cur = ui.trips.mt.memberIds;
    setUi('trips', { mt: { ...ui.trips.mt, memberIds: e.target.checked ? [...new Set([...cur, id])] : cur.filter((x) => x !== id) } });
    return;
  }
  if (e.target.dataset.hvColor) { // 高額品にするシールの色
    const cur = ui.warehouses.hv ?? loadMaster().highValue.colors;
    const c = e.target.dataset.hvColor;
    setUi('warehouses', { hv: e.target.checked ? [...new Set([...cur, c])] : cur.filter((x) => x !== c) });
    return;
  }
  if (e.target.dataset.group) {
    const g = e.target.dataset.group;
    const groups = e.target.checked ? [...new Set([...ui.employees.form.groups, g])] : ui.employees.form.groups.filter((x) => x !== g);
    setUi('employees', { form: { ...ui.employees.form, groups } });
    return;
  }
  if (e.target.dataset.f === 'role') { setUi('employees', { form: { ...blankForm(e.target.value), name: ui.employees.form.name, loginId: ui.employees.form.loginId, departmentId: ui.employees.form.departmentId === defaultDepartmentOf(ui.employees.form.role) ? defaultDepartmentOf(e.target.value) : ui.employees.form.departmentId } }); render(); return; } // 役割で、入力欄が変わる
  if (onField(e)) return;
  if (['warehouseId', 'storeId', 'departmentId'].includes(e.target.dataset.f)) setUi('employees', { form: { ...ui.employees.form, [e.target.dataset.f]: e.target.value } });
});

// 別のタブで、マスタが変わったときに追従する（入力中の欄を壊さないよう、社員の一覧だけ）
window.addEventListener('storage', (e) => {
  if (e.key === EMPLOYEES_KEY) { employees = loadEmployees(); renderList(); }
  if (e.key === DEPARTMENTS_KEY) { departments = loadDepartments(); renderList(); }
  if (e.key === OFFICES_KEY) offices = loadOffices();
  if (e.key === STORES_KEY) stores = loadStores();
  if (e.key === MASTER_KEY) renderList();
});

initTheme();
initHelp();
render();
