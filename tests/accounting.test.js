import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { flagsOf, giveAdvance, advanceReady, addCustomerPayment, loadCustomerPayments, markPaid, paymentReady, CASH_LIMIT } = await import('../src/accounting.js');
const { loadLedger } = await import('../src/ledger.js');
const { loadStoredDeposits } = await import('../src/workday.js');

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

test('始業時・終業時の差異、立替金の残高マイナス、所持金過多を検知する', () => {
  const a = flagsOf(day({ start: { counted: 49000, expected: 50000, diff: -1000, note: '財布に入れ忘れ' } }), summary());
  assert.ok(a.some((f) => f.level === 'warn' && f.text.includes('始業時') && f.text.includes('財布に入れ忘れ')));
  const b = flagsOf(day({ closedAt: 9, close: { counted: 90000, expected: 100000, diff: -10000, note: '不明' } }), summary());
  assert.ok(b.some((f) => f.level === 'danger' && f.text.includes('終業時')));
  assert.ok(flagsOf(day(), summary(-500)).some((f) => f.level === 'danger' && f.text.includes('マイナス')));
  assert.ok(flagsOf(day(), summary(CASH_LIMIT + 1)).some((f) => f.text.includes('所持金が多い')));
});

test('鑑定士への立替金: 鑑定士の所持金（入金）と帳簿の支払に、同時に記録する', () => {
  assert.equal(advanceReady({ userId: '', amount: 1000 }), false);
  assert.equal(advanceReady({ userId: 'u01', amount: 0 }), false);
  assert.equal(giveAdvance({ userId: 'u01', amount: 300000, memo: '買取資金' }, { now: 100 }), true);
  const dep = loadStoredDeposits();
  assert.deepEqual([dep[0].userId, dep[0].amount, dep[0].by], ['u01', 300000, '経理部']);
  const led = loadLedger();
  assert.deepEqual([led[0].kind, led[0].category, led[0].amount, led[0].userId], ['out', 'advance', 300000, 'u01']);
});

test('お客様への支払: 入力チェック、登録、振込済みへの更新', () => {
  assert.equal(paymentReady({ customerName: '', amount: 1000, reason: 'shortage' }), false);
  assert.equal(paymentReady({ customerName: '山田', amount: 0, reason: 'shortage' }), false);
  assert.equal(paymentReady({ customerName: '山田', amount: 1000, reason: '' }), false);
  assert.equal(paymentReady({ customerName: '山田', amount: 1000, reason: 'other', memo: '' }), false);
  assert.equal(paymentReady({ customerName: '山田', amount: 1000, reason: 'shortage' }), true);
  const p = addCustomerPayment({ customerName: '山田 花子', amount: 120000, reason: 'highvalue', userId: 'u01', memo: '' }, 100);
  assert.equal(p.status, 'pending');
  assert.equal(loadCustomerPayments().length, 1);
  assert.equal(markPaid(p.id, 200), true);
  assert.deepEqual([loadCustomerPayments()[0].status, loadCustomerPayments()[0].paidAt], ['done', 200]);
  const led = loadLedger().filter((e) => e.category === 'customer'); // 振込済みにすると、帳簿に支払として載る（二重には載せない）
  assert.deepEqual([led.length, led[0].amount, led[0].kind], [1, 120000, 'out']);
  assert.equal(markPaid(p.id, 300), false);
  assert.equal(loadLedger().filter((e) => e.category === 'customer').length, 1);
});

test('営業所での絞り込み: 空なら全員。指定すれば、その営業所の鑑定士だけ', async () => {
  const { officeUsers, onlyOffice } = await import('../src/accounting.js');
  const users = [{ id: 'u01' }, { id: 'u04' }, { id: 'u08' }];
  const areaOf = (id) => ({ u01: 'osaka', u04: 'kanto', u08: 'tokai' })[id];
  assert.equal(officeUsers(users, '', areaOf).length, 3);
  assert.deepEqual(officeUsers(users, 'kanto', areaOf).map((u) => u.id), ['u04']);
  assert.deepEqual(officeUsers(users, 'nowhere', areaOf), []);
  const ids = officeUsers(users, 'osaka', areaOf).map((u) => u.id);
  assert.equal(onlyOffice([{ userId: 'u01' }, { userId: 'u04' }, { userId: '' }], ids, true).length, 1);
  assert.equal(onlyOffice([{ userId: 'u01' }, { userId: '' }], null, false).length, 2); // 絞り込みなし
});
