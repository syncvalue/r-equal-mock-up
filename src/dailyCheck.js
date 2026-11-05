// 経費精算（営業サポートの一次チェック）: 日ごと・鑑定士ごとに、前日までに提出された経費・お客様への支払・現金（前日繰越金と終業時の所持金）の
// 入力漏れ・入力ミスを確認し、「チェック済み」か「差戻し」にする。買取代金は、お客様への支払として確認する（経費とは分けて表示）。
import { DAILY_CHECK_KEY, ITEM_CHECK_KEY } from './store.js';
import { PURCHASE_TYPE, balanceOf, dateKey, summaryOf, typeOf } from './workday.js';
import { HIGH_EXPENSE, flagsOf } from './accounting.js';

export const CHECK_STATUS = {
  pending: { label: '未チェック', cls: 'bg-amber-100 text-amber-800' },
  ok: { label: 'チェック済み', cls: 'bg-emerald-100 text-emerald-800' },
  returned: { label: '差戻し', cls: 'bg-rose-100 text-rose-700' },
};

const yen = (n) => `¥${Number(n).toLocaleString('ja-JP')}`;
const signed = (n) => `${n > 0 ? '+' : '−'}${yen(Math.abs(n))}`;
const isPurchase = (e) => e.type === PURCHASE_TYPE.key;
const sum = (list) => list.reduce((n, x) => n + x.amount, 0);

// ---- 保存（日ごと・鑑定士ごとのチェック結果。キーは「鑑定士ID:日付」） ---------------------------------
const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
export const checkKey = (userId, date) => `${userId}:${date}`;
export const loadChecks = () => readJson(DAILY_CHECK_KEY, {});
export const saveChecks = (c) => { try { localStorage.setItem(DAILY_CHECK_KEY, JSON.stringify(c)); return true; } catch { return false; } };

// 1件ずつの確認（経費・お客様への支払・終業時の現金）。キーは、経費・買取代金のID、または現金の確認のID（cashItemId）
export const loadItemChecks = () => readJson(ITEM_CHECK_KEY, {});
export const saveItemChecks = (c) => { try { localStorage.setItem(ITEM_CHECK_KEY, JSON.stringify(c)); return true; } catch { return false; } };
export const cashItemId = (userId, date) => `cash:${userId}:${date}`;
export const toggleItem = (items, id, { by = '営業サポート', now = Date.now() } = {}) => (items[id]
  ? Object.fromEntries(Object.entries(items).filter(([k]) => k !== id))
  : { ...items, [id]: { by, at: now } });
// その鑑定士のその日の確認を、まとめて「確認した」にする（一括でチェック済みにするとき）
export const markAllItems = (items, row, { by = '営業サポート', now = Date.now() } = {}) => {
  const ids = [...row.expenses, ...row.purchases].map((e) => e.id).concat(row.cash.required ? [row.cash.id] : []);
  return { ...items, ...Object.fromEntries(ids.filter((id) => !items[id]).map((id) => [id, { by, at: now }])) };
};

// ---- 確認のポイント ---------------------------------------------------------------------------------
// 経費1件の確認のポイント。blocks は「鑑定士に直してもらわないと、チェック済みにできない」もの
export function claimFlags(e) {
  const flags = [];
  if (!e.photo && !e.proxy) flags.push({ level: 'danger', blocks: true, text: '領収書の写真がない' });
  if (e.amount >= HIGH_EXPENSE) flags.push({ level: 'warn', text: '高額（1万円以上）' });
  if (e.type === 'other') flags.push({ level: 'info', text: '用途が「その他」' });
  if (!e.memo?.trim()) flags.push({ level: 'warn', text: '内容の記入がない' });
  return flags;
}

// ---- 現金の照合 -------------------------------------------------------------------------------------
// 始業時に数えた金額 ＋ 引き出し金額 − 経費 − お客様への支払（買取代金） ＝ 帳簿上の所持金。終業時に数えた金額との差が過不足
export function reconcile(day) {
  const expenses = day.expenses ?? [];
  const closed = Boolean(day.closedAt);
  return {
    carryover: day.start?.expected ?? 0, startCounted: day.start?.counted ?? 0, startDiff: day.start?.diff ?? 0,
    withdrawn: sum(day.withdrawals ?? []), expenses: sum(expenses.filter((e) => !isPurchase(e))), customerPaid: sum(expenses.filter(isPurchase)),
    book: balanceOf(day), closeCounted: closed ? day.close?.counted ?? 0 : null, closeDiff: closed ? day.close?.diff ?? 0 : null,
  };
}

// 前日繰越金の元になる、前日の記録の終業時の金額（未終業なら帳簿残高）。前日の記録がなければ null
export function prevAmount(days, userId, date) {
  const prev = days.filter((d) => d.userId === userId && d.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!prev) return null;
  return prev.closedAt ? prev.close.counted : balanceOf(prev);
}

