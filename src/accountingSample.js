// 経理部画面の見本データ。鑑定士の始業・経費・日報、鑑定士への補充金、お客様への支払、入出金の帳簿（約4週間）、
// 鑑定士の小口金、経費精算（一次チェック）の結果を、今日を基準に作る。
import { WORKDAY_KEY, DEPOSIT_KEY, CUSTOMER_PAY_KEY, LEDGER_KEY, PETTY_KEY, DAILY_CHECK_KEY } from './store.js';
import { makeEntry } from './ledger.js';
import { USERS } from './dashboard.js';
import { dateKey, loadDays } from './workday.js';
import { dummyPhoto } from './image.js';

export const SAMPLE_SEEDED_KEY = 'rq-mock-accounting-sample'; // 初期化で消えない目印（初期化後に、自動で復活させない）

const at = (now, date, h, m = 0) => new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime() || now;
const ex = (now, date, i, h, type, amount, memo, photo = true) => ({ id: `SX-${date}-${i}`, at: at(now, date, h), type, amount, memo, photo: photo ? dummyPhoto(memo.slice(0, 8) || 'receipt') : null });
const buy = (now, date, i, h, amount, name, n) => ({ ...ex(now, date, i, h, 'purchase', amount, `${name} 様 買取代金（${n}点）`, false), auto: true, visitId: `SV-${date}-${i}` });

