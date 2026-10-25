import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const W = await import('../src/warehouse.js');
const T = await import('../src/warehouseTransfer.js');
const C = await import('../src/warehouseConsign.js');
const { DEFAULT_MASTER: M, setVendorActive } = await import('../src/warehouseMaster.js');
const [OSAKA, KANTO] = M.warehouses;
const [V1, V2] = M.vendors;

const NOW = new Date(2026, 9, 25, 12, 0).getTime();
const day = (n) => new Date(2026, 9, 25 - n, 10, 0).getTime();
const unit = (code, over = {}) => ({
  code, visitId: `V-${code}`, userId: 'u01', customerName: '山田 花子', at: day(20), date: W.dateOf(day(20)), itemId: code, name: `商品${code}`, category: 'ブランドバッグ', rank: 'A', n: 1, qty: 1, price: 10000,
  sealColor: 'other', status: 'stored', storedAt: day(20), location: OSAKA.locations[0], by: 'x', warehouseId: OSAKA.id, ...over,
});
const base = () => ({ units: [unit('A'), unit('B'), unit('H', { sealColor: 'purple', price: 500000, warehouseId: M.warehouses.find((w) => w.highValue).id }), unit('K', { warehouseId: KANTO.id }), unit('P', { status: 'pending', storedAt: null, location: null, warehouseId: undefined })], records: {}, returns: [], transfers: [] });
const mk = (s = base(), over = {}) => C.createConsignPack(s, M, { fromId: OSAKA.id, vendorId: V1.id, by: '小川 直樹', at: NOW, ...over });
const add = (s, id, code) => C.addToConsignPack(s, M, id, code, { at: NOW });

test('委託のパックを作る: 委託先（業者）を決めて、空のパック（梱包中）を作る。有効な委託先だけ', () => {
  const r = mk();
  assert.equal(r.ok, true);
  assert.deepEqual({ kind: r.pack.kind, status: r.pack.status, vendorId: r.pack.vendorId, vendorName: r.pack.vendorName, fromId: r.pack.fromId, codes: r.pack.codes, prices: r.pack.prices, boxes: r.pack.boxes }, { kind: 'consign', status: 'draft', vendorId: V1.id, vendorName: V1.name, fromId: OSAKA.id, codes: [], prices: {}, boxes: 1 });
  assert.equal(mk(base(), { vendorId: 'gone' }).reason, 'badVendor');
  const off = setVendorActive(M, V1.id, false).master;
  assert.equal(C.createConsignPack(base(), off, { fromId: OSAKA.id, vendorId: V1.id, by: 'x', at: NOW }).reason, 'badVendor');
  assert.equal(C.createConsignPack(base(), M, { fromId: 'gone', vendorId: V1.id, by: 'x', at: NOW }).reason, 'badWarehouse');
});

test('委託のパックに商品を入れる: 自倉庫の在庫を、読み取り・検索で入れる。希望価格は、原価の目安が入る。高額品も委託できる（送り先の規則は、倉庫間の移動だけ）', () => {
  const { state, pack } = mk();
  const a = add(state, pack.id, ' a ');
  assert.equal(a.ok, true);
  assert.deepEqual(a.state.transfers[0].codes, ['A']);
  assert.equal(a.state.transfers[0].prices.A, W.suggestPrice({ price: 10000 })); // 13,000
  assert.equal(W.buildRows(a.state, NOW).find((r) => r.unit.code === 'A').stage, 'packing');
  assert.equal(add(a.state, pack.id, 'A').already, true);
  assert.equal(add(state, pack.id, 'K').reason, 'otherWarehouse');
  assert.equal(add(state, pack.id, 'P').reason, 'notStock');
  assert.equal(add(state, pack.id, 'ZZ').reason, 'unknown');
  const hon = C.createConsignPack(base(), M, { fromId: M.warehouses.find((w) => w.highValue).id, vendorId: M.vendors[2].id, by: 'x', at: NOW });
  assert.equal(add(hon.state, hon.pack.id, 'H').ok, true); // 本社の高額品を、貴金属市場へ委託
  const other = mk(a.state);
  assert.equal(add(other.state, other.pack.id, 'A').reason, 'inOtherPack');
});

test('希望価格: パックの中の商品ごとに、1円以上の整数で設定する。外した商品の価格は消える', () => {
  let { state, pack } = mk();
  state = add(add(state, pack.id, 'A').state, pack.id, 'B').state;
  const r = C.setPackPrice(state, pack.id, 'A', '28,000');
  assert.equal(r.transfers[0].prices.A, 28000);
  assert.equal(C.setPackPrice(state, pack.id, 'A', 0), state);
  assert.equal(C.setPackPrice(state, pack.id, 'A', 'x'), state);
  assert.equal(C.setPackPrice(state, pack.id, 'ZZ', 1000), state); // パックにない商品
  const removed = T.removeFromPack(r, pack.id, 'A');
  assert.equal('A' in removed.transfers[0].prices, false);
  assert.equal(removed.transfers[0].prices.B > 0, true);
});

