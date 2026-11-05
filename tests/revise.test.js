import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const W = await import('../src/workday.js');
const D = await import('../src/dailyCheck.js');

const ex = (o) => ({ id: 'e1', at: 1, type: 'gas', amount: 1000, memo: 'ガソリン', photo: 'data:x', ...o });
const buy = { id: 'p1', at: 2, type: 'purchase', amount: 50000, memo: '山田 様 買取代金（3点）', photo: null, auto: true };
// 始業 5万 ＋ 引き出し 10万 − 経費 1,000 − 買取代金 5万 ＝ 帳簿 99,000。終業時に数えた金額も 99,000
const closed = (o = {}) => ({
  userId: 'u01', date: '2026-11-04', startedAt: 1, start: { expected: 50000, counted: 50000, diff: 0 },
  expenses: [ex(), buy], withdrawals: [{ id: 'w', amount: 100000 }], visits: [], closedAt: 5,
  close: { counted: 99000, expected: 99000, diff: 0, cashPhoto: 'c' },
  report: { deposits: [{ amount: 100000 }], depositTotal: 100000, withdrawalTotal: 100000, expenseTotal: 51000, byType: [], purchaseTotal: 50000 },
  ...o,
});

test('終業済みの日の経費を直すと、帳簿残高・終業時の過不足・日報の経費合計も直る（数えた金額は変えない）', () => {
  const d0 = closed();
  const d1 = W.reviseExpense(d0, 'u01', { id: 'e1', type: 'gas', amount: 4000, memo: 'ガソリン代', photo: 'data:y', invoice: true });
  const e = d1.expenses.find((x) => x.id === 'e1');
  assert.deepEqual([e.amount, e.photo, e.invoice, e.at], [4000, 'data:y', true, 1]); // 時刻などは元のまま
  assert.deepEqual([d1.close.counted, d1.close.expected, d1.close.diff, d1.report.expenseTotal], [99000, 96000, 3000, 54000]);
  assert.equal(d0.expenses[0].amount, 1000); // 元の記録は変えない
  assert.equal(d1.report.byType.find((t) => t.key === 'gas').amount, 4000);
});

test('経費の追加と削除。買取代金（自動計上）は、直せない・消せない', () => {
  const added = W.reviseExpense(closed(), 'u01', { id: null, type: 'lunch', amount: 800, memo: '昼食', photo: 'data:z', invoice: false }, { now: 9 });
  assert.equal(added.expenses.length, 3);
  assert.deepEqual([added.expenses[2].type, added.expenses[2].at, added.expenses[2].auto, added.close.diff], ['lunch', 9, false, 800]);
  assert.ok(added.expenses[2].id.startsWith('EX-'));
  const removed = W.reviseRemove(added, 'u01', added.expenses[2].id);
  assert.deepEqual([removed.expenses.length, removed.close.diff], [2, 0]);
  assert.equal(W.reviseExpense(closed(), 'u01', { id: 'p1', type: 'gas', amount: 1, memo: '', photo: null }).expenses.find((x) => x.id === 'p1').amount, 50000);
  assert.equal(W.reviseRemove(closed(), 'u01', 'p1').expenses.length, 2);
});

test('修正できる日: 提出済みで、営業サポートがチェック済みにしていない日（差戻しが先、新しい順）。チェック済みは修正できない', () => {
  const days = [closed({ date: '2026-11-02' }), closed({ date: '2026-11-03' }), closed({ date: '2026-11-04' }), closed({ date: '2026-11-01' }), closed({ userId: 'u02' }), closed({ date: '2026-11-05', closedAt: null, close: null })];
  const checks = { 'u01:2026-11-03': { status: 'ok' }, 'u01:2026-11-02': { status: 'returned', reason: '領収書' } };
  assert.deepEqual(D.revisableDays(days, checks, 'u01').map((r) => [r.date, r.status]), [['2026-11-02', 'returned'], ['2026-11-04', 'pending'], ['2026-11-01', 'pending']]);
  assert.equal(D.canRevise(checks, 'u01', '2026-11-03'), false);
  assert.deepEqual([D.canRevise(checks, 'u01', '2026-11-02'), D.canRevise(checks, 'u01', '2026-11-04')], [true, true]);
});

