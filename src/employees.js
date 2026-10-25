// 社員（このシステムを使う社内の人）の名簿。社員は、いずれかの部署に属し（src/departments.js）、役割（システムでの立場）は1人にひとつ。
// 営業・オペレーター・配車係・査定員・経理担当・倉庫担当を、ここで一元管理する（用語は docs/SPEC.md の用語集）。
// 画面は、この名簿から必要な形（倉庫担当・オペレーター名・査定員）を受け取る。操作はすべて新しい配列を返す。
import { USERS as SALES, GROUPS } from './dashboard.js';
import { defaultDepartmentOf } from './departments.js';

export const EMPLOYEES_KEY = 'rq-mock-employees';
const LEGACY_USERS_KEY = 'rq-mock-users'; // 「社員」と呼んでいたころの保存先（部署なし）
const LEGACY_MASTER_KEY = 'rq-mock-warehouse-master'; // 倉庫担当を、倉庫マスタで登録していたころの保存先

export const ROLES = [
  { key: 'sales', label: '営業', where: '営業タブレット' },
  { key: 'operator', label: 'オペレーター', where: 'コールセンター' },
  { key: 'dispatcher', label: '配車係', where: 'コールセンター（配車確定）' },
  { key: 'appraiser', label: '査定員', where: '本社 査定部' },
  { key: 'accountant', label: '経理担当', where: '本社 経理部' },
  { key: 'warehouse', label: '倉庫担当', where: '倉庫・物流' },
];
export const roleLabel = (role) => ROLES.find((r) => r.key === role)?.label ?? '';

// 営業は、業績・担当エリア・始業終業などの記録が各画面に固定されていて、まだ名簿とつながっていない。ここでは参照だけ（モック）
export const isReadOnlyRole = (role) => role === 'sales';

// 初期値（ダミー）。営業・査定員は、既存の画面のデータと同じ。配車係・経理担当は、画面で人を区別していないため、見本の1名ずつ
const withDept = (e) => (e.departmentId ? e : { ...e, departmentId: defaultDepartmentOf(e.role) }); // 部署がなければ、役割ごとの初期の部署
export const DEFAULT_EMPLOYEES = [
  ...SALES.map((u, i) => ({ id: u.id, loginId: `sales${String(i + 1).padStart(2, '0')}`, name: u.name, role: 'sales', active: true, groups: [u.group], leader: u.role === 'leader' })),
  { id: 'op01', loginId: 'op01', name: '佐藤', role: 'operator', active: true },
  { id: 'op02', loginId: 'op02', name: '渡辺', role: 'operator', active: true },
  { id: 'dp01', loginId: 'dp01', name: '高田 修', role: 'dispatcher', active: true },
  { id: 'a1', loginId: 'ap01', name: '青木', role: 'appraiser', active: true, groups: ['A'] },
  { id: 'a2', loginId: 'ap02', name: '井上', role: 'appraiser', active: true, groups: ['B'] },
  { id: 'ac01', loginId: 'ac01', name: '木村 真理', role: 'accountant', active: true },
  { id: 'wh01', loginId: 'wh01', name: '小川 直樹', role: 'warehouse', active: true, warehouseId: 'W-OSAKA' },
  { id: 'wh02', loginId: 'wh02', name: '中島 里奈', role: 'warehouse', active: true, warehouseId: 'W-OSAKA' },
  { id: 'wh03', loginId: 'wh03', name: '山本 大地', role: 'warehouse', active: true, warehouseId: 'W-KANTO' },
  { id: 'wh04', loginId: 'wh04', name: '藤田 結衣', role: 'warehouse', active: true, warehouseId: 'W-FUKUOKA' },
  { id: 'wh05', loginId: 'wh05', name: '岡田 剛', role: 'warehouse', active: true, warehouseId: 'W-HONSHA' },
].map(withDept);

const validList = (v) => Array.isArray(v) && v.length > 0 && v.every((u) => u && u.id && u.loginId && u.name && ROLES.some((r) => r.key === u.role));
const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };

// 保存がなければ初期値。以前の保存（「社員」の保存・倉庫マスタの中の倉庫担当）があれば、社員として引き継ぎ、保存する
export function loadEmployees() {
  const saved = readJson(EMPLOYEES_KEY);
  if (validList(saved)) return saved.map(withDept);
  const oldUsers = readJson(LEGACY_USERS_KEY);
  if (validList(oldUsers)) {
    const list = oldUsers.map(withDept);
    saveEmployees(list);
    return list;
  }
  const legacy = readJson(LEGACY_MASTER_KEY)?.staff;
  if (!Array.isArray(legacy) || !legacy.length) return DEFAULT_EMPLOYEES;
  const moved = legacy.map((s) => withDept({ id: s.id, loginId: s.loginId, name: s.name, role: 'warehouse', active: s.active !== false, warehouseId: s.warehouseId }));
  const list = [...DEFAULT_EMPLOYEES.filter((u) => u.role !== 'warehouse'), ...moved];
  saveEmployees(list);
  return list;
}

