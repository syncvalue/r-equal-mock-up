import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { productPhoto, photoOf } = await import('../src/image.js');
const { unitsFromVisit, setUnitPhoto, clearUnitPhoto } = await import('../src/stock.js');

const decode = (url) => decodeURIComponent(url.replace('data:image/svg+xml;utf8,', ''));

test('商品の写真（ダミー）: 商品名・カテゴリから決まる。同じ商品は同じ絵、別の商品は別の絵。名前は無害化する', () => {
  const a = productPhoto('ロレックス デイトジャスト', '腕時計');
  assert.ok(a.startsWith('data:image/svg+xml;utf8,'));
  assert.equal(a, productPhoto('ロレックス デイトジャスト', '腕時計'));
  assert.notEqual(a, productPhoto('オメガ シーマスター', '腕時計')); // 似た商品でも見分けられる
  assert.ok(decode(a).includes('ロレックス デイトジャスト'));
  const evil = productPhoto('<script>alert(1)</script>&', 'x');
  assert.ok(!decode(evil).includes('<script>') && decode(evil).includes('&lt;script&gt;') && decode(evil).includes('&amp;'));
});

test('写真の選び方: 登録された写真があればそれを、なければ商品名から作ったダミーを使う', () => {
  assert.equal(photoOf({ photo: 'data:image/jpeg;base64,AAA', name: 'x', category: 'y' }), 'data:image/jpeg;base64,AAA');
  assert.equal(photoOf({ name: 'x', category: 'y' }), productPhoto('x', 'y'));
});

test('持ち帰り商品の登録: 査定依頼の写真があれば商品に付ける。なければ付けない（表示のときにダミーを使う）', () => {
  const item = { id: 'i1', name: '時計', category: '腕時計', rank: 'A', price: 1000, qty: 1 };
  const slots = [{ key: 'i1-1', item, n: 1 }];
  const base = { visitId: 'V', userId: 'u01', customerName: 'x', slots, labels: { 'i1-1': 'RQ-1' }, at: Date.now() };
  assert.equal(unitsFromVisit({ ...base, photos: { i1: 'data:image/jpeg;base64,BBB' } })[0].photo, 'data:image/jpeg;base64,BBB');
  assert.equal('photo' in unitsFromVisit(base)[0], false);
});

test('持ち帰り商品の登録: 訪問のお客様の電話番号（1・2）を、商品に控える。空の番号は控えない', () => {
  const item = { id: 'i1', name: '時計', category: '腕時計', rank: 'A', price: 1000, qty: 1 };
  const base = { visitId: 'V', userId: 'u01', customerName: 'x', slots: [{ key: 'i1-1', item, n: 1 }], labels: { 'i1-1': 'RQ-1' }, at: Date.now() };
  assert.deepEqual(unitsFromVisit({ ...base, phones: ['090-1111-2222', ''] })[0].phones, ['090-1111-2222']);
  assert.deepEqual(unitsFromVisit({ ...base, phones: ['090-1111-2222', '06-0000-0000'] })[0].phones, ['090-1111-2222', '06-0000-0000']);
  assert.deepEqual(unitsFromVisit(base)[0].phones, []);
});

const units = () => [{ code: 'A', name: 'a', category: 'x' }, { code: 'B', name: 'b', category: 'y', photo: 'data:image/jpeg;base64,OLD', photoBy: '旧', photoAt: 1 }];

test('倉庫での写真の登録: 商品に写真と、登録した人・日時を残す。撮り直せる。空の写真・未登録の商品は変えない', () => {
  const list = units();
  const set = setUnitPhoto(list, 'A', 'data:image/jpeg;base64,NEW', { by: '小川 直樹', at: 5 });
  assert.deepEqual([set[0].photo, set[0].photoBy, set[0].photoAt], ['data:image/jpeg;base64,NEW', '小川 直樹', 5]);
  assert.equal(list[0].photo, undefined); // 元の配列は変えない
  assert.equal(setUnitPhoto(set, 'B', 'data:image/jpeg;base64,NEW2', { by: '中島 里奈', at: 9 })[1].photo, 'data:image/jpeg;base64,NEW2'); // 撮り直し
  assert.equal(setUnitPhoto(list, 'A', '', { by: 'x' }), list);
  assert.equal(setUnitPhoto(list, 'Z', 'data:image/jpeg;base64,NEW', { by: 'x' }), list);
  assert.equal('by' in set[0], false);
});

test('倉庫での写真の削除: 写真と記録を外す（表示は、ダミーに戻る）。写真のない商品は変えない', () => {
  const list = units();
  const cleared = clearUnitPhoto(list, 'B');
  assert.deepEqual(['photo' in cleared[1], 'photoBy' in cleared[1], 'photoAt' in cleared[1]], [false, false, false]);
  assert.equal(photoOf(cleared[1]), productPhoto('b', 'y'));
  assert.equal(clearUnitPhoto(list, 'A'), list);
});
