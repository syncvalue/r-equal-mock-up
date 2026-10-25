globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
import { test } from 'node:test';
import assert from 'node:assert/strict';

const S = await import('../src/shipping.js');
const { DEFAULT_MASTER: M } = await import('../src/warehouseMaster.js');
const [OSAKA, KANTO] = M.warehouses;

const unit = (code, name, price = 10000, over = {}) => ({ code, name, price, category: 'ブランドバッグ', rank: 'A', customerName: '山田 花子', date: '2026-10-10', sealColor: 'other', userId: 'u01', ...over });
const units = [unit('RQ-AAA1', 'ルイ・ヴィトン ネヴァーフル', 98000), unit('RQ-BBB2', '<script>alert(1)</script> "割れ物", 箱', 5000, { sealColor: 'purple' })];
const pack = (over = {}) => ({
  id: 'TR-TEST1', codes: ['RQ-AAA1', 'RQ-BBB2'], fromId: OSAKA.id, toId: KANTO.id, fromName: OSAKA.name, toName: KANTO.name, status: 'draft',
  carrier: 'yamato', size: '80', boxes: 1, note: '割れ物注意', tracking: '', createdAt: new Date(2026, 9, 25, 9).getTime(), ...over,
});
const NOW = new Date(2026, 9, 25, 15, 30).getTime();

test('配送業者とサイズ: ヤマト・佐川・日本郵便・その他。サイズは60〜170', () => {
  assert.deepEqual(S.CARRIERS.map((c) => c.key), ['yamato', 'sagawa', 'jp', 'other']);
  assert.equal(S.carrierOf('sagawa').label, '佐川急便');
  assert.equal(S.carrierOf('x'), null);
  assert.deepEqual(S.PACK_SIZES, ['60', '80', '100', '120', '140', '160', '170']);
});

test('パックの集計: 点数と、商品の買取額の合計（配送の補償額の目安）', () => {
  assert.deepEqual(S.packSummary(pack(), units), { count: 2, total: 103000 });
  assert.deepEqual(S.packSummary(pack({ codes: ['RQ-AAA1', 'none'] }), units), { count: 2, total: 98000 }); // 見つからない商品も、点数には数える
});

test('CSVの書式: カンマ・引用符・改行を含む項目は、引用符で囲む。行の区切りはCRLF', () => {
  assert.equal(S.csvEscape('abc'), 'abc');
  assert.equal(S.csvEscape('a,b'), '"a,b"');
  assert.equal(S.csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(S.csvEscape('a\nb'), '"a\nb"');
  assert.equal(S.csvEscape(null), '');
  assert.equal(S.csvEscape(12), '12');
  assert.equal(S.toCsv([['a', 'b'], ['1,2', '3']]), 'a,b\r\n"1,2",3\r\n');
});

test('CSV: 配送業者ごとの見出しで、パックの送り先・送り元・品名・個数・サイズを出す。UTF-8（BOMつき）', () => {
  for (const key of ['yamato', 'sagawa', 'jp', 'other']) {
    const csv = S.shippingCsv(key, [pack()], units, M, { now: NOW });
    assert.ok(csv.startsWith('﻿'), key);
    const [head, row] = csv.slice(1).split('\r\n');
    assert.ok(head.includes('お届け先') || key === 'other', key);
    for (const must of [KANTO.name, KANTO.zip, KANTO.address, OSAKA.address, '買取商品（2点）', 'TR-TEST1']) assert.ok(row.includes(must) || (key === 'jp' && must === 'TR-TEST1' && row.includes('TR-TEST1')), `${key}: ${must}`);
  }
  const y = S.shippingCsv('yamato', [pack()], units, M, { now: NOW }).slice(1).split('\r\n');
  assert.ok(y[0].startsWith('お客様管理番号,送り状種類'));
  assert.ok(y[1].includes('2026/10/25')); // 出荷予定日
  assert.ok(y[1].includes('80')); // サイズ
});

test('CSV: 個口数が2以上なら、箱ごとに1行（管理番号に枝番）。複数のパックをまとめて出力できる。0件でも見出しだけ出す', () => {
  const two = S.shippingCsv('sagawa', [pack({ boxes: 2 })], units, M, { now: NOW }).slice(1).trim().split('\r\n');
  assert.equal(two.length, 3);
  assert.ok(two[1].includes('TR-TEST1-1') && two[2].includes('TR-TEST1-2'));
  const many = S.shippingCsv('jp', [pack(), pack({ id: 'TR-TEST2' })], units, M, { now: NOW }).slice(1).trim().split('\r\n');
  assert.equal(many.length, 3);
  assert.equal(S.shippingCsv('yamato', [], units, M, { now: NOW }).slice(1).trim().split('\r\n').length, 1);
});

test('CSV: 追跡番号がすでにあれば伝票番号の欄に入れる。メモ・商品のシールNo.は記事・備考に入る。本文のカンマ・引用符を壊さない', () => {
  const csv = S.shippingCsv('yamato', [pack({ tracking: '1234-5678-9012' })], units, M, { now: NOW });
  assert.ok(csv.includes('1234-5678-9012') && csv.includes('割れ物注意'));
  const other = S.shippingCsv('other', [pack()], units, M, { now: NOW });
  assert.ok(other.includes('RQ-AAA1') && other.includes('RQ-BBB2'));
  assert.equal(other.slice(1).trim().split('\r\n').length, 2); // 商品名に改行・カンマがあっても、行は増えない
});

test('CSVのファイル名: 配送業者と日付が分かる', () => {
  assert.equal(S.csvFileName('yamato', NOW), 'ヤマト運輸_発送_20261025.csv');
  assert.equal(S.csvFileName('other', NOW), 'その他_発送_20261025.csv');
});

test('明細（印刷用）: パックの番号・送り元と送り先・商品の一覧（シールNo.・商品名・色・買取額）・合計・受領の確認欄。入力は無害化する', () => {
  const html = S.packingListHtml(pack(), units, M, { now: NOW });
  for (const must of ['TR-TEST1', OSAKA.name, KANTO.name, 'RQ-AAA1', 'ルイ・ヴィトン ネヴァーフル', 'RQ-BBB2', '2点', '¥103,000', '受領', '割れ物注意']) assert.ok(html.includes(must), must);
  assert.ok(!html.includes('<script>alert(1)</script>')); // 商品名のスクリプトは、そのまま出さない
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('window.print'));
  assert.ok(html.startsWith('<!doctype html>'));
});

