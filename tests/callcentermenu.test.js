import { test } from 'node:test';
import assert from 'node:assert/strict';

const { TABS, tabLabel, menuView } = await import('../callcenter/menu.js');

test('コールセンターのメニュー: 新規受付・配車確定・クーリングオフ・来店予約の4つ。選んだものが強調され、件数の印が出る', () => {
  assert.deepEqual(TABS.map((t) => [t.key, t.label]), [['new', '新規受付'], ['dispatch', '配車確定（配車係）'], ['cooloff', 'クーリングオフ'], ['store', '来店予約（店舗）']]);
  assert.equal(tabLabel('store'), '来店予約（店舗）');
  assert.equal(tabLabel('nope'), '');
  const html = menuView({ tab: 'dispatch', badges: { dispatch: [{ cls: 'bg-amber-500', text: '仮確定 3' }], cooloff: [{ cls: 'bg-rose-600', text: '回答待ち 2' }] } });
  assert.equal((html.match(/data-tab="/g) || []).length, 4);
  assert.match(html, /bg-teal-700[^"]*"[^>]*data-tab="dispatch"/);
  assert.ok(html.includes('data-menu-close') && html.includes('メインメニュー'));
  const t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(t.includes('仮確定 3') && t.includes('回答待ち 2'));
  assert.ok(!menuView({ tab: 'new', badges: {} }).includes('仮確定 3'));
});
