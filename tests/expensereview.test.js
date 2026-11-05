import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const R = await import('../src/expenseReview.js');
const ex = (o) => ({ id: 'e1', at: 1, type: 'gas', amount: 1000, memo: 'ガソリン', photo: 'data:x', ...o });
const day = (userId, date, expenses) => ({ userId, date, expenses });

test('確認のポイント: 領収書なし・高額・その他・内容なし。経理代行は領収書なしでも指摘しない', () => {
  assert.deepEqual(R.claimFlags(ex()), []);
  assert.ok(R.claimFlags(ex({ photo: null })).some((f) => f.level === 'danger' && f.text.includes('領収書')));
  assert.equal(R.claimFlags(ex({ photo: null, proxy: true })).length, 0);
  assert.ok(R.claimFlags(ex({ amount: 10000 })).some((f) => f.text.includes('高額')));
  assert.ok(R.claimFlags(ex({ type: 'other' })).some((f) => f.text.includes('その他')));
  assert.ok(R.claimFlags(ex({ memo: ' ' })).some((f) => f.text.includes('内容')));
});

test('経費の一覧: 買取代金は対象外。確認結果と結びつけ、新しい順', () => {
  const days = [
    day('u01', '2026-11-02', [ex({ id: 'a', at: 10 }), ex({ id: 'p', type: 'purchase', amount: 90000, photo: null, auto: true })]),
    day('u02', '2026-11-03', [ex({ id: 'b', at: 20, photo: null })]),
  ];
  const reviews = { a: { status: 'approved', reason: '' } };
  const list = R.claimsFrom(days, reviews);
  assert.deepEqual(list.map((c) => [c.id, c.status, c.userId]), [['b', 'pending', 'u02'], ['a', 'approved', 'u01']]);
  assert.deepEqual(R.claimCounts(list), { pending: 1, approved: 1, returned: 0, pendingAmount: 1000, approvedAmount: 1000 });
});

test('精算・差戻し: 差戻しは理由必須。未確認に戻せる。元の確認結果は変えない', () => {
  const r0 = {};
  const r1 = R.approve(r0, 'a', { now: new Date('2026-11-05T10:00:00').getTime() });
  assert.deepEqual([r1.a.status, r1.a.date, Object.keys(r0).length], ['approved', '2026-11-05', 0]);
  assert.equal(R.returnClaim(r1, 'b', '  '), r1); // 理由がなければ変えない
  const r2 = R.returnClaim(r1, 'b', ' 日付が読めない ', { by: '木村' });
  assert.deepEqual([r2.b.status, r2.b.reason, r2.b.by], ['returned', '日付が読めない', '木村']);
  assert.deepEqual(Object.keys(R.reopen(r2, 'a')), ['b']);
  assert.equal(R.loadReviews().x, undefined);
});

test('領収書のない経費は精算できない（経理代行は除く）', () => {
  assert.equal(R.canApprove({ photo: null }), false);
  assert.equal(R.canApprove({ photo: null, proxy: true }), true);
  assert.equal(R.canApprove({ photo: 'data:x' }), true);
});
