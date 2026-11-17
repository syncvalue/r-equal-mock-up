import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapView, tileUrl, directionLabel } from '../src/mapView.js';

const dest = { lat: 34.6462, lng: 135.5138 };

test('訪問先が中心: 現在地が分からなくても、訪問先を中心にタイルを敷き詰める', () => {
  const v = mapView({ dest, me: null });
  assert.equal(v.zoom, 16);
  assert.equal(v.me, null);
  assert.ok(v.tiles.length >= 6);
  // 中心（0,0）が、どれかのタイルの内側にある
  assert.ok(v.tiles.some((t) => t.left <= 0 && 0 < t.left + 256 && t.top <= 0 && 0 < t.top + 256));
  assert.match(tileUrl(v.tiles[0]), /^https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png$/);
});

test('近くにいる: 現在地を同じ地図に出す（訪問先は中心のまま）', () => {
  const v = mapView({ dest, me: { lat: dest.lat + 0.0005, lng: dest.lng + 0.0005 } });
  assert.equal(v.zoom, 16);
  assert.ok(v.me && Math.abs(v.me.x) < 120 && Math.abs(v.me.y) < 70);
  assert.ok(v.me.y < 0); // 北にいるので、上
});

test('少し離れている: 現在地が入るところまで縮尺を下げる', () => {
  const v = mapView({ dest, me: { lat: dest.lat + 0.01, lng: dest.lng } }); // 約1.1km
  assert.ok(v.zoom < 16 && v.zoom >= 13);
  assert.ok(v.me);
});

test('遠く離れている: 訪問先を優先して中心にし、現在地は地図に出さず、距離と方角を示す', () => {
  const v = mapView({ dest, me: { lat: dest.lat + 0.2, lng: dest.lng + 0.2 } });
  assert.equal(v.me, null);
  assert.ok(v.far.km > 20);
  assert.equal(v.far.dir, '北東');
  assert.equal(directionLabel(0), '北');
  assert.equal(directionLabel(181), '南');
  assert.equal(directionLabel(270), '西');
});
