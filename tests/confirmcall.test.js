import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALL_RESULTS, confirmDateOf, addConfirmCall, confirmStatus, confirmPending, monthCells } from '../src/confirmCall.js';

const visit = (o = {}) => ({ id: 'R1', date: '2026-10-30', status: 'confirmed', ...o });
const at = new Date(2026, 9, 29, 10, 5);

test('前日確認の日は、訪問の前日（月をまたいでも）', () => {
  assert.equal(confirmDateOf('2026-10-30'), '2026-10-29');
  assert.equal(confirmDateOf('2026-11-01'), '2026-10-31');
  assert.equal(confirmDateOf('2027-01-01'), '2026-12-31');
});

test('連絡の記録を足す: つながった／つながらなかった。結果と、誰が・いつ・メモが残る（元の記録は変えない）', () => {
  const r = visit();
  const a = addConfirmCall(r, { result: 'noanswer', memo: '  留守電に入れた ', by: '佐藤', at });
  assert.equal(a.ok, true);
  assert.deepEqual(a.fields.confirmCalls, [{ result: 'noanswer', memo: '留守電に入れた', by: '佐藤', at: at.getTime() }]);
  assert.equal(r.confirmCalls, undefined);
  const b = addConfirmCall({ ...r, ...a.fields }, { result: 'reached', memo: '10時に変更したい', by: '渡辺', at });
  assert.equal(b.fields.confirmCalls.length, 2);
  assert.equal(b.fields.confirmCalls[1].memo, '10時に変更したい');
});

test('結果が不正、記録した人がいないときは記録しない。つながった場合のメモは空でもよい', () => {
  assert.equal(addConfirmCall(visit(), { result: 'x', memo: '', by: '佐藤', at }).ok, false);
  assert.equal(addConfirmCall(visit(), { result: 'reached', memo: '', by: '', at }).ok, false);
  assert.equal(addConfirmCall(visit(), { result: 'reached', memo: '', by: '佐藤', at }).ok, true);
  assert.deepEqual(Object.keys(CALL_RESULTS), ['reached', 'noanswer']);
});

test('取消した受付には記録できない', () => {
  const r = addConfirmCall(visit({ status: 'cancelled' }), { result: 'reached', memo: '', by: '佐藤', at });
  assert.equal(r.ok, false);
});

test('状態: 未連絡／不通（回数）／連絡済み。一度つながれば、その後の不通があっても連絡済み', () => {
  assert.equal(confirmStatus(visit()).key, 'none');
  const no = (n) => visit({ confirmCalls: Array.from({ length: n }, () => ({ result: 'noanswer', memo: '', by: '佐藤', at: 1 })) });
  assert.deepEqual([confirmStatus(no(2)).key, confirmStatus(no(2)).label], ['noanswer', '不通 2回']);
  const done = visit({ confirmCalls: [{ result: 'reached', memo: 'OK', by: '佐藤', at: 1 }, { result: 'noanswer', memo: '', by: '佐藤', at: 2 }] });
  assert.equal(confirmStatus(done).key, 'reached');
  assert.equal(confirmStatus(done).label, '連絡済み');
  assert.equal(confirmStatus(done).last.at, 2);
});

test('今日連絡する訪問（明日の訪問で、まだつながっていない・取消でない）を数える', () => {
  const list = [
    visit({ id: 'a' }), visit({ id: 'b', confirmCalls: [{ result: 'reached', memo: '', by: 'x', at: 1 }] }),
    visit({ id: 'c', confirmCalls: [{ result: 'noanswer', memo: '', by: 'x', at: 1 }] }), visit({ id: 'd', status: 'cancelled' }),
    visit({ id: 'e', date: '2026-10-31' }), visit({ id: 'f', status: 'tentative' }),
  ];
  assert.deepEqual(confirmPending(list, '2026-10-29').map((r) => r.id), ['a', 'c', 'f']);
  assert.deepEqual(confirmPending(list, '2026-10-30').map((r) => r.id), ['e']);
});

test('月のカレンダー: 日曜はじまりの週ごと。日ごとの件数（取消は除く）と、仮確定の件数', () => {
  const list = [visit({ id: 'a' }), visit({ id: 'b', status: 'tentative' }), visit({ id: 'c', status: 'cancelled' }), visit({ id: 'd', date: '2026-09-28' })];
  const weeks = monthCells('2026-10', list, '2026-10-29');
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(weeks[0][0].date, '2026-09-27'); // 2026-10-01は木曜
  assert.equal(weeks[0][0].inMonth, false);
  const cells = weeks.flat();
  const d30 = cells.find((c) => c.date === '2026-10-30');
  assert.deepEqual([d30.count, d30.tentative, d30.inMonth], [2, 1, true]);
  assert.equal(cells.find((c) => c.date === '2026-09-28').count, 1); // 前後の月の日にも件数を出す
  assert.equal(cells.find((c) => c.date === '2026-10-29').today, true);
  assert.equal(cells.at(-1).date, '2026-10-31');
});

test('カレンダーの日に、前日確認が未の件数を付ける（今日連絡する日＝明日の訪問だけ）', () => {
  const list = [visit({ id: 'a' }), visit({ id: 'b', confirmCalls: [{ result: 'reached', memo: '', by: 'x', at: 1 }] })];
  const cells = monthCells('2026-10', list, '2026-10-29').flat();
  assert.equal(cells.find((c) => c.date === '2026-10-30').pending, 1);
  assert.equal(monthCells('2026-10', list, '2026-10-20').flat().find((c) => c.date === '2026-10-30').pending, 0);
});
