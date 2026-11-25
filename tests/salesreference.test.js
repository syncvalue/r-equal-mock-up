import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { similarSales, salesSummary, DEMO_PAST_SALES, realPastSales } = await import('../src/salesReference.js');
const { hasExpectedPrice, canApprove } = await import('../src/appraisalThread.js');

const sale = (name, category, rank, soldPrice, soldAt, over = {}) => ({ code: `X-${name}-${soldAt}`, name, category, rank, soldPrice, cost: Math.round(soldPrice / 2), soldAt, channel: 'mercari', demo: false, ...over });

const LIST = [
  sale('ロレックス デイトジャスト', '腕時計', 'A', 600000, 3),
  sale('ロレックス デイトジャスト', '腕時計', 'B', 540000, 2),
  sale('オメガ シーマスター', '腕時計', 'B', 260000, 4),
  sale('K18 ネックレス（約20g）', 'ジュエリー・貴金属', 'B', 140000, 5),
  sale('ルイヴィトン ネヴァーフル', 'ブランドバッグ', 'A', 150000, 6),
];

test('過去の販売実績: 同じ商品名（語の一致）を先頭に、同じカテゴリが続く。ほかのカテゴリは出さない', () => {
  const r = similarSales(LIST, { name: 'ロレックス デイトジャスト 41', category: '腕時計', rank: 'A' });
  assert.deepEqual(r.map((x) => x.name), ['ロレックス デイトジャスト', 'ロレックス デイトジャスト', 'オメガ シーマスター']);
  assert.equal(r[0].rank, 'A'); // 同じ名前なら、同じランクが先
  assert.ok(!r.some((x) => x.category === 'ブランドバッグ'));
});

test('過去の販売実績: 件数の上限。名前が違ってもカテゴリが同じなら参考に出る。該当なしは空', () => {
  assert.equal(similarSales(LIST, { name: 'ロレックス', category: '腕時計', rank: 'A' }, 2).length, 2);
  assert.deepEqual(similarSales(LIST, { name: 'カメラ', category: 'カメラ・家電', rank: 'A' }), []);
  assert.deepEqual(similarSales([], { name: 'x', category: 'y', rank: 'A' }), []);
});

test('販売実績の集計: 件数・最小・中央値・最大。実績がなければ null', () => {
  const rows = [100, 300, 200, 400].map((p, i) => sale('a', 'c', 'A', p, i));
  assert.deepEqual(salesSummary(rows), { count: 4, min: 100, median: 250, max: 400 });
  assert.deepEqual(salesSummary(rows.slice(0, 3)), { count: 3, min: 100, median: 200, max: 300 });
  assert.equal(salesSummary([]), null);
});

test('倉庫で売れた商品の記録を、実績に変える（売れた商品だけ。ダミーではない）', () => {
  const units = [{ code: 'A', name: 'シャネル マトラッセ', category: 'ブランドバッグ', rank: 'A', price: 100000 }, { code: 'B', name: '在庫', category: 'ブランドバッグ', rank: 'A', price: 1 }];
  const records = { A: { stage: 'sold', soldAt: 5, soldPrice: 230000, channel: 'yahoo' }, B: { stage: 'listed' } };
  const r = realPastSales({ units, records });
  assert.deepEqual(r.map((x) => [x.code, x.soldPrice, x.cost, x.demo]), [['A', 230000, 100000, false]]);
});

test('デモの販売実績（ダミー）: 想定販売価格のデモの商品と同じ種類の商品が入っている', () => {
  assert.ok(DEMO_PAST_SALES.length >= 12);
  assert.ok(DEMO_PAST_SALES.every((s) => s.demo === true && s.soldPrice > s.cost && s.soldAt > 0));
  const watch = similarSales(DEMO_PAST_SALES, { name: 'ロレックス デイトジャスト', category: '腕時計', rank: 'B' });
  assert.ok(watch.length >= 2);
});

test('想定販売価格が決まっているか: 商品に入っている、または査定部の提案（返信）に入っている', () => {
  const item = { id: 'i1', expectedPrice: 0 };
  assert.equal(hasExpectedPrice(item, 'V1', [], []), false);
  assert.equal(hasExpectedPrice({ ...item, expectedPrice: 90000 }, 'V1', [], []), true);
  const t = { visitId: 'V1', itemId: 'i1', createdAt: 1, status: '回答済み', messages: [{ from: 'hq', expectedPrice: 80000, at: 2 }] };
  assert.equal(hasExpectedPrice(item, 'V1', [t], []), true);
  assert.equal(hasExpectedPrice(item, 'V2', [t], []), false); // 別の訪問
  const c = { visitId: 'V1', itemId: 'i1', expectedPrice: 70000, from: '査定部' };
  assert.equal(hasExpectedPrice(item, 'V1', [], [c]), true);
  assert.equal(hasExpectedPrice(item, 'V1', [{ ...t, messages: [{ from: 'sales', text: 'x', at: 1 }] }], []), false);
});

test('承認の条件（査定依頼の完結）は、これまでどおり', () => {
  assert.equal(canApprove([], 'V1', 'i1').ok, true);
});
