// 経理部の入出金の帳簿と、日次残高。入金・支払を1件ずつ記録し、日ごとの残高を出す。
import { LEDGER_KEY } from './store.js';
import { dateKey, newId } from './workday.js';

export const OPENING_BALANCE = 3000000; // 帳簿の最初の残高（ダミー）。最初の記録より前の残高として扱う

export const IN_CATEGORIES = [
  { key: 'sales', label: '販売代金', hint: '商品の販売の入金（原価を入れると、週間収支の粗利になる）' },
  { key: 'cashback', label: '鑑定士からの現金戻し', hint: '鑑定士が持っていた現金を、経理部へ戻した分' },
  { key: 'other_in', label: 'その他の入金', hint: '内容をメモに記入' },
];
export const OUT_CATEGORIES = [
  { key: 'advance', label: '鑑定士への補充金', hint: '買取資金として、鑑定士に振り込んだお金（鑑定士が引き出して使う）' },
  { key: 'customer', label: 'お客様への支払', hint: '銀行振込など、お客様への買取代金のお支払い' },
  { key: 'fixed', label: '固定費', hint: '家賃・人件費など（固定費の画面から支払う）' },
  { key: 'other_out', label: 'その他の支払', hint: '内容をメモに記入' },
];
// 廃止した区分（以前の記録に残っているもの）。選べないが、帳簿には、そのまま出す
const LEGACY_CATEGORIES = [{ key: 'petty', label: '小口金（廃止）', hint: '' }];
export const categoryOf = (key) => [...IN_CATEGORIES, ...OUT_CATEGORIES].find((c) => c.key === key) ?? LEGACY_CATEGORIES.find((c) => c.key === key) ?? null;
export const kindOf = (key) => (IN_CATEGORIES.some((c) => c.key === key) ? 'in' : 'out');

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
export const loadLedger = () => readJson(LEDGER_KEY, []);
export const saveLedger = (list) => { try { localStorage.setItem(LEDGER_KEY, JSON.stringify(list)); return true; } catch { return false; } };

// 記録の入力が足りているか。金額は1円以上、「その他」はメモ必須
export const entryReady = (d) => Boolean([...IN_CATEGORIES, ...OUT_CATEGORIES].some((c) => c.key === d.category) && d.amount > 0 && (!/^other_/.test(d.category) || d.memo?.trim()));

// 記録を作る（日付は、記録した日。記録の日付を指定すれば、その日の入出金になる）
export function makeEntry(d, { by = '経理部', now = Date.now() } = {}) {
  return {
    id: newId('LG'), date: d.date || dateKey(new Date(now)), kind: kindOf(d.category), category: d.category, amount: d.amount,
    cost: d.category === 'sales' ? Math.max(0, Number(d.cost) || 0) : 0, memo: (d.memo ?? '').trim(), userId: d.userId || '',
    fixedId: d.fixedId || '', month: d.month || '', by, at: now,
  };
}
export const addEntry = (list, entry) => [entry, ...list];
export const removeEntry = (list, id) => list.filter((e) => e.id !== id);

const net = (e) => (e.kind === 'in' ? e.amount : -e.amount);
const sum = (list) => list.reduce((n, e) => n + e.amount, 0);
export const totals = (list) => ({ in: sum(list.filter((e) => e.kind === 'in')), out: sum(list.filter((e) => e.kind === 'out')) });

// 指定した日の終わりの残高
export const balanceOn = (list, date, opening = OPENING_BALANCE) => opening + list.filter((e) => e.date <= date).reduce((n, e) => n + net(e), 0);

// 日付の一覧（from〜to を含む）
export function datesBetween(from, to) {
  const out = [];
  for (let t = new Date(`${from}T00:00:00`); dateKey(t) <= to; t = new Date(t.getTime() + 86400000)) out.push(dateKey(t));
  return out;
}

// 日次残高: 日ごとに、前日残高・入金・支払・残高。新しい日が先
export function dailyBalances(list, from, to, opening = OPENING_BALANCE) {
  return datesBetween(from, to).map((date) => {
    const day = list.filter((e) => e.date === date);
    const t = totals(day);
    const balance = balanceOn(list, date, opening);
    return { date, opening: balance - t.in + t.out, in: t.in, out: t.out, balance, count: day.length };
  }).reverse();
}