test('発送伝票（印刷用）: 送り先・ご依頼主（住所・電話）・配送業者・サイズ・品名・個数。個口ごとに1枚', () => {
  const one = S.shippingLabelHtml(pack(), units, M, { now: NOW });
  for (const must of ['お届け先', 'ご依頼主', KANTO.zip, KANTO.address, KANTO.phone, OSAKA.address, 'ヤマト運輸', '80', '買取商品（2点）', 'TR-TEST1', '割れ物注意']) assert.ok(one.includes(must), must);
  const two = S.shippingLabelHtml(pack({ boxes: 2, tracking: '9999' }), units, M, { now: NOW });
  assert.equal((two.match(/class="label"/g) || []).length, 2);
  assert.ok(two.includes('1 / 2') && two.includes('2 / 2') && two.includes('9999'));
  assert.ok(S.shippingLabelHtml(pack({ carrier: '' }), units, M, { now: NOW }).includes('未選択'));
});

test('送り先の情報が足りないときの確認: 郵便番号・住所・電話番号がなければ、足りない項目を返す', () => {
  assert.deepEqual(S.addressProblems(pack(), M), []);
  const bare = { ...M, warehouses: M.warehouses.map((w) => (w.id === KANTO.id ? { ...w, zip: '', phone: '' } : w)) };
  assert.deepEqual(S.addressProblems(pack(), bare), ['送り先（関東倉庫）の郵便番号', '送り先（関東倉庫）の電話番号']);
});

const V1 = M.vendors[0];
const consign = (over = {}) => ({
  id: 'CS-TEST1', kind: 'consign', codes: ['RQ-AAA1', 'RQ-BBB2'], prices: { 'RQ-AAA1': 128000, 'RQ-BBB2': 9000 }, fromId: OSAKA.id, fromName: OSAKA.name, vendorId: V1.id, vendorName: V1.name, status: 'draft',
  carrier: 'sagawa', size: '100', boxes: 1, note: '', tracking: '', createdAt: new Date(2026, 9, 25, 9).getTime(), ...over,
});

test('委託のパック: 送り先は、委託先（業者）。集計は、希望価格の合計も出す', () => {
  assert.deepEqual(S.packSummary(consign(), units), { count: 2, total: 103000, ask: 137000 });
  assert.equal(S.packSummary(pack(), units).ask, undefined); // 倉庫間の移動には、希望価格がない
});

