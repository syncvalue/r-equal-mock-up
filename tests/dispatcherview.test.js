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

const rec = (o = {}) => ({
  id: 'R1', receptionNo: 'CC-1', date: '2026-10-23', start: '14:00', end: '15:30', status: 'tentative', userId: 'u01', areaId: 'osaka', gender: 'f',
  customer: { name: '山田 花子', phone: '090-1111-2222', address: '大阪府大阪市阿倍野区1-2-3' }, hearing: { wants: '時計' }, ...o,
});
const page = (selId, reservations = [rec()]) => dispatcherHtml({ date: '2026-10-23', reservations, now: NOW, chips: [], area: 'osaka', selId });

test('配車確定: 帯を選ぶと、詳細は画面の右側（表の横）に出る。下には出さない。選んでいないときは出ない', () => {
  const none = page(null);
  assert.ok(!none.includes('data-bclose') && !none.includes('data-chg="R1"'));
  const sel = page('R1');
  assert.ok(sel.includes('data-bclose') && sel.includes('data-fix="R1"') && sel.includes('data-chg="R1"') && sel.includes('data-cancelres="R1"'));
  // 表と詳細は、同じ横並びの行に入っている（表のあとに、詳細。下の段の border-t ではない）
  assert.ok(sel.indexOf('data-bcol') < sel.indexOf('data-bclose'));
  assert.ok(sel.includes('w-[min(26rem,40%)]') && !sel.includes('<div class="border-t"><div class="space-y-2'));
  assert.ok(!page('NOPE').includes('data-bclose')); // 見つからない予約は出さない
});
