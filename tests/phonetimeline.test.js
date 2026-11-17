import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pastVisitRows } from '../callcenter/phoneTimeline.js';

const ms = (s) => new Date(`${s}T10:00:00`).getTime();
const res = (o) => ({ id: o.id, status: 'confirmed', date: o.date, start: o.start ?? '10:00', end: o.end ?? '11:30', userId: 'u01', customer: { phone: o.phone ?? '090-2468-1357' }, hearing: { wants: o.wants ?? 'バッグ' }, ...o });
const base = { phones: ['09024681357'], today: '2026-11-17', nameOf: () => '西田' };

test('過去の訪問: 訪問済みの受付に、同じ日の買取を結びつける。これからの予約は入れない', () => {
  const rows = pastVisitRows({
    ...base,
    reservations: [res({ id: 'a', date: '2026-08-03' }), res({ id: 'b', date: '2026-11-20' }), res({ id: 'x', date: '2026-08-03', phone: '080-0000-0000' })],
    visits: [{ at: ms('2026-08-03'), items: 'ブランドバッグ', total: 185000, lines: [{ name: 'スピーディ', qty: 1, price: 95000 }] }],
  });
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].kind, rows[0].date, rows[0].total, rows[0].reserved, rows[0].staff], ['visited', '2026-08-03', 185000, true, '西田']);
  assert.equal(rows[0].lines.length, 1);
});

test('過去の訪問: 受付のない買取も出す。取消は「取消」として出し、買取の合計に入れない。新しい順', () => {
  const rows = pastVisitRows({
    ...base,
    reservations: [res({ id: 'c', date: '2026-09-01', status: 'cancelled', cancelReason: 'お客様のご都合（やめる）' }), res({ id: 'd', date: '2026-10-05' })],
    visits: [{ at: ms('2026-04-12'), items: '腕時計', total: 420000 }],
  });
  assert.deepEqual(rows.map((r) => [r.date, r.kind]), [['2026-10-05', 'visited'], ['2026-09-01', 'cancelled'], ['2026-04-12', 'visited']]);
  assert.equal(rows[0].total, 0); // 訪問したが、買取の記録なし
  assert.equal(rows[1].note, 'お客様のご都合（やめる）');
  assert.equal(rows[2].reserved, false);
  assert.equal(rows[2].lines.length, 1); // 内訳がない記録は、品目と合計から1行
});

test('過去の訪問: 同じ日に見送った商品の点数を添える', () => {
  const rows = pastVisitRows({ ...base, reservations: [], visits: [{ at: ms('2026-04-12'), items: '腕時計', total: 420000 }], declined: [{ at: ms('2026-04-12'), items: [{ name: 'ロレックス', qty: 1 }, { name: 'オメガ', qty: 2 }] }] });
  assert.equal(rows[0].declinedCount, 3);
});

test('過去の訪問: 電話番号が無効なら空', () => {
  assert.deepEqual(pastVisitRows({ ...base, phones: ['', '090'], reservations: [res({ id: 'a', date: '2026-08-03' })], visits: [] }), []);
});
