import { test } from 'node:test';
import assert from 'node:assert/strict';

const B = await import('../src/ball.js');
const C = await import('../src/expenseChat.js');

const T = (...msgs) => msgs.reduce((c, m, i) => C.post(c, 'u01', '2026-11-04', { ...m, now: i + 1 }), {});
const thread = (...msgs) => C.threadOf(T(...msgs), 'u01', '2026-11-04');
const acc = (text, kind = '') => ({ from: 'accounting', text, kind });
const sal = (text, kind = '') => ({ from: 'sales', text, kind });
const base = { closed: true, isToday: false };

test('ボール: チェック済みは誰も持たない。提出前の今日の分も、誰も持たない', () => {
  assert.equal(B.ballOf({ ...base, status: 'ok', thread: thread() }).ball, null);
  assert.equal(B.ballOf({ closed: false, isToday: true, status: 'pending', thread: thread() }).ball, null);
});

test('ボール: 未チェックは経理部が持つ。経理部が質問して返信待ちのときだけ、鑑定士が持つ', () => {
  assert.deepEqual(B.ballOf({ ...base, status: 'pending', thread: thread() }), { ball: 'accounting', why: '未チェック' });
  assert.equal(B.ballOf({ ...base, status: 'pending', thread: thread(acc('領収書を見せてください')) }).ball, 'sales');
  assert.equal(B.ballOf({ ...base, status: 'pending', thread: thread(acc('領収書を見せてください')) }).why, '経理部の質問に返信してください');
  const replied = B.ballOf({ ...base, status: 'pending', thread: thread(acc('質問'), sal('返信です')) });
  assert.deepEqual(replied, { ball: 'accounting', why: '鑑定士から返信があります' });
  const revised = B.ballOf({ ...base, status: 'pending', thread: thread(acc('差戻し', 'returned'), sal('経費を修正しました', 'revised')) });
  assert.deepEqual(revised, { ball: 'accounting', why: '鑑定士が修正しました。もう一度確認してください' });
});

test('ボール: 差戻しは鑑定士が持つ（直すまで）。鑑定士が質問したら、経理部が持つ。日報が未提出の過去日は、経理部が持つ', () => {
  assert.deepEqual(B.ballOf({ ...base, status: 'returned', thread: thread(acc('差戻し', 'returned')) }), { ball: 'sales', why: '差戻しです。経費を修正してください' });
  assert.equal(B.ballOf({ ...base, status: 'returned', thread: thread(acc('差戻し', 'returned'), acc('補足です')) }).ball, 'sales');
  assert.deepEqual(B.ballOf({ ...base, status: 'returned', thread: thread(acc('差戻し', 'returned'), sal('どうすればよいですか？')) }), { ball: 'accounting', why: '鑑定士から質問があります' });
  assert.deepEqual(B.ballOf({ closed: false, isToday: false, status: 'pending', thread: thread() }), { ball: 'accounting', why: '日報が未提出です（確認・差戻しが必要）' });
});

const day = (userId, date, o = {}) => ({ userId, date, startedAt: 1, closedAt: 2, ...o });

test('ボールの一覧: 持っている人ごと。古い日から並ぶ。経過日数がつく', () => {
  const days = [day('u01', '2026-11-02'), day('u01', '2026-11-03'), day('u02', '2026-11-04'), day('u03', '2026-11-04'), day('u04', '2026-11-05', { closedAt: null })];
  const checks = { 'u01:2026-11-03': { status: 'returned', reason: 'x' }, 'u03:2026-11-04': { status: 'ok' } };
  const chats = C.post({}, 'u01', '2026-11-03', { from: 'accounting', kind: 'returned', text: 'x', now: 1 });
  const acct = B.ballList(days, checks, chats, '2026-11-05', 'accounting');
  assert.deepEqual(acct.map((r) => [r.userId, r.date, r.age]), [['u01', '2026-11-02', 3], ['u02', '2026-11-04', 1]]);
  const sales = B.ballList(days, checks, chats, '2026-11-05', 'sales', 'u01');
  assert.deepEqual(sales.map((r) => [r.userId, r.date, r.why]), [['u01', '2026-11-03', '差戻しです。経費を修正してください']]);
  assert.deepEqual(B.ballList(days, checks, chats, '2026-11-05', 'sales', 'u02'), []);
});
