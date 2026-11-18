import { test } from 'node:test';
import assert from 'node:assert/strict';

const { TABS, tabLabel, menuView } = await import('../callcenter/menu.js');

test('コールセンターのメニュー: 受電・訪問カレンダー・配車確定・クーリングオフ・来店予約の5つ。選んだものが強調され、件数の印が出る', () => {
  assert.deepEqual(TABS.map((t) => [t.key, t.label]), [['new', '受電'], ['calendar', '訪問カレンダー'], ['dispatch', '配車確定（配車係）'], ['cooloff', 'クーリングオフ'], ['store', '来店予約（店舗）']]);
  assert.equal(tabLabel('store'), '来店予約（店舗）');
  assert.equal(tabLabel('nope'), '');
  const html = menuView({ tab: 'dispatch', badges: { dispatch: [{ cls: 'bg-amber-500', text: '仮確定 3' }], cooloff: [{ cls: 'bg-rose-600', text: '回答待ち 2' }], calendar: [{ cls: 'bg-rose-600', text: '前日確認 未4' }] } });
  assert.equal((html.match(/data-tab="/g) || []).length, 5);
  assert.match(html, /bg-teal-700[^"]*"[^>]*data-tab="dispatch"/);
  assert.ok(html.includes('data-menu-close') && html.includes('メインメニュー'));
  const t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(t.includes('仮確定 3') && t.includes('回答待ち 2') && t.includes('前日確認 未4'));
  assert.ok(!menuView({ tab: 'new', badges: {} }).includes('仮確定 3'));
});

test('メニューのバッジは、項目名・説明の下に、折り返して並べる（右に置いて、項目名を窮屈にしない）', () => {
  const html = menuView({ tab: 'new', badges: { calendar: [{ cls: 'bg-rose-600', text: '前日確認 未10' }, { cls: 'bg-amber-500', text: '変更 2' }] } });
  assert.ok(!html.includes('flex flex-col items-end gap-1'));
  assert.match(html, /<span class="flex-1 min-w-0"><span class="block font-bold text-lg leading-tight">訪問カレンダー<\/span><span class="text-xs text-slate-300">[^<]*<\/span><span class="flex flex-wrap gap-1 mt-1\.5">.*前日確認 未10.*変更 2/);
});
