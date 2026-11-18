import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { RANK_VALUES, STAFF_RANK_KEY, currentStaffRank, staffRankHistory, setStaffRank, staffRankHistoryText, clearStaffRanks } = await import('../src/staffRank.js');
const { rankOfUser, RANKS } = await import('../src/dispatch.js');

beforeEach(() => store.clear());

test('ランクはSS・S・A・Bの4段階。鑑定士のランクの一覧と同じ', () => {
  assert.deepEqual(RANK_VALUES, ['SS', 'S', 'A', 'B']);
  assert.deepEqual(RANKS, RANK_VALUES);
});

test('変更していない鑑定士は、見本（固定値）のランク。変更すると、変更後のランクになる', () => {
  const before = rankOfUser('u01');
  assert.ok(RANKS.includes(before));
  const other = RANKS.find((r) => r !== before);
  const r = setStaffRank('u01', other, { by: '社員 管理', now: Date.UTC(2026, 10, 18), base: before });
  assert.equal(r.ok, true);
  assert.equal(rankOfUser('u01'), other);
  assert.equal(currentStaffRank('u01'), other);
  assert.equal(rankOfUser('u02') !== undefined, true); // ほかの人は変わらない
  clearStaffRanks();
  assert.equal(rankOfUser('u01'), before); // 初期値に戻す
});

test('変更のたびに、変遷（ランク・いつ・誰が）が残る。最初の変更では、変更前の見本のランクも「初期値」として残す', () => {
  setStaffRank('u03', 'SS', { by: '管理者', now: Date.UTC(2026, 9, 1), base: 'S' });
  setStaffRank('u03', 'A', { by: '管理者', now: Date.UTC(2026, 10, 18) });
  const h = staffRankHistory('u03');
  assert.deepEqual(h.map((x) => x.rank), ['S', 'SS', 'A']);
  assert.equal(h[0].at, null); // 初期値には、日付がない
  assert.deepEqual([h[1].by, h[2].by], ['管理者', '管理者']);
  assert.equal(staffRankHistoryText('u03'), 'A（11/18） ← SS（10/1） ← S（初期値）');
});

test('同じランクへの変更は、何も変えない。SS・S・A・B以外のランクと、記録する人がいないときは、変更できない', () => {
  assert.equal(setStaffRank('u01', 'A', { by: '管理者', base: 'A' }).ok, false);
  assert.equal(staffRankHistory('u01').length, 0);
  assert.equal(setStaffRank('u01', 'C', { by: '管理者', base: 'A' }).ok, false);
  assert.equal(setStaffRank('u01', 'SS', { by: ' ', base: 'A' }).ok, false);
  assert.equal(store.has(STAFF_RANK_KEY), false);
});

test('ランクの変遷の文: 変更がなければ空', () => {
  assert.equal(staffRankHistoryText('u05'), '');
});
