import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { flagsOf, expenseStats, proxyExpense, canProxy, addCustomerPayment, loadCustomerPayments, markPaid, paymentReady, HIGH_EXPENSE, CASH_LIMIT } = await import('../src/accounting.js');

const ex = (o) => ({ id: 'e', at: 1, type: 'gas', amount: 1000, memo: '', photo: 'data:x', ...o });
const day = (o = {}) => ({
  userId: 'u01', date: '2026-10-24', startedAt: 1, start: { counted: 50000, expected: 50000, diff: 0, note: '' },
  expenses: [], visits: [], closedAt: null, close: null, report: null, ...o,
});
const summary = (balance = 100000) => ({ balance });

test('問題のない日は、確認事項なし。未始業は判定しない', () => {
  assert.deepEqual(flagsOf(day({ expenses: [ex()] }), summary()), []);
  assert.deepEqual(flagsOf(null, null), []);
});

test('始業時・終業時の差異、残高マイナス、所持金過多を検知する', () => {
  const a = flagsOf(day({ start: { counted: 49000, expected: 50000, diff: -1000, note: '財布に入れ忘れ' } }), summary());
  assert.ok(a.some((f) => f.level === 'warn' && f.text.includes('始業時') && f.text.includes('財布に入れ忘れ')));
  const b = flagsOf(day({ closedAt: 9, close: { counted: 90000, expected: 100000, diff: -10000, note: '不明' } }), summary());
  assert.ok(b.some((f) => f.level === 'danger' && f.text.includes('終業時')));
  assert.ok(flagsOf(day(), summary(-500)).some((f) => f.level === 'danger' && f.text.includes('マイナス')));
  assert.ok(flagsOf(day(), summary(CASH_LIMIT + 1)).some((f) => f.text.includes('所持金が多い')));
});

test('経費の使い方: 高額・その他・レシートなしを検知。買取代金（自動計上）は対象外', () => {
  const f = flagsOf(day({ expenses: [
    ex({ id: 'a', type: 'supply', amount: HIGH_EXPENSE }),
    ex({ id: 'b', type: 'other', memo: '手土産' }),
    ex({ id: 'c', photo: null }),
    ex({ id: 'd', type: 'purchase', amount: 900000, photo: null, auto: true }),
    ex({ id: 'e2', photo: null, proxy: true }),
  ] }), summary());
  assert.equal(f.length, 3);
  assert.ok(f.some((x) => x.text.includes('高額')));
  assert.ok(f.some((x) => x.text.includes('その他') && x.text.includes('手土産')));
  assert.ok(f.some((x) => x.text.includes('レシート')));
});

test('経費の集計: 期間・種類別・営業別。買取代金は経費に含めず別に出す', () => {
  const days = [
    day({ userId: 'u01', date: '2026-10-24', expenses: [ex({ amount: 3000 }), ex({ type: 'lunch', amount: 800 }), ex({ type: 'purchase', amount: 50000 })] }),
    day({ userId: 'u02', date: '2026-10-24', expenses: [ex({ amount: 2000 })] }),
    day({ userId: 'u01', date: '2026-10-02', expenses: [ex({ amount: 1000 })] }),
    day({ userId: 'u01', date: '2026-09-30', expenses: [ex({ amount: 9999 })] }),
  ];
  const today = expenseStats(days, '2026-10-24');
  assert.equal(today.total, 5800);
  assert.equal(today.purchaseTotal, 50000);
  assert.deepEqual(today.byType.map((t) => [t.key, t.amount, t.count]), [['gas', 5000, 2], ['lunch', 800, 1]]);
  assert.deepEqual(today.byUser.map((u) => [u.userId, u.amount]), [['u01', 3800], ['u02', 2000]]);
  const month = expenseStats(days, '2026-10');
  assert.equal(month.total, 6800);
  assert.equal(expenseStats([], '2026-10').total, 0);
});

test('経費の入力代行: 業務中の日だけ。代行の印・入力者が残り、元の記録は変えない', () => {
  const d = day();
  assert.equal(canProxy(d), true);
  assert.equal(canProxy(day({ closedAt: 5 })), false);
  assert.equal(canProxy(null), false);
  const next = proxyExpense(d, { type: 'gas', amount: 4200, memo: 'レシート紛失', by: '経理部', at: 99 });
  assert.equal(d.expenses.length, 0);
  assert.equal(next.expenses.length, 1);
  assert.deepEqual([next.expenses[0].proxy, next.expenses[0].by, next.expenses[0].photo, next.expenses[0].amount], [true, '経理部', null, 4200]);
});

test('お客様への入金: 入力チェック、登録、振込済みへの更新', () => {
  assert.equal(paymentReady({ customerName: '', amount: 1000, reason: 'shortage' }), false);
  assert.equal(paymentReady({ customerName: '山田', amount: 0, reason: 'shortage' }), false);
  assert.equal(paymentReady({ customerName: '山田', amount: 1000, reason: '' }), false);
  assert.equal(paymentReady({ customerName: '山田', amount: 1000, reason: 'other', memo: '' }), false);
  assert.equal(paymentReady({ customerName: '山田', amount: 1000, reason: 'shortage' }), true);
  const p = addCustomerPayment({ customerName: '山田 花子', amount: 120000, reason: 'highvalue', userId: 'u01', memo: '' }, 100);
  assert.equal(p.status, 'pending');
  assert.equal(loadCustomerPayments().length, 1);
  markPaid(p.id, 200);
  assert.deepEqual([loadCustomerPayments()[0].status, loadCustomerPayments()[0].paidAt], ['done', 200]);
});
