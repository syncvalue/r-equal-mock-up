import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messagesOf, threadFor, addMessage, closeThread, canApprove, hasUnread, markRead } from '../src/appraisalThread.js';

const base = { id: 'AP1', visitId: 'V1', itemId: 'I1', createdAt: 1000, note: '傷あり', photos: ['p1'], status: '依頼中', reply: null };

test('古い形式の依頼（備考・写真・回答）も、チャットの発言として読める', () => {
  const legacy = { ...base, status: '回答済み', reply: { price: 90000, rank: 'B', comment: '減額です', at: 2000 } };
  const m = messagesOf(legacy);
  assert.deepEqual(m.map((x) => x.from), ['sales', 'hq']);
  assert.equal(m[0].text, '傷あり');
  assert.deepEqual(m[0].photos, ['p1']);
  assert.equal(m[1].price, 90000);
});

test('商品ごとに、同じ訪問の最新の依頼を1つのやり取りとして扱う', () => {
  const list = [{ ...base, id: 'A', createdAt: 1 }, { ...base, id: 'B', createdAt: 5 }, { ...base, id: 'C', visitId: 'V2', createdAt: 9 }];
  assert.equal(threadFor(list, 'V1', 'I1').id, 'B');
  assert.equal(threadFor(list, 'V1', 'I9'), null);
});

test('営業が話すと「依頼中」、査定員が話すと「回答済み」。完結後に営業が話すと再開する', () => {
  let t = addMessage(base, { from: 'hq', text: '型番は？', at: 2000 });
  assert.equal(t.status, '回答済み');
  t = addMessage(t, { from: 'sales', text: 'AB123です', at: 3000 });
  assert.equal(t.status, '依頼中');
  t = closeThread(addMessage(t, { from: 'hq', text: '了解', at: 4000 }), 5000);
  assert.equal(t.status, '完結');
  assert.equal(t.closedAt, 5000);
  t = addMessage(t, { from: 'sales', text: '追加で…', at: 6000 });
  assert.equal(t.status, '依頼中');
  assert.equal(t.closedAt, null);
  assert.equal(messagesOf(t).length, 5);
});

test('addMessage は元の記録を書き換えない', () => {
  const before = JSON.stringify(base);
  addMessage(base, { from: 'hq', text: 'x', at: 2 });
  assert.equal(JSON.stringify(base), before);
});

test('承認の条件: 査定依頼がなければ承認できる。依頼があれば、完結しているときだけ', () => {
  assert.equal(canApprove([], 'V1', 'I1').ok, true);
  const open = canApprove([base], 'V1', 'I1');
  assert.equal(open.ok, false);
  assert.match(open.reason, /完結/);
  assert.equal(canApprove([closeThread(base, 9)], 'V1', 'I1').ok, true);
  assert.equal(canApprove([base], 'V1', 'I2').ok, true); // 別の商品には影響しない
});

test('未読: 相手の最後の発言が、自分の既読より新しいとき', () => {
  let t = addMessage(base, { from: 'hq', text: 'a', at: 2000 });
  assert.equal(hasUnread(t, 'sales'), true);
  assert.equal(hasUnread(t, 'hq'), true); // 営業の最初の依頼を、まだ読んでいない
  t = markRead(t, 'sales', 2500);
  assert.equal(hasUnread(t, 'sales'), false);
  t = markRead(t, 'hq', 2500);
  assert.equal(hasUnread(t, 'hq'), false);
});
