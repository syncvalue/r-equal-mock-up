import { test } from 'node:test';
import assert from 'node:assert/strict';

const { TABS, tabLabel, menuView } = await import('../honsha/menu.js');

test('査定部のメニュー: 鑑定士サポート／査定の2つ。選んだものが強調され、件数の印が出る', () => {
  assert.deepEqual(TABS.map((t) => t.label), ['鑑定士サポート', '査定']);
  assert.equal(tabLabel('support'), '鑑定士サポート');
  assert.equal(tabLabel('appraisal'), '査定');
  assert.equal(tabLabel('nope'), '');
  const html = menuView({ tab: 'appraisal', badges: { support: 2, appraisal: 5 } });
  assert.equal((html.match(/data-tab="/g) || []).length, 2);
  assert.match(html, /bg-teal-700[^"]*"[^>]*data-tab="appraisal"/);
  assert.ok(html.includes('data-menu-close') && html.includes('メインメニュー') && html.includes('HQ-M02'));
  const t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(t.includes('返信待ち 2') && t.includes('査定待ち 5'));
  assert.ok(!menuView({ tab: 'support', badges: {} }).includes('待ち '));
});

test('査定部のメニューのバッジは、項目名・説明の下に置く', () => {
  const html = menuView({ tab: 'support', badges: { appraisal: 3 } });
  assert.match(html, /<span class="flex-1 min-w-0">.*査定<\/span>.*<span class="flex flex-wrap gap-1 mt-1\.5">/);
});
