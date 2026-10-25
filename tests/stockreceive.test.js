import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { receive, receiveCodes } = await import('../src/stock.js');

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

test('照合の記録: 倉庫で入庫すると、誰が・いつ・どの方法で明細と実物を照合したかが残る。営業のタブレットからの入庫には残らない', () => {
  const scan = receive(list(), null, 'A', { location: 'A棚', by: '小川 直樹', at: 1000, method: 'scan' });
  assert.deepEqual(scan.list[0].check, { by: '小川 直樹', at: 1000, method: 'scan' });
  const mine = receive(list(), 'u01', 'A', { location: 'A棚', by: '鈴木 一郎', at: 1000 });
  assert.equal(mine.list[0].check, null);
});

test('チェックした商品をまとめて入庫: 指定した商品だけ入庫し、照合（manual）を記録する。入庫済み・存在しない商品は数えない', () => {
  const before = list();
  const r = receiveCodes(before, ['A', 'C', 'D', 'ZZZ'], { location: '金庫室（高額品）', by: '小川 直樹', at: 2000, method: 'manual' });
  assert.equal(r.count, 2); // A・C（Dは入庫済み、ZZZは未登録）
  const by = Object.fromEntries(r.list.map((x) => [x.code, x]));
  assert.equal(by.A.status, 'stored'); assert.equal(by.C.status, 'stored'); // 所在不明も入庫できる
  assert.equal(by.B.status, 'pending'); // チェックしていない商品は、入庫待ちのまま
  assert.equal(by.D.location, 'A棚（バッグ・小物）'); // 入庫済みの保管場所は変えない
  assert.deepEqual(by.A.check, { by: '小川 直樹', at: 2000, method: 'manual' });
  assert.equal(before[0].status, 'pending'); // 元は変更されない
  assert.equal(receiveCodes(r.list, ['A'], { location: 'A棚', by: 'x', method: 'manual' }).count, 0);
});

const { unitsFromVisit, SEAL_COLORS } = await import('../src/stock.js');

test('シールの色: 紫・赤・その他（黄・緑・青）の3つ。買取のシール紐づけで選んだ色を、商品ごとに記録する', () => {
  assert.deepEqual(SEAL_COLORS.map((c) => c.key), ['purple', 'red', 'other']);
  const item = (id, name) => ({ id, name, category: 'x', rank: 'A', qty: 1, price: 1000 });
  const slots = [{ key: 'a-1', item: item('a', 'A'), n: 1 }, { key: 'b-1', item: item('b', 'B'), n: 1 }, { key: 'c-1', item: item('c', 'C'), n: 1 }];
  const units = unitsFromVisit({ visitId: 'V', userId: 'u01', customerName: 'x', slots, labels: { 'a-1': 'RQ-1', 'b-1': 'RQ-2', 'c-1': 'RQ-3' }, colors: { 'a-1': 'purple', 'b-1': 'other' } });
  assert.deepEqual(units.map((u) => u.sealColor), ['purple', 'other', null]); // 色の記録がなければ null
});
