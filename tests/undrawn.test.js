import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const W = await import('../src/workday.js');
const { expenseView } = await import('../src/workdayView.js');

const today = W.dateKey();
const day = (withdrawals) => ({ userId: 'u01', date: today, startedAt: 1, start: { expected: 50000, counted: 50000, diff: 0 }, expenses: [], withdrawals, visits: [], closedAt: null });
const state = (d) => ({ phase: 'open', user: 'u01', day: d, expDraft: W.blankExpenseDraft(), withdrawDraft: { amount: 0 }, fixable: [] });

test('補充金は、引き出すまで所持金に入らない。引き出した分だけが所持金に加わる', () => {
  const none = W.summaryOf(day([]), 'u01');
  assert.deepEqual([none.depositTotal, none.undrawn, none.balance], [300000, 300000, 50000]);
  const part = W.summaryOf(day([{ id: 'w', at: 1, amount: 100000 }]), 'u01');
  assert.deepEqual([part.undrawn, part.balance], [200000, 150000]);
});

test('経費管理の表示: 未引き出しがあるときは、補充金のお知らせ・未引き出しの印・ボタンが出る。引き出し済みなら、お知らせは出ない', () => {
  const before = expenseView(state(day([])));
  for (const w of ['未引き出し ¥300,000', '登録すると、はじめて所持金に加わります', 'data-action="wdr-rest"', '引き出すまで所持金ではありません', '引き出すまで、所持金に入りません']) assert.ok(before.includes(w), w);
  const after = expenseView(state(day([{ id: 'w', at: 1, amount: 300000 }])));
  assert.ok(!after.includes('登録すると、はじめて所持金に加わります') && after.includes('引き出し済み') && !after.includes('data-action="wdr-rest"'));
});
