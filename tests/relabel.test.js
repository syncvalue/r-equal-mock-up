import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const W = await import('../src/warehouse.js');
const T = await import('../src/warehouseTransfer.js');
const S = await import('../src/stock.js');
const { DEFAULT_MASTER: M, destinationProblem, isHighValue } = await import('../src/warehouseMaster.js');
const [OSAKA, KANTO] = M.warehouses;
const HON = M.warehouses.find((w) => w.highValue);

const NOW = new Date(2026, 9, 25, 12, 0).getTime();
const day = (n) => new Date(2026, 9, 25 - n, 10, 0).getTime();
const unit = (code, over = {}) => ({
  code, visitId: `V-${code}`, userId: 'u01', customerName: '山田 花子', at: day(20), date: W.dateOf(day(20)), itemId: code, name: `商品${code}`, category: 'ブランドバッグ', rank: 'A', n: 1, qty: 1, price: 10000,
  sealColor: 'other', status: 'stored', storedAt: day(20), location: OSAKA.locations[0], by: 'x', warehouseId: OSAKA.id, ...over,
});
const state = (units, over = {}) => ({ units, records: {}, returns: [], transfers: [], ...over });
const pending = (code, over = {}) => unit(code, { status: 'pending', storedAt: null, location: null, by: null, warehouseId: undefined, ...over });
const rl = (s, code, newCode, color, extra = {}) => W.relabelUnit(s, code, { newCode, color, by: '小川 直樹', at: NOW, ...extra });

test('貼り替え: 色が変わると、シールそのものが別になるので、商品のシールNo.（ID）が新しくなる。古いNo.と色は、記録に残る', () => {
  const s = state([pending('RQ-OLD1'), pending('RQ-OTHER')]);
  const r = rl(s, 'RQ-OLD1', ' rq-new1 ', 'purple');
  assert.equal(r.ok, true);
  const u = r.state.units.find((x) => x.code === 'RQ-NEW1');
  assert.equal(u.sealColor, 'purple');
  assert.deepEqual(u.relabels, [{ from: 'RQ-OLD1', to: 'RQ-NEW1', fromColor: 'other', toColor: 'purple', by: '小川 直樹', at: NOW }]);
  assert.equal(r.state.units.some((x) => x.code === 'RQ-OLD1'), false);
  assert.equal(r.state.units.length, 2);
  assert.equal(s.units[0].code, 'RQ-OLD1'); // 元は変更されない
  assert.equal(isHighValue(u, M), true); // 色が変わったので、高額品（本社管理）になる
  const again = rl(r.state, 'RQ-NEW1', 'RQ-NEW2', 'red');
  assert.deepEqual(again.state.units.find((x) => x.code === 'RQ-NEW2').relabels.map((x) => x.from), ['RQ-OLD1', 'RQ-NEW1']); // 何度貼り替えても、経緯が残る
});

test('貼り替え: 入庫前・所在不明・在庫の商品だけ。出品中・委託中・売却済み・返品対応中・返品済み・輸送中は、貼り替えない', () => {
  const base = state([unit('S1'), pending('P1'), pending('M1', { status: 'missing' })]);
  for (const code of ['S1', 'P1', 'M1']) assert.equal(rl(base, code, `RQ-N-${code}`, 'red').ok, true, code);
  let s = state([unit('A'), unit('B'), unit('C')]);
  s = W.listItem(s, 'A', { channel: 'mercari', price: 1000, at: NOW }).state; // 出品中
  s = W.listItem(s, 'B', { channel: 'auction', price: 1000, at: NOW }).state; // 委託中
  const sold = W.sell(W.listItem(state([unit('X')]), 'X', { channel: 'mercari', price: 1000, at: NOW }).state, 'X', { price: 900, at: NOW }).state;
  const ret = W.requestReturn(state([unit('R', { at: day(2), date: W.dateOf(day(2)) })]), { customerName: 'x', codes: ['R'], reason: 'family', at: NOW }).state;
  const sent = T.sendTransfer(state([unit('T')]), M, { fromId: OSAKA.id, toId: KANTO.id, codes: ['T'], by: 'x', at: NOW }).state;
  for (const [st, code] of [[s, 'A'], [s, 'B'], [sold, 'X'], [ret, 'R'], [sent, 'T']]) assert.equal(rl(st, code, 'RQ-ZZ', 'red').reason, 'notRelabelable', code);
  assert.equal(rl(s, 'C', 'RQ-OK', 'red').ok, true);
});

