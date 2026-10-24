import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerDossier } from '../src/customerHistory.js';

globalThis.localStorage = { getItem: () => null, setItem() {} };
test('お客様の詳細: 買取の履歴・評価・これまでの担当営業・ランクなど', () => {
  const d = customerDossier(['080-8901-2345']);
  assert.equal(d.count, 3);
  assert.equal(d.visits[0].total, 310000);
  assert.equal(d.total, 310000 + 150000 + 220000);
  assert.equal(d.average, Math.round(680000 / 3));
  assert.ok(d.evals.length >= 1 && d.staff.includes('佐々木 美咲')); // 前回までの担当
  assert.equal(d.profile.cooloff.length, 1);
  const empty = customerDossier(['090-0000-0000']);
  assert.deepEqual([empty.count, empty.total, empty.evals.length, empty.staff], [0, 0, 0, []]);
});
