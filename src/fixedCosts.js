// 固定費（家賃・人件費など）。支払は入出金の帳簿（ledger.js）に記録する。
import { FIXED_KEY } from './store.js';
import { newId } from './workday.js';

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

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } };

export const loadFixed = () => { const v = readJson(FIXED_KEY, null); return Array.isArray(v) ? v : DEFAULT_FIXED; };
export const saveFixed = (list) => write(FIXED_KEY, list);

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
