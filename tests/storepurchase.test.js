import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const P = await import('../src/storePurchase.js');
const W = await import('../src/warehouse.js');

const NOW = new Date(2026, 9, 25, 15, 0).getTime();
const store = { id: 'S-NAMBA', name: 'なんば', warehouseId: 'W-OSAKA' };
const staff = { id: 'st01', name: '田中 美咲' };
const visit = { id: 'SV-1', storeId: 'S-NAMBA', createdBy: '佐藤', source: 'reserved' };
const customer = { name: '山田 花子', kana: 'ヤマダ ハナコ', phone: '090-1234-5678', phone2: '', zip: '545-0052', address: '大阪府大阪市阿倍野区1-2-3', occupation: '主婦', birth: '1964-02-11' };
const items = [
  { id: 'p1', name: 'ルイ・ヴィトン ネヴァーフル MM', category: 'ブランドバッグ', qty: 1, rank: 'A', price: 98000, sell: true },
  { id: 'p2', name: 'K18 ネックレス', category: 'ジュエリー・貴金属', qty: 2, rank: 'B', price: 52000, sell: true },
  { id: 'p3', name: 'ロレックス デイトジャスト', category: '腕時計', qty: 1, rank: 'B', price: 420000, sell: false },
];
const labels = { 'p1-1': 'RQ-AAA1', 'p2-1': 'RQ-BBB1', 'p2-2': 'RQ-BBB2' };
const colors = { 'p1-1': 'other', 'p2-1': 'red', 'p2-2': 'other' };
const checks = Object.fromEntries(P.LEAVE_CHECKS.map((c) => [c.key, true]));
const args = (o = {}) => ({ visit, store, staff, customer, items, labels, colors, checks, now: NOW, contractId: 'GS-1', isRepeat: false, ...o });

test('説明事項と終了前の確認: 店頭用。訪問買取の項目から、お客様宅に関するもの（梱包・持ち帰り）を除き、クーリング・オフの説明は「対象外であること」に変える', () => {
  assert.deepEqual(P.EXPLAIN_ITEMS.map((x) => x.key), ['flow', 'refuse', 'photo', 'kyc', 'nocooling']);
  assert.ok(P.EXPLAIN_ITEMS.every((x) => x.text));
  assert.ok(P.EXPLAIN_ITEMS.find((x) => x.key === 'nocooling').text.includes('クーリング・オフ')); // お客様への説明の文言は、法令の表記
  assert.deepEqual(P.LEAVE_CHECKS.map((x) => x.key), ['kyc', 'paper', 'copy', 'pay', 'count', 'lost']);
});

test('売る商品・シール枠・合計: 「売る」にした商品だけを、数量分の枠に展開する。合計は、単価×数量（買取の金額は、1点ごとの単価を入力）', () => {
  assert.deepEqual(P.sellItems(items).map((i) => i.id), ['p1', 'p2']);
  assert.deepEqual(P.slotsOf(items).map((x) => x.key), ['p1-1', 'p2-1', 'p2-2']);
  assert.equal(P.totalOf(items), 98000 + 52000 * 2 );
});

