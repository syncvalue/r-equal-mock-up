import test from 'node:test';
import assert from 'node:assert/strict';
import { validPin, roundPin, pinLabel, addressQueries } from '../callcenter/pin.js';

test('ピン: 緯度経度の範囲を確かめる', () => {
  assert.equal(validPin({ lat: 34.69, lng: 135.5 }), true);
  assert.equal(validPin({ lat: 91, lng: 135.5 }), false);
  assert.equal(validPin({ lat: 34, lng: 181 }), false);
  assert.equal(validPin(null), false);
  assert.equal(validPin({ lat: 'x', lng: 1 }), false);
});

test('ピン: 小数6桁（約10cm）に丸める', () => {
  assert.deepEqual(roundPin({ lat: 34.69373812345, lng: 135.50216599 }), { lat: 34.693738, lng: 135.502166 });
});

test('ピン: 表示の文字。置いていなければ「未設定」', () => {
  assert.equal(pinLabel({ lat: 34.693738, lng: 135.502166 }), '緯度 34.693738 ／ 経度 135.502166');
  assert.equal(pinLabel(null), '位置：未設定');
});

test('ピン: 住所の検索は、番地を末尾から削って、順に広げる', () => {
  assert.deepEqual(addressQueries('奈良県奈良市あやめ池北1-2-3'), ['奈良県奈良市あやめ池北1-2-3', '奈良県奈良市あやめ池北']);
  assert.deepEqual(addressQueries('大阪府大阪市阿倍野区阿倍野筋１丁目２番３号'), ['大阪府大阪市阿倍野区阿倍野筋1丁目2番3号', '大阪府大阪市阿倍野区阿倍野筋']);
  assert.deepEqual(addressQueries('東京都千代田区千代田'), ['東京都千代田区千代田']);
  assert.deepEqual(addressQueries('  '), []);
});
