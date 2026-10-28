import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarHtml } from '../callcenter/calendarView.js';
import { dayColumns } from '../src/visitCalendar.js';

const NOW = new Date(2026, 9, 29, 9, 0);
const rec = (o = {}) => ({
  id: 'R1', receptionNo: 'CC-1', date: '2026-10-30', start: '10:30', end: '12:00', status: 'confirmed', userId: 'u01', areaId: 'osaka',
  customer: { name: '山田 花子', phone: '090-1111-2222', address: '大阪府大阪市阿倍野区1-2-3' }, hearing: { contact: '17:00〜19:00', wants: '時計' }, ...o,
});
const base = { areaId: 'osaka', mode: 'week', weekStart: '2026-10-29', date: '2026-10-30', today: '2026-10-29', calSel: null, draft: { result: 'reached', memo: '' }, now: NOW };
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('週の表: エリアの切り替え・縦に時間・横に7日。セルは濃さで色分けし、日付を押すとその日になる', () => {
  const h = calendarHtml({ ...base, reservations: [] });
  for (const a of ['osaka', 'hyogo', 'kanto', 'tokai']) assert.ok(h.includes(`data-calarea="${a}"`), a);
  for (const d of ['2026-10-29', '2026-10-30', '2026-11-04']) assert.ok(h.includes(`data-calday="${d}"`), d);
  assert.equal((h.match(/<tr>/g) || []).length, 20 + 1); // 時間の行（9:00〜18:30）と、見出しの行
  assert.ok(h.includes('data-calshift="-7"') && h.includes('data-calshift="7"') && h.includes('data-caltoday'));
  assert.match(h, /rgba\(13,148,136,/);
  assert.ok(text(h).includes('濃い（埋まっている）') && text(h).includes('09:00'));
});

test('週の表: 明日の訪問で前日確認が未の件数を、日付の下に出す（そのエリアだけ）', () => {
  const list = [rec(), rec({ id: 'R2' }), rec({ id: 'R3', areaId: 'kanto' }), rec({ id: 'R4', confirmCalls: [{ result: 'reached', memo: '', by: 'x', at: 1 }] })];
  assert.ok(text(calendarHtml({ ...base, reservations: list })).includes('前日確認 未2'));
});

test('日別: 営業ごとの列。営業の名前と、その日の訪問の帯。週に戻れる', () => {
  const cols = dayColumns({ areaId: 'osaka', date: '2026-10-30', reservations: [], now: NOW });
  const u = cols.find((c) => !c.absent && c.att.kind === 'present').user;
  const h = calendarHtml({ ...base, mode: 'day', reservations: [rec({ userId: u.id })] });
  for (const c of cols) assert.ok(h.includes(c.user.name), c.user.name);
  assert.ok(h.includes('data-calweek') && h.includes('data-calshift="-1"'));
  assert.ok(h.includes(`data-callopen="R1"`));
});

test('日別の右の一覧: 時刻・お客様・住所・前日確認の連絡時間と状態。取消と、別エリアは出さない', () => {
  const list = [rec(), rec({ id: 'X', status: 'cancelled' }), rec({ id: 'K', areaId: 'kanto', userId: 'u99', customer: { name: '別エリア 様', address: '東京' } })];
  const t = text(calendarHtml({ ...base, mode: 'day', reservations: list }));
  for (const s of ['10:30', '山田 花子', '大阪府大阪市阿倍野区1-2-3', '17:00〜19:00', '未連絡', '今日、前日確認の連絡をする日']) assert.ok(t.includes(s), s);
  assert.ok(!t.includes('別エリア'));
  assert.ok(text(calendarHtml({ ...base, mode: 'day', date: '2026-10-31', reservations: [] })).includes('この日の受付した訪問はありません'));
});

test('訪問を選ぶと、連絡の記録の入力と、これまでの連絡の履歴が出る', () => {
  const calls = [{ result: 'noanswer', memo: '留守電に入れた', by: '佐藤', at: new Date(2026, 9, 29, 9, 0).getTime() }];
  const h = calendarHtml({ ...base, mode: 'day', calSel: 'R1', draft: { result: 'noanswer', memo: '' }, reservations: [rec({ confirmCalls: calls })] });
  for (const k of ['data-callresult="reached"', 'data-callresult="noanswer"', 'data-callmemo', 'data-callsave="R1"', 'data-chg="R1"']) assert.ok(h.includes(k), k);
  const t = text(h);
  assert.ok(t.includes('不通 1回') && t.includes('留守電に入れた') && t.includes('佐藤'));
});

test('メモの文字は、HTMLとして解釈しない', () => {
  const h = calendarHtml({ ...base, mode: 'day', calSel: 'R1', reservations: [rec({ confirmCalls: [{ result: 'reached', memo: '<b>x</b>', by: '佐藤', at: 1 }] })] });
  assert.ok(!h.includes('<b>x</b>') && h.includes('&lt;b&gt;x&lt;/b&gt;'));
});