// 1日ぶんの確認のポイント（現金の確認事項は accounting.js の flagsOf を使い、入力漏れを足す）
export function dayFlags(day, { prev = null, summary = summaryOf(day, day.userId) } = {}) {
  const flags = [...flagsOf(day, summary)];
  if (!day.closedAt) flags.push({ level: 'danger', blocks: true, text: '終業・日報が未提出（終業時の所持金が確認できない）' });
  else if (!day.close?.cashPhoto) flags.push({ level: 'danger', blocks: true, text: '数えた現金の写真がない' });
  if (prev !== null && day.start && prev !== day.start.expected) flags.push({ level: 'warn', text: `前日繰越金 ${yen(day.start.expected)} が、前日の終業時の所持金 ${yen(prev)} と一致しない` });
  return flags;
}

// ---- 一覧 ---------------------------------------------------------------------------------------------
// 対象日に始業した鑑定士ごとの行。issues は、1日ぶんの指摘と経費ごとの指摘をまとめたもの（経費の指摘には、どの経費かを添える）
export function checkRows(days, date, checks, items = {}) {
  return days.filter((d) => d.date === date && d.startedAt).map((d) => {
    const all = d.expenses ?? [];
    const expenses = all.filter((e) => !isPurchase(e)).map((e) => ({ ...e, flags: claimFlags(e), checked: items[e.id] ?? null }));
    const purchases = all.filter(isPurchase).map((e) => ({ ...e, checked: items[e.id] ?? null }));
    const cashId = cashItemId(d.userId, d.date);
    const cash = { id: cashId, required: Boolean(d.closedAt && d.close?.cashPhoto), checked: items[cashId] ?? null }; // 数えた現金の写真と金額が一致していることの確認
    const targets = [...expenses, ...purchases, ...(cash.required ? [cash] : [])];
    const progress = { done: targets.filter((t) => t.checked).length, total: targets.length };
    const review = checks[checkKey(d.userId, d.date)] ?? null;
    const issues = [
      ...dayFlags(d, { prev: prevAmount(days, d.userId, d.date) }),
      ...expenses.flatMap((e) => e.flags.map((f) => ({ ...f, text: `${typeOf(e.type).label} ${yen(e.amount)}：${f.text}` }))),
    ];
    return {
      userId: d.userId, date: d.date, day: d, rec: reconcile(d), expenses, purchases, cash, progress, allChecked: progress.done === progress.total,
      issues, canCheck: !issues.some((i) => i.blocks), canOk: !issues.some((i) => i.blocks) && progress.done === progress.total, status: review?.status ?? 'pending', review,
    };
  }).sort((a, b) => a.userId.localeCompare(b.userId));
}

export const checkCounts = (rows) => ({
  total: rows.length,
  pending: rows.filter((r) => r.status === 'pending').length,
  ok: rows.filter((r) => r.status === 'ok').length,
  returned: rows.filter((r) => r.status === 'returned').length,
  withIssues: rows.filter((r) => r.status === 'pending' && r.issues.length).length,
});

// 一括でチェック済みにしてよいもの: 未チェックで、指摘が1つもない鑑定士
export const bulkTargets = (rows) => rows.filter((r) => r.status === 'pending' && !r.issues.length);

// ---- 操作（いずれも新しいチェック結果を返す） -----------------------------------------------------------
const stamp = (status, reason, by, now) => ({ status, reason, by, at: now, date: dateKey(new Date(now)) });
export const markOk = (checks, userId, date, { by = '営業サポート', now = Date.now() } = {}) => ({ ...checks, [checkKey(userId, date)]: stamp('ok', '', by, now) });
// 差戻しは理由必須（空なら変えない）
export function markReturned(checks, userId, date, reason, { by = '営業サポート', now = Date.now() } = {}) {
  if (!reason?.trim()) return checks;
  return { ...checks, [checkKey(userId, date)]: stamp('returned', reason.trim(), by, now) };
}
export const reopen = (checks, userId, date) => Object.fromEntries(Object.entries(checks).filter(([k]) => k !== checkKey(userId, date)));

export { signed };

// 日付を n 日ずらす（'2026-11-04', -1 → '2026-11-03'）
export const shiftDate = (date, n) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};

// ---- カレンダー ------------------------------------------------------------------------------------------
// 月（'2026-11'）の日付を、日曜始まりの週ごとに並べる。月の前後の空きは null
export function monthGrid(month) {
  const first = new Date(`${month}-01T12:00:00`);
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

// 日ごとの印: total＝提出された鑑定士、pending＝未チェック、urgent＝未チェックのうち、赤の指摘（danger）がある鑑定士
export function dayBadges(days, checks, items = {}) {
  const dates = [...new Set(days.filter((d) => d.startedAt).map((d) => d.date))];
  return Object.fromEntries(dates.map((date) => {
    const rows = checkRows(days, date, checks, items);
    const pending = rows.filter((r) => r.status === 'pending');
    return [date, { total: rows.length, pending: pending.length, urgent: pending.filter((r) => r.issues.some((i) => i.level === 'danger')).length }];
  }));
}
