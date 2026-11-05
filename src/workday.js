// 始業・終業と経費管理のデータとロジック。鑑定士ごと・日付ごとに「1日の記録」を localStorage に保存する。
// 所持金 ＝ 前日繰越金（始業時に実際に数えた金額）＋ 引き出し金額 − 経費（買取代金・ガソリン代など）
// 補充金 ＝ 経理部が鑑定士に振り込んだ金額（経理部が入力）。引き出し金額 ＝ そのうち、鑑定士が実際に引き出した金額（鑑定士が入力）。通常は一致する
import { USERS } from './dashboard.js';
import { WORKDAY_KEY, DEPOSIT_KEY } from './store.js';

const SEED_CARRYOVER = 50000; // 初回（前日の記録がない場合）の繰越金（ダミー）
const SEED_DEPOSIT = 300000; // 毎日 朝に振り込まれる定例の補充金（ダミー）

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

// 訪問したが、買取の手続きに進めなかった場合の記録。訪問実績には数え、鑑定士の業績（成約率など）には影響させない
export const VISIT_OUTCOMES = [
  { key: 'absent', icon: '🚪', label: '不在', hint: 'インターホンや電話でも応答がなかった' },
  { key: 'resched', icon: '📅', label: '日程変更の依頼', hint: '玄関口で、別の日時での訪問を希望された' },
  { key: 'declined', icon: '🙅', label: 'お客様都合のキャンセル', hint: '玄関口で、売却をやめると言われた' },
  { key: 'other', icon: '📝', label: 'その他', hint: '上記以外（理由をメモに記入）' },
];
export const outcomeOf = (key) => VISIT_OUTCOMES.find((o) => o.key === key) ?? VISIT_OUTCOMES.at(-1);
export const blankOutcomeDraft = () => ({ type: '', memo: '', date: '', time: '' });
export const outcomeReady = (d) => Boolean(d.type && (d.type !== 'other' || d.memo.trim()));

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
  { key: 'receipt', text: '今日の経費の履歴とレシート画像を見直し、間違いがない（すべてレシート付き）' },
  { key: 'goods', text: '買取商品の入庫（倉庫への保管）を済ませた、または未入庫分を引き継いだ' },
  { key: 'contract', text: '契約書・書類を整理し、紛失がない' },
  { key: 'car', text: '車両・タブレットの片付け、充電をした' },
];

// ---- 現金の数え方（終業時） ---------------------------------------------------
export const DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 100, 50, 10, 5, 1].map((value) => ({ value, kind: value >= 1000 ? 'bill' : 'coin', label: value >= 1000 ? `${value.toLocaleString('ja-JP')}円札` : `${value}円玉` }));
const countOf = (n) => (Number.isInteger(Number(n)) && Number(n) > 0 ? Number(n) : 0);
export const cashTotal = (counts) => DENOMINATIONS.reduce((n, d) => n + d.value * countOf(counts?.[d.value]), 0);
// 金額を、大きい紙幣・硬貨から順に枚数へ分ける（デモ用）
export function breakdownOf(amount) {
  let rest = Math.max(0, Math.floor(amount));
  const counts = {};
  for (const d of DENOMINATIONS) { const n = Math.floor(rest / d.value); if (n) { counts[d.value] = n; rest -= n * d.value; } }
  return counts;
}
// 終業時に確認する経費（鑑定士が計上したもの。買取代金の自動計上は、レシートがないので除く）
export const expensesToReview = (day) => (day?.expenses ?? []).filter((e) => !e.auto);

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

// 補充金（経理部の画面から登録）。定例の補充金のダミーは、今日の分だけ常に入っているものとして扱う
export const loadStoredDeposits = () => readJson(DEPOSIT_KEY, []);
export const addDeposit = (d) => localStorage.setItem(DEPOSIT_KEY, JSON.stringify([d, ...loadStoredDeposits()]));