// 1日の記録。balance（帳簿残高）は、未終業なら始業時の金額＋引き出し金額−経費、終業済みなら counted が実際に数えた金額
function day(userId, date, now, { start, expected = start, startNote = '', expenses, close, deposits = [], visits = 0, drawn: drawnTotal }) {
  // 引き出し金額（鑑定士の入力）。補充金と一致させる。今日の未終業の日は、定例の補充金（30万円）も引き出し済み
  const drawn = [...(close ? [] : [{ amount: 300000, memo: '定例の補充金' }]), ...deposits.map((d) => ({ amount: d.amount, memo: d.memo }))];
  const withdrawals = (drawnTotal === undefined ? drawn : [{ amount: drawnTotal, memo: '補充金の引き出し' }]).map((w, i) => ({ id: `SW-${date}-${userId}-${i}`, at: at(now, date, 10), amount: w.amount, memo: w.memo }));
  const startedAt = at(now, date, 9, 30);
  expenses = expenses.map((e) => ({ ...e, id: `${e.id}-${userId}` })); // 鑑定士ごとに、経費のIDを分ける
  const expenseTotal = expenses.reduce((n, e) => n + e.amount, 0);
  const depositTotal = deposits.reduce((n, d) => n + d.amount, 0);
  const withdrawalTotal = withdrawals.reduce((n, w) => n + w.amount, 0);
  const base = {
    userId, date, startedAt, start: { expected, counted: start, diff: start - expected, note: startNote, checks: {} },
    expenses, withdrawals, visits: [], closedAt: null, close: null, report: null,
  };
  if (!close) return base;
  const balance = start + withdrawalTotal - expenseTotal;
  const purchases = expenses.filter((e) => e.type === 'purchase');
  return {
    ...base, closedAt: at(now, date, 18, 20),
    close: { counted: close.counted ?? balance, expected: balance, diff: (close.counted ?? balance) - balance, note: close.note ?? '', checks: {}, comment: close.comment ?? '', cashPhoto: close.noPhoto ? null : dummyPhoto('cash') },
    report: {
      deposits, opening: start, depositTotal, withdrawalTotal, expenseTotal, byType: [], visitCount: visits || purchases.length,
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
    day('u02', today, now, { start: 48000, expected: 49000, startNote: '財布に入れた千円札を1枚、前日に自宅へ持ち帰ってしまった', expenses: [ex(now, today, 1, 12, 'lunch', 980, '昼食')] }), // 始業時の差異
    day('u03', today, now, { start: 47000, expenses: [ex(now, today, 1, 10, 'supply', 15800, '梱包材（プチプチ・ダンボール）'), buy(now, today, 2, 14, 120000, '佐藤 一雄', 6)], close: { counted: 213000, note: '釣り銭の渡し間違いかもしれない', comment: '明日は梱包材を持参する' }, deposits: [{ id: 'seed-u03', userId: 'u03', amount: 300000, memo: '定例入金', by: '経理部', at: at(now, today, 9) }] }), // 終業済み・過不足・高額
    day('u04', today, now, { start: 161200, expenses: [ex(now, today, 1, 12, 'toll', 1200, '駐車場')] }), // 所持金が多い（下の追加入金）
    day('u05', today, now, { start: 50000, expenses: [ex(now, today, 1, 11, 'other', 3300, '手土産（お客様宅）', false), ex(now, today, 2, 15, 'gas', 4100, 'ガソリン代', false)] }), // その他・レシートなし
    day('u06', today, now, { start: 50000, expenses: [ex(now, today, 1, 11, 'transit', 560, '電車（客先まで）'), buy(now, today, 2, 15, 64000, '田村 恵子', 3)], close: { comment: 'お客様の反応が良かった' }, deposits: [{ id: 'seed-u06', userId: 'u06', amount: 300000, memo: '定例入金', by: '経理部', at: at(now, today, 9) }] }), // 終業済み・一致
    day('u07', today, now, { start: 50000, expenses: [buy(now, today, 1, 11, 230000, '中村 正', 8), buy(now, today, 2, 15, 190000, '小林 由美', 5)] }), // 帳簿残高がマイナス
  ];
  // ---- 過去（経費精算の一次チェックの見本）。前日繰越金が続くように、補充金の引き出しは、その日の支出（経費＋買取代金）と同じ額にする ----
  const spent = (items) => items.reduce((n, e) => n + e.amount, 0);
  const closedDay = (userId, n, items, opts = {}) => {
    const date = ago(n);
    const expenses = items.map((e, i) => (typeof e[0] === 'number' ? buy(now, date, i + 1, 11 + i, e[0], e[1], e[2]) : ex(now, date, i + 1, 11 + i, e[0], e[1], e[2], e[3] !== false)));
    const total = spent(expenses);
    return day(userId, date, now, { start: 50000, expenses, close: {}, deposits: [{ id: `sd-${userId}-${n}`, userId, amount: total, memo: '買取資金', by: '経理部', at: at(now, date, 9) }], ...opts });
  };
  const yesterday = [
    // 1日前: 前日分のチェック（指摘の見本）
    closedDay('u01', 1, [['gas', 4200, 'ガソリン代 ENEOS'], ['lunch', 850, '昼食'], [98000, '山田 花子', 4]]), // 問題なし
    closedDay('u02', 1, [['gas', 3600, 'ガソリン代', false], ['supply', 5200, ''], [64000, '田村 恵子', 3]], { start: 49000, expected: 50000, startNote: '財布の千円札を1枚、自宅へ持ち帰ってしまった' }), // 領収書なし・内容なし・始業時の差異
    closedDay('u03', 1, [['gas', 3900, 'ガソリン代'], [120000, '佐藤 一雄', 6]], { close: { counted: 47000, note: '釣り銭の渡し間違いかもしれない' } }), // 終業時の過不足
    closedDay('u04', 1, [['toll', 2800, '高速代'], [86000, '小林 由美', 5]], { deposits: [{ id: 'sd-u04-1', userId: 'u04', amount: 300000, memo: '買取資金', by: '経理部', at: at(now, ago(1), 9) }], drawn: 200000 }), // 補充金の未引き出し
    closedDay('u05', 1, [['other', 3300, '手土産（お客様宅）'], ['supply', 15800, '梱包材（プチプチ・ダンボール）']]), // 「その他」・高額
    day('u06', ago(1), now, { start: 50000, expenses: [ex(now, ago(1), 1, 11, 'transit', 560, '電車（客先まで）'), buy(now, ago(1), 2, 15, 64000, '中村 正', 3)], drawn: 64560 }), // 終業・日報が未提出
    closedDay('u07', 1, [['gas', 4400, 'ガソリン代'], [190000, '井上 和夫', 8]], { close: { noPhoto: true } }), // 数えた現金の写真がない
  ];
  const earlier = [
    [2, 'u01', [['toll', 2800, '高速代'], ['gas', 4500, 'ガソリン代']]], [2, 'u03', [['gas', 3900, 'ガソリン代'], ['lunch', 900, '昼食']]], [2, 'u05', [['transit', 1200, '電車']]],
    [3, 'u02', [['gas', 4000, 'ガソリン代'], ['supply', 5200, '手袋・マスク']]], [3, 'u04', [['lunch', 1000, '昼食'], ['toll', 1500, '駐車場']]], [3, 'u07', [['gas', 4400, 'ガソリン代']]],
  ].map(([n, userId, items]) => closedDay(userId, n, items));
  const past = [...yesterday, ...earlier];
  const days = Object.fromEntries([...list, ...past].map((d) => [`${d.userId}:${d.date}`, d]));
  const deposits = [{ id: 'SD-1', userId: 'u04', amount: 300000, memo: '買取資金の追加（高額案件の予定あり）', by: '経理部', at: at(now, today, 10, 15) }];
  const payments = [
    { id: 'SP-1', customerName: '山田 花子', amount: 120000, reason: 'highvalue', userId: 'u01', memo: '○○銀行 梅田支店 普通 1234567', status: 'pending', at: at(now, today, 13, 40), paidAt: null },
    { id: 'SP-2', customerName: '中村 正', amount: 40000, reason: 'shortage', userId: 'u07', memo: '△△銀行 三宮支店 普通 7654321（現金が不足した分）', status: 'pending', at: at(now, today, 15, 10), paidAt: null },
    { id: 'SP-3', customerName: '井上 和夫', amount: 95000, reason: 'highvalue', userId: 'u03', memo: '□□銀行 難波支店 普通 1112223', status: 'done', at: at(now, ago(1), 16), paidAt: at(now, ago(1), 17, 30) },
  ];
  const storedDeposits = [...deposits, ...past.flatMap((d) => (d.closedAt ? [] : [{ id: `SD-${d.userId}-${d.date}`, userId: d.userId, amount: d.withdrawals.reduce((n, w) => n + w.amount, 0), memo: '買取資金', by: '経理部', at: at(now, d.date, 9) }]))];
  return { days, deposits: storedDeposits, payments, ...buildLedger(now, today, ago, deposits, payments), checks: buildChecks(earlier) };
}

// 経費精算（一次チェック）の見本: 2日前・3日前の分はチェック済み（1人だけ差戻し）。前日の分は、すべて未チェック
function buildChecks(earlier) {
  const checks = {};
  earlier.forEach((d, i) => {
    checks[`${d.userId}:${d.date}`] = i === 0
      ? { status: 'returned', reason: '高速代の領収書の日付が読めません。再提出してください', by: '営業サポート', at: d.closedAt, date: d.date }
      : { status: 'ok', reason: '', by: '営業サポート', at: d.closedAt, date: d.date };
  });
  return checks;
}

// 入出金の帳簿の見本: 28日分の販売代金・補充金・お客様への支払・固定費、鑑定士の小口金の補充と使用
function buildLedger(now, today, ago, deposits, payments) {
  const L = [];
  const push = (date, d, h = 10) => L.push({ ...makeEntry({ ...d, date }, { now: at(now, date, h) }), id: `SL-${L.length + 1}` });
  for (let n = 28; n >= 1; n -= 1) {
    const date = ago(n);
    const dow = new Date(`${date}T00:00:00`).getDay();
    if (dow === 0) continue; // 日曜は動きなし
    const k = (n * 7) % 5;
    push(date, { category: 'sales', amount: 180000 + k * 65000, cost: 120000 + k * 38000, memo: ['フリマ売上', '業者への販売', 'オークション落札分', '業者への販売', 'フリマ売上'][k] }, 15);
    if (dow >= 1 && dow <= 5) push(date, { category: 'advance', amount: 300000, memo: '鑑定士の買取資金', userId: `u0${(k % 7) + 1}` }, 9);
    if (k === 2) push(date, { category: 'customer', amount: 60000 + k * 10000, memo: '高額のため後日振込' }, 16);
    if (k === 4) push(date, { category: 'cashback', amount: 150000, memo: '鑑定士の余剰現金の戻し', userId: 'u03' }, 18);
  }
  // 固定費: 先月分は払い済み。今月分は、支払日を過ぎたもののうち、水道光熱費・通信費だけ払い済み（家賃・給与は未払い）
  const lastMonth = dateKey(new Date(new Date(`${today.slice(0, 7)}-01T00:00:00`).getTime() - 86400000)).slice(0, 7);
  for (const [id, name, amount, day] of [['FX-RENT-OSAKA', '大阪営業所 家賃', 280000, 25], ['FX-RENT-KANTO', '関東営業所 家賃', 350000, 25], ['FX-RENT-HONSHA', '本社 家賃', 420000, 25], ['FX-PAYROLL', '社員の給与', 2400000, 25]]) {
    const date = `${lastMonth}-${day}`;
    if (date >= ago(28)) push(date, { category: 'fixed', amount, memo: name, fixedId: id, month: lastMonth }, 11);
  }
  for (const [id, name, amount] of [['FX-UTIL', '水道光熱費（本社）', 38000], ['FX-SYSTEM', '通信・システム費', 120000]]) {
    const date = `${today.slice(0, 7)}-10`;
    if (date < today) push(date, { category: 'fixed', amount, memo: name, fixedId: id, month: today.slice(0, 7) }, 11);
  }
  // 鑑定士の小口金: 全員に5万円を補充（u02 だけ6万円）。u01 は残りが十分、u02 は使って残りが少ない（補充が必要）
  for (const u of USERS) push(ago(14), { category: 'petty', amount: u.id === 'u02' ? 60000 : 50000, memo: '小口金の補充', userId: u.id }, 10);
  // 今日: 鑑定士への補充金・お客様への支払は、見本の補充金・振込済みから
  for (const d of deposits) push(today, { category: 'advance', amount: d.amount, memo: d.memo, userId: d.userId }, 10);
  for (const p of payments.filter((x) => x.status === 'done')) push(dateKey(new Date(p.paidAt)), { category: 'customer', amount: p.amount, memo: `${p.customerName} 様 高額のため、後日 銀行振込`, userId: p.userId }, 17);
  push(today, { category: 'sales', amount: 240000, cost: 160000, memo: '業者への販売' }, 14);
  const pettyUses = [
    { id: 'SU-1', userId: 'u01', date: ago(9), amount: 12000, memo: '梱包用のテープ・手袋・クリーナー', at: at(now, ago(9), 14) },
    { id: 'SU-2', userId: 'u01', date: ago(3), amount: 6000, memo: '資料の郵送料・コピー代', at: at(now, ago(3), 14) },
    { id: 'SU-3', userId: 'u02', date: ago(10), amount: 32000, memo: '鑑定ツール（試金石・拡大鏡）', at: at(now, ago(10), 14) },
    { id: 'SU-4', userId: 'u02', date: ago(2), amount: 20000, memo: '現場への交通費（電車）', at: at(now, ago(2), 14), proxy: true, by: '経理部' },
    { id: 'SU-5', userId: 'u01', date: today, amount: 8000, memo: '査定用の白手袋・クリーニングクロス', at: at(now, today, 11), status: 'pending' },
    { id: 'SU-6', userId: 'u02', date: today, amount: 12000, memo: '買取品の鑑定書の取り寄せ費用', at: at(now, today, 12), status: 'pending' }, // 残りより多い（先に補充が必要）
  ];
  return { ledger: L, pettyUses };
}

// 見本を保存する。force でないときは、まだ入れたことがなく、記録が空のときだけ入れる。入れたら true
export function seedSample(now = Date.now(), force = false) {
  try {
    if (!force && (localStorage.getItem(SAMPLE_SEEDED_KEY) || Object.keys(loadDays()).length)) return false;
    const { days, deposits, payments, ledger, pettyUses, checks } = buildSample(now);
    localStorage.setItem(WORKDAY_KEY, JSON.stringify(days));
    localStorage.setItem(DEPOSIT_KEY, JSON.stringify(deposits));
    localStorage.setItem(CUSTOMER_PAY_KEY, JSON.stringify(payments));
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
    localStorage.setItem(PETTY_KEY, JSON.stringify(pettyUses));
    localStorage.setItem(DAILY_CHECK_KEY, JSON.stringify(checks));
    localStorage.setItem(SAMPLE_SEEDED_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
