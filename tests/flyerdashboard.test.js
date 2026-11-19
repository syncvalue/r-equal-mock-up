import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueFlyers, topFlyersByCalls, stageCounts, monthSummary, windowStart } from '../src/flyerDashboard.js';

const TODAY = '2026-11-19';
const f = (id, o = {}) => ({ id, name: id, media: 'newspaper', area: '大阪府', from: '2026-12-01', to: '2026-12-01', quantity: 1000, cost: 10000, stage: 'design', deadline: '', active: true, ...o });
const at = (s) => Date.parse(`${s}T12:00:00`);
const rec = (flyerId, day, status = 'confirmed') => ({ id: `${flyerId}-${day}-${Math.random()}`, flyerId, status, receivedTs: at(day) });

test('入稿の期限: 未着手・制作中で、期限が過ぎている／今日／3日以内のものに分ける。入稿済み・無効・期限なしは出さない', () => {
  const list = [f('A', { deadline: '2026-11-18' }), f('B', { deadline: TODAY, stage: 'plan' }), f('C', { deadline: '2026-11-22' }), f('D', { deadline: '2026-11-23' }), f('E', { deadline: TODAY, stage: 'submitted' }), f('F', { deadline: TODAY, active: false }), f('G', { deadline: '' })];
  const d = dueFlyers(list, TODAY);
  assert.deepEqual([d.overdue, d.today, d.soon].map((x) => x.map((y) => y.id)), [['A'], ['B'], ['C']]);
});

test('直近3か月の反響の上位: 受付の件数の多い順。3か月より前・反響のないチラシは入れない。件数で絞る', () => {
  assert.equal(windowStart('2026-11-19', 3), '2026-08-19');
  assert.equal(windowStart('2026-05-31', 3), '2026-02-28');
  const list = [f('A'), f('B'), f('C'), f('D')];
  const r = [rec('A', '2026-11-01'), rec('B', '2026-11-02'), rec('B', '2026-10-01'), rec('B', '2026-09-01'), rec('C', '2026-08-19'), rec('C', '2026-08-18'), rec('D', '2026-05-01')];
  const top = topFlyersByCalls(list, r, TODAY, { limit: 10 });
  assert.deepEqual(top.map((x) => [x.flyer.id, x.calls]), [['B', 3], ['A', 1], ['C', 1]]);
  assert.deepEqual(topFlyersByCalls(list, r, TODAY, { limit: 1 }).map((x) => x.flyer.id), ['B']);
  assert.equal(top[0].rate, 3 / 1000);
});

test('進捗の件数: 有効なチラシを、進捗ごとに数える', () => {
  const c = stageCounts([f('A', { stage: 'plan' }), f('B'), f('C'), f('D', { stage: 'submitted' }), f('E', { stage: 'distributed' }), f('F', { active: false })]);
  assert.deepEqual(c, { plan: 1, design: 2, submitted: 1, distributed: 1 });
});

test('今月のまとめ: 受付の件数（先月との差）、今月配布するチラシの費用、粗利と損益', () => {
  const list = [f('A', { from: '2026-11-10', to: '2026-11-10', cost: 50000 }), f('B', { from: '2026-12-01', cost: 99999 }), f('C', { from: '2026-10-20', to: '2026-10-20', cost: 7 })];
  const r = [rec('A', '2026-11-03'), rec('A', '2026-11-05'), rec('C', '2026-10-30'), rec('C', '2026-10-31'), rec('C', '2026-10-02')];
  const results = { [r[0].id]: { won: true, amount: 1, gross: 30000 }, [r[1].id]: { won: true, amount: 1, gross: 40000 }, [r[2].id]: { won: true, amount: 1, gross: 5 } };
  const m = monthSummary(list, r, results, TODAY);
  assert.deepEqual([m.calls, m.prevCalls, m.cost, m.gross, m.profit], [2, 3, 50000, 70000, 20000]);
});
