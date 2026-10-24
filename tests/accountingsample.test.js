import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { buildSample, seedSample, SAMPLE_SEEDED_KEY } = await import('../src/accountingSample.js');
const { flagsOf, expenseStats, loadCustomerPayments } = await import('../src/accounting.js');
const { todayRows, loadDays, dateKey } = await import('../src/workday.js');

const NOW = new Date(2026, 9, 24, 15, 0).getTime();

test('サンプル: 今日の営業に、問題なし・差異・高額・マイナス等の見本が揃い、未始業も残る', () => {
  seedSample(NOW, true);
  const rows = todayRows().filter((r) => r.day);
  assert.ok(rows.length >= 7 && rows.length < 16);
  const levels = new Set(rows.flatMap((r) => flagsOf(r.day, r.summary).map((f) => f.level)));
  assert.deepEqual([...levels].sort(), ['danger', 'info', 'warn']);
  assert.ok(rows.some((r) => !flagsOf(r.day, r.summary).length)); // 問題のない営業もいる
  assert.ok(rows.some((r) => r.phase === 'closed') && rows.some((r) => r.phase === 'open'));
});

test('サンプル: 過去の記録で今月の集計ができ、お客様への入金に未払い・済みがある', () => {
  const month = expenseStats(Object.values(loadDays()), dateKey(new Date(NOW)).slice(0, 7));
  assert.ok(month.total > 0 && month.byType.length >= 3);
  const pays = loadCustomerPayments();
  assert.ok(pays.some((p) => p.status === 'pending') && pays.some((p) => p.status === 'done'));
});

test('サンプル: 一度入れたら、データがある限り自動では入れ直さない。強制のときだけ入れ直す', () => {
  const before = localStorage.getItem('rq-mock-workdays');
  assert.equal(seedSample(NOW), false);
  assert.equal(localStorage.getItem('rq-mock-workdays'), before);
  assert.ok(localStorage.getItem(SAMPLE_SEEDED_KEY));
  mem.delete('rq-mock-workdays'); // 初期化で消えても、自動では復活しない
  assert.equal(seedSample(NOW), false);
  assert.equal(seedSample(NOW, true), true);
  assert.ok(Object.keys(buildSample(NOW).days).length > 7);
});
