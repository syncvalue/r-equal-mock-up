import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarHtml } from '../callcenter/calendarView.js';

const rec = (o = {}) => ({
  id: 'R1', receptionNo: 'CC-1', date: '2026-10-30', start: '10:30', end: '12:00', status: 'confirmed', userId: 'u01',
  customer: { name: '山田 花子', phone: '090-1111-2222', address: '大阪府大阪市阿倍野区1-2-3' }, hearing: { contact: '17:00〜19:00', wants: '時計' }, ...o,
});
const base = { ym: '2026-10', date: '2026-10-30', today: '2026-10-29', calSel: null, draft: { result: 'reached', memo: '' } };
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('月の表: 見出し・日ごとの件数・今日連絡する日の未連絡の件数', () => {
  const h = calendarHtml({ ...base, reservations: [rec(), rec({ id: 'R2', status: 'tentative' })] });
  assert.match(h, /2026年10月/);
  assert.match(h, /data-calday="2026-10-30"/);
  assert.ok(text(h).includes('前日確認 未2'));
  assert.ok(h.includes('data-calmonth="-1"') && h.includes('data-calmonth="1"') && h.includes('data-caltoday'));
});

test('選んだ日の訪問: 時刻・お客様・住所・担当営業・前日確認の希望時間と状態', () => {
  const t = text(calendarHtml({ ...base, reservations: [rec()] }));
  for (const s of ['10:30', '山田 花子', '大阪府大阪市阿倍野区1-2-3', '17:00〜19:00', '未連絡']) assert.ok(t.includes(s), s);
  assert.ok(t.includes('今日、前日確認の連絡をする日'));
  assert.ok(!text(calendarHtml({ ...base, date: '2026-10-31', reservations: [rec({ date: '2026-10-31' })] })).includes('今日、前日確認の連絡をする日'));
});

test('取消した受付は出さない。訪問がない日は、その旨', () => {
  assert.ok(text(calendarHtml({ ...base, reservations: [rec({ status: 'cancelled' })] })).includes('この日の訪問はありません'));
});

test('訪問を選ぶと、連絡の記録の入力と、これまでの連絡の履歴が出る', () => {
  const calls = [{ result: 'noanswer', memo: '留守電に入れた', by: '佐藤', at: new Date(2026, 9, 29, 9, 0).getTime() }];
  const h = calendarHtml({ ...base, calSel: 'R1', draft: { result: 'noanswer', memo: '' }, reservations: [rec({ confirmCalls: calls })] });
  for (const k of ['data-callresult="reached"', 'data-callresult="noanswer"', 'data-callmemo', 'data-callsave="R1"', 'data-chg="R1"']) assert.ok(h.includes(k), k);
  const t = text(h);
  assert.ok(t.includes('不通 1回') && t.includes('留守電に入れた') && t.includes('佐藤'));
});

test('メモの文字は、HTMLとして解釈しない', () => {
  const h = calendarHtml({ ...base, calSel: 'R1', reservations: [rec({ confirmCalls: [{ result: 'reached', memo: '<b>x</b>', by: '佐藤', at: 1 }] })] });
  assert.ok(!h.includes('<b>x</b>') && h.includes('&lt;b&gt;x&lt;/b&gt;'));
});
