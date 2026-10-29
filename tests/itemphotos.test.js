import test from 'node:test';
import assert from 'node:assert/strict';
import { itemReady, hasPhoto, addPhoto, removePhoto, noPhotoCount } from '../src/itemPhotos.js';

const base = { id: 'p1', price: 1000, photos: ['a'] };

test('買取商品は、写真が1枚以上あり、金額が入っていて、はじめて明細として整う', () => {
  assert.equal(itemReady(base), true);
  assert.equal(itemReady({ ...base, photos: [] }), false);
  assert.equal(itemReady({ ...base, photos: undefined }), false);
  assert.equal(itemReady({ ...base, price: 0 }), false);
});

test('写真は複数枚登録でき、1枚ずつ消せる（元の商品は変えない）', () => {
  const i0 = { id: 'p1', photos: [] };
  const i1 = addPhoto(i0, 'a');
  const i2 = addPhoto(i1, 'b');
  assert.deepEqual(i2.photos, ['a', 'b']);
  assert.deepEqual(i0.photos, []);
  assert.deepEqual(removePhoto(i2, 0).photos, ['b']);
  assert.equal(hasPhoto(removePhoto(removePhoto(i2, 0), 0)), false);
});

test('写真のない商品の数を数える', () => {
  assert.equal(noPhotoCount([base, { id: 'p2' }, { id: 'p3', photos: [] }]), 2);
});
