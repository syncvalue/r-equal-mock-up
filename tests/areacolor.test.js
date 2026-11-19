import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaColor, areaOf, areaOptions } from '../src/areaColor.js';

const f = (id, area, active = true) => ({ id, area, active });

test('エリア: チラシの配布エリアの都道府県。読み取れなければ「その他」', () => {
  assert.equal(areaOf(f('A', '大阪府（吹田市・豊中市）')), '大阪府');
  assert.equal(areaOf(f('A', '京都府京都市北区')), '京都府');
  assert.equal(areaOf(f('A', '全国')), 'その他');
  assert.equal(areaOf(f('A', '')), 'その他');
});

test('エリアの色: 同じエリアは、いつも同じ色。エリアごとに違う色（濃い色と薄い色の組）', () => {
  const a = areaColor('大阪府');
  assert.deepEqual(areaColor('大阪府'), a);
  const all = ['大阪府', '兵庫県', '京都府', '奈良県', '愛知県', '東京都', '神奈川県', 'その他'].map((x) => areaColor(x).solid);
  assert.equal(new Set(all).size, all.length);
  assert.ok(a.solid.startsWith('hsl(') && a.tint.startsWith('hsl('));
  assert.equal(areaColor('その他').solid.includes(' 0% ') || areaColor('その他').solid.includes('0%'), true); // その他は、灰色
});

test('エリアの選択肢: 有効なチラシのあるエリアを、チラシの多い順に。件数つき。無効なチラシは数えない', () => {
  const o = areaOptions([f('A', '大阪府（A）'), f('B', '大阪府（B）'), f('C', '兵庫県西宮市'), f('D', '京都府', false), f('E', '全国')]);
  assert.deepEqual(o.map((x) => [x.area, x.count]), [['大阪府', 2], ['兵庫県', 1], ['その他', 1]]);
});
