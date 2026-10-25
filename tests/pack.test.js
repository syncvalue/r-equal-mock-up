import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const W = await import('../src/warehouse.js');
const T = await import('../src/warehouseTransfer.js');
const { DEFAULT_MASTER: M } = await import('../src/warehouseMaster.js');
const [OSAKA, KANTO] = M.warehouses;

const NOW = new Date(2026, 9, 25, 12, 0).getTime();
const day = (n) => new Date(2026, 9, 25 - n, 10, 0).getTime();
const unit = (code, over = {}) => ({
  code, visitId: `V-${code}`, userId: 'u01', customerName: '山田 花子', at: day(20), date: W.dateOf(day(20)), itemId: code, name: `商品${code}`, category: 'ブランドバッグ', rank: 'A', n: 1, qty: 1, price: 10000,
  sealColor: 'other', status: 'stored', storedAt: day(20), location: OSAKA.locations[0], by: 'x', warehouseId: OSAKA.id, ...over,
});
const base = () => ({ units: [unit('A'), unit('B'), unit('C'), unit('K', { warehouseId: KANTO.id }), unit('P', { status: 'pending', storedAt: null, location: null, warehouseId: undefined })], records: {}, returns: [], transfers: [] });
const mk = (s = base(), over = {}) => T.createPack(s, M, { fromId: OSAKA.id, toId: KANTO.id, by: '小川 直樹', at: NOW, ...over });
const add = (s, id, code) => T.addToPack(s, M, id, code, { at: NOW });

test('パックを作る: 送り先を決めて、空のパック（梱包中）を作る。送り先は別の倉庫だけ', () => {
  const r = mk();
  assert.equal(r.ok, true);
  assert.deepEqual({ status: r.pack.status, codes: r.pack.codes, fromId: r.pack.fromId, toId: r.pack.toId, createdBy: r.pack.createdBy, boxes: r.pack.boxes, carrier: r.pack.carrier }, { status: 'draft', codes: [], fromId: OSAKA.id, toId: KANTO.id, createdBy: '小川 直樹', boxes: 1, carrier: '' });
  assert.equal(r.state.transfers.length, 1);
  assert.equal(mk(base(), { toId: OSAKA.id }).reason, 'sameWarehouse');
  assert.equal(mk(base(), { toId: 'gone' }).reason, 'badDestination');
});

test('パックに商品を入れる: 読み取り・検索で選んだ商品を入れる。梱包中の商品は、ほかで使えない（出品・別のパック）。二重に入れても重ならない', () => {
  const { state, pack } = mk();
  const a = add(state, pack.id, ' a ');
  assert.equal(a.ok, true);
  assert.deepEqual(a.state.transfers[0].codes, ['A']);
  assert.equal(W.buildRows(a.state, NOW).find((r) => r.unit.code === 'A').stage, 'packing'); // 梱包中
  assert.equal(W.listItem(a.state, 'A', { channel: 'mercari', price: 1000, at: NOW }).ok, false);
  const dup = add(a.state, pack.id, 'A');
  assert.equal(dup.ok, true); assert.equal(dup.already, true); assert.deepEqual(dup.state.transfers[0].codes, ['A']);
  const other = mk(a.state);
  assert.equal(add(other.state, other.pack.id, 'A').reason, 'inOtherPack'); // 別のパックに入っている
  assert.equal(add(state, pack.id, 'K').reason, 'otherWarehouse');
  assert.equal(add(state, pack.id, 'P').reason, 'notStock');
  assert.equal(add(state, pack.id, 'ZZ').reason, 'unknown');
  assert.equal(add(state, 'nope', 'A').reason, 'notDraft');
  assert.deepEqual(state.transfers[0].codes, []); // 元は変更されない
});

test('パックに商品を入れる: 送り先の規則（高額品は本社へ、それ以外は本社以外へ）も確かめる', () => {
  const s = { ...base(), units: [...base().units, unit('H', { sealColor: 'purple' })] };
  const { state, pack } = mk(s);
  assert.equal(add(state, pack.id, 'H').reason, 'wrongDestination');
});

test('パックから商品を外す: 外した商品は、在庫に戻る', () => {
  let { state, pack } = mk();
  state = add(add(state, pack.id, 'A').state, pack.id, 'B').state;
  const r = T.removeFromPack(state, pack.id, 'A');
  assert.deepEqual(r.transfers[0].codes, ['B']);
  assert.equal(W.buildRows(r, NOW).find((x) => x.unit.code === 'A').stage, 'stock');
  assert.equal(T.removeFromPack(r, pack.id, 'ZZ'), r); // 入っていない商品は、変えない
});

test('パックの設定: 配送業者（ヤマト・佐川・日本郵便・その他）・サイズ・個口数・メモ。正しくない値は反映しない', () => {
  const { state, pack } = mk();
  const r = T.updatePack(state, pack.id, { carrier: 'yamato', size: '80', boxes: '2', note: ' 割れ物注意 ' });
  assert.deepEqual({ c: r.transfers[0].carrier, s: r.transfers[0].size, b: r.transfers[0].boxes, n: r.transfers[0].note }, { c: 'yamato', s: '80', b: 2, n: '割れ物注意' });
  assert.equal(T.updatePack(state, pack.id, { carrier: 'unknown' }), state);
  assert.equal(T.updatePack(state, pack.id, { size: '999' }), state);
  assert.equal(T.updatePack(state, pack.id, { boxes: 0 }), state);
  assert.equal(T.updatePack(state, pack.id, { boxes: 'x' }), state);
  const partial = T.updatePack(r, pack.id, { size: '100' });
  assert.equal(partial.transfers[0].carrier, 'yamato'); // 指定しなかった項目は、そのまま
});

