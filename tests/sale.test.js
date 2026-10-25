import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const W = await import('../src/warehouse.js');
const T = await import('../src/warehouseTransfer.js');
const Sale = await import('../src/warehouseSale.js');
const { DEFAULT_MASTER: M } = await import('../src/warehouseMaster.js');
const [OSAKA, KANTO] = M.warehouses;

const NOW = new Date(2026, 9, 25, 12, 0).getTime();
const day = (n) => new Date(2026, 9, 25 - n, 10, 0).getTime();
const unit = (code, over = {}) => ({
  code, visitId: `V-${code}`, userId: 'u01', customerName: '山田 花子', at: day(20), date: W.dateOf(day(20)), itemId: code, name: `商品${code}`, category: 'ブランドバッグ', rank: 'A', n: 1, qty: 1, price: 10000,
  sealColor: 'other', status: 'stored', storedAt: day(20), location: OSAKA.locations[0], by: 'x', warehouseId: OSAKA.id, ...over,
});
// A・B: 大阪倉庫で売れた商品（フリマ・業者直販）／C: 関東倉庫で売れた商品／D: 在庫／E: 委託中
const soldState = () => {
  let s = { units: [unit('A'), unit('B'), unit('C', { warehouseId: KANTO.id }), unit('D'), unit('E')], records: {}, returns: [], transfers: [] };
  for (const [code, ch, price] of [['A', 'mercari', 20000], ['B', 'direct', 30000], ['C', 'yahoo', 15000]]) {
    s = W.sell(W.listItem(s, code, { channel: ch, price, at: day(3) }).state, code, { price, buyer: `${code}の購入者`, at: day(2) }).state;
  }
  s = W.listItem(s, 'E', { channel: 'auction', price: 1000, vendor: 'x', at: day(3) }).state;
  return s;
};
const buyer = { name: '佐藤 一郎', zip: '1500001', address: '東京都渋谷区神宮前1-1-1', phone: '03-0000-0000' };
const mk = (s = soldState(), over = {}) => Sale.createSalePack(s, M, { fromId: OSAKA.id, buyer, by: '小川 直樹', at: NOW, ...over });
const add = (s, id, code) => Sale.addToSalePack(s, M, id, code, { at: NOW });

test('発送待ち: 売れたのに、まだ購入者へ発送していない、自倉庫の商品。在庫・委託中・他の倉庫の商品は含まない', () => {
  const rows = Sale.awaitingShipment(soldState(), M, OSAKA.id, NOW);
  assert.deepEqual(rows.map((r) => r.unit.code).sort(), ['A', 'B']);
  assert.deepEqual(Sale.awaitingShipment(soldState(), M, KANTO.id, NOW).map((r) => r.unit.code), ['C']);
});

test('販売の発送のパックを作る: 購入者の名前が必要（郵便番号・住所・電話番号は伝票・CSVのとき確認）。郵便番号は形式を確かめ、整える', () => {
  const r = mk();
  assert.equal(r.ok, true);
  assert.deepEqual({ kind: r.pack.kind, status: r.pack.status, fromId: r.pack.fromId, codes: r.pack.codes, prices: r.pack.prices, boxes: r.pack.boxes }, { kind: 'sale', status: 'draft', fromId: OSAKA.id, codes: [], prices: {}, boxes: 1 });
  assert.deepEqual(r.pack.buyer, { ...buyer, zip: '150-0001' });
  assert.equal(mk(soldState(), { buyer: { ...buyer, name: ' ' } }).reason, 'noBuyer');
  assert.equal(mk(soldState(), { buyer: { ...buyer, zip: '12-3' } }).reason, 'badZip');
  assert.equal(mk(soldState(), { buyer: { name: '田中', zip: '', address: '', phone: '' } }).ok, true);
  assert.equal(mk(soldState(), { fromId: 'gone' }).reason, 'badWarehouse');
});

test('商品を入れる: 売れた商品だけ。売価が記録される。在庫・委託中・発送済み・他の倉庫・別のパックの商品は入れられない', () => {
  const { state, pack } = mk();
  const a = add(state, pack.id, ' a ');
  assert.equal(a.ok, true);
  assert.deepEqual(a.state.transfers[0].codes, ['A']);
  assert.equal(a.state.transfers[0].prices.A, 20000); // 売価
  assert.equal(add(a.state, pack.id, 'A').already, true);
  assert.equal(add(state, pack.id, 'D').reason, 'notSold');
  assert.equal(add(state, pack.id, 'E').reason, 'notSold');
  assert.equal(add(state, pack.id, 'C').reason, 'otherWarehouse');
  assert.equal(add(state, pack.id, 'ZZ').reason, 'unknown');
  assert.equal(add(state, 'nope', 'A').reason, 'notDraft');
  const other = mk(a.state);
  assert.equal(add(other.state, other.pack.id, 'A').reason, 'inOtherPack');
  assert.equal(W.buildRows(a.state, NOW).find((r) => r.unit.code === 'A').stage, 'sold'); // 梱包中でも、売却済みのまま（売上・在庫の数え方は変わらない）
  assert.equal(Sale.awaitingShipment(a.state, M, OSAKA.id, NOW).some((r) => r.unit.code === 'A'), false); // 梱包に入れた商品は、発送待ちから外れる
});