test('買取の完了: 契約・入庫待ちの実物（1点ごと）・見送り品を作る。契約は店舗で、GMOサインの印刷へ回る', () => {
  const r = P.buildPurchase(args());
  assert.equal(r.ok, true);
  const c = r.contract;
  assert.deepEqual([c.id, c.status, c.channel, c.storeId, c.visitId, c.total, c.sentAt], ['GS-1', '本人確認待ち', 'store', 'S-NAMBA', 'SV-1', 202000, NOW]);
  assert.equal(c.customer.phone, '090-1234-5678'); // お客様の履歴は、電話番号で結びつく
  assert.deepEqual(c.callInfo, { receptionNo: 'SV-1', receivedAt: '2026/10/25 15:00', operator: '佐藤', apType: '新', appraiser: '田中 美咲' });
  assert.deepEqual(c.items.map((i) => [i.name, i.qty, i.price, i.codes]), [['ルイ・ヴィトン ネヴァーフル MM', 1, 98000, ['RQ-AAA1']], ['K18 ネックレス', 2, 52000, ['RQ-BBB1', 'RQ-BBB2']]]);
  assert.deepEqual(r.units.map((u) => [u.code, u.sealColor, u.status]), [['RQ-AAA1', 'other', 'pending'], ['RQ-BBB1', 'red', 'pending'], ['RQ-BBB2', 'other', 'pending']]);
  assert.ok(r.units.every((u) => u.channel === 'store' && u.storeId === 'S-NAMBA' && u.visitId === 'SV-1' && u.userId === 'st01' && u.date === '2026-10-25'));
  assert.deepEqual(r.units[0].phones, ['090-1234-5678']);
  assert.deepEqual(r.declined.map((i) => i.name), ['ロレックス デイトジャスト']);
  assert.deepEqual(r.result, { type: 'purchased', contractId: 'GS-1', total: 202000, count: 3 });
  assert.equal(P.buildPurchase(args({ isRepeat: true })).contract.callInfo.apType, '再');
  assert.equal(P.buildPurchase(args({ visit: { ...visit, source: 'walkin', createdBy: '' } })).contract.callInfo.operator, '飛び込み'); // 受けたオペレーターがいない
});

test('完了できない場合: 売る商品がない・金額が未入力・シール（色まで）が未紐づけ・確認が済んでいない', () => {
  assert.equal(P.buildPurchase(args({ items: [{ ...items[2] }] })).reason, 'noItems');
  assert.equal(P.buildPurchase(args({ items: [{ ...items[0], price: 0 }] })).reason, 'noPrice');
  assert.equal(P.buildPurchase(args({ labels: { ...labels, 'p2-2': '' } })).reason, 'noSeal');
  assert.equal(P.buildPurchase(args({ colors: { ...colors, 'p1-1': null } })).reason, 'noSeal');
  assert.equal(P.buildPurchase(args({ checks: { ...checks, pay: false } })).reason, 'checks');
});

test('買取に至らなかった（全部見送り）場合: 契約は作らず、見送り品だけを記録する', () => {
  const r = P.buildDeclined({ items: [{ ...items[0], sell: false }, { ...items[2] }] });
  assert.deepEqual(r.result, { type: 'declined' });
  assert.deepEqual(r.declined.map((i) => i.id), ['p1', 'p3']);
});

test('店頭買取の商品は、クーリングオフの保管期間（10日）がない。買取のその日から出品できる。訪問買取の商品は、これまでどおり', () => {
  const store1 = { code: 'S1', date: '2026-10-25', channel: 'store' };
  const visit1 = { code: 'V1', date: '2026-10-25' };
  assert.equal(W.inCoolingOff(store1, NOW), false);
  assert.equal(W.inCoolingOff(visit1, NOW), true);
  const rows = W.buildRows({ units: [{ ...store1, status: 'stored' }, { ...visit1, status: 'stored' }], records: {}, returns: [], transfers: [] }, NOW);
  assert.deepEqual(rows.map((r) => [r.cooling, r.canList]), [[false, true], [true, false]]);
});

test('クーリングオフの検索: 店頭買取の商品は「対象外」と表示し、依頼にできない。契約にも店頭買取の印が付く', () => {
  const units = [
    { code: 'S1', visitId: 'SV-1', customerName: '山田 花子', date: '2026-10-25', name: '時計', category: '腕時計', price: 1000, phones: ['090-1'], status: 'stored', channel: 'store' },
    { code: 'V1', visitId: 'V-1', customerName: '山田 花子', date: '2026-10-25', name: 'バッグ', category: 'ブランドバッグ', price: 2000, phones: ['090-1'], status: 'stored' },
  ];
  const found = W.cooloffContracts({ units, records: {}, returns: [], transfers: [] }, '山田', NOW);
  const byVisit = Object.fromEntries(found.map((c) => [c.visitId, c]));
  assert.deepEqual([byVisit['SV-1'].store, byVisit['V-1'].store], [true, false]);
  assert.equal(byVisit['SV-1'].rows[0].check.kind, 'store');
  assert.equal(byVisit['V-1'].rows[0].check.kind, 'ok');
});
