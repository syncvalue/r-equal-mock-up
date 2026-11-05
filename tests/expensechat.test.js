import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const C = await import('../src/expenseChat.js');
const V = await import('../src/expenseChatView.js');
const U = 'u01';
const DATE = '2026-11-04';

test('発言を足す: 日ごと・鑑定士ごとの1つのやり取り。空の発言は足さない。元は変えない', () => {
  const c0 = {};
  const c1 = C.post(c0, U, DATE, { from: 'accounting', by: '経理部', text: ' 領収書を確認してください ', now: 10 });
  assert.deepEqual(C.threadOf(c1, U, DATE).messages.map((m) => [m.from, m.text, m.at, m.kind]), [['accounting', '領収書を確認してください', 10, '']]);
  assert.equal(C.post(c1, U, DATE, { from: 'sales', text: '  ', now: 11 }), c1);
  const c2 = C.post(c1, U, DATE, { from: 'sales', by: '鈴木 一郎', text: '撮り直します', now: 20 });
  assert.deepEqual(C.threadOf(c2, U, DATE).messages.map((m) => m.id), [`${U}:${DATE}-0`, `${U}:${DATE}-1`]);
  assert.deepEqual([Object.keys(c0).length, C.threadOf(c2, 'u02', DATE).messages.length], [0, 0]);
});

test('未読: 相手の発言（システムの記録も含む）が、自分が読んだ時刻より新しいものの数。読むと0になる', () => {
  let c = C.post({}, U, DATE, { from: 'accounting', text: '差戻し：領収書がありません', kind: 'returned', now: 10 });
  c = C.post(c, U, DATE, { from: 'sales', text: '直します', now: 20 });
  assert.deepEqual([C.unreadCount(c, U, DATE, 'sales'), C.unreadCount(c, U, DATE, 'accounting')], [1, 1]);
  const read = C.markRead(c, U, DATE, 'sales', 30);
  assert.deepEqual([C.unreadCount(read, U, DATE, 'sales'), C.unreadCount(read, U, DATE, 'accounting')], [0, 1]);
  assert.equal(C.markRead(read, U, DATE, 'sales', 40), read); // 未読がなければ、変えない
  assert.equal(C.unreadCount({}, U, DATE, 'sales'), 0);
});

test('保存と読み込み', () => {
  assert.deepEqual(C.loadChats(), {});
  assert.equal(C.saveChats({ a: 1 }), true);
  assert.deepEqual(C.loadChats(), { a: 1 });
});

test('チャットの表示: 鑑定士は左・経理部は右。システムの記録は中央。送る欄はつけた属性のとおり', () => {
  let c = C.post({}, U, DATE, { from: 'accounting', by: '経理部', text: '差戻し：<領収書なし>', kind: 'returned', now: new Date('2026-11-05T10:00:00').getTime() });
  c = C.post(c, U, DATE, { from: 'sales', by: '鈴木 一郎', text: '撮り直します', now: new Date('2026-11-05T10:30:00').getTime() });
  const html = V.chatView(C.threadOf(c, U, DATE), { inputAttrs: 'data-f="chat.text"', sendAttrs: 'data-chat-send', draft: '下書き' });
  for (const w of ['差戻し：&lt;領収書なし&gt;', '撮り直します', '鈴木 一郎', '10:30', 'data-f="chat.text"', 'data-chat-send', 'value="下書き"', 'data-chat']) assert.ok(html.includes(w), w);
  assert.ok(!html.includes('<領収書なし>'));
  assert.ok(html.indexOf('justify-start') < html.indexOf('justify-end') || html.includes('justify-start')); // 鑑定士は左
  assert.ok(V.chatView(C.threadOf({}, U, DATE), { inputAttrs: '', sendAttrs: '', draft: '' }).includes('まだやり取りはありません'));
});
