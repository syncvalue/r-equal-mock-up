import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterFlyers, stageCountsForFilter, DUE_OPTIONS } from '../src/flyerSearch.js';

const TODAY = '2026-11-19';
const f = (id, o = {}) => ({ id, name: id, media: 'newspaper', adType: '', area: '大阪府（大阪市）', from: '2026-12-01', to: '2026-12-01', quantity: 1, cost: 0, note: '', stage: 'plan', deadline: '', active: true, ...o });
const list = [
  f('A', { name: '来週の折込 貴金属', stage: 'design', deadline: '2026-11-18' }),
  f('B', { name: '年末のはがき', media: 'dm', area: '兵庫県西宮市', stage: 'plan', deadline: '2026-11-19', note: 'ＤＭ 再訪向け' }),
  f('C', { name: '京都ポスティング', media: 'posting', area: '京都府（北区）', stage: 'submitted', from: '2026-11-18', to: '2026-11-20' }),
  f('D', { name: '10月の折込', stage: 'distributed', from: '2026-10-12', to: '2026-10-12' }),
  f('E', { name: '無効のチラシ', active: false, stage: 'design', deadline: '2026-11-21' }),
];
const ids = (o) => filterFlyers(list, o, TODAY).map((x) => x.id);

test('検索: 条件なしなら、すべて', () => assert.deepEqual(ids({}), ['A', 'B', 'C', 'D', 'E']));

test('検索（進捗）: 未着手・制作中・入稿済み・配布済み・無効。無効は、無効のものだけ', () => {
  assert.deepEqual(ids({ stage: 'plan' }), ['B']);
  assert.deepEqual(ids({ stage: 'design' }), ['A']); // 無効の E は入らない
  assert.deepEqual(ids({ stage: 'submitted' }), ['C']);
  assert.deepEqual(ids({ stage: 'distributed' }), ['D']);
  assert.deepEqual(ids({ stage: 'off' }), ['E']);
  assert.deepEqual(ids({ stage: 'todo' }), ['A', 'B']); // 作業が残っている（未着手・制作中）
});

test('検索（エリア・配布方法）: エリアは都道府県。配布方法は完全一致', () => {
  assert.deepEqual(ids({ area: '兵庫県' }), ['B']);
  assert.deepEqual(ids({ area: '大阪府' }), ['A', 'D', 'E']);
  assert.deepEqual(ids({ media: 'dm' }), ['B']);
  assert.deepEqual(ids({ area: '大阪府', media: 'newspaper', stage: 'todo' }), ['A']); // 条件は、すべて満たすもの
});

test('検索（入稿期限）: 期限切れ・今日・3日以内。入稿済み・配布済み・無効は入らない', () => {
  assert.deepEqual(DUE_OPTIONS.map((x) => x.key), ['overdue', 'today', 'soon']);
  assert.deepEqual(ids({ due: 'overdue' }), ['A']);
  assert.deepEqual(ids({ due: 'today' }), ['B']);
  assert.deepEqual(ids({ due: 'soon' }), []); // E は無効
});

test('検索（フリーワード）: ID・名前・エリア・メモ・配布方法・広告種別。空白で区切ると、すべてを含むもの。全角・半角・大文字小文字は問わない', () => {
  assert.deepEqual(ids({ q: '折込' }), ['A', 'D', 'E']); // 名前、または配布方法（新聞折込）
  assert.deepEqual(ids({ q: 'c' }), ['C']); // ID
  assert.deepEqual(ids({ q: '西宮' }), ['B']); // エリア
  assert.deepEqual(ids({ q: 'dm 再訪' }), ['B']); // 配布方法とメモ（全角のＤＭ）
  assert.deepEqual(ids({ q: 'ポスティング 京都' }), ['C']);
  assert.deepEqual(ids({ q: '折込 兵庫' }), []);
  assert.deepEqual(ids({ q: '  ' }), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(ids({ q: '制作中' }), ['A']); // 進捗の名前でも探せる
});

test('進捗の件数: 進捗の札に付ける件数（無効は無効として数える）', () => {
  assert.deepEqual(stageCountsForFilter(list, TODAY), { all: 5, todo: 2, plan: 1, design: 1, submitted: 1, distributed: 1, off: 1 });
});

// ---- 反響管理の期間（配布した日が、期間内におさまっているか）----
import { flyersInPeriod, periodPreset } from '../src/flyerSearch.js';
const g = (id, from, to) => f(id, { from, to });
const pl = [g('A', '2026-10-31', '2026-10-31'), g('B', '2026-11-01', '2026-11-01'), g('C', '2026-11-30', '2026-11-30'), g('D', '2026-11-28', '2026-12-02'), g('E', '2026-12-01', '2026-12-01')];
const pids = (a, b) => flyersInPeriod(pl, a, b).map((x) => x.id);

test('期間: 配布した日が、期間内におさまっているチラシだけ。両端の日を含む。複数日の配布は、はじめもおわりも期間内', () => {
  assert.deepEqual(pids('2026-11-01', '2026-11-30'), ['B', 'C']); // D は、おわりが期間の外
  assert.deepEqual(pids('2026-11-28', '2026-12-02'), ['C', 'D', 'E']);
  assert.deepEqual(pids('2026-11-01', '2026-11-01'), ['B']); // 1日だけの期間
});
test('期間: はじめだけ・おわりだけの指定もできる。両方なければ、すべて。逆の指定は、1件も出さない', () => {
  assert.deepEqual(pids('2026-11-30', ''), ['C', 'E']);
  assert.deepEqual(pids('', '2026-11-01'), ['A', 'B']);
  assert.deepEqual(pids('', ''), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(pids('2026-12-01', '2026-11-01'), []);
});
test('期間の早見: 今月・先月・直近3か月（今日から3か月前の同じ日まで）', () => {
  assert.deepEqual(periodPreset('month', '2026-11-19'), { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(periodPreset('lastMonth', '2026-11-19'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(periodPreset('lastMonth', '2026-01-10'), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(periodPreset('last3', '2026-11-19'), { from: '2026-08-19', to: '2026-11-19' });
  assert.deepEqual(periodPreset('all', '2026-11-19'), { from: '', to: '' });
});
