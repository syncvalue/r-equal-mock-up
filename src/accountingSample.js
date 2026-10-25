// 経理部画面の見本データ。営業の始業・経費・日報、営業への入金、お客様への入金を、今日を基準に作る。
import { WORKDAY_KEY, DEPOSIT_KEY, CUSTOMER_PAY_KEY } from './store.js';
import { USERS } from './dashboard.js';
import { dateKey, loadDays } from './workday.js';
import { dummyPhoto } from './image.js';

export const SAMPLE_SEEDED_KEY = 'rq-mock-accounting-sample'; // 初期化で消えない目印（初期化後に、自動で復活させない）

const at = (now, date, h, m = 0) => new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime() || now;
const ex = (now, date, i, h, type, amount, memo, photo = true) => ({ id: `SX-${date}-${i}`, at: at(now, date, h), type, amount, memo, photo: photo ? dummyPhoto(memo.slice(0, 8) || 'receipt') : null });
const buy = (now, date, i, h, amount, name, n) => ({ ...ex(now, date, i, h, 'purchase', amount, `${name} 様 買取代金（${n}点）`, false), auto: true, visitId: `SV-${date}-${i}` });

// 1日の記録。balance（帳簿残高）は、未終業なら始業時の金額＋入金−経費、終業済みなら counted が実際に数えた金額
function day(userId, date, now, { start, expected = start, startNote = '', expenses, close, deposits = [], visits = 0 }) {
  const startedAt = at(now, date, 9, 30);
  const expenseTotal = expenses.reduce((n, e) => n + e.amount, 0);
  const depositTotal = deposits.reduce((n, d) => n + d.amount, 0);
  const base = {
    userId, date, startedAt, start: { expected, counted: start, diff: start - expected, note: startNote, checks: {} },
    expenses, visits: [], closedAt: null, close: null, report: null,
  };
  if (!close) return base;
  const balance = start + depositTotal - expenseTotal;
  const purchases = expenses.filter((e) => e.type === 'purchase');
  return {
    ...base, closedAt: at(now, date, 18, 20),
    close: { counted: close.counted ?? balance, expected: balance, diff: (close.counted ?? balance) - balance, note: close.note ?? '', checks: {}, comment: close.comment ?? '' },
    report: {
      deposits, opening: start, depositTotal, expenseTotal, byType: [], visitCount: visits || purchases.length,
      purchaseTotal: purchases.reduce((n, e) => n + e.amount, 0), itemCount: purchases.length * 3,
    },
  };
}