test('出力の記録: 明細・発送伝票を出力した日時を残す（発送前の確認用）', () => {
  const { state, pack } = mk();
  const l = T.markPrinted(state, pack.id, 'list', NOW);
  assert.equal(l.transfers[0].listPrintedAt, NOW); assert.equal(l.transfers[0].labelPrintedAt, null);
  assert.equal(T.markPrinted(l, pack.id, 'label', NOW + 1).transfers[0].labelPrintedAt, NOW + 1);
  assert.equal(T.markPrinted(state, pack.id, 'zzz', NOW), state);
});

test('発送する: 商品が1点以上、配送業者が決まっていれば、輸送中になる（追跡番号は任意）。ここから、受け取り・取り消しの対象', () => {
  let { state, pack } = mk();
  assert.equal(T.shipPack(state, pack.id, { by: 'x', at: NOW }).reason, 'noItems');
  state = add(state, pack.id, 'A').state;
  assert.equal(T.shipPack(state, pack.id, { by: 'x', at: NOW }).reason, 'noCarrier');
  state = T.updatePack(state, pack.id, { carrier: 'sagawa', size: '60' });
  const r = T.shipPack(state, pack.id, { tracking: ' 1234-5678-9012 ', by: '小川 直樹', at: NOW });
  assert.equal(r.ok, true);
  const t = r.state.transfers[0];
  assert.deepEqual({ status: t.status, tracking: t.tracking, sentBy: t.sentBy, sentAt: t.sentAt, codes: t.codes }, { status: 'transit', tracking: '1234-5678-9012', sentBy: '小川 直樹', sentAt: NOW, codes: ['A'] });
  assert.equal(W.buildRows(r.state, NOW).find((x) => x.unit.code === 'A').stage, 'transit');
  assert.equal(T.outgoing(r.state, OSAKA.id).length, 1); assert.equal(T.incoming(r.state, KANTO.id).length, 1);
  assert.equal(T.shipPack(r.state, pack.id, { by: 'x' }).reason, 'notDraft'); // 二重に発送できない
  const rec = T.receiveTransfer(r.state, M, pack.id, { receiverWarehouseId: KANTO.id, location: KANTO.locations[0], by: '山本 大地', at: NOW + 1 });
  assert.equal(rec.ok, true);
  assert.equal(rec.state.transfers[0].carrier, 'sagawa'); assert.equal(rec.state.transfers[0].tracking, '1234-5678-9012'); // 配送の情報は、受け取っても残る
});

test('発送前の確認: 発送のときも、送り先の規則とパックの商品の状態を、もう一度確かめる', () => {
  let { state, pack } = mk();
  state = T.updatePack(add(state, pack.id, 'A').state, pack.id, { carrier: 'jp' });
  const gone = { ...state, units: state.units.map((u) => (u.code === 'A' ? { ...u, sealColor: 'purple' } : u)) }; // 梱包中に、色が高額品に変わった
  const r = T.shipPack(gone, pack.id, { by: 'x', at: NOW, master: M });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'wrongDestination');
  assert.deepEqual(r.rejected, [{ code: 'A', reason: 'wrongDestination' }]);
});

test('パックの破棄: 梱包中のパックだけ。商品は在庫に戻る。発送したパックは破棄できない（取り消しを使う）', () => {
  let { state, pack } = mk();
  state = T.updatePack(add(state, pack.id, 'A').state, pack.id, { carrier: 'yamato' });
  const d = T.discardPack(state, pack.id);
  assert.equal(d.ok, true);
  assert.equal(d.state.transfers.length, 0);
  assert.equal(W.buildRows(d.state, NOW).find((x) => x.unit.code === 'A').stage, 'stock');
  const sent = T.shipPack(state, pack.id, { by: 'x', at: NOW }).state;
  assert.equal(T.discardPack(sent, pack.id).reason, 'notDraft');
});

test('梱包中のパックの一覧、梱包中の商品は、履歴に出ない・返品も受け付けない', () => {
  let { state, pack } = mk(base());
  state = add(state, pack.id, 'A').state;
  assert.equal(T.drafts(state, OSAKA.id).length, 1); assert.equal(T.drafts(state, KANTO.id).length, 0);
  assert.deepEqual(W.historyOf(state, 'A').map((e) => e.label), ['買取', '入庫']); // まだ発送していない
  const ret = W.requestReturn({ ...state, units: state.units.map((u) => ({ ...u, at: day(2), date: W.dateOf(day(2)) })) }, { customerName: 'x', codes: ['A'], reason: 'family', at: NOW });
  assert.equal(ret.ok, false);
  assert.deepEqual(ret.rejected, [{ code: 'A', reason: 'inPacking' }]);
  const relabel = W.relabelUnit(state, 'A', { newCode: 'RQ-N', color: 'red', at: NOW });
  assert.equal(relabel.reason, 'notRelabelable'); // 梱包中は貼り替えない
});

test('読み取りの判定: 梱包中の商品は、理由「packing」（別のパックに入っている）で知らせる', () => {
  let { state, pack } = mk();
  state = add(state, pack.id, 'A').state;
  assert.equal(T.sendableCheck(state, M, { fromId: OSAKA.id, code: 'A', at: NOW }).reason, 'packing');
});
