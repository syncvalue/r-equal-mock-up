import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { buildSample, seedSample, SAMPLE_SEEDED_KEY } = await import('../src/accountingSample.js');
const { flagsOf, loadCustomerPayments } = await import('../src/accounting.js');
const { todayRows, loadDays, dateKey } = await import('../src/workday.js');
const { loadLedger, dailyBalances } = await import('../src/ledger.js');
const { recentWeeks } = await import('../src/weekly.js');
const { claimsFrom, loadReviews, claimCounts } = await import('../src/expenseReview.js');
const { monthlyFixed, pettyRows, loadFixed, loadPettyUses, fieldStaff } = await import('../src/fixedCosts.js');

const NOW = Date.now(); // 画面（todayRows）は実際の今日を使うため、固定の日付にしない

test('サンプル: 今日の鑑定士に、問題なし・差異・高額・マイナス等の見本が揃い、未始業も残る', () => {
  seedSample(NOW, true);
  const rows = todayRows().filter((r) => r.day);
  assert.ok(rows.length >= 7 && rows.length < 16);
  const levels = new Set(rows.flatMap((r) => flagsOf(r.day, r.summary).map((f) => f.level)));
  assert.deepEqual([...levels].sort(), ['danger', 'warn']);
  assert.ok(rows.some((r) => !flagsOf(r.day, r.summary).length)); // 問題のない鑑定士もいる
  assert.ok(rows.some((r) => r.phase === 'closed') && rows.some((r) => r.phase === 'open'));
});

test('サンプル: 経費精算に、未確認・精算済み・差戻しがあり、経費のIDは重ならない。お客様への支払に未払い・済みがある', () => {
  const claims = claimsFrom(Object.values(loadDays()), loadReviews());
  assert.equal(new Set(claims.map((c) => c.id)).size, claims.length);
  const n = claimCounts(claims);
  assert.ok(n.pending >= 3 && n.approved >= 3 && n.returned === 1);
  assert.ok(claims.some((c) => c.status === 'pending' && !c.photo) && claims.some((c) => c.status === 'pending' && c.flags.length === 0));
  const pays = loadCustomerPayments();
  assert.ok(pays.some((p) => p.status === 'pending') && pays.some((p) => p.status === 'done'));
});

test('サンプル: 帳簿が約4週間ぶんあり、日次残高が続き、直近の週に粗利・固定費がある', () => {
  const ledger = loadLedger();
  const today = new Date(NOW).toISOString();
  assert.ok(ledger.length > 40 && new Set(ledger.map((e) => e.id)).size === ledger.length);
  const rows = dailyBalances(ledger, ledger.map((e) => e.date).sort()[0], ledger.map((e) => e.date).sort().at(-1));
  assert.ok(rows.length >= 28 && rows.every((r) => r.balance > 0));
  const weeks = recentWeeks(ledger, NOW, 5);
  assert.ok(weeks.slice(1, 4).every((w) => w.gross > 0 && w.in > 0 && w.out > 0));
  assert.ok(weeks.some((w) => w.fixed > 0));
  assert.ok(today);
});

test('サンプル: 固定費は、先月分が払い済みで今月分に未払いがあり、鑑定士の小口金に「補充が必要」と「十分」がいる', () => {
  const today = dateKey(new Date(NOW));
  const month = today.slice(0, 7);
  const last = dateKey(new Date(new Date(`${month}-01T00:00:00`).getTime() - 86400000)).slice(0, 7);
  assert.ok(monthlyFixed(loadFixed(), loadLedger(), last, today).some((r) => r.paid));
  assert.ok(monthlyFixed(loadFixed(), loadLedger(), month, today).some((r) => !r.paid));
  const petty = pettyRows(loadLedger(), loadPettyUses(), fieldStaff());
  assert.ok(petty.some((r) => r.low) && petty.some((r) => !r.low));
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
  assert.ok(localStorage.getItem('rq-mock-ledger') && localStorage.getItem('rq-mock-expense-reviews'));
});
