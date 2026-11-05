import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const D = await import('../src/dailyCheck.js');

const ex = (o) => ({ id: 'e1', at: 1, type: 'gas', amount: 1000, memo: 'ガソリン', photo: 'data:x', ...o });
const buy = (o) => ({ id: 'p1', at: 2, type: 'purchase', amount: 50000, memo: '山田 様 買取代金（3点）', photo: null, auto: true, ...o });
// 始業 5万円 ＋ 引き出し 10万円 − 経費 1,000円 − 買取代金 5万円 ＝ 帳簿残高 99,000円
const day = (o = {}) => ({
  userId: 'u01', date: '2026-11-04', startedAt: 1,
  start: { expected: 50000, counted: 50000, diff: 0, note: '' },
  expenses: [ex(), buy()], withdrawals: [{ id: 'w', amount: 100000 }], visits: [],
  closedAt: 2, close: { counted: 99000, expected: 99000, diff: 0, note: '', cashPhoto: 'data:cash' },
  report: { deposits: [{ amount: 100000 }], depositTotal: 100000, withdrawalTotal: 100000 },
  ...o,
});

test('現金の照合: 前日繰越金→始業時→引き出し→経費・お客様への支払→帳簿→終業時の過不足', () => {
  const r = D.reconcile(day({ close: { counted: 96000, diff: -3000, cashPhoto: 'x', note: '釣り銭' } }));
  assert.deepEqual(
    [r.carryover, r.startCounted, r.startDiff, r.withdrawn, r.expenses, r.customerPaid, r.book, r.closeCounted, r.closeDiff],
    [50000, 50000, 0, 100000, 1000, 50000, 99000, 96000, -3000],
  );
  const open = D.reconcile(day({ closedAt: null, close: null }));
  assert.deepEqual([open.closeCounted, open.closeDiff], [null, null]);
});

test('前日繰越金は、前日の記録の終業時の金額（未終業なら帳簿残高）。前日の記録がなければ null', () => {
  const days = [day({ date: '2026-11-03', close: { counted: 97000, cashPhoto: 'x' } }), day({ userId: 'u02', date: '2026-11-03' }), day()];
  assert.equal(D.prevAmount(days, 'u01', '2026-11-04'), 97000);
  assert.equal(D.prevAmount(days, 'u01', '2026-11-03'), null);
  assert.equal(D.prevAmount([day({ date: '2026-11-03', closedAt: null, close: null })], 'u01', '2026-11-04'), 99000);
});

test('指摘: 問題のない日は指摘なし。未終業・現金写真なし・領収書なしは「直す必要がある」（blocks）', () => {
  const clean = D.dayFlags(day(), { prev: null });
  assert.deepEqual(clean, []);
  const open = D.dayFlags(day({ closedAt: null, close: null }), { prev: null });
  assert.ok(open.some((f) => f.blocks && f.text.includes('日報')));
  const nophoto = D.dayFlags(day({ close: { counted: 99000, cashPhoto: null } }), { prev: null });
  assert.ok(nophoto.some((f) => f.blocks && f.text.includes('現金の写真')));
  const noReceipt = D.checkRows([day({ expenses: [ex({ photo: null }), buy()] })], '2026-11-04', {})[0];
  assert.ok(noReceipt.issues.some((f) => f.blocks && f.text.includes('ガソリン代') && f.text.includes('領収書')));
});

test('指摘: 始業時の差異・終業時の過不足・補充金の未引き出し・前日繰越金の不一致は、直さなくても確認できる（blocks なし）', () => {
  const f = D.dayFlags(day({
    start: { expected: 50000, counted: 49000, diff: -1000, note: '持ち帰った' },
    close: { counted: 90000, diff: -9000, cashPhoto: 'x', note: '' },
  }), { prev: 60000 });
  const texts = f.map((x) => x.text).join('\n');
  assert.ok(texts.includes('始業時') && texts.includes('終業時の過不足') && texts.includes('前日繰越金'));
  assert.ok(f.every((x) => !x.blocks));
});

