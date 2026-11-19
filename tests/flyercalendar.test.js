import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, shiftMonth } from '../src/flyerCalendar.js';

const f = (id, from, to, active = true) => ({ id, from, to, active, media: 'newspaper', name: id, area: 'x', quantity: 1, cost: 0 });

test('配布カレンダー: 月の表は、日曜はじまりの週で、前後の月の日も含めて埋める', () => {
  const g = monthGrid([], '2026-11'); // 2026-11-01 は日曜
  assert.equal(g.length, 5);
  assert.ok(g.every((w) => w.length === 7));
  assert.deepEqual([g[0][0].day, g[0][0].inMonth, g.at(-1)[6].day, g.at(-1)[6].inMonth], ['2026-11-01', true, '2026-12-05', false]);
  assert.equal(monthGrid([], '2026-10')[0][0].day, '2026-09-27'); // 10/1 は木曜
});

test('配布カレンダー: 日ごとに、その日が配布の期間に入る有効なチラシを入れる。期間が複数日なら、毎日に出る', () => {
  const g = monthGrid([f('N1', '2026-11-19', '2026-11-19'), f('P1', '2026-11-17', '2026-11-19'), f('D1', '2026-11-19', '2026-11-19', false)], '2026-11');
  const cell = (day) => g.flat().find((c) => c.day === day);
  assert.deepEqual(cell('2026-11-19').flyers.map((x) => x.id), ['N1', 'P1']);
  assert.deepEqual(cell('2026-11-18').flyers.map((x) => x.id), ['P1']);
  assert.deepEqual(cell('2026-11-20').flyers, []);
});

test('配布カレンダー: 月の移動（年をまたぐ）', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-11', 0), '2026-11');
});