test('修正したら、差戻しは未チェックに戻り、その経費の1件ずつの確認は外れる', () => {
  const checks = { 'u01:2026-11-04': { status: 'returned', reason: 'x' }, 'u02:2026-11-04': { status: 'returned', reason: 'y' } };
  const items = { e1: { by: 'a' }, e2: { by: 'a' }, 'cash:u01:2026-11-04': { by: 'a' } };
  const r = D.afterRevise({ checks, items }, 'u01', '2026-11-04', ['e1']);
  assert.deepEqual(Object.keys(r.checks), ['u02:2026-11-04']);
  assert.deepEqual(Object.keys(r.items).sort(), ['cash:u01:2026-11-04', 'e2']);
  const pending = D.afterRevise({ checks: {}, items }, 'u01', '2026-11-04', []);
  assert.deepEqual(pending.checks, {});
});

test('タブレットの表示: 差戻しのお知らせ（理由つき）・修正できる日の一覧・修正の画面。チェック済みの日は、直す欄が出ない', async () => {
  const R = await import('../src/reviseView.js');
  const days = [closed({ date: '2026-11-03' }), closed()];
  const checks = { 'u01:2026-11-03': { status: 'returned', reason: '高速代の領収書が読めません' } };
  const fixable = D.revisableDays(days, checks, 'u01');
  const B = await import('../src/ball.js');
  const balls = B.ballList(days, checks, {}, '2026-11-05', 'sales', 'u01');
  const s = { user: 'u01', fixable, balls, modal: { type: 'revise', date: '2026-11-03' }, rvDraft: { id: null, type: '', amount: 0, memo: '', photo: null, invoice: false } };
  const banner = R.reviseBanner(s);
  assert.ok(banner.includes('あなたの対応待ち') && banner.includes('差戻しです') && banner.includes('高速代の領収書が読めません') && banner.includes('2日経過') && banner.includes('data-action="rv-open"'));
  assert.equal(R.reviseBanner({ fixable: [fixable[1]], balls: [] }), ''); // 鑑定士がボールを持っていないときは、お知らせは出さない
  const section = R.reviseSection(s);
  assert.ok(section.includes('差戻し') && section.includes('確認待ち') && section.includes('11/3（火）'));
  const modal = R.reviseModalView(s);
  for (const w of ['営業サポートからの差戻し理由', '高速代の領収書が読めません', 'data-action="rv-edit"', 'data-action="rv-remove"', 'data-wd="rv-amount"', '終業時に数えた金額', '自動計上']) assert.ok(modal.includes(w), w);
  assert.ok(!modal.includes('undefined') && !modal.includes('NaN'));
  const locked = R.reviseModalView({ ...s, fixable: [], modal: { type: 'revise', date: '2026-11-03', day: days[0] } });
  assert.ok(locked.includes('直せません') && !locked.includes('rv-save') && !locked.includes('rv-edit') && !locked.includes('data-wd="rv-amount"'));
  assert.ok(R.rvLiveView(s).includes('種別を選んでください') && R.rvLiveView({ rvDraft: { id: 'e1', type: 'gas', amount: 5, memo: '', photo: 'x', invoice: false } }).includes('修正を保存する'));
});

test('タブレットの表示: 修正の画面に、経理部とのやり取り（チャット）と送る欄が出る。経理部のメッセージが新着なら、一覧・お知らせに出る', async () => {
  const R = await import('../src/reviseView.js');
  const Ch = await import('../src/expenseChat.js');
  const days = [closed({ date: '2026-11-03' })];
  const checks = { 'u01:2026-11-03': { status: 'returned', reason: '領収書' } };
  const chats = Ch.post({}, 'u01', '2026-11-03', { from: 'accounting', by: '経理部', text: '撮り直してください', now: 5 });
  const s = { user: 'u01', fixable: D.revisableDays(days, checks, 'u01'), balls: [{ date: '2026-11-03', why: '差戻しです。経費を修正してください', status: 'returned', age: 2 }], chats, rvChat: '了解です', modal: { type: 'revise', date: '2026-11-03' }, rvDraft: { id: null, type: '', amount: 0, memo: '', photo: null, invoice: false } };
  const modal = R.reviseModalView(s);
  for (const w of ['経理部とのやり取り', '撮り直してください', 'data-wd="rv-chat"', 'data-action="rv-chat-send"', 'value="了解です"']) assert.ok(modal.includes(w), w);
  assert.ok(R.reviseBanner(s).includes('新着 1') && R.reviseSection(s).includes('新着 1'));
  assert.ok(!R.reviseBanner({ ...s, chats: Ch.markRead(chats, 'u01', '2026-11-03', 'sales', 9) }).includes('新着'));
  const locked = R.reviseModalView({ ...s, fixable: [], modal: { type: 'revise', date: '2026-11-03', day: days[0] } });
  assert.ok(locked.includes('data-wd="rv-chat"')); // チェック済みの日も、やり取りは続けられる
});
