import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { addWithdrawal, DENOMINATIONS, cashTotal, breakdownOf, blankCloseForm, closeReady, closeDay, END_CHECKS, expensesToReview } = await import('../src/workday.js');

const day0 = { date: new Date().toLocaleDateString('sv'), userId: 'u01', startedAt: 1, closedAt: null, start: { counted: 50000 }, expenses: [], deposits: [], visits: [], close: null, report: null };
const day = addWithdrawal(day0, { id: 'W1', at: 2, amount: 300000 });
const allChecked = Object.fromEntries(END_CHECKS.map((c) => [c.key, true]));

test('紙幣と硬貨の種類は、1万円札から1円玉まで', () => {
  assert.deepEqual(DENOMINATIONS.map((d) => d.value), [10000, 5000, 2000, 1000, 500, 100, 50, 10, 5, 1]);
});

test('枚数から合計金額を出す（未入力は0枚）', () => {
  assert.equal(cashTotal({ 10000: 3, 500: 2, 1: 7 }), 31007);
  assert.equal(cashTotal({}), 0);
  assert.equal(cashTotal({ 1000: -2, 100: 'x' }), 0);
});

test('金額を、大きい紙幣・硬貨から順に枚数へ分ける', () => {
  assert.deepEqual(breakdownOf(36660), { 10000: 3, 5000: 1, 1000: 1, 500: 1, 100: 1, 50: 1, 10: 1 });
  assert.equal(cashTotal(breakdownOf(123456)), 123456);
});

test('終業の入力は、現金の写真がないと提出できない', () => {
  const form = { ...blankCloseForm(), counts: breakdownOf(350000), counted: 350000, countedSet: true, checks: allChecked };
  assert.equal(closeReady(form, day, 'u01', false), false);
  assert.equal(closeReady({ ...form, cashPhoto: 'data:image/jpeg;base64,x' }, day, 'u01', false), true);
});

test('終業の記録に、枚数と現金の写真が残る', () => {
  const form = { ...blankCloseForm(), counts: breakdownOf(350000), counted: 350000, countedSet: true, checks: allChecked, cashPhoto: 'data:image/jpeg;base64,x' };
  const closed = closeDay(day, 'u01', form, 99);
  assert.deepEqual(closed.close.counts, breakdownOf(350000));
  assert.equal(closed.close.cashPhoto, 'data:image/jpeg;base64,x');
  assert.equal(closed.close.diff, 0);
});

test('終業時に確認する経費は、自分で計上したものだけ（買取代金の自動計上は除く）', () => {
  const d = { ...day, expenses: [{ id: 'a', at: 1, auto: false }, { id: 'b', at: 2, auto: true }, { id: 'c', at: 3, auto: false }] };
  assert.deepEqual(expensesToReview(d).map((e) => e.id), ['a', 'c']);
});
