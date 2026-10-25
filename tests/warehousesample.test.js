import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { buildSample, seedSample, WH_SAMPLE_KEY } = await import('../src/warehouseSample.js');
const W = await import('../src/warehouse.js');

const NOW = new Date(2026, 9, 25, 15, 0).getTime();

test('サンプル: 在庫・出品中・売却済み・クーリングオフ期間中・入庫待ち・返品対応が、すべて揃う', () => {
  seedSample(NOW, true);
  const rows = W.buildRows(W.loadState(), NOW);
  const stages = new Set(rows.map((r) => r.stage));
  for (const s of ['incoming', 'missing', 'stock', 'listed', 'consigned', 'sold', 'returning', 'returned']) assert.ok(stages.has(s), s);
  assert.ok(rows.some((r) => r.stage === 'stock' && r.canList)); // すぐ出品できる在庫
  assert.ok(rows.some((r) => r.stage === 'stock' && r.cooling)); // 期間中で出品を止めている在庫
  assert.ok(W.returnableContracts(W.loadState(), NOW).length >= 1); // 今から返品を受け付けられる契約
});

test('サンプル: 売上は、今日・今月に売れたものがあり、フリマと業者の両方で、利益が出ている', () => {
  const state = W.loadState();
  const rows = W.salesRows(state);
  const today = W.salesStats(rows, W.dateOf(NOW));
  const month = W.salesStats(rows, W.dateOf(NOW).slice(0, 7));
  assert.ok(today.count >= 1 && month.count > today.count);
  assert.ok(new Set(month.byChannel.map((c) => W.channelOf(c.key).type)).size === 2);
  assert.ok(month.profit > 0);
});

test('サンプル: 売却済み・出品中の商品は、売るときの規則（期間外の入庫済み）を満たしている', () => {
  const { units, records } = buildSample(NOW);
  for (const [code, rec] of Object.entries(records)) {
    const u = units.find((x) => x.code === code);
    assert.ok(u, code);
    assert.equal(u.status, 'stored');
    assert.ok(W.dateOf(rec.listedAt) > W.coolingOffEnd(u.date), `${code} は期間中に出品されている`);
  }
});

test('サンプル: 商品No.は重複しない。一度入れたら自動では入れ直さず、強制のときだけ入れ直す', () => {
  const { units } = buildSample(NOW);
  assert.equal(new Set(units.map((u) => u.code)).size, units.length);
  const before = mem.get('rq-mock-warehouse');
  assert.equal(seedSample(NOW), false);
  assert.equal(mem.get('rq-mock-warehouse'), before);
  assert.ok(mem.get(WH_SAMPLE_KEY));
  mem.delete('rq-mock-warehouse'); // 初期化で消えても、自動では復活しない
  assert.equal(seedSample(NOW), false);
  assert.equal(seedSample(NOW, true), true);
});

test('サンプル: 既存の入庫データ（営業が登録したもの）がある場合、自動投入では消さずに追加する', () => {
  mem.clear();
  mem.set('rq-mock-stock', JSON.stringify([{ code: 'RQ-MINE', visitId: 'V1', userId: 'u01', customerName: 'テスト', at: NOW, date: W.dateOf(NOW), itemId: 'x', name: 'x', category: 'バッグ', rank: 'A', n: 1, qty: 1, price: 1, status: 'pending', storedAt: null, location: null, by: null }]));
  assert.equal(seedSample(NOW), true);
  const codes = W.loadState().units.map((u) => u.code);
  assert.ok(codes.includes('RQ-MINE') && codes.length > 10);
});
