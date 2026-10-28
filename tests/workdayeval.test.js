import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { workdayView } = await import('../src/workdayView.js');
const { evalTargetOfVisit } = await import('../src/scheduleView.js');
const { publishLive, upsertEval } = await import('../src/store.js');

test('日報: 評価が未登録の訪問に、目立つ表示と登録ボタンを出す。登録済み・不在の訪問には出さない', () => {
  publishLive({ visitId: 'V1', customerName: '山田 太郎', phone: '090-1', startedAt: 1, endedAt: 2, items: [], updatedAt: 2 });
  const dayOf = (visits) => ({ date: '2026-10-28', userId: 'u01', startedAt: 1, closedAt: null, start: { diff: 0 }, expenses: [], deposits: [], visits, close: null, report: null });
  const v1 = { visitId: 'V1', customerName: '山田 太郎', itemCount: 1, total: 1000, at: 5 };
  const v2 = { visitId: 'V2', customerName: '不在さん', itemCount: 0, total: 0, at: 6, outcome: { type: 'absent', memo: '' } };
  const render = (visits) => workdayView({ phase: 'closed', user: 'u01', day: dayOf(visits) });
  const html = render([v1, v2]);
  assert.match(html, /お客様の評価が未登録です（1件）/);
  assert.match(html, /data-action="eval-open" data-visit-id="V1"/);
  assert.doesNotMatch(html, /data-visit-id="V2"/);
  assert.equal(evalTargetOfVisit('V1').customer.phone, '090-1');
  assert.equal(evalTargetOfVisit('V2'), null);
  upsertEval({ visitId: 'V1', overall: 4, attitude: '', repeat: '', wealth: '', timing: '', cats: [], flags: [], memo: '' });
  const after = render([v1, v2]);
  assert.doesNotMatch(after, /未登録です/);
  assert.match(after, /評価済み ★4/);
});
