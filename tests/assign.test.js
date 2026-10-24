import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestStaff } from '../callcenter/assign.js';
import { customerDossier } from '../src/customerHistory.js';

globalThis.localStorage = { getItem: () => null, setItem() {} };
const NOW = new Date(2026, 9, 21, 9, 0);
const rec = (o = {}) => ({ id: 'x', userId: 'u09', date: '2026-10-28', start: '13:00', end: '14:30', areaId: 'osaka', hearing: { wants: '腕時計 ロレックス 2本', mainItems: {} }, ...o });
const none = { rank: null, trouble: { level: 'none', tags: [] }, cooloff: [] };

test('営業の当てはめの目安: 売りたいものと得意分野が合う営業が先。空いていない営業は出さない', () => {
  const list = suggestStaff(rec(), [], none, NOW);
  assert.ok(list.length >= 3);
  assert.ok(list.every((c) => c.free));
  const watch = list.filter((c) => c.matched.includes('腕時計'));
  assert.ok(watch.length >= 2);
  assert.ok(list.slice(0, watch.length).every((c) => c.matched.length >= 1)); // 合う営業が、先頭にまとまる
  assert.ok(list.every((c) => c.user.id !== 'zzz'));
});

test('営業の当てはめの目安: 要注意・資産の多いお客様は、上位ランクを優先する', () => {
  const hot = { rank: 'S', trouble: { level: 'alert', tags: ['クレームが多い'] }, cooloff: [{}, {}] };
  const list = suggestStaff(rec(), [], hot, NOW);
  const order = { S: 4, A: 3, B: 2, C: 1 };
  assert.ok(list.every((c, i) => i === 0 || order[list[i - 1].rank] >= order[c.rank])); // ランクの高い順
  assert.ok(['S', 'A'].includes(list[0].rank));
});

test('営業の当てはめの目安: 別の予約で埋まっている営業は、出ない', () => {
  const base = suggestStaff(rec(), [], none, NOW);
  const busy = { id: 'b', userId: base[0].user.id, date: '2026-10-28', start: '13:00', end: '14:30', areaId: 'osaka', status: 'confirmed', customer: { name: 'B' } };
  const after = suggestStaff(rec(), [busy], none, NOW);
  assert.ok(!after.some((c) => c.user.id === base[0].user.id));
});

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