test('貼り替え: 新しいシールNo.が空・同じ・すでに別の商品で使用中、色が正しくない、商品がない場合は、できない', () => {
  const s = state([pending('A'), pending('B')]);
  assert.equal(rl(s, 'A', '  ', 'red').reason, 'badCode');
  assert.equal(rl(s, 'A', 'a', 'red').reason, 'sameCode');
  assert.equal(rl(s, 'A', 'B', 'red').reason, 'dupCode');
  assert.equal(rl(s, 'A', 'RQ-N', 'pink').reason, 'badColor');
  assert.equal(rl(s, 'ZZ', 'RQ-N', 'red').reason, 'unknown');
  assert.equal(rl(s, 'A', 'RQ-N', 'other').ok, true); // 同じ色でも、シールが破れたときなどは、貼り替えられる
});

test('貼り替え: 移動の記録も、新しいシールNo.につなぎ替える（記録が途切れず、履歴に貼り替えが残る）', () => {
  const sent = T.sendTransfer(state([unit('A'), unit('B')]), M, { fromId: OSAKA.id, toId: KANTO.id, codes: ['A', 'B'], by: 'x', at: NOW });
  const done = T.receiveTransfer(sent.state, M, sent.transfer.id, { receiverWarehouseId: KANTO.id, location: KANTO.locations[0], by: 'y', at: NOW + 1 }).state;
  const r = rl(done, 'A', 'RQ-NEW', 'red', { at: NOW + 10 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.transfers[0].codes, ['RQ-NEW', 'B']);
  const h = W.historyOf(r.state, 'RQ-NEW');
  assert.deepEqual(h.map((e) => e.label), ['買取', '入庫', '移動（送付）', '移動（受取）', 'シール貼り替え']);
  assert.ok(h.at(-1).detail.includes('黄・緑・青') && h.at(-1).detail.includes('赤') && h.at(-1).detail.includes('RQ-NEW') && h.at(-1).detail.includes('小川 直樹'));
  assert.deepEqual(W.historyOf(r.state, 'A'), []); // 古いNo.では、履歴を引けない（新しいNo.に引き継がれた）
});

test('貼り替えで納入先が変わる: 高額品でなくなる・高額品になると、いまの保管場所が規則に合わなくなる', () => {
  const s = state([unit('A', { sealColor: 'other' })]); // 大阪倉庫の在庫（高額品ではない）
  const high = rl(s, 'A', 'RQ-HI', 'purple').state.units[0];
  assert.equal(destinationProblem(M, high, OSAKA.id), 'highToHonsha'); // 本社に移す必要がある
  assert.equal(destinationProblem(M, high, HON.id), '');
  const back = rl(state([unit('H', { sealColor: 'purple', warehouseId: HON.id, location: HON.locations[0] })]), 'H', 'RQ-LOW', 'other').state.units[0];
  assert.equal(destinationProblem(M, back, HON.id), 'normalToWarehouse'); // 倉庫に移す必要がある
});

test('古いシールNo.: 読み取ると、貼り替え済みであることと新しいNo.を知らせる（入庫・探すとき）', () => {
  const s = rl(state([pending('RQ-OLD')]), 'RQ-OLD', 'RQ-NEW', 'red').state;
  const rows = W.buildRows(s, NOW);
  assert.equal(W.findByCode(rows, 'RQ-OLD'), null); // 古いNo.は、商品としては見つからない
  assert.deepEqual(W.replacedCode(s.units, ' rq-old '), { from: 'RQ-OLD', to: 'RQ-NEW' });
  assert.equal(W.replacedCode(s.units, 'RQ-NEW'), null);
  const r = S.receive(s.units, null, 'RQ-OLD', { location: 'A棚', by: 'x' });
  assert.deepEqual(r.result, { type: 'replaced', code: 'RQ-OLD', newCode: 'RQ-NEW' });
  assert.ok(S.resultMessage(r.result).text.includes('RQ-NEW') && !S.resultMessage(r.result).ok);
  assert.equal(S.receive(s.units, null, 'RQ-NEW', { location: 'A棚', by: 'x' }).result.type, 'ok');
});

test('貼り替え: 黄・緑・青のどれにも貼り替えられる。選べない色は不可。高額品の判定は紫・赤だけ（黄・緑・青の扱いは同じ）', () => {
  for (const c of ['yellow', 'green', 'blue']) assert.equal(rl(state([unit('A', { sealColor: 'purple' })]), 'A', `RQ-${c}`, c).ok, true, c);
  assert.equal(rl(state([unit('A')]), 'A', 'RQ-X', 'pink').ok, false);
});
