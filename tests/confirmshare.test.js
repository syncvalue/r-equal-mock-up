import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { reservationToEvent } = await import('../src/reservations.js');
const { confirmCallsHtml, hearingModal } = await import('../src/hearingView.js');

const NOW = new Date(2026, 10, 18, 9, 0);
const res = (o = {}) => ({
  id: 'R1', receptionNo: 'CC-1', receivedAt: '2026/11/17 10:00', operator: '佐藤', apType: '新', userId: 'u01', date: '2026-11-19', start: '10:00', end: '11:30', status: 'confirmed',
  lat: 34.7, lng: 135.5, customer: { name: '山田 花子', kana: 'ヤマダ ハナコ', phone: '090-1111-2222', zip: '', address: '大阪府大阪市1-1' }, hearing: { wants: '時計', notes: '未確認' }, ...o,
});
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const calls = [
  { result: 'noanswer', memo: '', by: '佐藤', at: new Date(2026, 10, 18, 9, 0).getTime() },
  { result: 'reached', memo: '駐車場はありません。<b>ご主人も同席</b>します', by: '渡辺', at: new Date(2026, 10, 18, 17, 30).getTime() },
];

test('鑑定士の予定（受付から作る）に、前日確認の記録（連絡の結果・メモ）を持たせる', () => {
  const e = reservationToEvent(res({ confirmCalls: calls }), NOW);
  assert.deepEqual(e.confirmCalls.map((c) => c.result), ['noanswer', 'reached']);
  assert.deepEqual(reservationToEvent(res(), NOW).confirmCalls, []); // 連絡がまだ
});

test('前日確認の記録: 新しい順ではなく、連絡した順に、日時・結果・メモ・電話をした人を出す。メモは、HTMLとして解釈しない', () => {
  const h = confirmCallsHtml(reservationToEvent(res({ confirmCalls: calls }), NOW));
  const t = text(h);
  assert.ok(t.includes('前日確認') && t.includes('つながらなかった') && t.includes('つながった') && t.includes('渡辺') && t.includes('11/18'));
  assert.ok(t.indexOf('つながらなかった') < t.indexOf('駐車場はありません'));
  assert.ok(!h.includes('<b>ご主人も同席</b>') && h.includes('&lt;b&gt;ご主人も同席&lt;/b&gt;'));
});

test('前日確認の記録: まだ連絡していなければ、その旨。不通のまま終了していれば、その旨。元からの予定（受付の記録がない）には、何も出さない', () => {
  assert.ok(text(confirmCallsHtml(reservationToEvent(res(), NOW))).includes('まだ連絡していません'));
  const closed = reservationToEvent(res({ confirmCalls: [calls[0]], confirmClosed: { by: '佐藤', at: 1 } }), NOW);
  assert.ok(text(confirmCallsHtml(closed)).includes('不通のまま、前日確認を終えました'));
  assert.equal(confirmCallsHtml({ customer: { name: 'x' } }), ''); // confirmCalls がない予定
});

test('受電時のヒアリングのモーダルにも、前日確認の記録が出る', () => {
  const m = hearingModal(reservationToEvent(res({ confirmCalls: calls }), NOW));
  assert.ok(text(m.body).includes('ご主人も同席'));
});