test('外す・設定・出力の記録・破棄は、ほかのパックと同じ操作。外すと、発送待ちに戻る', () => {
  let { state, pack } = mk();
  state = add(add(state, pack.id, 'A').state, pack.id, 'B').state;
  const r = T.removeFromPack(state, pack.id, 'A');
  assert.deepEqual(r.transfers[0].codes, ['B']);
  assert.equal('A' in r.transfers[0].prices, false);
  assert.equal(Sale.awaitingShipment(r, M, OSAKA.id, NOW).some((x) => x.unit.code === 'A'), true);
  assert.equal(T.updatePack(state, pack.id, { carrier: 'yamato', size: '60' }).transfers[0].carrier, 'yamato');
  assert.equal(T.markPrinted(state, pack.id, 'list', NOW).transfers[0].listPrintedAt, NOW);
  assert.equal(T.discardPack(state, pack.id).state.transfers.length, 0);
  assert.equal(T.drafts(state, OSAKA.id, 'sale').length, 1); assert.equal(T.drafts(state, OSAKA.id).length, 0); // 倉庫間移動の一覧には出ない
  assert.equal(T.shipPack(T.updatePack(state, pack.id, { carrier: 'yamato' }), pack.id, { by: 'x' }).reason, 'wrongKind');
});

test('発送する: 商品が1点以上・配送業者が決まっていれば、購入者へ発送済みになる（追跡番号は任意）。商品は売却済みのまま、発送の記録が残る', () => {
  let { state, pack } = mk();
  assert.equal(Sale.shipSalePack(state, pack.id, { by: 'x', at: NOW }).reason, 'noItems');
  state = add(add(state, pack.id, 'A').state, pack.id, 'B').state;
  assert.equal(Sale.shipSalePack(state, pack.id, { by: 'x', at: NOW }).reason, 'noCarrier');
  state = T.updatePack(state, pack.id, { carrier: 'jp', size: '80' });
  const r = Sale.shipSalePack(state, pack.id, { tracking: ' 8100-1111 ', by: '小川 直樹', at: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.state.transfers[0].status, 'shipped');
  assert.deepEqual({ ...r.state.records.A }, { ...state.records.A, shipPackId: pack.id, shippedAt: NOW, shippedBy: '小川 直樹', tracking: '8100-1111' });
  assert.equal(r.state.records.A.stage, 'sold'); // 売上は、そのまま
  assert.equal(Sale.awaitingShipment(r.state, M, OSAKA.id, NOW).length, 0);
  assert.equal(Sale.shipSalePack(r.state, pack.id, { by: 'x' }).reason, 'notDraft');
  assert.equal(Sale.shipments(r.state, OSAKA.id).length, 1);
  assert.equal(W.salesStats(W.salesRows(r.state), '').count, 3); // 売上の集計は、発送の有無に関係しない
});

test('履歴: 売却のあとの発送（購入者・配送業者・追跡番号）が、商品の履歴に残る', () => {
  let { state, pack } = mk();
  state = T.updatePack(add(state, pack.id, 'A').state, pack.id, { carrier: 'yamato', size: '60' });
  const r = Sale.shipSalePack(state, pack.id, { tracking: '4321-0000', by: '小川 直樹', at: NOW });
  const h = W.historyOf(r.state, 'A');
  assert.deepEqual(h.map((e) => e.label), ['買取', '入庫', '出品', '売却', '購入者へ発送']);
  assert.ok(h.at(-1).detail.includes('佐藤 一郎') && h.at(-1).detail.includes('ヤマト運輸') && h.at(-1).detail.includes('4321-0000') && h.at(-1).detail.includes('小川 直樹'));
});

test('発送待ち: 委託先（市場）で売れた商品は含めない（市場が購入者へ送る）', () => {
  let s = { units: [unit('E')], records: {}, returns: [], transfers: [] };
  s = W.sell(W.listItem(s, 'E', { channel: 'auction', price: 30000, vendor: '市場', at: day(3) }).state, 'E', { price: 28000, at: day(1) }).state;
  assert.equal(W.buildRows(s, NOW)[0].stage, 'sold');
  assert.deepEqual(Sale.awaitingShipment(s, M, OSAKA.id, NOW), []);
});

test('購入者の情報を直す: 梱包中のパックの購入者（名前・郵便番号・住所・電話番号）。名前が空・郵便番号の形式が違うときは、変えない', () => {
  const { state, pack } = mk();
  const r = Sale.setBuyer(state, pack.id, { zip: '1000001', address: '東京都千代田区千代田1-1', phone: ' 03-1111-2222 ' });
  assert.deepEqual(r.transfers[0].buyer, { name: '佐藤 一郎', zip: '100-0001', address: '東京都千代田区千代田1-1', phone: '03-1111-2222' });
  assert.equal(Sale.setBuyer(state, pack.id, { name: ' ' }), state);
  assert.equal(Sale.setBuyer(state, pack.id, { zip: '1-2' }), state);
  assert.equal(Sale.setBuyer(state, 'nope', { name: 'x' }), state);
  const shipped = Sale.shipSalePack(T.updatePack(add(state, pack.id, 'A').state, pack.id, { carrier: 'yamato' }), pack.id, { by: 'x', at: NOW }).state;
  assert.equal(Sale.setBuyer(shipped, pack.id, { name: '別の人' }), shipped); // 発送後は変えない
});
