import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const A = await import('../src/advanceRequest.js');

test('補充の依頼: 金額が1円以上なら出せる。作ると、依頼中になる', () => {
  assert.equal(A.requestReady({ amount: 0, memo: 'x' }), false);
  assert.equal(A.requestReady({ amount: 200000, memo: '' }), true);
  const r = A.makeRequest('u03', { amount: 200000, memo: ' 高額案件の予定 ' }, 5);
  assert.deepEqual([r.userId, r.amount, r.memo, r.status, r.at, r.paidAmount], ['u03', 200000, '高額案件の予定', 'pending', 5, 0]);
  assert.ok(r.id.startsWith('AR-'));
});

test('取り下げ: 自分の依頼中だけ。ほかの鑑定士の依頼・決まった依頼は取り下げられない', () => {
  const a = A.makeRequest('u03', { amount: 1 }, 1);
  const done = { ...A.makeRequest('u03', { amount: 2 }, 2), status: 'done' };
  const list = [a, done];
  assert.equal(A.withdrawRequest(list, a.id, 'u04').length, 2);
  assert.equal(A.withdrawRequest(list, done.id, 'u03').length, 2);
  assert.deepEqual(A.withdrawRequest(list, a.id, 'u03').map((r) => r.id), [done.id]);
});

test('経理部の対応: 振り込んだ記録（依頼中だけ）・却下（理由必須）。元の一覧は変えない', () => {
  const a = A.makeRequest('u03', { amount: 100000 }, 1);
  const list = [a];
  const ok = A.approveRequest(list, a.id, { by: '経理部', now: 9 });
  assert.deepEqual([ok[0].status, ok[0].paidAmount, ok[0].by, ok[0].decidedAt, list[0].status], ['done', 100000, '経理部', 9, 'pending']);
  assert.equal(A.approveRequest(ok, a.id)[0].decidedAt, 9); // 決まった依頼は、変えない
  assert.equal(A.approveRequest(list, a.id, { paidAmount: 80000 })[0].paidAmount, 80000); // 相談して、依頼と違う金額で振り込める
  assert.equal(A.rejectRequest(list, a.id, '  '), list);
  const rej = A.rejectRequest(list, a.id, ' すでに30万円あります ', { now: 7 });
  assert.deepEqual([rej[0].status, rej[0].reason, rej[0].decidedAt], ['rejected', 'すでに30万円あります', 7]);
  assert.equal(A.rejectRequest(ok, a.id, 'x')[0].status, 'done');
});

test('一覧: 依頼中は古い順（経理部の対応待ち）。自分の依頼は新しい順。営業所で絞れる。保存と読み込み', () => {
  const a = A.makeRequest('u01', { amount: 1 }, 10);
  const b = A.makeRequest('u02', { amount: 2 }, 5);
  const c = { ...A.makeRequest('u01', { amount: 3 }, 20), status: 'done' };
  const list = [a, b, c];
  assert.deepEqual(A.pendingRequests(list).map((r) => r.userId), ['u02', 'u01']);
  assert.deepEqual(A.pendingRequests(list, ['u01']).map((r) => r.userId), ['u01']);
  assert.deepEqual(A.requestsOf(list, 'u01').map((r) => r.at), [20, 10]);
  assert.deepEqual(A.loadRequests(), []);
  assert.equal(A.saveRequests(list), true);
  assert.equal(A.loadRequests().length, 3);
});

test('依頼ごとのチャット: 依頼のIDで分かれる。相手の発言が未読になり、読むと0になる。経費精算のチャットとは混ざらない', async () => {
  const C = await import('../src/expenseChat.js');
  let c = A.postAdv({}, 'AR-1', { from: 'sales', by: '鈴木', text: '補充を依頼します', now: 1 });
  c = A.postAdv(c, 'AR-1', { from: 'accounting', by: '経理部', text: '10万円ではどうですか？', now: 2 });
  c = A.postAdv(c, 'AR-2', { from: 'sales', text: '別の依頼', now: 3 });
  assert.deepEqual([A.advThread(c, 'AR-1').messages.length, A.advThread(c, 'AR-2').messages.length], [2, 1]);
  assert.deepEqual([A.advUnread(c, 'AR-1', 'sales'), A.advUnread(c, 'AR-1', 'accounting')], [1, 1]);
  assert.equal(A.advUnread(A.markAdvRead(c, 'AR-1', 'sales', 9), 'AR-1', 'sales'), 0);
  assert.equal(C.threadOf(c, 'u01', '2026-11-04').messages.length, 0);
});
