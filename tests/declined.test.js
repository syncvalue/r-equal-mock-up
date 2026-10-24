import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { recordDeclined, loadDeclined, DECLINE_REASONS } = await import('../src/declined.js');
const { declinedList, customerProfile, customerDossier } = await import('../src/customerHistory.js');
const { declinedCardHtml, salesDeclinedCard, customerMarks } = await import('../src/customerProfileView.js');
const { customerModalHtml } = await import('../callcenter/dispatcherView.js');

const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
beforeEach(() => store.clear());

const items = [
  { name: 'ロレックス デイトナ', category: '腕時計', rank: 'A', qty: 1, price: 900000, sell: false, declineReason: '金額に納得いただけなかった' },
  { name: 'ゴルフクラブ セット', category: 'その他', rank: 'B', qty: 2, price: 40000, sell: false },
];

test('見送り品の記録: 訪問ごとに1件。見送りがなければ残さない。あとから売ることにしたら消える', () => {
  recordDeclined({ visitId: 'V1', phone: '090-1111-2222', customerName: 'A', at: Date.UTC(2026, 9, 20), items });
  assert.equal(loadDeclined().length, 1);
  assert.deepEqual(loadDeclined()[0].items.map((i) => [i.name, i.qty, i.price, i.reason]), [['ロレックス デイトナ', 1, 900000, '金額に納得いただけなかった'], ['ゴルフクラブ セット', 2, 40000, '']]);
  recordDeclined({ visitId: 'V1', phone: '090-1111-2222', customerName: 'A', at: Date.UTC(2026, 9, 20), items: [items[0]] }); // 同じ訪問は、上書き
  assert.equal(loadDeclined().length, 1);
  assert.equal(loadDeclined()[0].items.length, 1);
  recordDeclined({ visitId: 'V1', phone: '090-1111-2222', customerName: 'A', at: 1, items: [] }); // すべて売ることにした
  assert.equal(loadDeclined().length, 0);
  assert.ok(DECLINE_REASONS.length >= 5);
});

test('見送り品の一覧: 電話番号から、新しい訪問の品から。サンプルの履歴と、記録したものを合わせる', () => {
  recordDeclined({ visitId: 'V1', phone: '09011112222', customerName: 'A', at: Date.UTC(2026, 9, 20), items });
  assert.deepEqual(declinedList(['090-1111-2222']).map((i) => i.name), ['ロレックス デイトナ', 'ゴルフクラブ セット']); // ハイフンの違いは吸収
  assert.deepEqual(declinedList(['090-9999-9999']), []);
  const mae = declinedList(['090-5050-6060']); // サンプル: 前川 玲子（2回の訪問で、3品）
  assert.equal(mae.length, 3);
  assert.ok(mae[0].at >= mae[1].at && mae[1].at >= mae[2].at);
  recordDeclined({ visitId: 'V7', phone: '090-5050-6060', customerName: '前川', at: Date.UTC(2026, 9, 22), items: [items[1]] });
  assert.equal(declinedList(['090-5050-6060'])[0].name, 'ゴルフクラブ セット'); // 一番新しい訪問が先頭
  assert.equal(customerProfile(['090-5050-6060']).declined, 4);
  assert.equal(customerDossier(['090-5050-6060']).declined.length, 4);
});

test('見送り品の表示: 点数・査定額の合計・分野・訪問ごとの内訳・理由', () => {
  recordDeclined({ visitId: 'V1', phone: '090-1111-2222', customerName: 'A', at: Date.UTC(2026, 9, 20), items });
  const t = text(declinedCardHtml(declinedList(['090-1111-2222'])));
  assert.ok(['3点', '査定額の合計 ¥980,000', '腕時計', 'その他', 'ロレックス デイトナ', 'ゴルフクラブ セット ×2', '¥80,000', '金額に納得いただけなかった', '2026/10/20の訪問'].every((k) => t.includes(k)), t);
  assert.match(text(salesDeclinedCard(declinedList(['090-1111-2222']))), /前に査定したが、売らなかったもの/);
  assert.equal(salesDeclinedCard([]), ''); // なければ、出さない
  assert.match(text(declinedCardHtml([], { empty: true })), /ありません/);
  assert.match(text(customerMarks(customerProfile(['090-5050-6060']))), /見送3/); // 予定表の帯の印
});

test('配車係のお客様の詳細に、見送り品を出す', () => {
  const rec = { id: 'r1', userId: 'u09', date: '2026-10-28', start: '13:00', end: '14:30', areaId: 'osaka', status: 'tentative', customer: { name: '前川 玲子', phone: '090-5050-6060', address: '大阪' }, hearing: { wants: '腕時計' }, gender: 'f' };
  const t = text(customerModalHtml({ rid: 'r1', reservations: [rec], now: new Date(2026, 9, 24, 9) }));
  assert.ok(t.includes('査定したが売らなかったもの（お手元に持っている可能性）') && t.includes('パテック・フィリップ カラトラバ') && t.includes('ダイヤ ネックレス 2.0ct'), t);
  const none = text(customerModalHtml({ rid: 'r1', reservations: [{ ...rec, customer: { ...rec.customer, phone: '090-0000-0000' } }], now: new Date(2026, 9, 24, 9) }));
  assert.ok(none.includes('査定したが売らなかったものは、ありません'));
});
