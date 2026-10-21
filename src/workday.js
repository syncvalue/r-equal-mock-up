// 始業・終業と経費管理のデータとロジック。営業ごと・日付ごとに「1日の記録」を localStorage に保存する。
// 所持金 ＝ 前日繰越（始業時に実際に数えた金額）＋ 本社からの入金 − 経費（買取代金・ガソリン代など）
import { USERS } from './dashboard.js';
import { WORKDAY_KEY, DEPOSIT_KEY } from './store.js';

const SEED_CARRYOVER = 50000; // 初回（前日の記録がない場合）の繰越金（ダミー）
const SEED_DEPOSIT = 300000; // 毎日 朝に入る定例入金（ダミー）

export const EXPENSE_TYPES = [
  { key: 'gas', icon: '⛽', label: 'ガソリン代' },
  { key: 'lunch', icon: '🍱', label: '昼食代' },
  { key: 'supply', icon: '🛒', label: '備品購入' },
  { key: 'toll', icon: '🅿️', label: '高速・駐車場' },
  { key: 'transit', icon: '🚃', label: '交通費' },
  { key: 'other', icon: '📝', label: 'その他' },
];
export const PURCHASE_TYPE = { key: 'purchase', icon: '💰', label: '買取代金' };
export const typeOf = (key) => [...EXPENSE_TYPES, PURCHASE_TYPE].find((t) => t.key === key) ?? EXPENSE_TYPES.at(-1);

// 始業時の点検項目（記録に残る）
export const START_CHECKS = [
  { key: 'alcohol', icon: '🍺', text: '飲酒していない（前日の酒気が残っていない）' },
  { key: 'health', icon: '🌡️', text: '体調は良好で、業務に支障がない' },
  { key: 'appearance', icon: '👔', text: '身だしなみ（服装・髪型・清潔感）を整えた' },
  { key: 'idcard', icon: '🪪', text: '社員証・名刺を携帯している' },
  { key: 'car', icon: '🚗', text: '車両の点検（燃料・外観・運転免許証）をした' },
  { key: 'tablet', icon: '📱', text: 'タブレットの充電・通信状況を確認した' },
  { key: 'supplies', icon: '📦', text: '買取用資材（シール・契約書・梱包材）が揃っている' },
  { key: 'compliance', icon: '📢', text: '本社からのお知らせ・注意事項を確認した' },
];

// 終業時の点検項目
export const END_CHECKS = [
  { key: 'receipt', text: '今日の経費は、すべてレシート付きで計上した' },
  { key: 'goods', text: '買取商品の入庫（倉庫への保管）を済ませた、または未入庫分を引き継いだ' },
  { key: 'contract', text: '契約書・書類を整理し、紛失がない' },
  { key: 'car', text: '車両・タブレットの片付け、充電をした' },
];

// ---- 日付・金額 -------------------------------------------------------------
const p2 = (n) => String(n).padStart(2, '0');
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const dayKey = (userId, date) => `${userId}:${date}`;
const sum = (list) => list.reduce((n, x) => n + x.amount, 0);

// ---- 保存 -------------------------------------------------------------------
const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

export const loadDays = () => readJson(WORKDAY_KEY, {});
export const loadDay = (userId, date = dateKey()) => loadDays()[dayKey(userId, date)] ?? null;

// 保存に失敗（容量超過など）したら false。レシート写真が重いと起こりうる
export function saveDay(record) {
  try {
    localStorage.setItem(WORKDAY_KEY, JSON.stringify({ ...loadDays(), [dayKey(record.userId, record.date)]: record }));
    return true;
  } catch {
    return false;
  }
}

// 本社からの入金（本社画面から登録）。定例入金のダミーは、今日の分だけ常に入っているものとして扱う
export const loadStoredDeposits = () => readJson(DEPOSIT_KEY, []);
export const addDeposit = (d) => localStorage.setItem(DEPOSIT_KEY, JSON.stringify([d, ...loadStoredDeposits()]));

export function depositsOf(userId, date = dateKey()) {
  const stored = loadStoredDeposits().filter((d) => d.userId === userId && dateKey(new Date(d.at)) === date);
  const seed = date === dateKey()
    ? [{ id: `seed-${userId}-${date}`, userId, amount: SEED_DEPOSIT, memo: '定例入金', by: '本社 経理部', at: new Date(`${date}T09:00:00`).getTime() }]
    : [];
  return [...seed, ...stored].sort((a, b) => a.at - b.at);
}

// ---- 繰越・残高 -------------------------------------------------------------
// 繰越金 ＝ 直近の過去の記録の、最終的な所持金（終業済みなら実際に数えた額、未終業なら帳簿残高）
export function carryoverFor(userId, date = dateKey()) {
  const prev = Object.values(loadDays())
    .filter((r) => r.userId === userId && r.date < date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!prev) return { amount: SEED_CARRYOVER, from: null };
  return { amount: prev.closedAt ? prev.close.counted : balanceOf(prev, depositsOf(userId, prev.date)), from: prev.date };
}

