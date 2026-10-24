import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// 保存先（localStorage）の代わり
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { addReservation, loadReservations, updateReservation, reservationEvents, isTentative } = await import('../src/reservations.js');

const NOW = new Date(2026, 9, 24, 9, 0);
const rec = (o) => ({
  id: 'r1', receptionNo: 'CC-1', receivedAt: '', operator: '佐藤', userId: 'u01', date: '2026-10-26', start: '10:00', end: '11:30', apType: '新', lat: 0, lng: 0,
  hearing: { wants: 'バッグ', notes: '' }, customer: { name: 'A', kana: '', phone: '', zip: '', address: '' }, gender: 'f', ...o,
});

beforeEach(() => store.clear());

test('仮確定の訪問は、営業のタブレットの予定に出ない。配車係が確定すると出る', () => {
  addReservation(rec({ status: 'tentative' }));
  assert.equal(isTentative(loadReservations()[0]), true);
  assert.equal(reservationEvents(NOW).length, 0);
  updateReservation('r1', { status: 'confirmed', confirmedBy: '配車係' });
  assert.equal(isTentative(loadReservations()[0]), false);
  assert.deepEqual(reservationEvents(NOW).map((e) => [e.id, e.userId, e.day]), [['r1', 'u01', 2]]);
});

test('状態がない古い記録は、確定済みとして扱う', () => {
  addReservation(rec({}));
  assert.equal(reservationEvents(NOW).length, 1);
});

test('担当の変更と、仮に戻す', () => {
  addReservation(rec({ status: 'tentative' }));
  updateReservation('r1', { userId: 'u03' });
  assert.equal(loadReservations()[0].userId, 'u03');
  updateReservation('r1', { status: 'confirmed' });
  updateReservation('r1', { status: 'tentative', confirmedAt: null });
  assert.equal(reservationEvents(NOW).length, 0);
});
