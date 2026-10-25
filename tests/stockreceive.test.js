import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { receive, receiveVisit } = await import('../src/stock.js');

const u = (code, userId, visitId, over = {}) => ({ code, userId, visitId, customerName: '山田 花子', date: '2026-10-25', name: code, status: 'pending', storedAt: null, location: null, by: null, ...over });
const list = () => [u('A', 'u01', 'V1'), u('B', 'u01', 'V1'), u('C', 'u01', 'V1', { status: 'missing' }), u('D', 'u01', 'V1', { status: 'stored', location: 'A棚（バッグ・小物）' }), u('E', 'u02', 'V2')];

test('入庫: 営業は自分の商品だけ入庫できる（他の営業の商品はエラー）', () => {
  assert.equal(receive(list(), 'u02', 'A', { location: 'A棚', by: '営業' }).result.type, 'other');
  assert.equal(receive(list(), 'u01', 'A', { location: 'A棚', by: '営業' }).result.type, 'ok');
});

test('入庫: 倉庫の担当者（営業を指定しない）は、誰が買い取った商品でも入庫でき、誰が受け取ったかを記録する', () => {
  const r = receive(list(), null, 'e', { location: 'B棚', by: '倉庫担当', at: 1000 }); // 小文字でも読み取れる
  assert.equal(r.result.type, 'ok');
  const e = r.list.find((x) => x.code === 'E');
  assert.deepEqual({ status: e.status, location: e.location, by: e.by, storedAt: e.storedAt }, { status: 'stored', location: 'B棚', by: '倉庫担当', storedAt: 1000 });
  assert.equal(receive(r.list, null, 'E', { location: 'B棚', by: '倉庫担当' }).result.type, 'dup'); // 二重入庫は不可
  assert.equal(receive(list(), null, 'ZZZ', { location: 'B棚', by: '倉庫担当' }).result.type, 'unknown');
});

test('契約まとめて入庫: 入庫待ち・所在不明を、その契約の分だけ入庫する（入庫済み・他の契約は変えない）', () => {
  const before = list();
  const r = receiveVisit(before, 'V1', { location: '金庫室（高額品）', by: '倉庫担当', at: 2000 });
  assert.equal(r.count, 3); // A・B・C
  assert.deepEqual(r.list.filter((x) => x.visitId === 'V1').map((x) => x.status), ['stored', 'stored', 'stored', 'stored']);
  assert.equal(r.list.find((x) => x.code === 'D').location, 'A棚（バッグ・小物）'); // 入庫済みの保管場所は変えない
  assert.equal(r.list.find((x) => x.code === 'A').location, '金庫室（高額品）');
  assert.equal(r.list.find((x) => x.code === 'E').status, 'pending');
  assert.equal(before[0].status, 'pending'); // 元は変更されない
  assert.equal(receiveVisit(r.list, 'V1', { location: 'A棚', by: 'x' }).count, 0);
});
