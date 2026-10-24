import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { busyBlocks, hiddenBlocks, canPlace } = await import('../src/dispatch.js');
const { reservationFromBlock } = await import('../callcenter/adopt.js');
const { addReservation, loadReservations, amendReservation, addMovedId, loadMovedIds, reservationEvents } = await import('../src/reservations.js');
const { eventsOfDay } = await import('../src/schedule.js');

const NOW = new Date(2026, 9, 21, 9, 0);
const sync = () => { hiddenBlocks.clear(); loadMovedIds().forEach((id) => hiddenBlocks.add(id)); };
beforeEach(() => { store.clear(); sync(); });

test('営業の予定（灰色）を予約として取り込んで動かすと、元の位置から外れる（営業アプリの予定からも）', () => {
  const [first] = busyBlocks('u01', '2026-10-21', [], NOW); // u01 今日 10:00-11:30 山田 太郎
  assert.equal(first.source, 'event');
  assert.ok(first.gid);
  const rec = reservationFromBlock(first, { userId: 'u01', date: '2026-10-21', now: NOW });
  assert.deepEqual([rec.status, rec.start, rec.end, rec.customer.name, rec.userId], ['confirmed', '10:00', '11:30', '山田 太郎', 'u01']);
  addReservation(rec);
  addMovedId(first.gid);
  sync();
  amendReservation(rec.id, { userId: 'u09', start: '14:00', end: '15:30' }, '配車係', [], { notify: false });
  // 元の位置（u01 10:00）には、予定が残らない。ダミーの予定も足されない
  assert.equal(busyBlocks('u01', '2026-10-21', loadReservations(), NOW).some((b) => b.gid === first.gid), false);
  const moved = busyBlocks('u09', '2026-10-21', loadReservations(), NOW).find((b) => b.source === 'reservation');
  assert.deepEqual([moved.start, moved.end, moved.status], [840, 930, 'tentative']);
  // 営業アプリ側: 元の予定は外れ、確定されるまで新しい位置にも出ない
  assert.equal(eventsOfDay(0, 'u01').some((e) => e.id === first.gid), false);
  assert.equal(reservationEvents(NOW).length, 0);
});

test('ダミーの他の訪問（灰色）も、予約として取り込める。取り込んだ元の位置には、もう出ない', () => {
  const date = ['2026-10-27', '2026-10-28', '2026-10-29', '2026-11-02'].find((d) => busyBlocks('u02', d, [], NOW).some((b) => b.source === 'dummy'));
  const block = busyBlocks('u02', date, [], NOW).find((b) => b.source === 'dummy');
  assert.match(block.gid, /^flr:u02\//);
  const rec = reservationFromBlock(block, { userId: 'u02', date, now: NOW });
  assert.equal(rec.customer.address, block.place);
  assert.equal(rec.customer.name + ' 様', block.label);
  addMovedId(block.gid);
  sync();
  assert.equal(busyBlocks('u02', date, [], NOW).some((b) => b.gid === block.gid), false);
});

test('取り込む前の予定を動かすときは、その予定自身を重なりに数えない', () => {
  const [first] = busyBlocks('u01', '2026-10-21', [], NOW); // 10:00-11:30
  const pseudo = { id: `AD-${first.gid}`, gid: first.gid, userId: 'u01', date: '2026-10-21', start: '10:00', end: '11:30' };
  assert.equal(canPlace(pseudo, 'u01', 10 * 60 + 30, [], NOW).ok, true); // 同じ営業で、30分ずらす（自分自身とは重ならない）
  const other = busyBlocks('u01', '2026-10-21', [], NOW).find((b) => b.gid !== first.gid); // 13:00-14:00
  assert.equal(canPlace(pseudo, 'u01', other.start, [], NOW).ok, false); // 別の予定とは重なる
});
