// 経理部のロジック。営業の現金の確認事項の検知、経費の集計、経費の入力代行、お客様への入金の記録。
import { CUSTOMER_PAY_KEY } from './store.js';
import { EXPENSE_TYPES, PURCHASE_TYPE, addExpense, newId } from './workday.js';

export const HIGH_EXPENSE = 10000; // 買取代金以外の経費で「高額」とみなす1件の金額
export const CASH_LIMIT = 500000; // 営業が持つ現金が「多い」とみなす金額

// ---- 確認事項の検知（日ごと） ---------------------------------------------------------
const yen = (n) => `¥${Number(n).toLocaleString('ja-JP')}`;
const signed = (n) => `${n > 0 ? '+' : '−'}${yen(Math.abs(n))}`;

export function flagsOf(day, summary) {
  if (!day?.startedAt) return [];
  const flags = [];
  const { start, close } = day;
  if (start?.diff) flags.push({ level: 'warn', text: `始業時に前日の繰越金と差異 ${signed(start.diff)}（理由: ${start.note || '未記入'}）` });
  if (day.closedAt && close?.diff) flags.push({ level: 'danger', text: `終業時の過不足 ${signed(close.diff)}（理由: ${close.note || '未記入'}）` });
  if (summary.balance < 0) flags.push({ level: 'danger', text: `帳簿残高がマイナス（${signed(summary.balance)}）` });
  else if (summary.balance > CASH_LIMIT) flags.push({ level: 'warn', text: `所持金が多い（${yen(summary.balance)}）` });
  for (const e of day.expenses.filter((x) => x.type !== PURCHASE_TYPE.key)) {
    if (e.amount >= HIGH_EXPENSE) flags.push({ level: 'warn', text: `高額な経費 ${yen(e.amount)}（${e.memo || '用途の記入なし'}）` });
    if (e.type === 'other') flags.push({ level: 'info', text: `用途が「その他」の経費 ${yen(e.amount)}（${e.memo || '用途の記入なし'}）` });
    if (!e.photo && !e.proxy) flags.push({ level: 'warn', text: `レシートの写真がない経費 ${yen(e.amount)}` });
  }
  return flags;
}

// ---- 経費の集計 ---------------------------------------------------------------------
// period: 日付（2026-10-24）または月（2026-10）。日付の先頭が一致する記録を対象にする。買取代金は経費に含めない
export function expenseStats(days, period) {
  const inPeriod = days.filter((d) => d.date.startsWith(period));
  const all = inPeriod.flatMap((d) => d.expenses.map((e) => ({ ...e, userId: d.userId })));
  const costs = all.filter((e) => e.type !== PURCHASE_TYPE.key);
  const sum = (list) => list.reduce((n, e) => n + e.amount, 0);
  const byType = EXPENSE_TYPES
    .map((t) => ({ ...t, amount: sum(costs.filter((e) => e.type === t.key)), count: costs.filter((e) => e.type === t.key).length }))
    .filter((t) => t.count);
  const userIds = [...new Set(costs.map((e) => e.userId))];
  const byUser = userIds.map((userId) => ({ userId, amount: sum(costs.filter((e) => e.userId === userId)), count: costs.filter((e) => e.userId === userId).length }));
  return {
    total: sum(costs), count: costs.length, purchaseTotal: sum(all.filter((e) => e.type === PURCHASE_TYPE.key)),
    byType, byUser: byUser.sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId)),
  };
}

// ---- 経費の入力代行 -----------------------------------------------------------------
// 業務中（始業済み・未終業）の日だけ。終業後に足すと、営業が数えた現金と帳簿が合わなくなるため
export const canProxy = (day) => Boolean(day?.startedAt && !day.closedAt);

export const proxyExpense = (day, { type, amount, memo, by, at = Date.now() }) =>
  addExpense(day, { id: newId('EX'), at, type, amount, memo: memo.trim(), photo: null, proxy: true, by });

// ---- お客様への入金（銀行振込） ---------------------------------------------------------
export const PAY_REASONS = [
  { key: 'shortage', label: '営業の現金が足りなかった', hint: '不足分を、後日 銀行振込でお支払いする' },
  { key: 'highvalue', label: '高額のため、後日 銀行振込', hint: '現金での持ち歩き・受け渡しを避ける' },
  { key: 'other', label: 'その他', hint: '理由をメモに記入' },
];
export const reasonOf = (key) => PAY_REASONS.find((r) => r.key === key) ?? PAY_REASONS.at(-1);

export const paymentReady = (d) => Boolean(d.customerName.trim() && d.amount > 0 && d.reason && (d.reason !== 'other' || d.memo?.trim()));

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
export const loadCustomerPayments = () => readJson(CUSTOMER_PAY_KEY, []);
const save = (list) => localStorage.setItem(CUSTOMER_PAY_KEY, JSON.stringify(list));

export function addCustomerPayment(d, now = Date.now()) {
  const p = { id: newId('CP'), customerName: d.customerName.trim(), amount: d.amount, reason: d.reason, userId: d.userId || '', memo: (d.memo ?? '').trim(), status: 'pending', at: now, paidAt: null };
  save([p, ...loadCustomerPayments()]);
  return p;
}

export const markPaid = (id, now = Date.now()) => save(loadCustomerPayments().map((p) => (p.id === id ? { ...p, status: 'done', paidAt: now } : p)));

// ---- 営業所での絞り込み -------------------------------------------------------------
// officeId が空なら全員。営業所は、営業の担当エリア（areaOf）で分ける
export const officeUsers = (users, officeId, areaOf) => (officeId ? users.filter((u) => areaOf(u.id) === officeId) : users);

// 営業の id を持つ記録（userId）を、営業所の営業だけに絞る。filtering=false なら絞らない
export const onlyOffice = (list, userIds, filtering) => (filtering ? list.filter((x) => userIds.includes(x.userId)) : list);
