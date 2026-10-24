import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { loadCustomerEval, saveCustomerEval, customerEvalFromVisit } = await import('../src/customerEval.js');
const { customerProfile, setFirstVisitCustomerEval, customerDossier, evalOfVisit } = await import('../src/customerHistory.js');
const { pastEvalView } = await import('../src/customerHistoryView.js');
const { upsertEval } = await import('../src/store.js');

const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
beforeEach(() => store.clear());

const visitEval = (o = {}) => ({ visitId: 'V1', phone: '090-1111-2222', customerName: 'A', savedAt: Date.UTC(2026, 9, 20), by: '営業 鈴木 一郎', overall: 4, attitude: '良好', repeat: '高い', wealth: '高そう', timing: '3か月以内', cats: [], flags: [], memo: '初回。丁寧に対応', ...o });

test('アポの評価から、お客様の評価の初期値を作る（資力→ランク、フラグ・態度→厄介度）', () => {
  assert.deepEqual(customerEvalFromVisit(visitEval()), { rank: 'A', trouble: { level: 'none', tags: [], memo: '' }, memo: '初回。丁寧に対応' });
  assert.equal(customerEvalFromVisit(visitEval({ wealth: '普通' })).rank, 'B');
  assert.equal(customerEvalFromVisit(visitEval({ wealth: '低そう' })).rank, 'C');
  const c = customerEvalFromVisit(visitEval({ flags: ['価格交渉が強い', '紹介が見込める'] }));
  assert.deepEqual([c.trouble.level, c.trouble.tags], ['caution', ['価格交渉が強い']]); // 前向きなフラグは、厄介な点に入れない
  assert.equal(customerEvalFromVisit(visitEval({ flags: ['クレーム注意'] })).trouble.level, 'alert');
  assert.equal(customerEvalFromVisit(visitEval({ attitude: '難あり' })).trouble.level, 'caution');
});

test('お客様の評価の登録・読み出し（電話番号で。ハイフンの違いは吸収）。登録したものが、評価として使われる', () => {
  assert.equal(loadCustomerEval(['090-1111-2222']), null);
  saveCustomerEval('090-1111-2222', { rank: 'S', trouble: { level: 'alert', tags: ['クレームが多い'] }, memo: '資産は多い' }, { by: '配車係' });
  assert.equal(loadCustomerEval(['09011112222']).rank, 'S');
  const p = customerProfile(['090-1111-2222']);
  assert.deepEqual([p.rank, p.trouble.level, p.trouble.tags, p.memo, p.meta.by, p.meta.source], ['S', 'alert', ['クレームが多い'], '資産は多い', '配車係', 'manual']);
  // 登録がサンプルの評価より優先される
  saveCustomerEval('080-8901-2345', { rank: 'C', trouble: { level: 'none', tags: [] } }, { by: '配車係' });
  assert.deepEqual([customerProfile(['080-8901-2345']).rank, customerProfile(['080-8901-2345']).trouble.level], ['C', 'none']);
  assert.equal(customerProfile(['080-8901-2345']).cooloff.length, 1); // クーリングオフ歴は、お客様の評価を登録し直しても消えない
});

test('初めてのアポの評価は、そのまま、お客様の評価の初期値になる。2回目以降・登録済みなら、設定しない', () => {
  const rec = visitEval({ phone: '090-3333-4444' });
  assert.equal(setFirstVisitCustomerEval(rec), true);
  const p = customerProfile(['090-3333-4444']);
  assert.deepEqual([p.rank, p.meta.source, p.meta.by], ['A', 'first-visit', '自動（初回のアポの評価）']);
  // 登録済みなら、上書きしない
  assert.equal(setFirstVisitCustomerEval(visitEval({ phone: '090-3333-4444', wealth: '低そう', visitId: 'V2' })), false);
  assert.equal(customerProfile(['090-3333-4444']).rank, 'A');
  // 過去のアポがある（サンプルの履歴）お客様は、初回ではない
  assert.equal(setFirstVisitCustomerEval(visitEval({ phone: '090-7777-0001', visitId: 'V9' }), {}), true);
  assert.equal(setFirstVisitCustomerEval(visitEval({ phone: '080-2345-6789' })), false); // 登録済みのお客様
});

test('アポの評価は、アポごとに別。お客様の評価とは別に管理する', () => {
  upsertEval(visitEval({ visitId: 'V1', phone: '090-5555-6666', savedAt: Date.UTC(2026, 9, 1), overall: 5, memo: '1回目' }));
  upsertEval(visitEval({ visitId: 'V2', phone: '090-5555-6666', savedAt: Date.UTC(2026, 9, 10), overall: 2, memo: '2回目は難あり' }));
  const d = customerDossier(['090-5555-6666']);
  assert.equal(d.evals.length, 2); // アポの評価は、アポの数だけ
  assert.equal(loadCustomerEval(['090-5555-6666']), null); // お客様の評価は、まだ登録されていない
  const seedVisit = customerDossier(['090-5050-6060']).visits[0];
  assert.ok(seedVisit.eval && seedVisit.eval.memo); // 履歴の各回に、その回の評価が結びつく
  assert.equal(evalOfVisit({ at: 5, visitId: 'X' }, [{ visitId: 'X', savedAt: 999 }]).visitId, 'X'); // 識別子があれば、それで結びつく
});

test('営業のタブレット: 過去のアポごとの評価を、アポの数だけ出す', () => {
  const h = { isRepeat: true, count: 3, visits: customerDossier(['090-5050-6060']).visits };
  const t = text(pastEvalView(h));
  assert.match(t, /過去のアポごとの評価（3回）/);
  assert.ok(['バーキンの査定額に不満が強く', '査定額への不満を繰り返し言われた', '骨董を中心に売却', 'エルメス バーキン30'].every((k) => t.includes(k)), t); // 回ごとの評価・メモと、品目
  assert.equal((pastEvalView(h).match(/<details class="rounded-lg border bg-white"/g) || []).length, 3);
  assert.match(text(pastEvalView({ isRepeat: false })), /初めてのお客様/);
});
