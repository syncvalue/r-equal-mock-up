import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactWindow, sortByContactTime, notYetReached } from '../src/confirmCall.js';

const r = (id, contact, start = '10:00', confirmCalls) => ({ id, start, hearing: { contact }, confirmCalls });

test('連絡時間の始まりを読む。片側だけ・指定なし・未確認も', () => {
  assert.deepEqual(contactWindow(r('a', '17:00〜19:00')), { rank: 0, start: 1020, end: 1140 });
  assert.deepEqual(contactWindow(r('a', '〜19:00')), { rank: 0, start: 0, end: 1140 });
  assert.deepEqual(contactWindow(r('a', '9:30〜')), { rank: 0, start: 570, end: 1440 });
  assert.equal(contactWindow(r('a', '指定なし')).rank, 1);
  assert.equal(contactWindow(r('a', '未確認')).rank, 2);
  assert.equal(contactWindow({ id: 'x' }).rank, 2);
});

test('電話をかける順: 連絡時間の早い順、そのあと指定なし、未確認。同じなら訪問の時刻順。元の配列は変えない', () => {
  const list = [r('un', '未確認'), r('eve', '17:00〜19:00'), r('any', '指定なし'), r('noon2', '12:00〜14:00', '13:00'), r('noon1', '12:00〜14:00', '09:00'), r('am', '09:00〜11:00')];
  assert.deepEqual(sortByContactTime(list).map((x) => x.id), ['am', 'noon1', 'noon2', 'eve', 'any', 'un']);
  assert.equal(list[0].id, 'un');
});

test('まだつながっていない訪問だけ（未連絡・不通）。つながった記録が一度でもあれば除く', () => {
  const list = [r('none', 'x'), r('no', 'x', '10:00', [{ result: 'noanswer' }]), r('ok', 'x', '10:00', [{ result: 'noanswer' }, { result: 'reached' }])];
  assert.deepEqual(notYetReached(list).map((x) => x.id), ['none', 'no']);
});
