import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {} };
const { purchaseSummary } = await import('../src/customerHistory.js');

test('買取の実績: 直近の買取額・依頼回数・総買取額', () => {
  const s = purchaseSummary(['080-8901-2345']); // 3回（31万円・15万円・22万円）
  assert.equal(s.count, 3);
  assert.equal(s.latest.total, 310000);
  assert.equal(s.total, 310000 + 150000 + 220000);
});

test('実績がない番号は0回。電話番号が複数でも、重複して数えない', () => {
  assert.deepEqual(purchaseSummary(['090-0000-0000']), { count: 0, total: 0, latest: null });
  assert.deepEqual(purchaseSummary(['', null]), { count: 0, total: 0, latest: null });
  assert.equal(purchaseSummary(['080-8901-2345', '080-8901-2345']).count, 3);
  assert.equal(purchaseSummary(['080-8901-2345', '080-5678-9012']).count, 4); // 別の番号の実績は合算する
});
