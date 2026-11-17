import { test } from 'node:test';
import assert from 'node:assert/strict';
import { USERS, dailySeries, summarize, stats, rangeOf, visitRecords, yearlySeries } from '../src/dashboard.js';

const NOW = new Date(2026, 10, 17); // 2026-11-17
const me = [USERS[0]];

test('訪問の記録に、受付の種別（新・再）がある。成約は、買取額より少ない粗利がある', () => {
  const recs = visitRecords(me, { start: new Date(2026, 9, 1), end: NOW }, NOW);
  assert.ok(recs.length > 20);
  assert.ok(recs.every((r) => r.apType === '新' || r.apType === '再'));
  assert.ok(recs.some((r) => r.apType === '再') && recs.some((r) => r.apType === '新'));
  assert.ok(recs.filter((r) => r.result === 'won').every((r) => r.gross > 0 && r.gross < r.amount));
  assert.ok(recs.filter((r) => r.result !== 'won').every((r) => r.gross === 0));
});

test('日別・期間の集計に、粗利・再訪数がある（再訪数は、不在・日程変更を含まない訪問のうち、種別が再のもの）', () => {
  const range = rangeOf('month', NOW);
  const s = summarize(dailySeries(me, range, NOW));
  const recs = visitRecords(me, range, NOW);
  assert.equal(s.gross, recs.reduce((n, r) => n + r.gross, 0));
  const counted = recs.filter((r) => r.result === 'won' || r.result === 'lost');
  assert.equal(s.revisits, counted.filter((r) => r.apType === '再').length);
  assert.equal(s.newVisits, counted.filter((r) => r.apType === '新').length);
  assert.equal(s.revisits + s.newVisits, s.visits);
  assert.equal(stats(me, range, NOW).gross, s.gross);
});

test('年間: 1〜12月の粗利・再訪数が出る。月の合計は年の合計に一致し、これからの月は0', () => {
  const y = yearlySeries(me, NOW);
  assert.equal(y.months.length, 12);
  assert.equal(y.year, 2026);
  assert.equal(y.total.gross, y.months.reduce((n, m) => n + m.gross, 0));
  assert.equal(y.total.revisits, y.months.reduce((n, m) => n + m.revisits, 0));
  assert.ok(y.months.slice(0, 11).every((m) => m.gross > 0));
  assert.equal(y.months[11].gross, 0); // 12月はこれから
  const nov = summarize(dailySeries(me, rangeOf('month', NOW), NOW));
  assert.equal(y.months[10].gross, nov.gross); // 今月は、今月の集計と同じ
  assert.deepEqual(yearlySeries(me, NOW), y); // 同じ条件なら、同じ結果
});

test('グループ全体の年間は、メンバーの合計', () => {
  const group = USERS.filter((u) => u.group === 'A');
  const g = yearlySeries(group, NOW).total.gross;
  assert.equal(g, group.reduce((n, u) => n + yearlySeries([u], NOW).total.gross, 0));
});

test('画面: 年間粗利・月別粗利・再訪数が出る（グループ全体の表にも、再訪・粗利）', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
  globalThis.document = { documentElement: { classList: { toggle() {}, contains: () => false }, style: {} }, querySelector: () => ({}), querySelectorAll: () => [], addEventListener() {}, activeElement: null, head: { appendChild() {} }, createElement: () => ({}) };
  const { dashboardView } = await import('../src/dashboardView.js');
  const base = { user: 'u02', visitId: 'V', dash: { period: 'month', scope: 'me', member: null, viewAs: null, msgOpen: {} }, modal: null };
  const html = dashboardView(base);
  for (const w of ['年間粗利', '年間の再訪数', '月別の粗利と再訪数', '再訪数', '粗利', '12月']) assert.ok(html.includes(w), w);
  const group = dashboardView({ ...base, dash: { ...base.dash, scope: 'group' } });
  assert.ok(group.includes('<th class="text-right">再訪</th>') && group.includes('<th class="text-right">粗利</th>'));
});
