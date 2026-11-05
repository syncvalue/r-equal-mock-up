import { test } from 'node:test';
import assert from 'node:assert/strict';

const { TABS, tabLabel, menuView } = await import('../accounting/menu.js');

test('経理部のメニュー: 経費精算／残高・入出金管理／週間収支の3つ。選んだものが強調され、件数の印が出る', () => {
  assert.deepEqual(TABS.map((t) => t.label), ['経費精算', '残高・入出金管理', '週間収支']);
  assert.equal(tabLabel('claims'), '経費精算');
  assert.equal(tabLabel('fixed'), ''); // 固定費の画面は、メニューから外した
  assert.equal(tabLabel('nope'), '');
  const html = menuView({ tab: 'claims', badges: { balance: 2, claims: 3 } });
  assert.equal((html.match(/data-tab="/g) || []).length, 3);
  assert.match(html, /bg-teal-700[^"]*"[^>]*data-tab="claims"/);
  assert.ok(html.includes('data-menu-close') && html.includes('メインメニュー'));
  const t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(t.includes('対応待ち 2') && t.includes('対応待ち 3'));
  assert.ok(!menuView({ tab: 'weekly', badges: {} }).includes('対応待ち')); // 0件のときは出さない
});
