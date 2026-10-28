import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORE_TIMES, storeCapacity, storeWeek } from '../src/storeSlots.js';

const NOW = new Date(2026, 9, 29, 11, 10).getTime(); // 2026-10-29 11:10
const dates = ['2026-10-29', '2026-10-30', '2026-10-31'];
const visit = (o) => ({ id: 'v', storeId: 'S-NAMBA', source: 'reserved', status: 'reserved', date: '2026-10-30', time: '14:00', customer: { name: 'x', phone: '1' }, ...o });
const staff = (storeId, active = true) => ({ id: `${storeId}-${active}-${Math.random()}`, role: 'store', storeId, active });

test('来店の時刻は、10:00〜18:30の30分刻み（18枠）', () => {
  assert.equal(STORE_TIMES.length, 18);
  assert.deepEqual([STORE_TIMES[0], STORE_TIMES.at(-1)], ['10:00', '18:30']);
});

test('同じ時刻に受けられる来店の数は、その店舗の有効な店舗スタッフの人数（最低1）', () => {
  const emp = [staff('S-NAMBA'), staff('S-NAMBA'), staff('S-NAMBA', false), staff('S-SHINJUKU'), { id: 'x', role: 'sales', storeId: 'S-NAMBA', active: true }];
  assert.equal(storeCapacity(emp, 'S-NAMBA'), 2);
  assert.equal(storeCapacity(emp, 'S-SHINJUKU'), 1);
  assert.equal(storeCapacity(emp, 'S-NONE'), 1);
});

test('週の空き: 日ごと・時刻ごとに、予約の数と空きの数。取消・来ず・飛び込み（時刻なし）・別の店舗は数えない', () => {
  const list = [visit({}), visit({ id: 'b' }), visit({ id: 'c', status: 'cancelled' }), visit({ id: 'd', status: 'noshow' }), visit({ id: 'e', source: 'walkin', time: '' }), visit({ id: 'f', storeId: 'S-SHINJUKU' }), visit({ id: 'g', time: '14:30' })];
  const w = storeWeek({ visits: list, storeId: 'S-NAMBA', dates, capacity: 3, now: NOW });
  assert.equal(w.length, 3);
  const slot = (date, time) => w.find((d) => d.date === date).slots.find((s) => s.time === time);
  assert.deepEqual([slot('2026-10-30', '14:00').booked, slot('2026-10-30', '14:00').free], [2, 1]);
  assert.equal(slot('2026-10-30', '14:30').booked, 1);
  assert.equal(slot('2026-10-30', '10:00').booked, 0);
  assert.equal(slot('2026-10-30', '14:00').ratio, 2 / 3);
  assert.equal(slot('2026-10-30', '14:00').full, false);
});

test('満席・過ぎた時刻は、選べない（full / past）。今日の、いまより前の枠と、過去の日が過ぎた枠', () => {
  const list = [visit({}), visit({ id: 'b' })];
  const w = storeWeek({ visits: list, storeId: 'S-NAMBA', dates: ['2026-10-28', ...dates], capacity: 2, now: NOW });
  const slot = (date, time) => w.find((d) => d.date === date).slots.find((s) => s.time === time);
  assert.equal(slot('2026-10-30', '14:00').full, true);
  assert.equal(slot('2026-10-30', '14:00').free, 0);
  assert.equal(slot('2026-10-29', '10:30').past, true); // 11:10より前
  assert.equal(slot('2026-10-29', '11:00').past, true);
  assert.equal(slot('2026-10-29', '11:30').past, false);
  assert.equal(slot('2026-10-28', '15:00').past, true);
  assert.equal(slot('2026-10-30', '10:00').past, false);
});