test('委託する（発送）: 商品・配送業者・すべての希望価格がそろえば、商品は「委託中」になる（委託先・希望価格・配送の情報つき）', () => {
  let { state, pack } = mk();
  assert.equal(C.shipConsignPack(state, M, pack.id, { by: 'x', at: NOW }).reason, 'noItems');
  state = add(add(state, pack.id, 'A').state, pack.id, 'B').state;
  assert.equal(C.shipConsignPack(state, M, pack.id, { by: 'x', at: NOW }).reason, 'noCarrier');
  state = T.updatePack(state, pack.id, { carrier: 'yamato', size: '80' });
  const r = C.shipConsignPack(state, M, pack.id, { tracking: ' 4321-0000-1111 ', by: '小川 直樹', at: NOW });
  assert.equal(r.ok, true);
  const t = r.state.transfers[0];
  assert.deepEqual({ status: t.status, tracking: t.tracking, sentBy: t.sentBy, sentAt: t.sentAt }, { status: 'consigned', tracking: '4321-0000-1111', sentBy: '小川 直樹', sentAt: NOW });
  assert.deepEqual({ ...r.state.records.A }, { stage: 'consigned', channel: 'auction', listPrice: W.suggestPrice({ price: 10000 }), listedAt: NOW, vendor: V1.name, vendorId: V1.id, packId: pack.id, listedBy: '小川 直樹' });
  assert.equal(W.buildRows(r.state, NOW).find((x) => x.unit.code === 'B').stage, 'consigned');
  assert.equal(T.incoming(r.state, KANTO.id).length, 0); assert.equal(T.outgoing(r.state, OSAKA.id).length, 0); // 倉庫間の移動ではない
  assert.equal(C.shipConsignPack(r.state, M, pack.id, { by: 'x' }).reason, 'notDraft');
  assert.equal(W.stockSummary(W.buildRows(r.state, NOW)).consigned, 2);
  // 委託中の商品は、売れたら入金・売れ残ったら倉庫に戻る（これまでどおり）
  assert.equal(W.sell(r.state, 'A', { price: 25000, at: NOW + 1 }).state.records.A.fee, 750);
  assert.equal(W.buildRows(W.recall(r.state, 'A'), NOW).find((x) => x.unit.code === 'A').stage, 'stock');
});

test('委託する: 希望価格が未設定・委託先が無効・商品の状態が変わった場合は、発送しない（理由つき）', () => {
  let { state, pack } = mk();
  state = T.updatePack(add(state, pack.id, 'A').state, pack.id, { carrier: 'sagawa' });
  const noPrice = { ...state, transfers: state.transfers.map((t) => ({ ...t, prices: { A: 0 } })) };
  const r1 = C.shipConsignPack(noPrice, M, pack.id, { by: 'x', at: NOW });
  assert.equal(r1.reason, 'noPrice'); assert.deepEqual(r1.rejected, [{ code: 'A', reason: 'noPrice' }]);
  const off = setVendorActive(M, V1.id, false).master;
  assert.equal(C.shipConsignPack(state, off, pack.id, { by: 'x', at: NOW }).reason, 'badVendor');
  const wrong = T.shipPack(state, pack.id, { by: 'x', at: NOW }); // 委託のパックは、倉庫間の発送の操作では発送できない
  assert.equal(wrong.reason, 'wrongKind');
});

test('梱包中のパックの一覧: 倉庫間移動と委託を分ける。委託のパックの破棄・設定・出力の記録は、倉庫間移動と同じ操作', () => {
  let s = base();
  const tr = T.createPack(s, M, { fromId: OSAKA.id, toId: KANTO.id, by: 'x', at: NOW });
  const cp = C.createConsignPack(tr.state, M, { fromId: OSAKA.id, vendorId: V1.id, by: 'x', at: NOW });
  assert.equal(T.drafts(cp.state, OSAKA.id).length, 1); // 既定は、倉庫間移動
  assert.equal(T.drafts(cp.state, OSAKA.id, 'consign').length, 1);
  assert.equal(T.drafts(cp.state, OSAKA.id, 'consign')[0].kind, 'consign');
  const printed = T.markPrinted(cp.state, cp.pack.id, 'list', NOW);
  assert.equal(printed.transfers.find((t) => t.id === cp.pack.id).listPrintedAt, NOW);
  assert.equal(T.discardPack(cp.state, cp.pack.id).state.transfers.length, 1);
});

test('履歴: 委託した商品の履歴に、委託先・希望価格・配送の情報（業者・追跡番号）が出る', () => {
  let { state, pack } = mk();
  state = T.updatePack(add(state, pack.id, 'A').state, pack.id, { carrier: 'jp', size: '60' });
  const r = C.shipConsignPack(state, M, pack.id, { tracking: '8100-1234', by: '小川 直樹', at: NOW });
  const h = W.historyOf(r.state, 'A');
  const e = h.find((x) => x.label === '委託');
  assert.ok(e.detail.includes(V1.name) && e.detail.includes('13,000') && e.detail.includes('日本郵便') && e.detail.includes('8100-1234'));
});