export function depositsOf(userId, date = dateKey()) {
  const stored = loadStoredDeposits().filter((d) => d.userId === userId && dateKey(new Date(d.at)) === date);
  const seed = date === dateKey()
    ? [{ id: `seed-${userId}-${date}`, userId, amount: SEED_DEPOSIT, memo: '定例の補充金', by: '経理部', at: new Date(`${date}T09:00:00`).getTime() }]
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
  return { amount: prev.closedAt ? prev.close.counted : balanceOf(prev), from: prev.date };
}

export const expenseTotal = (day) => sum(day?.expenses ?? []);
export const withdrawalsOf = (day) => day?.withdrawals ?? [];
export const balanceOf = (day) => (day?.start?.counted ?? 0) + sum(withdrawalsOf(day)) - expenseTotal(day);

// 引き出し金額（鑑定士が、補充金のうち実際に引き出した金額を記録する）
export const withdrawalReady = (d) => Number(d?.amount) > 0;
export const addWithdrawal = (day, w) => ({ ...day, withdrawals: [...withdrawalsOf(day), w] });
export const removeWithdrawal = (day, id) => ({ ...day, withdrawals: withdrawalsOf(day).filter((w) => w.id !== id) });

// 画面で使う集計
export function summaryOf(day, userId) {
  const deposits = day?.closedAt ? day.report.deposits : depositsOf(userId, day?.date);
  const expenses = day?.expenses ?? [];
  const byType = EXPENSE_TYPES.concat(PURCHASE_TYPE)
    .map((t) => ({ ...t, amount: sum(expenses.filter((e) => e.type === t.key)), count: expenses.filter((e) => e.type === t.key).length }))
    .filter((t) => t.count);
  const withdrawals = withdrawalsOf(day);
  return {
    opening: day?.start?.counted ?? 0, deposits, depositTotal: sum(deposits), withdrawals, withdrawalTotal: sum(withdrawals),
    undrawn: sum(deposits) - sum(withdrawals), // 補充金のうち、まだ引き出していない金額（マイナスは、補充金を超えて引き出した）
    expenses, expenseTotal: sum(expenses), byType, balance: balanceOf(day),
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
    expenses: [], withdrawals: [], visits: [], closedAt: null, close: null, report: null,
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
  const close = { counted, expected: s.balance, diff, note: form.note.trim(), counts: { ...form.counts }, cashPhoto: form.cashPhoto ?? null, checks: { ...form.checks }, comment: form.comment.trim() };
  return {
    ...day, closedAt: now, close,
    report: {
      deposits: s.deposits, opening: s.opening, depositTotal: s.depositTotal, withdrawalTotal: s.withdrawalTotal, expenseTotal: s.expenseTotal,
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
  return !visiting && form.countedSet && Boolean(form.cashPhoto) && END_CHECKS.every((c) => form.checks[c.key]) && (diff === 0 || form.note.trim() !== '');
};
export const expenseReady = (d) => Boolean(d.type && d.amount > 0 && d.photo && (d.type !== 'other' || d.memo.trim()));

export const blankStartForm = () => ({ counted: 0, countedSet: false, note: '', checks: {} });
// counts: 紙幣・硬貨ごとの枚数（counted は、その合計）。cashPhoto: 数えた現金の写真（必須）
export const blankCloseForm = () => ({ counted: 0, countedSet: false, counts: {}, cashPhoto: null, note: '', checks: {}, comment: '' });
export const blankExpenseDraft = () => ({ type: '', amount: 0, memo: '', photo: null, invoice: false, ai: null }); // invoice: インボイス対応（適格請求書）のレシートか。ai: レシートのAI読み取りの状態

// 本社画面の一覧用: 全鑑定士の「今日」の状況
export const todayRows = () => USERS.map((u) => {
  const day = loadDay(u.id);
  return { user: u, day, phase: phaseOf(day), summary: day?.startedAt ? summaryOf(day, u.id) : null };
});

// OCRの読取後の「インボイス対応」。登録番号が読めたらチェックする。読めなくても人のチェックは外さない（再読取は読取結果に合わせる）
export const invoiceAfterRead = (current, sample, overwrite) => (sample.invoiceNo ? true : overwrite ? false : current);
