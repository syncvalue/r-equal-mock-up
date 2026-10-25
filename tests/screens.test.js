import { test } from 'node:test';
import assert from 'node:assert/strict';

// 画面のスクリプトを読み込み、最初の描画でエラーにならないことを確かめる（画面の部品を消したときの消し忘れを防ぐ）
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const root = { innerHTML: '' };
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
globalThis.document = { documentElement: { classList: { toggle() {}, contains: () => false }, style: {} }, querySelector: () => root, querySelectorAll: () => [], addEventListener() {}, activeElement: null };
globalThis.setInterval = () => {};

test('本社 査定部の画面は、描画できる。入金・日報のボタンはない', async () => {
  await import('../honsha/honsha.js');
  assert.ok(root.innerHTML.includes('本社 査定部'));
  assert.ok(root.innerHTML.includes('お知らせ送信'));
  assert.ok(!root.innerHTML.includes('入金') && !root.innerHTML.includes('日報'));
});

test('本社 経理部の画面は、描画できる（サンプルデータ入り）', async () => {
  root.innerHTML = '';
  await import('../accounting/accounting.js');
  assert.ok(root.innerHTML.includes('本社 経理部') && root.innerHTML.includes('所持金の確認') && root.innerHTML.includes('鈴木 一郎'));
});

test('倉庫・物流の画面は、描画できる（サンプルデータ入り）。商品管理のほか、出品・売上・返品の各タブも表示できる', async () => {
  root.innerHTML = '';
  await import('../warehouse/warehouse.js');
  assert.ok(root.innerHTML.includes('倉庫・物流') && root.innerHTML.includes('商品管理') && root.innerHTML.includes('ルイ・ヴィトン ネヴァーフル MM'));
  assert.ok(root.innerHTML.includes('クーリングオフ返品') && root.innerHTML.includes('売上管理'));
});
