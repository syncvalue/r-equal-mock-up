import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { sampleVisits } = await import('../src/storeSample.js');
const V = await import('../src/storeVisits.js');

const NOW = new Date(2026, 9, 25, 11, 0).getTime();
const STORES = ['S-NAMBA', 'S-SHINJUKU'];

test('サンプルの来店: 店舗ごとに、待ち・予約・完了が今日にある。明日の予約もある。IDは重複しない', () => {
  const list = sampleVisits(NOW, STORES);
  for (const id of STORES) {
    const b = V.boardOf(list, id, '2026-10-25');
    assert.ok(b.waiting.length >= 1 && b.reserved.length >= 1 && b.done.length >= 1, id);
  }
  assert.ok(V.boardOf(list, 'S-NAMBA', '2026-10-26').reserved.length >= 1);
  assert.equal(new Set(list.map((v) => v.id)).size, list.length);
});

test('サンプルの来店: 予約には受けたオペレーター、完了には買取の結果がある。過去に買取のあるお客様（山田 花子）の予約が含まれる', () => {
  const list = sampleVisits(NOW, STORES);
  assert.ok(list.filter((v) => v.status === 'reserved').every((v) => v.createdBy && v.time && v.customer.phone));
  assert.ok(list.filter((v) => v.status === 'done').every((v) => v.result && v.staffName && v.endedAt));
  assert.ok(list.some((v) => v.customer.phone === '090-2468-1357' && v.status === 'reserved'));
  // 時刻は、今（11:00）より前に来店済みの待ち・完了、あとに来店の予約
  assert.ok(list.filter((v) => v.status === 'reserved' && v.date === '2026-10-25').every((v) => v.time > '11:00'));
});

test('店舗がなければ、空', () => {
  assert.deepEqual(sampleVisits(NOW, []), []);
});