export function saveEmployees(list) {
  try {
    localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const newId = () => `US-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const fail = (employees, reason) => ({ ok: false, employees, reason });
const replaceAt = (list, id, item) => list.map((x) => (x.id === id ? item : x));

// 登録・更新（id があれば更新）。役割は、登録のときに決め、あとから変えられない。
// departmentIds: 選べる部署のID。reason: badRole／readOnly／notFound／roleLocked／noName／badLoginId／dupLoginId／noWarehouse／noGroup／noDepartment
export function saveEmployee(employees, { id, loginId, name, role, departmentId, warehouseId, groups, active }, { warehouseIds = [], departmentIds = [] } = {}) {
  if (!ROLES.some((r) => r.key === role)) return fail(employees, 'badRole');
  if (isReadOnlyRole(role)) return fail(employees, 'readOnly');
  const old = id ? employees.find((u) => u.id === id) : null;
  if (id && !old) return fail(employees, 'notFound');
  if (old && old.role !== role) return fail(employees, 'roleLocked');
  const n = String(name ?? '').trim();
  const login = String(loginId ?? '').trim().toLowerCase();
  if (!n) return fail(employees, 'noName');
  if (!/^[a-z0-9_-]{3,20}$/.test(login)) return fail(employees, 'badLoginId');
  if (employees.some((u) => u.loginId === login && u.id !== id)) return fail(employees, 'dupLoginId');
  const extra = {};
  if (role === 'warehouse') {
    if (!warehouseId || !warehouseIds.includes(warehouseId)) return fail(employees, 'noWarehouse');
    extra.warehouseId = warehouseId;
  }
  if (role === 'appraiser') {
    const g = [...new Set(groups ?? [])];
    if (!g.length || g.some((x) => !GROUPS.some((grp) => grp.id === x))) return fail(employees, 'noGroup');
    extra.groups = g;
  }
  if (!departmentId || !departmentIds.includes(departmentId)) return fail(employees, 'noDepartment');
  const item = { id: id ?? newId(), loginId: login, name: n, role, departmentId, active: active ?? old?.active ?? true, ...extra };
  return { ok: true, employees: old ? replaceAt(employees, id, item) : [...employees, item] };
}

// 有効・無効。役割ごとに、有効な社員を最低1人は残す（オペレーターの選択・査定員の切り替えなどが空にならないように）。有効に戻すのは、いつでもできる
export function setEmployeeActive(employees, id, active) {
  const u = employees.find((x) => x.id === id);
  if (!u) return fail(employees, 'notFound');
  if (isReadOnlyRole(u.role)) return fail(employees, 'readOnly');
  if (!active && u.active && !employees.some((x) => x.role === u.role && x.active && x.id !== id)) return fail(employees, 'lastActive');
  return { ok: true, employees: replaceAt(employees, id, { ...u, active }) };
}

// ---- 各画面が名簿から受け取る形 -----------------------------------------------------
// 倉庫マスタと同じ形（無効の判定は倉庫側で行うため、無効な倉庫担当も含める）
export const warehouseStaffOf = (employees) => employees.filter((u) => u.role === 'warehouse').map((u) => ({ id: u.id, loginId: u.loginId, name: u.name, warehouseId: u.warehouseId, active: u.active }));
export const operatorNames = (employees) => employees.filter((u) => u.role === 'operator' && u.active).map((u) => u.name);
export const appraisersOf = (employees) => employees.filter((u) => u.role === 'appraiser' && u.active).map((u) => ({ id: u.id, name: u.name, groups: u.groups ?? [] }));

// ---- 一覧の絞り込み ---------------------------------------------------------------
const norm = (s) => String(s ?? '').replace(/　/g, ' ').trim().toLowerCase();

// role: 役割（空は全員）／departmentId: 部署（空は全部署）／q: 氏名・ログインIDの一部／status: active・inactive（空は両方）
export function filterEmployees(employees, { role = '', q = '', status = '', departmentId = '' } = {}) {
  const key = norm(q);
  return employees.filter((u) => (!role || u.role === role)
    && (!departmentId || u.departmentId === departmentId)
    && (!status || (status === 'active') === u.active)
    && (!key || norm(u.name).includes(key) || u.loginId.includes(key)));
}

export const countByRole = (employees) => ({ all: employees.length, ...Object.fromEntries(ROLES.map((r) => [r.key, employees.filter((u) => u.role === r.key).length])) });

// 部署ごとの、有効な社員の人数
export const countByDepartment = (employees) => employees.filter((u) => u.active).reduce((n, u) => ({ ...n, [u.departmentId]: (n[u.departmentId] ?? 0) + 1 }), {});
