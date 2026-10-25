import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const W = await import('../src/warehouse.js');
const T = await import('../src/warehouseTransfer.js');
const { DEFAULT_MASTER: M, saveWarehouse, setWarehouseActive } = await import('../src/warehouseMaster.js');
const [OSAKA, KANTO, FUKUOKA] = M.warehouses;

const NOW = new Date(2026, 9, 25, 12, 0).getTime();
const day = (n) => new Date(2026, 9, 25 - n, 10, 0).getTime();
const unit = (code, wid, over = {}) => ({
  code, visitId: `V-${code}`, userId: 'u01', customerName: '山田 花子', at: day(20), date: W.dateOf(day(20)), itemId: code, name: `商品${code}`, category: 'バッグ', rank: 'A', n: 1, qty: 1, price: 10000,
  status: 'stored', storedAt: day(20), location: OSAKA.locations[0], by: 'x', warehouseId: wid, ...over,
});
const base = () => ({ units: [unit('A', OSAKA.id), unit('B', OSAKA.id), unit('C', KANTO.id), unit('D', OSAKA.id, { status: 'pending', storedAt: null, location: null, warehouseId: undefined })], records: {}, returns: [], transfers: [] });
const send = (s, over = {}) => T.sendTransfer(s, M, { fromId: OSAKA.id, toId: KANTO.id, codes: ['A', 'B'], by: '小川 直樹', at: NOW, ...over });

test('送る: 自倉庫の在庫を、別の倉庫へ送る。送った商品は「輸送中」になり、出品などはできない', () => {
  const s = base();
  const r = send(s);
  assert.equal(r.ok, true);
  assert.deepEqual({ codes: r.transfer.codes, fromId: r.transfer.fromId, toId: r.transfer.toId, status: r.transfer.status, sentBy: r.transfer.sentBy, sentAt: r.transfer.sentAt }, { codes: ['A', 'B'], fromId: OSAKA.id, toId: KANTO.id, status: 'transit', sentBy: '小川 直樹', sentAt: NOW });
  const rows = W.buildRows(r.state, NOW);
  assert.equal(rows.find((x) => x.unit.code === 'A').stage, 'transit');
  assert.equal(rows.find((x) => x.unit.code === 'A').canList, false);
  assert.equal(W.listItem(r.state, 'A', { channel: 'mercari', price: 1000, at: NOW }).ok, false);
  assert.deepEqual(s.transfers, []); // 元は変更されない
  assert.equal(W.stockSummary(rows).transit, 2);
  assert.equal(W.stockSummary(rows).inventoryCost, 10000); // 輸送中のA・Bは数えない（残るのは、移動していないC）
});