test('経費の明細: 買取代金（お客様への支払）と経費を分け、経費だけに確認のポイントが付く', () => {
  const rows = D.checkRows([day({ expenses: [ex({ photo: null, id: 'a' }), buy()] })], '2026-11-04', {});
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.deepEqual(r.expenses.map((e) => e.id), ['a']);
  assert.deepEqual(r.purchases.map((e) => e.id), ['p1']);
  assert.ok(r.expenses[0].flags.length > 0);
  assert.equal(r.status, 'pending');
  assert.ok(r.issues.some((i) => i.text.includes('領収書')));
  assert.equal(r.canCheck, false);
});

test('一覧: 対象日の記録だけ。始業していない記録は出さない。確認済みの状況を結びつける', () => {
  const days = [day(), day({ userId: 'u02' }), day({ userId: 'u03', date: '2026-11-03' }), day({ userId: 'u04', startedAt: null })];
  const checks = { 'u01:2026-11-04': { status: 'ok', reason: '' } };
  const rows = D.checkRows(days, '2026-11-04', checks);
  assert.deepEqual(rows.map((r) => [r.userId, r.status]), [['u01', 'ok'], ['u02', 'pending']]);
  assert.deepEqual(D.checkCounts(rows), { total: 2, pending: 1, ok: 1, returned: 0, withIssues: 0 });
});

test('チェック済み・差戻し・未チェックに戻す: 差戻しは理由必須。元の記録は変えない', () => {
  const c0 = {};
  const now = new Date('2026-11-05T10:00:00').getTime();
  const c1 = D.markOk(c0, 'u01', '2026-11-04', { by: '営業サポート', now });
  assert.deepEqual([c1['u01:2026-11-04'].status, c1['u01:2026-11-04'].date, c1['u01:2026-11-04'].by, Object.keys(c0).length], ['ok', '2026-11-05', '営業サポート', 0]);
  assert.equal(D.markReturned(c1, 'u02', '2026-11-04', '  '), c1);
  const c2 = D.markReturned(c1, 'u02', '2026-11-04', ' 領収書を撮り直して ', { now });
  assert.deepEqual([c2['u02:2026-11-04'].status, c2['u02:2026-11-04'].reason], ['returned', '領収書を撮り直して']);
  assert.deepEqual(Object.keys(D.reopen(c2, 'u01', '2026-11-04')), ['u02:2026-11-04']);
});

test('一括でチェック済みにできるのは、未チェックで指摘が1つもない鑑定士だけ', () => {
  const days = [day(), day({ userId: 'u02', expenses: [ex({ photo: null }), buy()] }), day({ userId: 'u03', expenses: [ex({ type: 'other', memo: '手土産' }), buy()] })];
  const rows = D.checkRows(days, '2026-11-04', {});
  assert.deepEqual(D.bulkTargets(rows).map((r) => r.userId), ['u01']);
  assert.equal(D.checkRows(days, '2026-11-04', { 'u01:2026-11-04': { status: 'ok' } }).filter((r) => D.bulkTargets([r]).length).length, 0);
});

test('保存と読み込み', () => {
  assert.deepEqual(D.loadChecks(), {});
  assert.equal(D.saveChecks({ a: { status: 'ok' } }), true);
  assert.deepEqual(D.loadChecks(), { a: { status: 'ok' } });
});

test('経費の確認のポイント: 領収書なし（直す必要あり）・高額・「その他」・内容なし。経理代行は領収書なしでも指摘しない', () => {
  assert.deepEqual(D.claimFlags(ex()), []);
  assert.ok(D.claimFlags(ex({ photo: null })).some((f) => f.level === 'danger' && f.blocks && f.text.includes('領収書')));
  assert.equal(D.claimFlags(ex({ photo: null, proxy: true })).length, 0);
  assert.ok(D.claimFlags(ex({ amount: 10000 })).some((f) => f.text.includes('高額')));
  assert.ok(D.claimFlags(ex({ type: 'other' })).some((f) => f.text.includes('その他')));
  assert.ok(D.claimFlags(ex({ memo: ' ' })).some((f) => f.text.includes('内容')));
});

