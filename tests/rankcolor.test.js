import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RANK_COLORS, UNRANKED, rankColor, boardBlockStyle, staffHeadStyle } from '../src/rankColor.js';

test('ランクの色: SS・S・A・Bで、すべて違う色。分からないものは別の色', () => {
  const fills = Object.values(RANK_COLORS).map((c) => c.fill);
  assert.deepEqual(Object.keys(RANK_COLORS), ['SS', 'S', 'A', 'B']);
  assert.equal(new Set([...fills, UNRANKED.fill]).size, 5);
  assert.equal(rankColor('SS'), RANK_COLORS.SS);
  assert.equal(rankColor(null), UNRANKED);
  assert.equal(rankColor('C'), UNRANKED); // 古いランクの値でも壊れない
});

test('帯の状態は枠線で表す: 確定済み＝実線／仮確定＝点線／戻った＝橙の二重線。塗りは、状態では変わらない', () => {
  const st = (state) => boardBlockStyle('S', state);
  assert.match(st('confirmed'), /border:3px solid/);
  assert.match(st('tentative'), /border:3px dashed/);
  assert.match(st('reverted'), /border:4px double #d97706/);
  for (const s of ['confirmed', 'tentative', 'reverted']) assert.ok(st(s).includes(`background:${RANK_COLORS.S.fill}`) && st(s).includes('background-clip:padding-box'));
});

test('鑑定士の見出しは、ランクの薄い背景と、上の太い線（帯と同じ色）', () => {
  const h = staffHeadStyle('SS');
  assert.ok(h.includes(RANK_COLORS.SS.tint) && h.includes(`border-top:4px solid ${RANK_COLORS.SS.fill}`));
});
