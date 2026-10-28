import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKyc, kycPhotos, KYC_MAX_PHOTOS } from '../src/kyc.js';

test('本人確認書類は、表面だけでも、表と裏の2枚でも登録できる', () => {
  assert.equal(KYC_MAX_PHOTOS, 2);
  assert.deepEqual(kycPhotos(buildKyc('運転免許証', 'F')), ['F']);
  assert.deepEqual(kycPhotos(buildKyc('運転免許証', 'F', 'B')), ['F', 'B']);
});

test('表面がなければ登録できない', () => {
  assert.equal(buildKyc('運転免許証', '', 'B'), null);
  assert.equal(buildKyc('運転免許証', null), null);
});

test('これまでの1枚だけの保存（photo）も読める', () => {
  assert.deepEqual(kycPhotos({ type: 'x', photo: 'P' }), ['P']);
  assert.deepEqual(kycPhotos(null), []);
});
