import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { makeEntry } = await import('../src/ledger.js');
const W = await import('../src/weekly.js');
const e = (date, o) => makeEntry({ amount: 1000, date, ...o }, { now: 1 });

test('週は月曜〜日曜。日曜は前の月曜の週に入る', () => {
  assert.equal(W.weekStart('2026-11-05'), '2026-11-02'); // 木曜
  assert.equal(W.weekStart('2026-11-02'), '2026-11-02'); // 月曜
  assert.equal(W.weekStart('2026-11-08'), '2026-11-02'); // 日曜
  assert.equal(W.weekEnd('2026-11-02'), '2026-11-08');
  assert.equal(W.shiftWeek('2026-11-02', -1), '2026-10-26');
});

test('週間収支: 入金・支払・粗利・固定費・残高。週の外の記録は入れない', () => {
  const list = [
    e('2026-10-30', { category: 'sales', amount: 400000, cost: 300000 }), // 前の週
    e('2026-11-02', { category: 'sales', amount: 500000, cost: 350000 }),
    e('2026-11-03', { category: 'sales', amount: 200000, cost: 120000 }),
    e('2026-11-03', { category: 'advance', amount: 300000 }),
    e('2026-11-06', { category: 'fixed', amount: 420000, fixedId: 'FX', month: '2026-11' }),
    e('2026-11-09', { category: 'customer', amount: 50000 }), // 次の週
  ];
  const w = W.weeklySummary(list, '2026-11-02', 1000000);
  assert.deepEqual([w.in, w.out, w.gross, w.fixed, w.afterFixed], [700000, 720000, 230000, 420000, -190000]);
  assert.equal(w.opening, 1400000); // 前の週の最後の残高
  assert.equal(w.balance, 1380000);
  assert.equal(w.days.length, 7);
  assert.deepEqual([w.days[1].in, w.days[1].out, w.days[1].balance], [200000, 300000, 1800000]);
  assert.equal(W.weeklySummary([], '2026-11-02', 5).balance, 5);
});

test('直近の週: 新しい週が先。今週から n 週ぶん', () => {
  const weeks = W.recentWeeks([], new Date('2026-11-05T12:00:00').getTime(), 3, 0);
  assert.deepEqual(weeks.map((w) => w.start), ['2026-11-02', '2026-10-26', '2026-10-19']);
});
