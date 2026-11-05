import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { dateKey, summaryOf, balanceOf, withdrawalsOf, addWithdrawal, removeWithdrawal, withdrawalReady, closeDay, blankCloseForm } = await import('../src/workday.js');
const { flagsOf } = await import('../src/accounting.js');

// 今日は、定例の補充金（30万円）が経理部から振り込まれているものとして扱う
const base = () => ({ date: dateKey(), userId: 'u01', startedAt: 1, closedAt: null, start: { counted: 50000 }, expenses: [], visits: [], close: null, report: null });

test('引き出し金額は、鑑定士が日ごとに記録する（元の記録は変えない）', () => {
  const d = base();
  assert.deepEqual(withdrawalsOf(d), []);
  const d2 = addWithdrawal(d, { id: 'W1', at: 5, amount: 300000 });
  assert.equal(withdrawalsOf(d2).length, 1);
  assert.equal(withdrawalsOf(d).length, 0);
  assert.equal(withdrawalsOf(removeWithdrawal(d2, 'W1')).length, 0);
});

test('所持金 ＝ 前日繰越金 ＋ 引き出し金額 − 経費（補充金は、引き出すまで所持金に入らない）', () => {
  const d = addWithdrawal({ ...base(), expenses: [{ id: 'e', at: 1, amount: 4000 }] }, { id: 'W1', at: 5, amount: 300000 });
  assert.equal(balanceOf(d), 50000 + 300000 - 4000);
  assert.equal(balanceOf({ ...base() }), 50000);
});

test('補充金と引き出し金額の差（未引き出し）を集計する', () => {
  const none = summaryOf(base(), 'u01');
  assert.equal(none.depositTotal, 300000);
  assert.equal(none.withdrawalTotal, 0);
  assert.equal(none.undrawn, 300000);
  const part = summaryOf(addWithdrawal(base(), { id: 'W1', at: 5, amount: 280000 }), 'u01');
  assert.equal(part.undrawn, 20000);
  const full = summaryOf(addWithdrawal(base(), { id: 'W1', at: 5, amount: 300000 }), 'u01');
  assert.equal(full.undrawn, 0);
});

test('引き出し金額は、1円以上の金額が必要', () => {
  assert.equal(withdrawalReady({ amount: 0 }), false);
  assert.equal(withdrawalReady({ amount: 10000 }), true);
});

test('補充金と引き出し金額が一致しないと、経理部の確認事項に出る（足りない＝警告、超える＝危険）', () => {
  const day = base();
  const sm = (w) => summaryOf(addWithdrawal(day, { id: 'W', at: 1, amount: w }), 'u01');
  const withDay = (w) => addWithdrawal(day, { id: 'W', at: 1, amount: w });
  assert.equal(flagsOf(withDay(300000), sm(300000)).length, 0);
  const less = flagsOf(withDay(280000), sm(280000));
  assert.equal(less.length, 1);
  assert.equal(less[0].level, 'warn');
  assert.match(less[0].text, /引き出し/);
  const more = flagsOf(withDay(320000), sm(320000));
  assert.equal(more[0].level, 'danger');
});

test('終業の日報に、補充金と引き出し金額が残る', () => {
  const d = addWithdrawal(base(), { id: 'W1', at: 5, amount: 300000 });
  const form = { ...blankCloseForm(), counted: 350000, countedSet: true, checks: {} };
  const closed = closeDay(d, 'u01', form, 99);
  assert.equal(closed.report.depositTotal, 300000);
  assert.equal(closed.report.withdrawalTotal, 300000);
  assert.equal(closed.close.diff, 0);
});
