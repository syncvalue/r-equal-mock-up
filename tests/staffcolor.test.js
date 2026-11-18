import test from 'node:test';
import assert from 'node:assert/strict';
import { USERS } from '../src/dashboard.js';
import { staffColor, visitBlockStyle } from '../src/staffColor.js';

test('鑑定士の色: 同じ人はいつも同じ色、全員ちがう色', () => {
  assert.deepEqual(staffColor('u02'), staffColor('u02'));
  const solids = USERS.map((u) => staffColor(u.id).solid);
  assert.equal(new Set(solids).size, USERS.length);
});

test('訪問の帯: 前日確認が済んでいれば塗りつぶし、まだなら点線', () => {
  assert.ok(visitBlockStyle('u01', true).css.includes('solid'));
  assert.ok(!visitBlockStyle('u01', true).css.includes('dashed'));
  assert.ok(visitBlockStyle('u01', false).css.includes('dashed'));
});
