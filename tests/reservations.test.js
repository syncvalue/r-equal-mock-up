import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// 保存先（localStorage）の代わり
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { addReservation, loadReservations, updateReservation, reservationEvents, isTentative, isCancelled, cancelReservation, amendReservation, needsReview, acknowledgeReservation, reviewDiffs, openReservationsFor } = await import('../src/reservations.js');

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

test('取消: 記録は残し、営業のタブレットの予定からは外れる', () => {
  addReservation(rec({ status: 'confirmed' }));
  assert.equal(reservationEvents(NOW).length, 1);
  cancelReservation('r1', 'お客様のご都合（やめる）', '佐藤');
  const r = loadReservations()[0];
  assert.deepEqual([r.status, r.cancelReason, r.cancelledBy, isCancelled(r)], ['cancelled', 'お客様のご都合（やめる）', '佐藤', true]);
  assert.equal(reservationEvents(NOW).length, 0);
});

test('仮確定の変更: 仮確定のまま。配車係への知らせ（needsReview）は立てない', () => {
  addReservation(rec({ status: 'tentative' }));
  amendReservation('r1', { date: '2026-10-28', start: '13:00', end: '14:30', userId: 'u02' }, '渡辺', [{ label: '訪問日時', from: 'a', to: 'b' }]);
  const r = loadReservations()[0];
  assert.deepEqual([r.date, r.start, r.userId, r.status, needsReview(r)], ['2026-10-28', '13:00', 'u02', 'tentative', false]);
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].wasConfirmed, false);
});

test('確定済みの変更: 仮確定に戻り、配車係が知れる（needsReview）。確定し直す・確認すると外れる', () => {
  addReservation(rec({ status: 'confirmed', confirmedBy: '配車係', confirmedAt: 'x' }));
  amendReservation('r1', { date: '2026-10-28', userId: 'u02', customer: { name: 'A', phone: '', address: '大阪' } }, '渡辺', [{ label: '訪問日時', from: '10/26', to: '10/28' }]);
  const r = loadReservations()[0];
  assert.deepEqual([r.status, r.confirmedBy, r.confirmedAt, needsReview(r), r.changes[0].wasConfirmed, r.changes[0].by], ['tentative', null, null, true, true, '渡辺']);
  assert.equal(reservationEvents(NOW).length, 0); // 再確定されるまで、営業の予定には出ない
  amendReservation('r1', { start: '09:30' }, '佐藤', [{ label: '訪問日時', from: '13:00', to: '09:30' }]); // 戻った後の再変更でも、知らせは残る
  assert.equal(needsReview(loadReservations()[0]), true);
  assert.deepEqual(reviewDiffs(loadReservations()[0]).map((d) => d.to), ['10/28', '09:30']); // 仮確定に戻った時点からの差分
  acknowledgeReservation('r1');
  assert.equal(needsReview(loadReservations()[0]), false);
});

test('取消すと、確認待ちの知らせは外れる', () => {
  addReservation(rec({ status: 'confirmed' }));
  amendReservation('r1', { start: '09:30' }, '佐藤', []);
  assert.equal(needsReview(loadReservations()[0]), true);
  cancelReservation('r1', 'その他', '配車係');
  assert.equal(needsReview(loadReservations()[0]), false);
});

test('電話番号から、これから訪問する未取消の受付を探す（電話番号2でも）', () => {
  const a = rec({ id: 'a', date: '2026-10-26', customer: { name: 'A', phone: '090-1234-5678', phone2: '06-1111-2222' } });
  const b = rec({ id: 'b', date: '2026-10-24', customer: { name: 'A', phone: '090-1234-5678' } }); // 今日以前
  const c = rec({ id: 'c', date: '2026-10-27', status: 'cancelled', customer: { name: 'A', phone: '090-1234-5678' } }); // 取消済み
  const d = rec({ id: 'd', date: '2026-10-27', customer: { name: 'B', phone: '080-0000-0000' } });
  assert.deepEqual(openReservationsFor([a, b, c, d], ['09012345678'], '2026-10-25').map((r) => r.id), ['a']);
  assert.deepEqual(openReservationsFor([a, d], ['', '06-1111-2222'], '2026-10-25').map((r) => r.id), ['a']);
  assert.deepEqual(openReservationsFor([a], ['090-12'], '2026-10-25'), []); // 短い番号では探さない
});

test('配車係自身が確定済みを変更した場合は、仮確定に戻るが、配車係への知らせは立てない', () => {
  addReservation(rec({ status: 'confirmed' }));
  amendReservation('r1', { start: '09:30' }, '配車係', [], { notify: false });
  const r = loadReservations()[0];
  assert.deepEqual([r.status, needsReview(r)], ['tentative', false]);
});
