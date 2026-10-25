import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const S = await import('../src/stores.js');

const WH = ['W-OSAKA', 'W-KANTO'];
const input = (o = {}) => ({ name: '梅田', zip: '530-0001', address: '大阪府大阪市北区梅田1-1-1', phone: '06-0000-1003', hours: '10:00〜19:00', licenseNo: '第000000003号', warehouseId: 'W-OSAKA', ...o });

test('初期の店舗: 名前は「店」を付けない短い名前で、画面では「なんば店」。納入先の倉庫と古物商許可番号を持つ', () => {
  assert.ok(S.DEFAULT_STORES.length >= 2 && S.DEFAULT_STORES.every((s) => s.active && s.warehouseId && s.licenseNo));
  const namba = S.DEFAULT_STORES.find((s) => s.id === 'S-NAMBA');
  assert.equal(namba.name, 'なんば');
  assert.equal(S.storeLabel(namba), 'なんば店');
  assert.equal(new Set(S.DEFAULT_STORES.map((s) => s.id)).size, S.DEFAULT_STORES.length);
});

test('保存と読み込み: 保存した店舗を読み戻せる。保存がない・壊れている・空なら初期値', () => {
  assert.deepEqual(S.loadStores(), S.DEFAULT_STORES);
  const r = S.saveStore(S.DEFAULT_STORES, input(), { warehouseIds: WH });
  assert.equal(S.saveStores(r.stores), true);
  assert.equal(S.loadStores().length, S.DEFAULT_STORES.length + 1);
  mem.set(S.STORES_KEY, '{broken');
  assert.deepEqual(S.loadStores(), S.DEFAULT_STORES);
  mem.set(S.STORES_KEY, '[]');
  assert.deepEqual(S.loadStores(), S.DEFAULT_STORES);
  mem.clear();
});

test('登録: 名前・古物商許可番号・納入先の倉庫が必要。名前は重複不可。元の配列は変えない', () => {
  const base = S.DEFAULT_STORES;
  const ok = S.saveStore(base, input({ name: ' 梅田 ' }), { warehouseIds: WH });
  assert.equal(ok.ok, true);
  const s = ok.stores.at(-1);
  assert.deepEqual([s.name, s.warehouseId, s.active], ['梅田', 'W-OSAKA', true]);
  assert.ok(s.id && !base.some((x) => x.id === s.id));
  assert.equal(ok.stores.length, base.length + 1);
  assert.equal(S.saveStore(base, input({ name: '' }), { warehouseIds: WH }).reason, 'noName');
  assert.equal(S.saveStore(base, input({ name: 'なんば' }), { warehouseIds: WH }).reason, 'dupName');
  assert.equal(S.saveStore(base, input({ licenseNo: ' ' }), { warehouseIds: WH }).reason, 'noLicense');
  assert.equal(S.saveStore(base, input({ warehouseId: '' }), { warehouseIds: WH }).reason, 'noWarehouse');
  assert.equal(S.saveStore(base, input({ warehouseId: 'W-NOPE' }), { warehouseIds: WH }).reason, 'noWarehouse');
});

test('変更: id があれば更新。有効・無効は引き継ぐ。存在しない id は不可', () => {
  const base = S.DEFAULT_STORES;
  const off = S.setStoreActive(base, 'S-SHINJUKU', false).stores;
  const r = S.saveStore(off, input({ id: 'S-SHINJUKU', name: '新宿西口' }), { warehouseIds: WH });
  assert.equal(r.ok, true);
  const s = r.stores.find((x) => x.id === 'S-SHINJUKU');
  assert.deepEqual([s.name, s.active], ['新宿西口', false]);
  assert.equal(S.saveStore(base, input({ id: 'S-NOPE' }), { warehouseIds: WH }).reason, 'notFound');
});

test('有効・無効: 削除はない。有効な店舗は最低1つ残す。有効な店舗スタッフがいる店舗は無効にできない', () => {
  const base = S.DEFAULT_STORES;
  const one = S.setStoreActive(base, 'S-SHINJUKU', false);
  assert.equal(one.ok, true);
  assert.equal(S.setStoreActive(one.stores, 'S-NAMBA', false).reason, 'lastActive');
  assert.equal(S.setStoreActive(base, 'S-NAMBA', false, { staffCount: 2 }).reason, 'hasStaff');
  assert.equal(S.setStoreActive(one.stores, 'S-SHINJUKU', true).ok, true); // 有効に戻すのはいつでもできる
  assert.equal(S.setStoreActive(base, 'S-NOPE', true).reason, 'notFound');
  assert.deepEqual(S.activeStores(one.stores).map((s) => s.id), ['S-NAMBA']);
});

test('店舗の名前の引き当て: 記録に残った店舗IDから、名前（なんば店）を出す。無効・不明は空', () => {
  assert.equal(S.storeNameOf('S-NAMBA', S.DEFAULT_STORES), 'なんば店');
  assert.equal(S.storeNameOf('S-NOPE', S.DEFAULT_STORES), '');
});
