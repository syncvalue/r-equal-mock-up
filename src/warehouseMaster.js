// 倉庫のマスタ。倉庫は営業所とは独立した施設で、営業所と一体の倉庫・倉庫のみ・倉庫のない営業所（営業のみ）がある。
// 倉庫の担当者は、各倉庫に所属する。商品は、入庫した倉庫に保管される。操作はすべて新しいマスタを返す。
import { AREAS } from './dispatch.js';
import { LOCATIONS, SEAL_COLORS } from './stock.js';

export const MASTER_KEY = 'rq-mock-warehouse-master';

// 本社も、倉庫と同じ保管場所の1つ（highValue: 高額品の保管先）。貴金属などの高額品は、納入のときから本社に入り、それ以外は倉庫に入る。
// 初期値（ダミー）。大阪・関東は営業所と一体、福岡は倉庫のみ。兵庫・京都、東海の営業所には倉庫がない（営業のみ）
export const DEFAULT_MASTER = {
  warehouses: [
    { id: 'W-OSAKA', name: '大阪倉庫', zip: '559-0034', address: '大阪府大阪市住之江区南港北1-1-1', phone: '06-0000-0001', officeId: 'osaka', locations: LOCATIONS, active: true },
    { id: 'W-KANTO', name: '関東倉庫', zip: '330-0854', address: '埼玉県さいたま市大宮区桜木町1-1-1', phone: '048-000-0002', officeId: 'kanto', locations: ['A棚（バッグ・小物）', 'B棚（時計・ジュエリー）', '金庫室（高額品）', '要確認エリア'], active: true },
    { id: 'W-FUKUOKA', name: '福岡倉庫', zip: '812-0011', address: '福岡県福岡市博多区博多駅前1-1-1', phone: '092-000-0003', officeId: '', locations: ['A棚', 'B棚', '金庫室（高額品）'], active: true },
    { id: 'W-HONSHA', name: '本社', zip: '541-0041', address: '大阪府大阪市中央区北浜1-1-1', phone: '06-0000-0004', officeId: '', locations: ['金庫室（高額品）', '貴金属保管庫'], highValue: true, active: true },
  ],
  staff: [
    { id: 'wh01', loginId: 'wh01', name: '小川 直樹', warehouseId: 'W-OSAKA', active: true },
    { id: 'wh02', loginId: 'wh02', name: '中島 里奈', warehouseId: 'W-OSAKA', active: true },
    { id: 'wh03', loginId: 'wh03', name: '山本 大地', warehouseId: 'W-KANTO', active: true },
    { id: 'wh04', loginId: 'wh04', name: '藤田 結衣', warehouseId: 'W-FUKUOKA', active: true },
    { id: 'wh05', loginId: 'wh05', name: '岡田 剛', warehouseId: 'W-HONSHA', active: true },
  ],
  // 委託先（業者）。業者オークションなど、外部の市場に商品を委託して販売する送り先（ダミー）
  vendors: [
    { id: 'V-OSAKA-WATCH', name: '大阪時計オークション', zip: '556-0011', address: '大阪府大阪市浪速区難波中2-1-1', phone: '06-1111-0001', active: true },
    { id: 'V-TOKYO-BRAND', name: '東京ブランド市場', zip: '110-0005', address: '東京都台東区上野1-1-1', phone: '03-1111-0002', active: true },
    { id: 'V-KANSAI-JEWEL', name: '関西貴金属市場', zip: '541-0053', address: '大阪府大阪市中央区本町1-1-1', phone: '06-1111-0003', active: true },
  ],
  // 高額品（本社の管理対象）: シールの色が、紫・赤の商品
  highValue: { colors: ['purple', 'red'] },
};

export function loadMaster() {
  try {
    const m = JSON.parse(localStorage.getItem(MASTER_KEY));
    return Array.isArray(m?.warehouses) && Array.isArray(m?.staff) ? { ...m, highValue: Array.isArray(m.highValue?.colors) ? m.highValue : DEFAULT_MASTER.highValue, vendors: Array.isArray(m.vendors) ? m.vendors : DEFAULT_MASTER.vendors } : DEFAULT_MASTER;
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
  const list = activeWarehouses(master).filter((w) => !w.highValue); // 本社は、通常の納入先ではない
  return list.find((w) => officeId && w.officeId === officeId) ?? list[0] ?? null;
};
// 営業が入庫するときの、納入先の倉庫と保管場所。選択が未指定・無効なら、営業所に併設の倉庫（なければ先頭）の先頭の棚
export function receiveTarget(master, officeId, { warehouseId, location } = {}) {
  const warehouse = activeWarehouses(master).find((w) => w.id === warehouseId && !w.highValue) ?? defaultWarehouseFor(master, officeId);
  return { warehouse, location: warehouse?.locations.includes(location) ? location : warehouse?.locations[0] };
}

// 商品が入庫されている倉庫。倉庫の記録がない古い商品は、先頭の倉庫として扱う
export const warehouseIdOf = (unit, master) => unit.warehouseId ?? master.warehouses.find((w) => !w.highValue)?.id;

// ---- 本社（高額品の保管先）---------------------------------------------------
export const honshaOf = (master) => activeWarehouses(master).find((w) => w.highValue) ?? null;
export const isHighValue = (unit, master) => (master.highValue?.colors ?? []).includes(unit.sealColor);
// 納入先の規則: 高額品は本社だけ、高額品以外は本社以外の倉庫だけ（本社が登録されていなければ、制限しない）。'' は問題なし
export function destinationProblem(master, unit, warehouseId) {
  if (!honshaOf(master)) return '';
  const toHonsha = Boolean(warehouseById(master, warehouseId)?.highValue);
  const high = isHighValue(unit, master);
  return high && !toHonsha ? 'highToHonsha' : !high && toHonsha ? 'normalToWarehouse' : '';
}
// 商品ごとの納入先。高額品は本社に自動で、それ以外は選んだ倉庫（本社は選べない）
export function receiveTargetFor(master, unit, officeId, sel = {}) {
  const hon = honshaOf(master);
  if (hon && isHighValue(unit, master)) return { warehouse: hon, location: hon.locations.includes(sel.location) ? sel.location : hon.locations[0] };
  return receiveTarget(master, officeId, sel);
}

const newId = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const toList = (v) => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(/[,、\n]/)).map((x) => String(x).trim()).filter(Boolean))];
const fail = (master, reason) => ({ ok: false, master, reason });
const replaceAt = (list, id, item) => list.map((x) => (x.id === id ? item : x));

