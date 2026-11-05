import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const A = await import('../src/advanceRequest.js');

test('補充の依頼: 金額が1円以上なら出せる。作ると、やり取り中になる', () => {
  assert.equal(A.requestReady({ amount: 0, memo: 'x' }), false);
  assert.equal(A.requestReady({ amount: 200000, memo: '' }), true);
  const r = A.makeRequest('u03', { amount: 200000, memo: ' 高額案件の予定 ' }, 5);
  assert.deepEqual([r.userId, r.amount, r.memo, r.status, r.at, r.closedAt], ['u03', 200000, '高額案件の予定', 'open', 5, null]);
  assert.ok(r.id.startsWith('AR-'));
});

test('完了にできるのは、依頼を出した鑑定士だけ（経理部はできない）。やり取り中の依頼だけが対象。元の一覧は変えない', () => {
  const a = A.makeRequest('u03', { amount: 1 }, 1);
  const list = [a];
  assert.equal(A.closeRequest(list, a.id, 'u04'), list); // ほかの鑑定士は完了にできない
  const done = A.closeRequest(list, a.id, 'u03', { now: 9 });
  assert.deepEqual([done[0].status, done[0].closedAt, list[0].status], ['closed', 9, 'open']);
  assert.equal(A.closeRequest(done, a.id, 'u03', { now: 20 })[0].closedAt, 9); // 完了した依頼は、変えない
});

test('ボール: 完了した依頼は誰も持たない。経理部は、鑑定士の発言（または、まだ発言がない）を待つ。鑑定士の返信待ちなら、鑑定士が持つ', () => {
  const r = A.makeRequest('u03', { amount: 1 }, 1);
  assert.equal(A.requestBall(r, A.advThread({}, r.id)), 'accounting'); // 発言がない
  const asked = A.postAdv({}, r.id, { from: 'sales', text: '補充を依頼します', now: 2 });
  assert.equal(A.requestBall(r, A.advThread(asked, r.id)), 'accounting');
  const answered = A.postAdv(asked, r.id, { from: 'accounting', text: '10万円ではどうですか？', now: 3 });
  assert.equal(A.requestBall(r, A.advThread(answered, r.id)), 'sales');
  assert.equal(A.requestBall({ ...r, status: 'closed' }, A.advThread(answered, r.id)), null);
});

test('一覧: やり取り中は古い順。経理部の番（ボール）だけを数えられる。自分の依頼は新しい順。昔の状態名（依頼中・振込済み・却下）も読める', () => {
  const a = A.makeRequest('u01', { amount: 1 }, 10);
  const b = A.makeRequest('u02', { amount: 2 }, 5);
  const c = { ...A.makeRequest('u01', { amount: 3 }, 20), status: 'closed' };
  const list = [a, b, c];
  assert.deepEqual(A.openRequests(list).map((r) => r.userId), ['u02', 'u01']);
  assert.deepEqual(A.openRequests(list, ['u01']).map((r) => r.userId), ['u01']);
  let chats = A.postAdv({}, b.id, { from: 'sales', text: 'x', now: 1 });
  chats = A.postAdv(chats, b.id, { from: 'accounting', text: '返信', now: 2 });
  assert.deepEqual(A.accountingTurn(list, chats).map((r) => r.id), [a.id]); // b は、鑑定士の返信待ち
  assert.deepEqual(A.requestsOf(list, 'u01').map((r) => r.at), [20, 10]);
  mem.set('rq-mock-advance-requests', JSON.stringify([{ id: 'x1', status: 'pending' }, { id: 'x2', status: 'done' }, { id: 'x3', status: 'rejected' }]));
  assert.deepEqual(A.loadRequests().map((r) => r.status), ['open', 'closed', 'closed']);
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
