// 会社と部署のマスタ。会社は1社だけ（クライアントのREqual）で、部署はすべてこの会社に属する。部署は並べるだけ（階層はない）。
// 社員は、いずれかの部署に属する（src/employees.js）。操作はすべて新しい配列を返す。

export const COMPANY = { id: 'C-REQUAL', name: 'REqual' };
export const DEPARTMENTS_KEY = 'rq-mock-departments';

// 初期値（ダミー）
export const DEFAULT_DEPARTMENTS = [
  { id: 'D-SALES', name: '営業部', active: true },
  { id: 'D-CALLCENTER', name: 'コールセンター', active: true },
  { id: 'D-APPRAISAL', name: '査定部', active: true },
  { id: 'D-ACCOUNTING', name: '経理部', active: true },
  { id: 'D-LOGISTICS', name: '物流部', active: true },
  { id: 'D-STORE', name: '店舗部', active: true },
].map((d) => ({ ...d, companyId: COMPANY.id }));

// 役割ごとの、初期の所属部署（社員を登録するときの初期値。役割と部署は、独立した項目）
const ROLE_DEPARTMENT = { sales: 'D-SALES', operator: 'D-CALLCENTER', dispatcher: 'D-CALLCENTER', appraiser: 'D-APPRAISAL', accountant: 'D-ACCOUNTING', warehouse: 'D-LOGISTICS', store: 'D-STORE' };
export const defaultDepartmentOf = (role) => ROLE_DEPARTMENT[role] ?? '';

const valid = (v) => Array.isArray(v) && v.length > 0 && v.every((d) => d && d.id && d.name);

// 店舗部がない古い保存は、店舗部を足す（店舗スタッフの所属先がなくならないように）
const withStoreDept = (list) => (list.some((d) => d.id === 'D-STORE') ? list : [...list, DEFAULT_DEPARTMENTS.find((d) => d.id === 'D-STORE')]);

export function loadDepartments() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEPARTMENTS_KEY));
    return valid(saved) ? withStoreDept(saved) : DEFAULT_DEPARTMENTS;
  } catch {
    return DEFAULT_DEPARTMENTS;
  }
}

export function saveDepartments(list) {
  try {
    localStorage.setItem(DEPARTMENTS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const newId = () => `D-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const fail = (departments, reason) => ({ ok: false, departments, reason });

// 登録・更新（id があれば更新）。会社は、いつも REqual。reason: noName／dupName／notFound
export function saveDepartment(departments, { id, name }) {
  const old = id ? departments.find((d) => d.id === id) : null;
  if (id && !old) return fail(departments, 'notFound');
  const n = String(name ?? '').trim();
  if (!n) return fail(departments, 'noName');
  if (departments.some((d) => d.name === n && d.id !== id)) return fail(departments, 'dupName');
  const item = { id: id ?? newId(), name: n, companyId: COMPANY.id, active: old?.active ?? true };
  return { ok: true, departments: old ? departments.map((d) => (d.id === id ? item : d)) : [...departments, item] };
}

// 有効・無効。有効な社員が所属している部署は無効にできない。有効な部署は最低1つ残す。reason: notFound／hasEmployees／lastActive
export function setDepartmentActive(departments, id, active, { employees = [] } = {}) {
  const d = departments.find((x) => x.id === id);
  if (!d) return fail(departments, 'notFound');
  if (!active && d.active) {
    if (employees.some((e) => e.departmentId === id && e.active)) return fail(departments, 'hasEmployees');
    if (!departments.some((x) => x.active && x.id !== id)) return fail(departments, 'lastActive');
  }
  return { ok: true, departments: departments.map((x) => (x.id === id ? { ...x, active } : x)) };
}

export const activeDepartments = (departments) => departments.filter((d) => d.active);
export const departmentName = (id, departments = loadDepartments()) => departments.find((d) => d.id === id)?.name ?? '';
