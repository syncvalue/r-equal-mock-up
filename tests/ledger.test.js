import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const L = await import('../src/ledger.js');
const e = (o) => L.makeEntry({ amount: 1000, ...o }, { now: new Date(`${o.date}T10:00:00`).getTime() });

test('入出金の登録チェック: 区分・金額が必要。「その他」はメモ必須', () => {
  assert.equal(L.entryReady({ category: '', amount: 100 }), false);
  assert.equal(L.entryReady({ category: 'sales', amount: 0 }), false);
  assert.equal(L.entryReady({ category: 'sales', amount: 100 }), true);
  assert.equal(L.entryReady({ category: 'other_out', amount: 100, memo: ' ' }), false);
  assert.equal(L.entryReady({ category: 'other_in', amount: 100, memo: '雑収入' }), true);
  assert.deepEqual([L.kindOf('sales'), L.kindOf('advance'), L.kindOf('fixed')], ['in', 'out', 'out']);
});

test('記録: 区分から入金・支払が決まり、原価は販売代金だけに付く。元の一覧は変えない', () => {
  const a = e({ date: '2026-11-02', category: 'sales', amount: 200000, cost: 150000 });
  const b = e({ date: '2026-11-02', category: 'advance', amount: 50000, cost: 999, userId: 'u01' });
  assert.deepEqual([a.kind, a.cost, b.kind, b.cost, b.userId], ['in', 150000, 'out', 0, 'u01']);
  const list = [];
  const next = L.addEntry(list, a);
  assert.equal(list.length, 0);
  assert.deepEqual(L.removeEntry(next, a.id), []);
});

test('日次残高: 前日残高＋入金−支払。記録のない日も残高が続き、新しい日が先', () => {
  const list = [
    e({ date: '2026-11-02', category: 'sales', amount: 500000 }),
    e({ date: '2026-11-02', category: 'advance', amount: 300000 }),
    e({ date: '2026-11-04', category: 'customer', amount: 100000 }),
  ];
  const rows = L.dailyBalances(list, '2026-11-02', '2026-11-04', 1000000);
  assert.deepEqual(rows.map((r) => r.date), ['2026-11-04', '2026-11-03', '2026-11-02']);
  assert.deepEqual(rows.map((r) => r.balance), [1100000, 1200000, 1200000]);
  assert.deepEqual([rows[2].opening, rows[2].in, rows[2].out], [1000000, 500000, 300000]);
  assert.deepEqual([rows[1].in, rows[1].out, rows[1].count], [0, 0, 0]);
  assert.equal(L.balanceOn([], '2026-11-02'), L.OPENING_BALANCE);
});
