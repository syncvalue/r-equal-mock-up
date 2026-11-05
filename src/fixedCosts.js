// 固定費（家賃・人件費など）と、鑑定士の小口金。支払・補充は入出金の帳簿（ledger.js）に記録する。
import { FIXED_KEY, PETTY_KEY } from './store.js';
import { newId } from './workday.js';
import { USERS } from './dashboard.js';

export const FIXED_TYPES = [
  { key: 'rent', icon: '🏢', label: '家賃' },
  { key: 'payroll', icon: '👥', label: '人件費' },
  { key: 'utility', icon: '💡', label: '水道光熱費' },
  { key: 'system', icon: '🖥️', label: '通信・システム費' },
  { key: 'other', icon: '📝', label: 'その他' },
];
export const fixedTypeOf = (key) => FIXED_TYPES.find((t) => t.key === key) ?? FIXED_TYPES.at(-1);

export const DEFAULT_FIXED = [
  { id: 'FX-RENT-OSAKA', type: 'rent', name: '大阪営業所 家賃', amount: 280000, payDay: 25, active: true },
  { id: 'FX-RENT-KANTO', type: 'rent', name: '関東営業所 家賃', amount: 350000, payDay: 25, active: true },
  { id: 'FX-RENT-HONSHA', type: 'rent', name: '本社 家賃', amount: 420000, payDay: 25, active: true },
  { id: 'FX-PAYROLL', type: 'payroll', name: '社員の給与', amount: 2400000, payDay: 25, active: true },
  { id: 'FX-UTIL', type: 'utility', name: '水道光熱費（本社）', amount: 38000, payDay: 10, active: true },
  { id: 'FX-SYSTEM', type: 'system', name: '通信・システム費', amount: 120000, payDay: 10, active: true },
];

export const PETTY_LOW = 10000; // 鑑定士の小口金の残りが、この金額を下回ったら「補充が必要」
export const PETTY_REFILL = 50000; // 補充の目安（残りがこの金額になるまで）

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } };

export const loadFixed = () => { const v = readJson(FIXED_KEY, null); return Array.isArray(v) ? v : DEFAULT_FIXED; };
export const saveFixed = (list) => write(FIXED_KEY, list);
export const loadPettyUses = () => readJson(PETTY_KEY, []);
export const savePettyUses = (list) => write(PETTY_KEY, list);

// ---- 固定費 -----------------------------------------------------------------
export const fixedReady = (d) => Boolean(d.name?.trim() && d.amount > 0 && d.payDay >= 1 && d.payDay <= 28);
export const saveFixedCost = (list, d) => {
  const item = { id: d.id || newId('FX'), type: d.type || 'other', name: d.name.trim(), amount: d.amount, payDay: d.payDay, active: d.active ?? true };
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
};
export const setFixedActive = (list, id, active) => list.map((x) => (x.id === id ? { ...x, active } : x));

// 月（2026-11）に、その固定費を支払った記録（帳簿の fixedId と month で探す）
export const paidEntry = (ledger, fixedId, month) => ledger.find((e) => e.category === 'fixed' && e.fixedId === fixedId && e.month === month) ?? null;
// 月の固定費の一覧: 有効なもの＋その月に払った記録のあるもの。払った／まだ、支払日を過ぎたか
export function monthlyFixed(fixed, ledger, month, today) {
  return fixed
    .filter((f) => f.active || paidEntry(ledger, f.id, month))
    .map((f) => {
      const paid = paidEntry(ledger, f.id, month);
      const due = `${month}-${String(f.payDay).padStart(2, '0')}`;
      return { ...f, due, paid, overdue: !paid && due < today };
    })
    .sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
}
export const monthlyTotals = (rows) => ({
  total: rows.reduce((n, r) => n + r.amount, 0),
  paid: rows.filter((r) => r.paid).reduce((n, r) => n + r.paid.amount, 0),
  unpaid: rows.filter((r) => !r.paid).reduce((n, r) => n + r.amount, 0),
});

// ---- 鑑定士の小口金 -----------------------------------------------------------
// 小口金を持つのは、現場で買取をする鑑定士（鑑定士タブレットを使う人。名簿は dashboard.js の USERS）
export const fieldStaff = () => USERS;
export const PETTY_STATUS = {
  pending: { label: '承認待ち', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: '承認済み', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: '却下', cls: 'bg-rose-100 text-rose-700' },
};
export const pettyStatusOf = (u) => u.status ?? 'approved'; // 状況のない古い記録は、承認済みとして扱う
export const pettyUseReady = (d) => Boolean(d.userId && d.amount > 0 && d.memo?.trim());

// 鑑定士の申請（承認待ち。鑑定士タブレットから）。経理部の代行入力（proxy）は、申請を待たずに承認済みで記録し、「経理代行」の印と入力者が残る
export function makePettyUse(d, { by = '', proxy = false, now = Date.now() } = {}) {
  return {
    id: newId('PU'), userId: d.userId, date: d.date, amount: d.amount, memo: d.memo.trim(), at: now,
    status: proxy ? 'approved' : 'pending', proxy, by, reason: '', decidedAt: proxy ? now : null,
  };
}
export const addPettyUse = (list, use) => [use, ...list];

// 承認・却下（新しい一覧を返す）。承認待ちだけが対象。却下は理由必須（空なら変えない）。
// 承認は、小口金の残りが足りるときだけ（足りなければ、先に補充する）
export function decidePettyUse(list, id, decision, { reason = '', by = '経理部', balance = Infinity, now = Date.now() } = {}) {
  const u = list.find((x) => x.id === id);
  if (!u || pettyStatusOf(u) !== 'pending') return list;
  if (decision === 'rejected' && !reason.trim()) return list;
  if (decision === 'approved' && u.amount > balance) return list;
  return list.map((x) => (x.id === id ? { ...x, status: decision, reason: decision === 'rejected' ? reason.trim() : '', by, decidedAt: now } : x));
}
// 申請した鑑定士が、承認待ちの申請を取り下げる
export const withdrawPettyUse = (list, id, userId) => list.filter((x) => !(x.id === id && x.userId === userId && pettyStatusOf(x) === 'pending'));

// 残高 ＝ 補充（帳簿の「鑑定士の小口金」）− 承認済みの使用。承認待ちは、残りに入れず別に数える
export function pettyRows(ledger, uses, staff) {
  return staff.map((a) => {
    const refill = ledger.filter((e) => e.category === 'petty' && e.userId === a.id).reduce((n, e) => n + e.amount, 0);
    const mine = uses.filter((u) => u.userId === a.id);
    const used = mine.filter((u) => pettyStatusOf(u) === 'approved').reduce((n, u) => n + u.amount, 0);
    const pending = mine.filter((u) => pettyStatusOf(u) === 'pending');
    const balance = refill - used;
    return { user: a, refill, used, balance, low: balance < PETTY_LOW, suggest: Math.max(0, PETTY_REFILL - balance), pendingCount: pending.length, pendingAmount: pending.reduce((n, u) => n + u.amount, 0) };
  });
}
