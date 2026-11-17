import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeZip, addressCandidates } from '../src/zipAddress.js';
import { zipCandidatesHtml } from '../callcenter/view.js';

const TABLE = { '1000001': ['東京都千代田区千代田'], '9999999': ['A県B市C町', 'A県B市D町'] };

test('郵便番号は、全角・ハイフン・空白があっても7桁にそろえる', () => {
  assert.equal(normalizeZip('545-0052'), '5450052');
  assert.equal(normalizeZip('５４５−００５２'), '5450052');
  assert.equal(normalizeZip(' 545 0052 '), '5450052');
  assert.equal(normalizeZip('〒545-0052'), '5450052');
});

test('7桁でなければ候補は出さない', () => {
  assert.deepEqual(addressCandidates('545-005', TABLE), []);
  assert.deepEqual(addressCandidates('', TABLE), []);
  assert.deepEqual(addressCandidates('10000011', TABLE), []);
});

test('郵便番号から、住所の候補を返す（複数の町域に当たれば、すべて）', () => {
  assert.deepEqual(addressCandidates('100-0001', TABLE), ['東京都千代田区千代田']);
  assert.deepEqual(addressCandidates('9999999', TABLE), ['A県B市C町', 'A県B市D町']);
  assert.deepEqual(addressCandidates('123-4567', TABLE), []);
});

test('標準の表で、サンプルのお客様の郵便番号が引ける', () => {
  assert.deepEqual(addressCandidates('545-0052'), ['大阪府大阪市阿倍野区阿倍野筋']);
});

test('候補は、住所がすでにその候補で始まっていれば出さない', () => {
  assert.match(zipCandidatesHtml({ zip: '100-0001', address: '' }, TABLE), /data-zipaddr="東京都千代田区千代田"/);
  assert.equal(zipCandidatesHtml({ zip: '100-0001', address: '東京都千代田区千代田1-1' }, TABLE), '');
  assert.equal(zipCandidatesHtml({ zip: '', address: '' }, TABLE), '');
});

test('郵便番号が表にないときは、その旨を出す（7桁そろったときだけ）', () => {
  assert.match(zipCandidatesHtml({ zip: '123-4567', address: '' }, TABLE), /見つかりません/);
  assert.equal(zipCandidatesHtml({ zip: '123-45', address: '' }, TABLE), '');
});

test('自動入力: 住所が空なら、町域まで入る。複数候補なら共通の頭だけ', async () => {
  const { autoAddress } = await import('../src/zipAddress.js');
  assert.equal(autoAddress('100-0001', '', '', TABLE), '東京都千代田区千代田');
  assert.equal(autoAddress('9999999', '', '', TABLE), 'A県B市');
  assert.equal(autoAddress('100-000', '', '', TABLE), null); // 7桁に満たない
  assert.equal(autoAddress('1000011', '', '', TABLE), null); // 表にない
});

test('自動入力: 打ち込んだ住所は消さない。前の郵便番号から入れただけなら、入れ替える', async () => {
  const { autoAddress } = await import('../src/zipAddress.js');
  assert.equal(autoAddress('100-0001', '東京都千代田区千代田1-2-3', '', TABLE), null);
  assert.equal(autoAddress('9999999', '東京都千代田区千代田', '1000001', TABLE), 'A県B市');
  assert.equal(autoAddress('9999999', '東京都千代田区千代田1-1', '1000001', TABLE), null);
  assert.equal(autoAddress('100-0001', '東京都千代田区千代田', '1000001', TABLE), null); // すでに同じ
});