test('送る: 在庫でない商品・自倉庫にない商品は送れない（理由つき）。1点もなければ失敗', () => {
  let s = base();
  s = W.listItem(s, 'B', { channel: 'mercari', price: 1000, at: NOW }).state;
  const r = send(s, { codes: ['A', 'B', 'C', 'D', 'Z'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.transfer.codes, ['A']);
  assert.deepEqual(r.rejected.sort((a, b) => a.code.localeCompare(b.code)), [{ code: 'B', reason: 'notStock' }, { code: 'C', reason: 'otherWarehouse' }, { code: 'D', reason: 'notStock' }, { code: 'Z', reason: 'unknown' }]);
  assert.equal(send(base(), { codes: ['C'] }).reason, 'noItems');
  assert.equal(send(base(), { toId: OSAKA.id }).reason, 'sameWarehouse');
  assert.equal(send(base(), { toId: 'gone' }).reason, 'badDestination');
  const off = setWarehouseActive(saveWarehouse(M, { name: '閉鎖', locations: 'A' }).master, 'none', false, {});
  assert.equal(off.ok, false);
  assert.equal(send(send(base()).state, { codes: ['A'] }).reason, 'noItems'); // 輸送中の商品は、二重に送れない
});

test('受け取る: 送り先の倉庫の担当者が、その倉庫の棚を決めて受け取る。商品は送り先の倉庫の在庫になる', () => {
  const sent = send(base());
  const id = sent.transfer.id;
  const r = T.receiveTransfer(sent.state, M, id, { receiverWarehouseId: KANTO.id, location: KANTO.locations[2], by: '山本 大地', at: NOW + 1000 });
  assert.equal(r.ok, true);
  const a = r.state.units.find((u) => u.code === 'A');
  assert.deepEqual({ w: a.warehouseId, l: a.location }, { w: KANTO.id, l: KANTO.locations[2] });
  assert.deepEqual({ status: r.state.transfers[0].status, by: r.state.transfers[0].receivedBy, loc: r.state.transfers[0].location }, { status: 'received', by: '山本 大地', loc: KANTO.locations[2] });
  const row = W.buildRows(r.state, NOW).find((x) => x.unit.code === 'A');
  assert.equal(row.stage, 'stock'); assert.equal(row.canList, true);
  assert.equal(W.holdingByWarehouse(r.state, M, NOW)[KANTO.id].count, 3); // C・A・B
  assert.equal(sent.state.units.find((u) => u.code === 'A').warehouseId, OSAKA.id); // 元は変更されない
});

test('受け取り: 送り先の倉庫の担当者でなければ、その倉庫にない棚なら、輸送中でなければ、受け取れない', () => {
  const sent = send(base());
  const id = sent.transfer.id;
  const opt = { receiverWarehouseId: KANTO.id, location: KANTO.locations[0], by: 'x' };
  assert.equal(T.receiveTransfer(sent.state, M, id, { ...opt, receiverWarehouseId: FUKUOKA.id }).reason, 'notDestination');
  assert.equal(T.receiveTransfer(sent.state, M, id, { ...opt, location: '存在しない棚' }).reason, 'badLocation');
  assert.equal(T.receiveTransfer(sent.state, M, 'nope', opt).reason, 'notInTransit');
  const done = T.receiveTransfer(sent.state, M, id, opt).state;
  assert.equal(T.receiveTransfer(done, M, id, opt).reason, 'notInTransit');
});

test('取り消し: 送った倉庫だけが、輸送中の間は取り消せる。商品は元の倉庫の在庫に戻る', () => {
  const sent = send(base());
  const id = sent.transfer.id;
  assert.equal(T.cancelTransfer(sent.state, id, { byWarehouseId: KANTO.id }).reason, 'notSender');
  const r = T.cancelTransfer(sent.state, id, { byWarehouseId: OSAKA.id, at: NOW + 1 });
  assert.equal(r.ok, true);
  assert.equal(r.state.transfers[0].status, 'cancelled');
  assert.equal(W.buildRows(r.state, NOW).find((x) => x.unit.code === 'A').stage, 'stock');
  assert.equal(T.cancelTransfer(r.state, id, { byWarehouseId: OSAKA.id }).reason, 'notInTransit');
});

test('輸送中の商品: 返品は受け付けない。履歴に、送付と受取が残る', () => {
  const s0 = { ...base(), units: base().units.map((u) => ({ ...u, at: day(2), date: W.dateOf(day(2)), storedAt: day(2) + 3600000 })) };
  const sent = send(s0);
  const ret = W.requestReturn(sent.state, { customerName: '山田 花子', codes: ['A'], reason: 'family', at: NOW });
  assert.equal(ret.ok, false);
  assert.deepEqual(ret.rejected, [{ code: 'A', reason: 'inTransit' }]);
  const done = T.receiveTransfer(sent.state, M, sent.transfer.id, { receiverWarehouseId: KANTO.id, location: KANTO.locations[0], by: '山本 大地', at: NOW + 5000 }).state;
  const h = W.historyOf(done, 'A');
  assert.deepEqual(h.map((e) => e.label), ['買取', '入庫', '移動（送付）', '移動（受取）']);
  assert.ok(h[2].detail.includes('大阪倉庫') && h[2].detail.includes('関東倉庫') && h[2].detail.includes('小川 直樹'));
  assert.ok(h[3].detail.includes('山本 大地'));
});

test('移動の一覧: 倉庫あての受け取り待ちと、倉庫が送った輸送中を分けて出す', () => {
  const sent = send(base());
  assert.equal(T.incoming(sent.state, KANTO.id).length, 1);
  assert.equal(T.incoming(sent.state, OSAKA.id).length, 0);
  assert.equal(T.outgoing(sent.state, OSAKA.id).length, 1);
  assert.equal(T.outgoing(sent.state, KANTO.id).length, 0);
});

test('保存: 移動の記録は保存して読み戻せる。壊れたデータは空として扱う', () => {
  assert.deepEqual(W.loadTransfers(), []);
  assert.equal(W.saveState({ records: {}, returns: [], transfers: [{ id: 'T1' }] }), true);
  assert.deepEqual(W.loadTransfers(), [{ id: 'T1' }]);
  mem.set('rq-mock-transfers', '{"x":1}');
  assert.deepEqual(W.loadTransfers(), []);
});

const HON = M.warehouses.find((w) => w.highValue);

test('送る: 納入先の規則は移動でも守る（高額品は本社へ、高額品以外は本社以外の倉庫へだけ）', () => {
  const high = unit('H', HON.id, { category: 'ジュエリー・貴金属', price: 500000, location: HON.locations[0] });
  const s = { ...base(), units: [...base().units, high] };
  const toHon = T.sendTransfer(s, M, { fromId: OSAKA.id, toId: HON.id, codes: ['A', 'H'], by: 'x', at: NOW }); // A は高額品でない／H は本社にある（元の倉庫が違う）
  assert.equal(toHon.reason, 'noItems');
  assert.deepEqual(toHon.rejected.sort((a, b) => a.code.localeCompare(b.code)), [{ code: 'A', reason: 'wrongDestination' }, { code: 'H', reason: 'otherWarehouse' }]);
  const fromHon = T.sendTransfer(s, M, { fromId: HON.id, toId: OSAKA.id, codes: ['H'], by: 'x', at: NOW });
  assert.equal(fromHon.reason, 'noItems'); // 高額品を、本社以外の倉庫へは送れない
  assert.deepEqual(fromHon.rejected, [{ code: 'H', reason: 'wrongDestination' }]);
  const high2 = unit('H2', OSAKA.id, { category: 'ジュエリー・貴金属', price: 500000 }); // 例外的に倉庫にある高額品（本社へ移す）
  const ok = T.sendTransfer({ ...s, units: [...s.units, high2] }, M, { fromId: OSAKA.id, toId: HON.id, codes: ['H2', 'A'], by: 'x', at: NOW });
  assert.deepEqual(ok.transfer.codes, ['H2']);
});

test('返品: 契約の商品が複数の倉庫（本社と倉庫）に分かれていても受け付け、倉庫ごとの返品に分けて、同じ契約として結びつける', () => {
  const same = { visitId: 'V-1', at: day(3), date: W.dateOf(day(3)), storedAt: day(3) + 1 };
  const s = { ...base(), units: [unit('A', OSAKA.id, { ...same, price: 12000 }), unit('B', HON.id, { ...same, price: 480000, category: 'ジュエリー・貴金属' }), unit('E', OSAKA.id, { ...same, price: 3000 })] };
  const r = W.requestReturn(s, { customerName: '山田 花子', codes: ['A', 'B', 'E'], reason: 'family', at: NOW, by: '小川 直樹', master: M });
  assert.equal(r.ok, true);
  assert.equal(r.rets.length, 2);
  const by = Object.fromEntries(r.rets.map((x) => [x.warehouseId, x]));
  assert.deepEqual(by[OSAKA.id].codes, ['A', 'E']); assert.equal(by[OSAKA.id].refund, 15000);
  assert.deepEqual(by[HON.id].codes, ['B']); assert.equal(by[HON.id].refund, 480000);
  assert.equal(by[OSAKA.id].groupId, by[HON.id].groupId);
  assert.equal(by[OSAKA.id].groupRefund, 495000); // お客様から返していただく代金は、契約全体の合計
  assert.equal(r.state.returns.length, 2);
  const one = W.requestReturn(s, { customerName: '山田 花子', codes: ['A'], reason: 'family', at: NOW, master: M });
  assert.equal(one.rets.length, 1); assert.equal(one.ret.warehouseId, OSAKA.id);
});