export const expenseTotal = (day) => sum(day?.expenses ?? []);
export const balanceOf = (day, deposits) => (day?.start?.counted ?? 0) + sum(deposits) - expenseTotal(day);

// 画面で使う集計
export function summaryOf(day, userId) {
  const deposits = day?.closedAt ? day.report.deposits : depositsOf(userId, day?.date);
  const expenses = day?.expenses ?? [];
  const byType = EXPENSE_TYPES.concat(PURCHASE_TYPE)
    .map((t) => ({ ...t, amount: sum(expenses.filter((e) => e.type === t.key)), count: expenses.filter((e) => e.type === t.key).length }))
    .filter((t) => t.count);
  return {
    opening: day?.start?.counted ?? 0, deposits, depositTotal: sum(deposits),
    expenses, expenseTotal: sum(expenses), byType, balance: balanceOf(day, deposits),
  };
}

export const newId = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

// ---- 状態遷移（いずれも新しい記録を返す） ---------------------------------------
export const phaseOf = (day) => (!day?.startedAt ? 'before' : day.closedAt ? 'closed' : 'open');

export function startDay(userId, form, now = Date.now()) {
  const carry = carryoverFor(userId);
  return {
    userId, date: dateKey(new Date(now)), startedAt: now,
    start: { expected: carry.amount, counted: form.counted, diff: form.counted - carry.amount, note: form.note.trim(), checks: { ...form.checks } },
    expenses: [], visits: [], closedAt: null, close: null, report: null,
  };
}

export const addExpense = (day, e) => ({ ...day, expenses: [...day.expenses, e] });
export const removeExpense = (day, id) => ({ ...day, expenses: day.expenses.filter((e) => e.id !== id) });

// 訪問の完了を記録し、買取代金を経費として自動計上する（同じ訪問は二重に計上しない）
export function recordVisit(day, visit, now = Date.now()) {
  if (day.visits.some((v) => v.visitId === visit.visitId)) return day;
  const withVisit = { ...day, visits: [...day.visits, { ...visit, at: now }] };
  if (!(visit.total > 0)) return withVisit;
  return addExpense(withVisit, {
    id: newId('EX'), at: now, type: PURCHASE_TYPE.key, amount: visit.total, memo: `${visit.customerName} 様 買取代金（${visit.itemCount}点）`,
    photo: null, auto: true, visitId: visit.visitId,
  });
}

export const closeDiff = (day, userId, counted) => counted - summaryOf(day, userId).balance;

export function closeDay(day, userId, form, now = Date.now()) {
  const s = summaryOf(day, userId);
  const counted = form.counted;
  const diff = counted - s.balance;
  const close = { counted, expected: s.balance, diff, note: form.note.trim(), checks: { ...form.checks }, comment: form.comment.trim() };
  return {
    ...day, closedAt: now, close,
    report: {
      deposits: s.deposits, opening: s.opening, depositTotal: s.depositTotal, expenseTotal: s.expenseTotal,
      byType: s.byType.map(({ key, label, amount, count }) => ({ key, label, amount, count })),
      visitCount: day.visits.length, purchaseTotal: day.visits.reduce((n, v) => n + v.total, 0), itemCount: day.visits.reduce((n, v) => n + v.itemCount, 0),
    },
  };
}

// ---- 入力チェック -------------------------------------------------------------
export const startReady = (form, userId) => {
  const diff = form.counted - carryoverFor(userId).amount;
  return form.countedSet && START_CHECKS.every((c) => form.checks[c.key]) && (diff === 0 || form.note.trim() !== '');
};
export const closeReady = (form, day, userId, visiting) => {
  const diff = closeDiff(day, userId, form.counted);
  return !visiting && form.countedSet && END_CHECKS.every((c) => form.checks[c.key]) && (diff === 0 || form.note.trim() !== '');
};
export const expenseReady = (d) => Boolean(d.type && d.amount > 0 && d.photo && (d.type !== 'other' || d.memo.trim()));

export const blankStartForm = () => ({ counted: 0, countedSet: false, note: '', checks: {} });
export const blankCloseForm = () => ({ counted: 0, countedSet: false, note: '', checks: {}, comment: '' });
export const blankExpenseDraft = () => ({ type: '', amount: 0, memo: '', photo: null });

// 本社画面の一覧用: 全営業の「今日」の状況
export const todayRows = () => USERS.map((u) => {
  const day = loadDay(u.id);
  return { user: u, day, phase: phaseOf(day), summary: day?.startedAt ? summaryOf(day, u.id) : null };
});
