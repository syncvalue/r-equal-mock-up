import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { buildSample, seedSample, WH_SAMPLE_KEY } = await import('../src/warehouseSample.js');
const W = await import('../src/warehouse.js');

const NOW = new Date(2026, 9, 25, 15, 0).getTime();

test('サンプル: 在庫・出品中・売却済み・クーリングオフ期間中・入庫待ち・返品対応が、すべて揃う', () => {
  seedSample(NOW, true);
  const rows = W.buildRows(W.loadState(), NOW);
  const stages = new Set(rows.map((r) => r.stage));
  for (const s of ['incoming', 'missing', 'stock', 'listed', 'consigned', 'sold', 'returning', 'returned']) assert.ok(stages.has(s), s);
  assert.ok(rows.some((r) => r.stage === 'stock' && r.canList)); // すぐ出品できる在庫
  assert.ok(rows.some((r) => r.stage === 'stock' && r.cooling)); // 期間中で出品を止めている在庫
  assert.ok(W.returnableContracts(W.loadState(), NOW).length >= 1); // 今から返品を受け付けられる契約
});

test('サンプル: 売上は、今日・今月に売れたものがあり、フリマと業者の両方で、利益が出ている', () => {
  const state = W.loadState();
  const rows = W.salesRows(state);
  const today = W.salesStats(rows, W.dateOf(NOW));
  const month = W.salesStats(rows, W.dateOf(NOW).slice(0, 7));
  assert.ok(today.count >= 1 && month.count > today.count);
  assert.ok(new Set(month.byChannel.map((c) => W.channelOf(c.key).type)).size === 2);
  assert.ok(month.profit > 0);
});

test('サンプル: 売却済み・出品中の商品は、売るときの規則（期間外の入庫済み）を満たしている', () => {
  const { units, records } = buildSample(NOW);
  for (const [code, rec] of Object.entries(records)) {
    const u = units.find((x) => x.code === code);
    assert.ok(u, code);
    assert.equal(u.status, 'stored');
    assert.ok(W.dateOf(rec.listedAt) > W.coolingOffEnd(u.date), `${code} は期間中に出品されている`);
  }
});

test('サンプル: 商品No.は重複しない。一度入れたら自動では入れ直さず、強制のときだけ入れ直す', () => {
  const { units } = buildSample(NOW);
  assert.equal(new Set(units.map((u) => u.code)).size, units.length);
  const before = mem.get('rq-mock-warehouse');
  assert.equal(seedSample(NOW), false);
  assert.equal(mem.get('rq-mock-warehouse'), before);
  assert.ok(mem.get(WH_SAMPLE_KEY));
  mem.delete('rq-mock-warehouse'); // 初期化で消えても、自動では復活しない
  assert.equal(seedSample(NOW), false);
  assert.equal(seedSample(NOW, true), true);
});

test('サンプル: 既存の入庫データ（営業が登録したもの）がある場合、自動投入では消さずに追加する', () => {
  mem.clear();
  mem.set('rq-mock-stock', JSON.stringify([{ code: 'RQ-MINE', visitId: 'V1', userId: 'u01', customerName: 'テスト', at: NOW, date: W.dateOf(NOW), itemId: 'x', name: 'x', category: 'バッグ', rank: 'A', n: 1, qty: 1, price: 1, status: 'pending', storedAt: null, location: null, by: null }]));
  assert.equal(seedSample(NOW), true);
  const codes = W.loadState().units.map((u) => u.code);
  assert.ok(codes.includes('RQ-MINE') && codes.length > 10);
});

test('サンプル: 入庫済みの商品は、複数の倉庫に分かれ、保管場所はその倉庫の棚。入庫前・所在不明の商品は、倉庫が決まらない', async () => {
  const { DEFAULT_MASTER: M } = await import('../src/warehouseMaster.js');
  const { units, transfers } = buildSample(NOW);
  const moved = new Set(transfers.flatMap((t) => t.codes));
  const stored = units.filter((u) => u.status === 'stored');
  assert.ok(new Set(stored.map((u) => u.warehouseId)).size >= 3);
  for (const u of stored) assert.ok(M.warehouses.find((w) => w.id === u.warehouseId).locations.includes(u.location), `${u.code}: ${u.location}`);
  for (const u of stored.filter((x) => x.check && !moved.has(x.code))) assert.equal(M.staff.find((s) => s.name === u.check.by)?.warehouseId, u.warehouseId); // 照合したのは、その倉庫の担当者
  for (const u of units.filter((x) => x.status !== 'stored')) assert.equal(u.warehouseId, undefined);
});

