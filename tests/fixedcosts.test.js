import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { makeEntry } = await import('../src/ledger.js');
const F = await import('../src/fixedCosts.js');

test('固定費の登録チェックと保存: 名前・金額・支払日（1〜28）。同じIDなら更新、無効にできる', () => {
  assert.equal(F.fixedReady({ name: '', amount: 1, payDay: 1 }), false);
  assert.equal(F.fixedReady({ name: '家賃', amount: 0, payDay: 1 }), false);
  assert.equal(F.fixedReady({ name: '家賃', amount: 1, payDay: 29 }), false);
  assert.equal(F.fixedReady({ name: '家賃', amount: 1, payDay: 28 }), true);
  const a = F.saveFixedCost([], { type: 'rent', name: ' 福岡 家賃 ', amount: 100000, payDay: 25 });
  assert.equal(a[0].name, '福岡 家賃');
  const b = F.saveFixedCost(a, { ...a[0], amount: 120000 });
  assert.deepEqual([b.length, b[0].amount], [1, 120000]);
  assert.equal(a[0].amount, 100000); // 元は変えない
  assert.equal(F.setFixedActive(b, b[0].id, false)[0].active, false);
  assert.equal(F.loadFixed().length, F.DEFAULT_FIXED.length); // 保存がなければ初期の登録
});

test('月ごとの固定費: 支払った記録は帳簿から探す。支払日を過ぎて未払いなら期限切れ。無効でも、払った月には残る', () => {
  const fixed = [
    { id: 'A', type: 'rent', name: '家賃', amount: 300000, payDay: 25, active: true },
    { id: 'B', type: 'utility', name: '光熱費', amount: 40000, payDay: 10, active: true },
    { id: 'C', type: 'other', name: '昔の契約', amount: 5000, payDay: 5, active: false },
  ];
  const ledger = [makeEntry({ category: 'fixed', amount: 38000, fixedId: 'B', month: '2026-11', date: '2026-11-10' }, { now: 1 })];
  const rows = F.monthlyFixed(fixed, ledger, '2026-11', '2026-11-15');
  assert.deepEqual(rows.map((r) => r.id), ['B', 'A']); // 無効で未払いのCは出ない。支払日の順
  assert.deepEqual([rows[0].paid?.amount, rows[0].overdue, rows[1].paid, rows[1].overdue], [38000, false, null, false]);
  assert.equal(F.monthlyFixed(fixed, ledger, '2026-11', '2026-11-26')[1].overdue, true);
  assert.deepEqual(F.monthlyTotals(rows), { total: 340000, paid: 38000, unpaid: 300000 });
  assert.equal(F.monthlyFixed(fixed, ledger, '2026-12', '2026-12-01').length, 2); // 別の月は未払い
});
