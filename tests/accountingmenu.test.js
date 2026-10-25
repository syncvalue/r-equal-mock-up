import { test } from 'node:test';
import assert from 'node:assert/strict';

const { TABS, tabLabel, menuView } = await import('../accounting/menu.js');

test('経理部のメニュー: 所持金の確認・入金処理・経費の入力代行・経費の全体状況の4つ。選んだものが強調され、件数の印が出る', () => {
  assert.deepEqual(TABS.map((t) => t.label), ['所持金の確認', '入金処理', '経費の入力代行', '経費の全体状況']);
  assert.equal(tabLabel('deposit'), '入金処理');
  assert.equal(tabLabel('nope'), '');
  const html = menuView({ tab: 'deposit', badges: { cash: 2, deposit: 3 } });
  assert.equal((html.match(/data-tab="/g) || []).length, 4);
  assert.match(html, /bg-teal-700[^"]*"[^>]*data-tab="deposit"/);
  assert.ok(html.includes('data-menu-close') && html.includes('メインメニュー'));
  const t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(t.includes('確認が必要 2') && t.includes('振込待ち 3'));
  assert.ok(!menuView({ tab: 'cash', badges: {} }).includes('確認が必要')); // 0件のときは出さない
});
