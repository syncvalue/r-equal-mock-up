import { test } from 'node:test';
import assert from 'node:assert/strict';

// 画面のスクリプトを読み込み、最初の描画でエラーにならないことを確かめる（画面の部品を消したときの消し忘れを防ぐ）
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const root = { innerHTML: '' };
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
globalThis.document = { documentElement: { classList: { toggle() {}, contains: () => false }, style: {} }, querySelector: () => root, querySelectorAll: () => [], addEventListener() {}, activeElement: null, head: { appendChild() {} }, createElement: () => ({}) };
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

test('マスタ管理の画面は、描画できる。社員・営業所・倉庫・委託先の各マスタを切り替えて表示できる', async () => {
  root.innerHTML = '';
  await import('../master/master.js');
  assert.ok(root.innerHTML.includes('マスタ管理') && root.innerHTML.includes('鈴木 一郎') && root.innerHTML.includes('小川 直樹') && root.innerHTML.includes('data-new'));
});

globalThis.sessionStorage = { getItem: (k) => (k === 'rq-mock-wh-session' ? 'wh01' : null), setItem() {}, removeItem() {} }; // 倉庫担当としてログイン済み

test('倉庫・物流の画面は、描画できる（サンプルデータ入り）。商品管理のほか、出品・売上・返品の各タブも表示できる', async () => {
  root.innerHTML = '';
  await import('../warehouse/warehouse.js');
  assert.ok(root.innerHTML.includes('倉庫・物流') && root.innerHTML.includes('商品管理') && root.innerHTML.includes('ルイ・ヴィトン ネヴァーフル MM'));
  const { TABS, menuView } = await import('../warehouse/menu.js'); // 各画面へは、左側の開閉式メニューから移動する
  const menu = menuView({ tab: 'stock', badges: {}, staff: { name: '小川 直樹' }, warehouseName: '大阪倉庫' });
  for (const label of ['商品管理', '入庫', '倉庫間移動', '販売（出品）', '売上管理', 'クーリングオフ返品']) assert.ok(TABS.some((t) => t.label === label) && menu.includes(label), label);
  assert.ok(!root.innerHTML.includes('メインメニュー')); // 初めは、メニューは閉じている
});

test('店舗の画面は、描画できる。ログイン前はログイン画面、店舗スタッフとしてログイン済みなら、来店の一覧（サンプル入り）', async () => {
  globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  root.innerHTML = '';
  await import('../store/store.js?login');
  assert.ok(root.innerHTML.includes('ログインID') && root.innerHTML.includes('st01'));
  globalThis.sessionStorage = { getItem: (k) => (k === 'rq-mock-store-session' ? 'st01' : null), setItem() {}, removeItem() {} };
  root.innerHTML = '';
  await import('../store/store.js?board');
  assert.ok(root.innerHTML.includes('なんば店') && root.innerHTML.includes('飛び込みの受付') && root.innerHTML.includes('山田 花子') && root.innerHTML.includes('田中 美咲'));
  assert.ok(JSON.parse(mem.get('rq-mock-store-visits')).length >= 8); // サンプルの来店が入る
});
