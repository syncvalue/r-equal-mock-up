import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCustomerId, buildIdIndex, customerOfId, idOfPhones, issueCustomerId } from '../callcenter/customerId.js';
import { seedCustomerIds } from '../src/customerHistory.js';

const seeds = [{ id: 'C000101', name: '山田 花子', phones: ['090-2468-1357'] }];
const res = [
  { customer: { customerId: 'C000201', name: '森本 勝', phone: '090-1357-2468', phone2: '' } },
  { customer: { customerId: 'C000201', name: '森本 勝', phone: '090-1357-2468', phone2: '06-1111-2222' } }, // 同じお客様の、2件目の受付（電話番号2が増えた）
  { customer: { name: '古い記録', phone: '090-0000-0000' } }, // 顧客IDのない古い記録
];
const index = buildIdIndex({ seeds, reservations: res });

test('顧客ID: 全角・小文字・ハイフン・空白をそろえる。形が違えば空', () => {
  assert.equal(normalizeCustomerId(' c-000101 '), 'C000101');
  assert.equal(normalizeCustomerId('Ｃ０００１０１'), 'C000101');
  assert.equal(normalizeCustomerId('101'), '');
  assert.equal(normalizeCustomerId(''), '');
});

test('顧客ID: 同じIDは1人のお客様にまとまり、電話番号は全部たどれる。IDのない記録は含めない', () => {
  assert.equal(index.length, 2);
  const mori = customerOfId(index, 'c000201');
  assert.equal(mori.name, '森本 勝');
  assert.deepEqual(mori.phones.sort(), ['06-1111-2222', '090-1357-2468']);
  assert.equal(customerOfId(index, 'C999999'), null);
});

test('顧客ID: 電話番号（ハイフンなしも、電話番号2も）から、IDを引く。知らない番号は null', () => {
  assert.equal(idOfPhones(index, ['09024681357']), 'C000101');
  assert.equal(idOfPhones(index, ['', '0611112222']), 'C000201');
  assert.equal(idOfPhones(index, ['090-0000-0000']), null);
  assert.equal(idOfPhones(index, ['']), null);
});

test('顧客ID: 新しいIDは、いちばん大きい番号の次（最初は C000001）。重ならない', () => {
  assert.equal(issueCustomerId(index), 'C000202');
  assert.equal(issueCustomerId([]), 'C000001');
});

test('顧客ID: サンプルの過去のお客様に、重ならないIDが付いている', () => {
  const list = seedCustomerIds();
  assert.ok(list.length >= 5);
  assert.equal(new Set(list.map((x) => x.id)).size, list.length);
  assert.ok(list.every((x) => /^C\d{6}$/.test(x.id) && x.phones.length >= 1));
  assert.equal(list.find((x) => x.phones.includes('090-2468-1357')).id, 'C000101');
});
