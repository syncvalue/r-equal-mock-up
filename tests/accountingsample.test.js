import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { buildSample, seedSample, SAMPLE_SEEDED_KEY } = await import('../src/accountingSample.js');
const { flagsOf, loadCustomerPayments } = await import('../src/accounting.js');
const { todayRows, loadDays, dateKey } = await import('../src/workday.js');
const { loadLedger, dailyBalances } = await import('../src/ledger.js');
const { recentWeeks } = await import('../src/weekly.js');
const { checkRows, checkCounts, loadChecks, shiftDate } = await import('../src/dailyCheck.js');
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

test('サンプル: 経費精算の前日分に、問題なし・領収書なし・過不足・日報未提出などの見本が揃い、前日繰越金が続く。お客様への支払に未払い・済みがある', () => {
  const days = Object.values(loadDays());
  const yesterday = shiftDate(dateKey(new Date(NOW)), -1);
  const rows = checkRows(days, yesterday, loadChecks());
  assert.ok(rows.length >= 7 && rows.every((r) => r.status === 'pending'));
  const texts = rows.flatMap((r) => r.issues.map((i) => i.text)).join('\n');
  for (const w of ['領収書の写真がない', '内容の記入がない', '始業時に前日の繰越金と差異', '終業時の過不足', 'まだ引き出されていません', '日報が未提出', '数えた現金の写真がない', '高額']) assert.ok(texts.includes(w), w);
  assert.ok(rows.some((r) => !r.issues.length) && rows.some((r) => r.purchases.length));
  assert.ok(!texts.includes('前日繰越金')); // 前日の終業時の所持金から、前日繰越金が続いている
  const older = checkCounts(checkRows(days, shiftDate(yesterday, -1), loadChecks()));
  assert.ok(older.ok >= 1 && older.returned === 1);
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
  assert.ok(localStorage.getItem('rq-mock-ledger') && localStorage.getItem('rq-mock-daily-checks'));
});

test('サンプル: 買取代金には買取の内訳があり、商品ごとの金額の合計が買取代金に一致する', () => {
  seedSample(NOW, true);
  const buys = Object.values(loadDays()).flatMap((d) => d.expenses.filter((e) => e.type === 'purchase'));
  assert.ok(buys.length >= 8);
  for (const e of buys) {
    assert.ok(e.items.length >= 1 && e.items.every((i) => i.name && i.price > 0), e.memo);
    assert.equal(e.items.reduce((n, i) => n + i.price, 0), e.amount);
  }
});

test('サンプル: 経費精算のやり取りがある（差戻しの日・経理部からの質問は鑑定士が未読・鑑定士からの連絡は経理部が未読）', async () => {
  seedSample(NOW, true);
  const { loadChats, threadOf, unreadCount } = await import('../src/expenseChat.js');
  const chats = loadChats();
  const keys = Object.keys(chats);
  assert.equal(keys.length, 3);
  const returned = Object.entries(loadChecks()).find(([, v]) => v.status === 'returned')[0];
  assert.ok(chats[returned].messages.some((m) => m.kind === 'returned') && chats[returned].messages.some((m) => m.from === 'sales'));
  const yesterday = shiftDate(dateKey(new Date(NOW)), -1);
  assert.equal(unreadCount(chats, 'u02', yesterday, 'sales'), 1);
  assert.equal(unreadCount(chats, 'u04', yesterday, 'accounting'), 1);
  assert.equal(threadOf(chats, 'u01', yesterday).messages.length, 0);
});
