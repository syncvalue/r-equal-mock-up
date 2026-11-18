import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { dispatcherHtml } = await import('../callcenter/dispatcherView.js');

const NOW = new Date(2026, 9, 21, 9, 0);

test('配車確定の鑑定士の列: 訪問間の移動の合計は、「移動距離・時間：」と書く（何の距離・時間か分かるように）', () => {
  // 予定が2件以上ある鑑定士（元からの予定）の日を探す
  const html = ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26'].map((date) => dispatcherHtml({ date, reservations: [], now: NOW, chips: [], area: 'osaka', selId: null })).find((h) => h.includes('移動距離・時間：'));
  assert.ok(html, '移動のある日が見つからない');
  assert.match(html.replace(/<[^>]+>/g, ''), /移動距離・時間：[\d.]+km・約\d+分/);
  assert.ok(!/>計[\d.]+km/.test(html));
});
