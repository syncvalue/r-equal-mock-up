// 経理部のロジック。鑑定士の立替金（所持金）の確認事項、鑑定士への立替金、お客様への支払、営業所での絞り込み。
import { CUSTOMER_PAY_KEY } from './store.js';
import { addDeposit, newId, dateKey } from './workday.js';
import { loadLedger, saveLedger, makeEntry, addEntry } from './ledger.js';

export const HIGH_EXPENSE = 10000; // 買取代金以外の経費で「高額」とみなす1件の金額
export const CASH_LIMIT = 500000; // 鑑定士が持つ現金が「多い」とみなす金額

const yen = (n) => `¥${Number(n).toLocaleString('ja-JP')}`;
const signed = (n) => `${n > 0 ? '+' : '−'}${yen(Math.abs(n))}`;

// 鑑定士の1日の現金の確認事項（始業時の差異・終業時の過不足・マイナス・多すぎ）。経費の確認は経費精算（expenseReview.js）
export function flagsOf(day, summary) {
  if (!day?.startedAt) return [];
  const flags = [];
  const { start, close } = day;
  if (start?.diff) flags.push({ level: 'warn', text: `始業時に前日の繰越金と差異 ${signed(start.diff)}（理由: ${start.note || '未記入'}）` });
  if (day.closedAt && close?.diff) flags.push({ level: 'danger', text: `終業時の過不足 ${signed(close.diff)}（理由: ${close.note || '未記入'}）` });
  if (summary.balance < 0) flags.push({ level: 'danger', text: `立替金の残高がマイナス（${signed(summary.balance)}）` });
  else if (summary.balance > CASH_LIMIT) flags.push({ level: 'warn', text: `所持金が多い（${yen(summary.balance)}）` });
  return flags;
}

// ---- 鑑定士への立替金（買取資金を渡す）: 鑑定士の所持金に入り、帳簿にも支払として残る --------------
export const advanceReady = (d) => Boolean(d.userId && d.amount > 0);
export function giveAdvance(d, { by = '経理部', now = Date.now() } = {}) {
  const memo = (d.memo ?? '').trim();
  addDeposit({ id: newId('DP'), userId: d.userId, amount: d.amount, memo, by, at: now });
  return saveLedger(addEntry(loadLedger(), makeEntry({ category: 'advance', amount: d.amount, memo, userId: d.userId }, { by, now })));
}

// ---- お客様への支払（銀行振込） ----------------------------------------------------
export const PAY_REASONS = [
  { key: 'shortage', label: '鑑定士の現金が足りなかった', hint: '不足分を、後日 銀行振込でお支払いする' },
  { key: 'highvalue', label: '高額のため、後日 銀行振込', hint: '現金での持ち歩き・受け渡しを避ける' },
  { key: 'other', label: 'その他', hint: '理由をメモに記入' },
];
export const reasonOf = (key) => PAY_REASONS.find((r) => r.key === key) ?? PAY_REASONS.at(-1);
export const paymentReady = (d) => Boolean(d.customerName.trim() && d.amount > 0 && d.reason && (d.reason !== 'other' || d.memo?.trim()));

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
export const loadCustomerPayments = () => readJson(CUSTOMER_PAY_KEY, []);
const save = (list) => localStorage.setItem(CUSTOMER_PAY_KEY, JSON.stringify(list));

export function addCustomerPayment(d, now = Date.now()) {
  const p = { id: newId('CP'), customerName: d.customerName.trim(), amount: d.amount, reason: d.reason, userId: d.userId || '', memo: (d.memo ?? '').trim(), status: 'pending', at: now, paidAt: null };
  save([p, ...loadCustomerPayments()]);
  return p;
}

// 振込済みにする。帳簿に「お客様への支払」を記録する（すでに済みなら何もしない）
export function markPaid(id, now = Date.now()) {
  const list = loadCustomerPayments();
  const p = list.find((x) => x.id === id);
  if (!p || p.status === 'done') return false;
  save(list.map((x) => (x.id === id ? { ...x, status: 'done', paidAt: now } : x)));
  const memo = `${p.customerName} 様 ${reasonOf(p.reason).label}`;
  return saveLedger(addEntry(loadLedger(), makeEntry({ category: 'customer', amount: p.amount, memo, userId: p.userId, date: dateKey(new Date(now)) }, { now })));
}

// ---- 営業所での絞り込み -------------------------------------------------------------
// officeId が空なら全員。営業所は、鑑定士の担当エリア（areaOf）で分ける
export const officeUsers = (users, officeId, areaOf) => (officeId ? users.filter((u) => areaOf(u.id) === officeId) : users);
// 鑑定士の id を持つ記録（userId）を、営業所の鑑定士だけに絞る。filtering=false なら絞らない
export const onlyOffice = (list, userIds, filtering) => (filtering ? list.filter((x) => userIds.includes(x.userId)) : list);