test('委託のCSV・伝票: お届け先が委託先（業者）になる', () => {
  for (const key of ['yamato', 'sagawa', 'jp', 'other']) {
    const row = S.shippingCsv(key, [consign()], units, M, { now: NOW }).slice(1).split('\r\n')[1];
    for (const must of [V1.name, V1.zip, V1.address, OSAKA.address]) assert.ok(row.includes(must), `${key}: ${must}`);
  }
  const label = S.shippingLabelHtml(consign(), units, M, { now: NOW });
  for (const must of [V1.name, V1.zip, V1.address, V1.phone, OSAKA.address, '佐川急便']) assert.ok(label.includes(must), must);
});

test('委託明細（印刷用）: 業者に渡すので、希望価格を出し、原価（買取額）とお客様の情報は出さない', () => {
  const html = S.packingListHtml(consign(), units, M, { now: NOW });
  for (const must of ['委託明細', V1.name, '希望価格', '¥128,000', '¥9,000', '¥137,000', 'RQ-AAA1', 'ルイ・ヴィトン ネヴァーフル', '受領']) assert.ok(html.includes(must), must);
  assert.ok(!html.includes('¥98,000') && !html.includes('買取額') && !html.includes('山田 花子')); // 原価・お客様は載せない
  assert.ok(!html.includes('<script>alert(1)</script>'));
});

test('委託の確認: 委託先の郵便番号・住所・電話番号がなければ、足りない項目を返す', () => {
  assert.deepEqual(S.addressProblems(consign(), M), []);
  const bare = { ...M, vendors: M.vendors.map((v) => (v.id === V1.id ? { ...v, phone: '' } : v)) };
  assert.deepEqual(S.addressProblems(consign(), bare), [`送り先（${V1.name}）の電話番号`]);
});

const sale = (over = {}) => ({
  id: 'SL-TEST1', kind: 'sale', codes: ['RQ-AAA1', 'RQ-BBB2'], prices: { 'RQ-AAA1': 128000, 'RQ-BBB2': 9000 }, fromId: OSAKA.id, fromName: OSAKA.name, status: 'draft',
  buyer: { name: '佐藤 一郎', zip: '150-0001', address: '東京都渋谷区神宮前1-1-1', phone: '03-0000-0000' }, carrier: 'yamato', size: '60', boxes: 1, note: '', tracking: '', createdAt: new Date(2026, 9, 25, 9).getTime(), ...over,
});

test('販売の発送のパック: 送り先は購入者。CSV・伝票のお届け先が購入者になり、敬称は「様」', () => {
  assert.deepEqual(S.packSummary(sale(), units), { count: 2, total: 103000, ask: 137000 });
  for (const key of ['yamato', 'sagawa', 'jp', 'other']) {
    const row = S.shippingCsv(key, [sale()], units, M, { now: NOW }).slice(1).split('\r\n')[1];
    for (const must of ['佐藤 一郎', '150-0001', '東京都渋谷区神宮前1-1-1', '03-0000-0000', OSAKA.address]) assert.ok(row.includes(must), `${key}: ${must}`);
  }
  assert.ok(S.shippingCsv('yamato', [sale()], units, M, { now: NOW }).includes('様'));
  const label = S.shippingLabelHtml(sale(), units, M, { now: NOW });
  assert.ok(label.includes('佐藤 一郎 様') && !label.includes('佐藤 一郎 御中'));
  assert.ok(S.shippingLabelHtml(pack(), units, M, { now: NOW }).includes('御中')); // 倉庫・委託先は、御中
});

test('納品書（印刷用）: 購入者に同梱する。商品名・金額（売価）だけで、原価・お客様の情報・色は載せない', () => {
  const html = S.packingListHtml(sale(), units, M, { now: NOW });
  for (const must of ['納品書', '佐藤 一郎', '¥128,000', '¥9,000', '¥137,000', 'ルイ・ヴィトン ネヴァーフル']) assert.ok(html.includes(must), must);
  assert.ok(!html.includes('¥98,000') && !html.includes('買取額') && !html.includes('山田 花子') && !html.includes('シールの色')); // 原価・買い取ったお客様は載せない
  assert.ok(!html.includes('<script>alert(1)</script>'));
});

test('販売の発送の確認: 購入者の郵便番号・住所・電話番号がなければ、足りない項目を返す', () => {
  assert.deepEqual(S.addressProblems(sale(), M), []);
  assert.deepEqual(S.addressProblems(sale({ buyer: { name: '田中', zip: '', address: '', phone: '' } }), M), ['送り先（田中）の郵便番号', '送り先（田中）の住所', '送り先（田中）の電話番号']);
});
