import { test } from 'node:test';
import assert from 'node:assert/strict';

const { TABS, tabLabel, menuView } = await import('../accounting/menu.js');

test('経理部のメニュー: 残高・入出金管理／経費精算／固定費・小口金管理／週間収支の4つ。選んだものが強調され、件数の印が出る', () => {
  assert.deepEqual(TABS.map((t) => t.label), ['残高・入出金管理', '経費精算', '固定費・小口金管理', '週間収支']);
  assert.equal(tabLabel('claims'), '経費精算');
  assert.equal(tabLabel('nope'), '');
  const html = menuView({ tab: 'claims', badges: { balance: 2, claims: 3, fixed: 1 } });
  assert.equal((html.match(/data-tab="/g) || []).length, 4);
  assert.match(html, /bg-teal-700[^"]*"[^>]*data-tab="claims"/);
  assert.ok(html.includes('data-menu-close') && html.includes('メインメニュー'));
  const t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(t.includes('振込待ち 2') && t.includes('未確認 3') && t.includes('要対応 1'));
  assert.ok(!menuView({ tab: 'weekly', badges: {} }).includes('未確認')); // 0件のときは出さない
});
