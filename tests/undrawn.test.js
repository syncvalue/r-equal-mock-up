import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const W = await import('../src/workday.js');
const { expenseView } = await import('../src/workdayView.js');

const today = W.dateKey();
const day = (withdrawals) => ({ userId: 'u01', date: today, startedAt: 1, start: { expected: 50000, counted: 50000, diff: 0 }, expenses: [], withdrawals, visits: [], closedAt: null });
const state = (d) => ({ phase: 'open', user: 'u01', day: d, expDraft: W.blankExpenseDraft(), withdrawDraft: { amount: 0 }, advForm: { amount: 0, memo: '' }, advRequests: [], fixable: [] });

test('補充金は、引き出すまで所持金に入らない。引き出した分だけが所持金に加わる', () => {
  const none = W.summaryOf(day([]), 'u01');
  assert.deepEqual([none.depositTotal, none.undrawn, none.balance], [300000, 300000, 50000]);
  const part = W.summaryOf(day([{ id: 'w', at: 1, amount: 100000 }]), 'u01');
  assert.deepEqual([part.undrawn, part.balance], [200000, 150000]);
});

test('経費管理の表示: 未引き出しがあるときは、補充金のお知らせ・未引き出しの印・ボタンが出る。引き出し済みなら、お知らせは出ない', () => {
  const before = expenseView(state(day([])));
  for (const w of ['未引き出し ¥300,000', '登録すると、はじめて所持金に加わります', 'data-action="wdr-rest"', '引き出すまで所持金ではありません', '引き出すまで、所持金に入りません']) assert.ok(before.includes(w), w);
  const after = expenseView(state(day([{ id: 'w', at: 1, amount: 300000 }])));
  assert.ok(!after.includes('登録すると、はじめて所持金に加わります') && after.includes('引き出し済み') && !after.includes('data-action="wdr-rest"'));
});

test('経費管理には、補充を依頼するボタンだけが出る（やり取り中・新着の件数つき）。入力欄は、ボタンで開く画面にある', async () => {
  const A = await import('../src/advanceRequest.js');
  const { advanceModalView } = await import('../src/advanceView.js');
  const r1 = { ...A.makeRequest('u01', { amount: 200000, memo: '高額案件' }, 3), id: 'AR-1' };
  const r2 = { ...A.makeRequest('u01', { amount: 50000, memo: '' }, 2), id: 'AR-2', status: 'closed', closedAt: 5 };
  const chats = A.postAdv({}, 'AR-1', { from: 'accounting', by: '経理部', text: '10万円ではどうですか？', now: 9 });
  const s = { ...state(day([])), advRequests: A.requestsOf([r1, r2], 'u01'), chats, modal: { type: 'advance' }, advSel: 'AR-1', advChat: '了解です' };
  const page = expenseView(s);
  assert.ok(page.includes('data-action="adv-open"') && page.includes('やり取り中 1') && page.includes('新着 1'));
  assert.ok(!page.includes('data-wd="adv-amount"') && !page.includes('data-wd="adv-memo"')); // 入力欄は、画面には置かない
  const modal = advanceModalView(s);
  for (const w of ['data-wd="adv-amount"', 'data-wd="adv-memo"', 'data-action="adv-send"', '経理部とのやり取り', '10万円ではどうですか？', 'data-wd="adv-chat"', 'data-action="adv-chat-send"', 'value="了解です"', 'data-action="adv-close"', '完了にする', 'data-action="adv-pick"', '金額を入力', '銀行システム']) assert.ok(modal.includes(w), w);
  assert.ok(!modal.includes('取り下げ') && !modal.includes('振込済み') && !modal.includes('却下'));
  const closed = advanceModalView({ ...s, advSel: 'AR-2' }); // 完了した依頼は、チャットを続けられない
  assert.ok(closed.includes('に完了') && !closed.includes('data-action="adv-close"') && !closed.includes('data-action="adv-chat-send"') && !closed.includes('data-wd="adv-chat"'));
  assert.equal(advanceModalView({ ...s, modal: null }), '');
  assert.ok(advanceModalView({ ...s, advRequests: [], advSel: null }).includes('依頼を送ると'));
});