test('サンプル: 倉庫間の移動に、受取済み（移動先の倉庫の在庫になった）と輸送中がある', () => {
  const rows = W.buildRows(W.loadState(), NOW);
  assert.ok(rows.some((r) => r.stage === 'transit'));
  const done = W.loadState().transfers.find((t) => t.status === 'received');
  assert.ok(done);
  const u = rows.find((r) => r.unit.code === done.codes[0]).unit;
  assert.equal(u.warehouseId, done.toId); assert.equal(u.location, done.location);
});

test('サンプル: どの倉庫（本社を含む）の担当者でログインしても、倉庫間移動の「受け取り待ち」「送った商品・輸送中」「移動の履歴」のダミーが見える', async () => {
  const MM = await import('../src/warehouseMaster.js');
  const M = MM.DEFAULT_MASTER;
  const T = await import('../src/warehouseTransfer.js');
  const state = W.loadState();
  const rows = W.buildRows(state, NOW);
  for (const w of M.warehouses) {
    assert.ok(T.incoming(state, w.id).length >= 1, `${w.name}: 受け取り待ちがない`);
    assert.ok(T.outgoing(state, w.id).length >= 1, `${w.name}: 送った商品・輸送中がない`);
    assert.ok(state.transfers.some((t) => t.status === 'received' && (t.fromId === w.id || t.toId === w.id)), `${w.name}: 移動の履歴がない`);
  }
  // 輸送中の商品は、すべて在庫から送られたもの。移動の記録の商品は、実在する
  const codes = new Set(state.units.map((u) => u.code));
  for (const t of state.transfers) for (const c of t.codes) assert.ok(codes.has(c), `${c} が商品にない`);
  assert.ok(rows.filter((r) => r.stage === 'transit').length >= 7);
  // 規則どおり: 高額品（紫・赤）は本社へ、それ以外は本社以外の倉庫へだけ移動している（色の貼り替えのあとの移動を含む）
  const byCode = new Map(state.units.map((u) => [u.code, u]));
  for (const t of state.transfers) for (const c of t.codes) assert.equal(MM.destinationProblem(M, byCode.get(c), t.toId), '', `${c} → ${t.toName}`);
});

test('サンプル: 色の貼り間違いを直した商品（貼り替え）が、本社・倉庫の間を移動している', () => {
  const moved = W.loadState().units.filter((u) => (u.relabels ?? []).length);
  assert.ok(moved.length >= 3);
  for (const u of moved) assert.ok(u.relabels[0].from !== u.code && u.relabels[0].fromColor !== u.relabels[0].toColor);
});

test('サンプル: 梱包中のパックのダミーが、どの倉庫（本社を含む）でも見える。発送済みのパックには、配送業者・追跡番号がある', async () => {
  const { DEFAULT_MASTER: M } = await import('../src/warehouseMaster.js');
  const T = await import('../src/warehouseTransfer.js');
  const state = W.loadState();
  for (const w of M.warehouses) assert.ok(T.drafts(state, w.id).length >= 1, `${w.name}: 梱包中のパックがない`);
  assert.ok(T.drafts(state, M.warehouses[0].id).some((p) => p.codes.length >= 2 && p.carrier && p.size)); // 設定の済んだパック
  assert.ok(state.transfers.some((p) => p.status === 'draft' && p.listPrintedAt && p.labelPrintedAt)); // 明細・伝票を出力済みのパック
  assert.ok(state.transfers.some((p) => p.status === 'draft' && !p.listPrintedAt && !p.carrier)); // これから設定するパック
  const sent = state.transfers.filter((t) => t.status === 'transit' || t.status === 'received');
  assert.ok(sent.filter((t) => t.carrier).length >= 4 && sent.some((t) => t.tracking));
  assert.deepEqual([...new Set(sent.map((t) => t.carrier).filter(Boolean))].sort(), ['jp', 'sagawa', 'yamato']); // 3社とも見える
  const rows = W.buildRows(state, NOW);
  assert.ok(rows.filter((r) => r.stage === 'packing').length >= 5);
});