// 倉庫の登録・更新（id があれば更新）。zip・phone は、発送伝票・CSVの住所に使う。reason: noName／noLocations／badOffice／badZip／dupName／dupHonsha／notFound
export function saveWarehouse(master, { id, name, address = '', zip, phone, officeId = '', locations, active, highValue }) {
  const n = String(name ?? '').trim();
  const locs = toList(locations);
  const old = id ? warehouseById(master, id) : null;
  if (id && !old) return fail(master, 'notFound');
  if (!n) return fail(master, 'noName');
  if (!locs.length) return fail(master, 'noLocations');
  if (officeId && !AREAS.some((a) => a.id === officeId)) return fail(master, 'badOffice');
  const z = zip === undefined ? old?.zip ?? '' : String(zip).trim().replace(/^(\d{3})(\d{4})$/, '$1-$2');
  if (z && !/^\d{3}-\d{4}$/.test(z)) return fail(master, 'badZip');
  if (master.warehouses.some((w) => w.name === n && w.id !== id)) return fail(master, 'dupName');
  const hv = Boolean(highValue ?? old?.highValue);
  if (hv && master.warehouses.some((w) => w.highValue && w.id !== id)) return fail(master, 'dupHonsha');
  const item = { id: id ?? newId('W'), name: n, zip: z, address: String(address).trim(), phone: phone === undefined ? old?.phone ?? '' : String(phone).trim(), officeId, locations: locs, active: active ?? old?.active ?? true, ...(hv ? { highValue: true } : {}) };
  return { ok: true, master: { ...master, warehouses: old ? replaceAt(master.warehouses, id, item) : [...master.warehouses, item] } };
}

// ---- 委託先（業者）-------------------------------------------------------------
export const vendorById = (master, id) => (master.vendors ?? []).find((v) => v.id === id) ?? null;
export const activeVendors = (master) => (master.vendors ?? []).filter((v) => v.active);

// 委託先の登録・更新（id があれば更新。指定しなかった項目は、いまの値を保つ）。reason: noName／badZip／dupName／notFound
export function saveVendor(master, { id, name, zip, address, phone }) {
  const old = id ? vendorById(master, id) : null;
  if (id && !old) return fail(master, 'notFound');
  const n = String(name ?? '').trim();
  if (!n) return fail(master, 'noName');
  const z = zip === undefined ? old?.zip ?? '' : String(zip).trim().replace(/^(\d{3})(\d{4})$/, '$1-$2');
  if (z && !/^\d{3}-\d{4}$/.test(z)) return fail(master, 'badZip');
  if ((master.vendors ?? []).some((v) => v.name === n && v.id !== id)) return fail(master, 'dupName');
  const item = { id: id ?? newId('V'), name: n, zip: z, address: address === undefined ? old?.address ?? '' : String(address).trim(), phone: phone === undefined ? old?.phone ?? '' : String(phone).trim(), active: old?.active ?? true };
  const list = master.vendors ?? [];
  return { ok: true, master: { ...master, vendors: old ? replaceAt(list, id, item) : [...list, item] } };
}

export function setVendorActive(master, id, active) {
  const v = vendorById(master, id);
  return v ? { ok: true, master: { ...master, vendors: replaceAt(master.vendors, id, { ...v, active }) } } : fail(master, 'notFound');
}

// 高額品（本社の管理対象）にするシールの色の設定。reason: noRule／badColor
export function saveHighValueRule(master, { colors }) {
  const list = [...new Set(colors ?? [])];
  if (!list.length) return fail(master, 'noRule');
  if (list.some((c) => !SEAL_COLORS.some((x) => x.key === c))) return fail(master, 'badColor');
  return { ok: true, master: { ...master, highValue: { colors: list } } };
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
