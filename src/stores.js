// 店舗のマスタ。お客様が買取希望品を持ち込む、常設の実店舗（訪問はしない）。店舗スタッフは、いずれかの店舗に所属する（src/employees.js）。
// 買い取った商品は、納入先の倉庫（warehouseId）に入庫する。古物商の許可は、店舗（営業所）ごとに必要なので、許可番号を持つ。操作はすべて新しい配列を返す。

export const STORES_KEY = 'rq-mock-stores';

// 初期値（ダミー）。名前は「店」を付けない短い名前
export const DEFAULT_STORES = [
  { id: 'S-NAMBA', name: 'なんば', zip: '542-0076', address: '大阪府大阪市中央区難波4-1-1', phone: '06-0000-1001', hours: '10:00〜19:00', licenseNo: '第000000001号', warehouseId: 'W-OSAKA', active: true },
  { id: 'S-SHINJUKU', name: '新宿', zip: '160-0022', address: '東京都新宿区新宿3-1-1', phone: '03-0000-1002', hours: '10:00〜19:00', licenseNo: '第000000002号', warehouseId: 'W-KANTO', active: true },
];
export const storeLabel = (s) => `${s.name}店`;

const valid = (v) => Array.isArray(v) && v.length > 0 && v.every((s) => s && s.id && s.name);

export function loadStores() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORES_KEY));
    return valid(saved) ? saved : DEFAULT_STORES;
  } catch {
    return DEFAULT_STORES;
  }
}

export function saveStores(list) {
  try {
    localStorage.setItem(STORES_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const newId = () => `S-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const fail = (stores, reason) => ({ ok: false, stores, reason });
const text = (v) => String(v ?? '').trim();

// 登録・更新（id があれば更新）。warehouseIds: 納入先に選べる倉庫のID。reason: notFound／noName／dupName／noLicense／noWarehouse
export function saveStore(stores, { id, name, zip, address, phone, hours, licenseNo, warehouseId }, { warehouseIds = [] } = {}) {
  const old = id ? stores.find((s) => s.id === id) : null;
  if (id && !old) return fail(stores, 'notFound');
  const n = text(name);
  if (!n) return fail(stores, 'noName');
  if (stores.some((s) => s.name === n && s.id !== id)) return fail(stores, 'dupName');
  if (!text(licenseNo)) return fail(stores, 'noLicense');
  if (!warehouseId || !warehouseIds.includes(warehouseId)) return fail(stores, 'noWarehouse');
  const item = { id: id ?? newId(), name: n, zip: text(zip), address: text(address), phone: text(phone), hours: text(hours), licenseNo: text(licenseNo), warehouseId, active: old?.active ?? true };
  return { ok: true, stores: old ? stores.map((s) => (s.id === id ? item : s)) : [...stores, item] };
}

// 有効・無効。有効な店舗は最低1つ残す。有効な店舗スタッフがいる店舗は無効にできない（staffCount）。reason: notFound／lastActive／hasStaff
export function setStoreActive(stores, id, active, { staffCount = 0 } = {}) {
  const s = stores.find((x) => x.id === id);
  if (!s) return fail(stores, 'notFound');
  if (!active && s.active) {
    if (staffCount > 0) return fail(stores, 'hasStaff');
    if (!stores.some((x) => x.active && x.id !== id)) return fail(stores, 'lastActive');
  }
  return { ok: true, stores: stores.map((x) => (x.id === id ? { ...x, active } : x)) };
}

export const activeStores = (stores) => stores.filter((s) => s.active);
export const storeById = (id, stores = loadStores()) => stores.find((s) => s.id === id) ?? null;
// 記録に残った店舗IDから、画面に出す名前（なんば店）。不明なら空
export const storeNameOf = (id, stores = loadStores()) => { const s = storeById(id, stores); return s ? storeLabel(s) : ''; };
