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

test('鑑定士の小口金: 残り＝補充−使用。下回ったら補充が必要で、補充の目安を出す', () => {
  const staff = [{ id: 'u01', name: '鈴木' }, { id: 'u02', name: '高橋' }];
  const ledger = [
    makeEntry({ category: 'petty', amount: 60000, userId: 'u01', date: '2026-11-01' }, { now: 1 }),
    makeEntry({ category: 'petty', amount: 60000, userId: 'u02', date: '2026-11-01' }, { now: 1 }),
    makeEntry({ category: 'advance', amount: 99999, userId: 'u01', date: '2026-11-01' }, { now: 1 }), // 小口金ではない
  ];
  const uses = [{ userId: 'u01', amount: 18000 }, { userId: 'u02', amount: 52000 }];
  const [a1, a2] = F.pettyRows(ledger, uses, staff);
  assert.deepEqual([a1.balance, a1.low, a1.suggest], [42000, false, 8000]);
  assert.deepEqual([a2.balance, a2.low, a2.suggest], [8000, true, 42000]);
  assert.equal(F.pettyRows(ledger, [], staff)[0].suggest, 0);
  assert.equal(F.pettyUseReady({ userId: 'u01', amount: 100, memo: ' ' }), false);
  assert.equal(F.pettyUseReady({ userId: 'u01', amount: 100, memo: '手袋' }), true);
  });

test('小口金を持つのは、現場で買取をする鑑定士（査定員ではない）', () => {
  assert.ok(F.fieldStaff().length >= 10 && F.fieldStaff().every((u) => u.id.startsWith('u')));
});

test('小口金の申請: 鑑定士の申請は承認待ち。経理部の代行入力は承認済みで、印と入力者が残る。元の一覧は変えない', () => {
  const d = { userId: 'u01', date: '2026-11-02', amount: 3000, memo: ' 手袋 ' };
  const req = F.makePettyUse(d, { by: '鈴木', now: 5 });
  assert.deepEqual([req.status, req.proxy, req.memo, req.by], ['pending', false, '手袋', '鈴木']);
  const prx = F.makePettyUse(d, { by: '経理部', proxy: true, now: 6 });
  assert.deepEqual([prx.status, prx.proxy, prx.by, prx.decidedAt], ['approved', true, '経理部', 6]);
  const list = [];
  assert.equal(F.addPettyUse(list, req).length, 1);
  assert.equal(list.length, 0);
  assert.equal(F.pettyStatusOf({ amount: 1 }), 'approved'); // 状況のない古い記録
});

test('小口金の承認・却下: 承認待ちだけが対象。承認は残りが足りるときだけ。却下は理由必須。承認済みだけが残りから引かれる', () => {
  const staff = [{ id: 'u01', name: '鈴木' }];
  const ledger = [makeEntry({ category: 'petty', amount: 50000, userId: 'u01', date: '2026-11-01' }, { now: 1 })];
  const mk = (id, amount, status = 'pending') => ({ id, userId: 'u01', date: '2026-11-02', amount, memo: 'x', at: 1, status });
  const uses = [mk('p1', 8000), mk('p2', 60000), mk('p3', 5000, 'approved'), mk('p4', 1000, 'rejected')];
  let row = F.pettyRows(ledger, uses, staff)[0];
  assert.deepEqual([row.balance, row.used, row.pendingCount, row.pendingAmount], [45000, 5000, 2, 68000]); // 承認待ち・却下は引かない
  assert.equal(F.decidePettyUse(uses, 'p2', 'approved', { balance: row.balance }), uses); // 残りが足りない
  assert.equal(F.decidePettyUse(uses, 'p1', 'rejected', { reason: ' ' }), uses); // 理由なし
  assert.equal(F.decidePettyUse(uses, 'p3', 'rejected', { reason: 'x' }), uses); // 承認待ちではない
  const ok = F.decidePettyUse(uses, 'p1', 'approved', { balance: row.balance, by: '木村', now: 9 });
  assert.deepEqual([ok[0].status, ok[0].by, ok[0].decidedAt, uses[0].status], ['approved', '木村', 9, 'pending']);
  row = F.pettyRows(ledger, ok, staff)[0];
  assert.equal(row.balance, 37000);
  const rej = F.decidePettyUse(uses, 'p1', 'rejected', { reason: ' 領収書が必要 ' });
  assert.deepEqual([rej[0].status, rej[0].reason], ['rejected', '領収書が必要']);
});

test('小口金の取り下げ: 自分の承認待ちだけ', () => {
  const uses = [{ id: 'p1', userId: 'u01', status: 'pending' }, { id: 'p2', userId: 'u01', status: 'approved' }];
  assert.deepEqual(F.withdrawPettyUse(uses, 'p1', 'u01').map((u) => u.id), ['p2']);
  assert.equal(F.withdrawPettyUse(uses, 'p1', 'u02').length, 2); // 他の鑑定士の申請は取り下げられない
  assert.equal(F.withdrawPettyUse(uses, 'p2', 'u01').length, 2); // 承認済みは取り下げられない
});