export function buildSample(now = Date.now()) {
  const today = dateKey(new Date(now));
  const ago = (n) => dateKey(new Date(now - n * 86400000));
  const list = [
    // ---- 今日 ----
    day('u01', today, now, { start: 50000, expenses: [ex(now, today, 1, 11, 'gas', 3800, 'ガソリン代 ENEOS'), buy(now, today, 2, 13, 86000, '山田 花子', 4)] }), // 問題なし
    day('u02', today, now, { start: 49000, expected: 50000, startNote: '財布に入れた千円札を1枚、前日に自宅へ持ち帰ってしまった', expenses: [ex(now, today, 1, 12, 'lunch', 980, '昼食')] }), // 始業時の差異
    day('u03', today, now, { start: 50000, expenses: [ex(now, today, 1, 10, 'supply', 15800, '梱包材（プチプチ・ダンボール）'), buy(now, today, 2, 14, 120000, '佐藤 一雄', 6)], close: { counted: 213000, note: '釣り銭の渡し間違いかもしれない', comment: '明日は梱包材を持参する' }, deposits: [{ id: 'seed-u03', userId: 'u03', amount: 300000, memo: '定例入金', by: '経理部', at: at(now, today, 9) }] }), // 終業済み・過不足・高額
    day('u04', today, now, { start: 50000, expenses: [ex(now, today, 1, 12, 'toll', 1200, '駐車場')] }), // 所持金が多い（下の追加入金）
    day('u05', today, now, { start: 50000, expenses: [ex(now, today, 1, 11, 'other', 3300, '手土産（お客様宅）', false), ex(now, today, 2, 15, 'gas', 4100, 'ガソリン代', false)] }), // その他・レシートなし
    day('u06', today, now, { start: 50000, expenses: [ex(now, today, 1, 11, 'transit', 560, '電車（客先まで）'), buy(now, today, 2, 15, 64000, '田村 恵子', 3)], close: { comment: 'お客様の反応が良かった' }, deposits: [{ id: 'seed-u06', userId: 'u06', amount: 300000, memo: '定例入金', by: '経理部', at: at(now, today, 9) }] }), // 終業済み・一致
    day('u07', today, now, { start: 50000, expenses: [buy(now, today, 1, 11, 230000, '中村 正', 8), buy(now, today, 2, 15, 190000, '小林 由美', 5)] }), // 帳簿残高がマイナス
  ];
  // ---- 過去（今月の集計用） ----
  const past = [
    [1, 'u01', [['gas', 4200, 'ガソリン代'], ['lunch', 850, '昼食']]], [1, 'u02', [['gas', 3600, 'ガソリン代']]], [1, 'u06', [['supply', 2400, '名刺・文具'], ['lunch', 1100, '昼食']]],
    [2, 'u01', [['toll', 2800, '高速代'], ['gas', 4500, 'ガソリン代']]], [2, 'u03', [['gas', 3900, 'ガソリン代'], ['lunch', 900, '昼食']]], [2, 'u05', [['transit', 1200, '電車']]],
    [3, 'u02', [['gas', 4000, 'ガソリン代'], ['supply', 5200, '手袋・マスク']]], [3, 'u04', [['lunch', 1000, '昼食'], ['toll', 1500, '駐車場']]], [3, 'u07', [['gas', 4400, 'ガソリン代']]],
  ].map(([n, userId, items]) => day(userId, ago(n), now, { start: 50000, expenses: items.map(([t, a, m], i) => ex(now, ago(n), i + 1, 11 + i, t, a, m)), close: {} }));
  const days = Object.fromEntries([...list, ...past].map((d) => [`${d.userId}:${d.date}`, d]));
  const deposits = [{ id: 'SD-1', userId: 'u04', amount: 300000, memo: '買取資金の追加（高額案件の予定あり）', by: '経理部', at: at(now, today, 10, 15) }];
  const payments = [
    { id: 'SP-1', customerName: '山田 花子', amount: 120000, reason: 'highvalue', userId: 'u01', memo: '○○銀行 梅田支店 普通 1234567', status: 'pending', at: at(now, today, 13, 40), paidAt: null },
    { id: 'SP-2', customerName: '中村 正', amount: 40000, reason: 'shortage', userId: 'u07', memo: '△△銀行 三宮支店 普通 7654321（現金が不足した分）', status: 'pending', at: at(now, today, 15, 10), paidAt: null },
    { id: 'SP-3', customerName: '井上 和夫', amount: 95000, reason: 'highvalue', userId: 'u03', memo: '□□銀行 難波支店 普通 1112223', status: 'done', at: at(now, ago(1), 16), paidAt: at(now, ago(1), 17, 30) },
  ];
  return { days, deposits, payments };
}

// 見本を保存する。force でないときは、まだ入れたことがなく、記録が空のときだけ入れる。入れたら true
export function seedSample(now = Date.now(), force = false) {
  try {
    if (!force && (localStorage.getItem(SAMPLE_SEEDED_KEY) || Object.keys(loadDays()).length)) return false;
    const { days, deposits, payments } = buildSample(now);
    localStorage.setItem(WORKDAY_KEY, JSON.stringify(days));
    localStorage.setItem(DEPOSIT_KEY, JSON.stringify(deposits));
    localStorage.setItem(CUSTOMER_PAY_KEY, JSON.stringify(payments));
    localStorage.setItem(SAMPLE_SEEDED_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
