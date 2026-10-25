// 倉庫のマスタ。倉庫は営業所とは独立した施設で、営業所と一体の倉庫・倉庫のみ・倉庫のない営業所（営業のみ）がある。
// 倉庫の担当者は、各倉庫に所属する。商品は、入庫した倉庫に保管される。操作はすべて新しいマスタを返す。
import { AREAS } from './dispatch.js';
import { LOCATIONS } from './stock.js';

export const MASTER_KEY = 'rq-mock-warehouse-master';

// 初期値（ダミー）。大阪・関東は営業所と一体、福岡は倉庫のみ。兵庫・京都、東海の営業所には倉庫がない（営業のみ）
export const DEFAULT_MASTER = {
  warehouses: [
    { id: 'W-OSAKA', name: '大阪倉庫', address: '大阪府大阪市', officeId: 'osaka', locations: LOCATIONS, active: true },
    { id: 'W-KANTO', name: '関東倉庫', address: '埼玉県さいたま市', officeId: 'kanto', locations: ['A棚（バッグ・小物）', 'B棚（時計・ジュエリー）', '金庫室（高額品）', '要確認エリア'], active: true },
    { id: 'W-FUKUOKA', name: '福岡倉庫', address: '福岡県福岡市', officeId: '', locations: ['A棚', 'B棚', '金庫室（高額品）'], active: true },
  ],
  staff: [
    { id: 'wh01', loginId: 'wh01', name: '小川 直樹', warehouseId: 'W-OSAKA', active: true },
    { id: 'wh02', loginId: 'wh02', name: '中島 里奈', warehouseId: 'W-OSAKA', active: true },
    { id: 'wh03', loginId: 'wh03', name: '山本 大地', warehouseId: 'W-KANTO', active: true },
    { id: 'wh04', loginId: 'wh04', name: '藤田 結衣', warehouseId: 'W-FUKUOKA', active: true },
  ],
};

export function loadMaster() {
  try {
    const m = JSON.parse(localStorage.getItem(MASTER_KEY));
    return Array.isArray(m?.warehouses) && Array.isArray(m?.staff) ? m : DEFAULT_MASTER;
  } catch {
    return DEFAULT_MASTER;
  }
}

export function saveMaster(master) {
  try {
    localStorage.setItem(MASTER_KEY, JSON.stringify(master));
    return true;
  } catch {
    return false;
  }
}

export const warehouseById = (master, id) => master.warehouses.find((w) => w.id === id) ?? null;
export const activeWarehouses = (master) => master.warehouses.filter((w) => w.active);
export const staffOf = (master, warehouseId) => master.staff.filter((s) => s.warehouseId === warehouseId);
export const officeName = (officeId) => AREAS.find((a) => a.id === officeId)?.name.replace('エリア', '') ?? '';

// 営業所に併設の倉庫を優先し、なければ先頭の有効な倉庫（営業が入庫するときの、納入先の初期値）
export const defaultWarehouseFor = (master, officeId) => {
  const list = activeWarehouses(master);
  return list.find((w) => officeId && w.officeId === officeId) ?? list[0] ?? null;
};
// 営業が入庫するときの、納入先の倉庫と保管場所。選択が未指定・無効なら、営業所に併設の倉庫（なければ先頭）の先頭の棚
export function receiveTarget(master, officeId, { warehouseId, location } = {}) {
  const warehouse = activeWarehouses(master).find((w) => w.id === warehouseId) ?? defaultWarehouseFor(master, officeId);
  return { warehouse, location: warehouse?.locations.includes(location) ? location : warehouse?.locations[0] };
}

// 商品が入庫されている倉庫。倉庫の記録がない古い商品は、先頭の倉庫として扱う
export const warehouseIdOf = (unit, master) => unit.warehouseId ?? master.warehouses[0]?.id;

const newId = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const toList = (v) => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(/[,、\n]/)).map((x) => String(x).trim()).filter(Boolean))];
const fail = (master, reason) => ({ ok: false, master, reason });
const replaceAt = (list, id, item) => list.map((x) => (x.id === id ? item : x));

// 倉庫の登録・更新（id があれば更新）。reason: noName／noLocations／badOffice／dupName／notFound
export function saveWarehouse(master, { id, name, address = '', officeId = '', locations, active }) {
  const n = String(name ?? '').trim();
  const locs = toList(locations);
  const old = id ? warehouseById(master, id) : null;
  if (id && !old) return fail(master, 'notFound');
  if (!n) return fail(master, 'noName');
  if (!locs.length) return fail(master, 'noLocations');
  if (officeId && !AREAS.some((a) => a.id === officeId)) return fail(master, 'badOffice');
  if (master.warehouses.some((w) => w.name === n && w.id !== id)) return fail(master, 'dupName');
  const item = { id: id ?? newId('W'), name: n, address: String(address).trim(), officeId, locations: locs, active: active ?? old?.active ?? true };
  return { ok: true, master: { ...master, warehouses: old ? replaceAt(master.warehouses, id, item) : [...master.warehouses, item] } };
}

// 担当者の登録・更新（id があれば更新）。reason: noName／badLoginId／noWarehouse／dupLoginId／notFound
export function saveStaff(master, { id, loginId, name, warehouseId, active }) {
  const login = String(loginId ?? '').trim().toLowerCase();
  const n = String(name ?? '').trim();
  const old = id ? master.staff.find((s) => s.id === id) : null;
  if (id && !old) return fail(master, 'notFound');
  if (!n) return fail(master, 'noName');
  if (!/^[a-z0-9_-]{3,20}$/.test(login)) return fail(master, 'badLoginId');
  if (!warehouseById(master, warehouseId)) return fail(master, 'noWarehouse');
  if (master.staff.some((s) => s.loginId === login && s.id !== id)) return fail(master, 'dupLoginId');
  const item = { id: id ?? newId('ST'), loginId: login, name: n, warehouseId, active: active ?? old?.active ?? true };
  return { ok: true, master: { ...master, staff: old ? replaceAt(master.staff, id, item) : [...master.staff, item] } };
}

// 倉庫の有効・無効。無効にできるのは、在庫（holding: 保管・出品・委託・返品対応中の点数）も有効な担当者もいない倉庫だけ
export function setWarehouseActive(master, id, active, { holding = 0 } = {}) {
  const w = warehouseById(master, id);
  if (!w) return fail(master, 'notFound');
  if (!active && holding > 0) return fail(master, 'inUse');
  if (!active && master.staff.some((s) => s.warehouseId === id && s.active)) return fail(master, 'hasStaff');
  return { ok: true, master: { ...master, warehouses: replaceAt(master.warehouses, id, { ...w, active }) } };
}

// ログインできるのは、有効な担当者だけ（IDの大文字・前後の空白は無視）
export const findStaff = (master, loginId) => master.staff.find((s) => s.active && s.loginId === String(loginId ?? '').trim().toLowerCase()) ?? null;