test('日付をずらす: 月・年をまたぐ', () => {
  assert.equal(D.shiftDate('2026-11-01', -1), '2026-10-31');
  assert.equal(D.shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(D.shiftDate('2026-11-05', 0), '2026-11-05');
});

test('1件ずつの確認: 経費・お客様への支払・終業時の現金の確認がそろうまで、チェック済みにできない', () => {
  const d = day();
  const id = D.cashItemId('u01', '2026-11-04');
  const none = D.checkRows([d], '2026-11-04', {}, {})[0];
  assert.deepEqual([none.progress, none.canCheck, none.canOk, none.cash.required], [{ done: 0, total: 3 }, true, false, true]);
  const part = D.checkRows([d], '2026-11-04', {}, { e1: { by: 'x', at: 1 }, p1: { by: 'x', at: 1 } })[0];
  assert.deepEqual([part.progress.done, Boolean(part.expenses[0].checked), Boolean(part.purchases[0].checked), Boolean(part.cash.checked), part.canOk], [2, true, true, false, false]);
  const all = D.checkRows([d], '2026-11-04', {}, D.markAllItems({}, none, { by: '営業サポート', now: 5 }))[0];
  assert.deepEqual([all.progress, all.canOk, all.allChecked], [{ done: 3, total: 3 }, true, true]);
  assert.ok(Object.keys(D.markAllItems({}, none)).includes(id));
});

test('1件ずつの確認: 押すたびに、確認した／していないが切り替わる。元は変えない。未終業・写真なしのときは現金の確認は不要', () => {
  const a = {};
  const b = D.toggleItem(a, 'e1', { by: '営業サポート', now: 9 });
  assert.deepEqual([b.e1.by, b.e1.at, Object.keys(a).length], ['営業サポート', 9, 0]);
  assert.deepEqual(D.toggleItem(b, 'e1'), {});
  const open = D.checkRows([day({ closedAt: null, close: null })], '2026-11-04', {}, {})[0];
  assert.deepEqual([open.cash.required, open.progress.total, open.canOk], [false, 2, false]); // 日報未提出（blocks）でもあるので押せない
  assert.equal(D.loadItemChecks().x, undefined);
  assert.equal(D.saveItemChecks({ e1: { by: 'x' } }), true);
  assert.deepEqual(D.loadItemChecks(), { e1: { by: 'x' } });
});

test('カレンダー: 月の週ごとの日付（日曜始まり。前後の空きは null）', () => {
  const g = D.monthGrid('2026-11'); // 2026-11-01 は日曜
  assert.equal(g[0][0], '2026-11-01');
  assert.equal(g.at(-1)[0], '2026-11-29');
  assert.deepEqual(g.at(-1).slice(1), ['2026-11-30', null, null, null, null, null]);
  assert.ok(g.every((w) => w.length === 7));
  assert.deepEqual(D.monthGrid('2026-10')[0].slice(0, 4), [null, null, null, null]); // 10/1 は木曜
});

test('カレンダーの印: 日ごとの、提出された人数・未チェックの人数・要対応（赤の指摘がある未チェック）の人数', () => {
  const days = [
    day(), // 11-04 u01: 問題なし
    day({ userId: 'u02', expenses: [ex({ photo: null }), buy()] }), // 11-04 u02: 領収書なし（要対応）
    day({ userId: 'u03' }), // 11-04 u03: チェック済み
    day({ userId: 'u01', date: '2026-11-03', start: { expected: 50000, counted: 49000, diff: -1000, note: 'x' } }), // 11-03 u01: 確認のみ（要対応ではない）
  ];
  const checks = { 'u03:2026-11-04': { status: 'ok' } };
  const b = D.dayBadges(days, checks, {});
  assert.deepEqual(b['2026-11-04'], { total: 3, pending: 2, urgent: 1 });
  assert.deepEqual(b['2026-11-03'], { total: 1, pending: 1, urgent: 0 });
  assert.equal(b['2026-11-02'], undefined);
});
