import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleReservations } from '../callcenter/samples.js';
import { formFromRecord } from '../callcenter/record.js';
import { blankForm } from '../callcenter/form.js';
import { isAbsent } from '../src/dispatch.js';
import { needsReview, isTentative, isCancelled, openReservationsFor } from '../src/reservations.js';

const NOW = new Date(2026, 9, 24, 9, 0);
const list = sampleReservations(NOW);
const ymd = (off) => { const d = new Date(2026, 9, 24 + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test('サンプルの受付: 今日から3日後までの見本が、全種類そろう', () => {
  assert.equal(list.length, 12);
  assert.ok(list.some((r) => r.date === ymd(2) && isTentative(r) && !needsReview(r))); // 翌々日の仮確定
  assert.ok(list.some((r) => r.status === 'confirmed')); // 確定済み
  assert.ok(list.some(needsReview)); // 確定済みが変更されて仮確定に戻った
  assert.ok(list.some(isCancelled)); // 取消
  assert.ok(list.filter((r) => r.date === ymd(2)).length >= 5);
  assert.deepEqual([...new Set(list.map((r) => r.areaId))].sort(), ['hyogo', 'kanto', 'osaka', 'tokai']);
});

test('サンプルの受付: 営業の予定が重ならず、欠勤の営業も割り当てない', () => {
  const live = list.filter((r) => !isCancelled(r));
  live.forEach((r) => assert.equal(isAbsent(r.userId, r.date, NOW), false));
  for (const a of live) for (const b of live) {
    if (a.id >= b.id || a.userId !== b.userId || a.date !== b.date) continue;
    assert.ok(a.end <= b.start || b.end <= a.start, `${a.id} と ${b.id} が重なる`);
  }
});

test('サンプルの受付: 全項目を、変更用の入力に戻せる。必須項目がそろっている', () => {
  list.forEach((r) => {
    const f = formFromRecord(r, blankForm(NOW));
    assert.ok(f.lastName && f.firstName && f.lastKana && f.firstKana && f.phone && f.gender && f.age && f.address, r.id);
    assert.ok(f.chirashi !== null && (f.cats.length || Object.values(f.mainItems).some((n) => n > 0) || f.wants), r.id);
  });
});

test('サンプルの受付: 電話番号から、受付済みの予約が見つかる（山田 花子）', () => {
  const found = openReservationsFor(list, ['090-2468-1357'], ymd(0));
  assert.equal(found.length, 1);
  assert.equal(found[0].customer.name, '山田 花子');
});
