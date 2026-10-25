import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.sessionStorage = { getItem: (k) => mem.get(`s:${k}`) ?? null, setItem: (k, v) => mem.set(`s:${k}`, String(v)), removeItem: (k) => mem.delete(`s:${k}`) };

const V = await import('../src/storeVisits.js');
const D = await import('../src/storeDraft.js');
const P = await import('../src/storePurchase.js');
const W = await import('../src/warehouse.js');
const S = await import('../src/stock.js');
const H = await import('../src/customerHistory.js');
const St = await import('../src/store.js');
const { DEFAULT_STORES } = await import('../src/stores.js');

const NOW = Date.now();
const store = DEFAULT_STORES[0];
const staff = { id: 'st01', name: '田中 美咲' };
const phone = '090-7777-0001';

test('来店から買取の完了まで: 契約・入庫待ち・履歴・倉庫の出品・クーリングオフ検索に、店頭買取として反映される', () => {
  // 来店予約 → 来店 → 対応開始
  const opts = { storeIds: [store.id], now: NOW };
  let list = V.reserveVisit([], { storeId: store.id, date: new Date(NOW).toISOString().slice(0, 10), time: '23:00', name: '新規 太郎', kana: 'シンキ タロウ', phone, wants: '腕時計', by: '佐藤' }, opts).list;
  const visit0 = list[0];
  list = V.arrive(list, visit0.id, opts).list;
  list = V.startServing(list, visit0.id, staff, opts).list;
  const visit = list[0];
  assert.equal(visit.status, 'serving');

  // 作業: お客様確認 → 説明 → 明細 → シール → 契約 → 確認
  let d = D.blankDraft(visit);
  d = { ...d, customerOk: true, customer: { ...d.customer, address: '大阪市北区', birth: '1980-01-01' } };
  d = D.goStep(d, 1);
  d = { ...d, explain: Object.fromEntries(P.EXPLAIN_ITEMS.map((x) => [x.key, true])), propose: 'yes' };
  d = D.goStep(d, 2);
  d = D.updateItem(D.addProduct(d, { id: 'w1', name: 'オメガ シーマスター', category: '腕時計' }), 'w1', { price: 150000 });
  d = D.updateItem(D.addProduct(d, { id: 'w2', name: 'セイコー', category: '腕時計' }), 'w2', { price: 20000, sell: false });
  assert.equal(D.canProceed(d), true);
  d = D.goStep(d, 3);
  d = D.setColor(D.assignLabel(d, 'w1-1', 'RQ-FLOW0001', { taken: [] }).draft, 'w1-1', 'other');
  assert.equal(D.canProceed(d), true);
  d = D.goStep(d, 4);
  const args = { visit, store, staff, customer: d.customer, items: d.items, labels: d.labels, colors: d.colors, now: NOW, contractId: 'GS-FLOW-1', isRepeat: false };
  const c = P.buildContract(args);
  St.upsertContract(c.contract);
  d = { ...d, contractId: 'GS-FLOW-1', checks: Object.fromEntries(P.LEAVE_CHECKS.map((x) => [x.key, true])) };
  assert.equal(D.canProceed(d), true);

  // 完了
  const done = P.buildPurchase({ ...args, checks: d.checks });
  assert.equal(done.ok, true);
  S.saveUnits(S.addUnits(S.loadUnits(), done.units));
  list = V.completeVisit(list, visit.id, done.result, { now: NOW }).list;
  assert.deepEqual(V.summaryOf(list, store.id, V.boardOf(list, store.id, visit.date).done[0].date), { visits: 1, done: 1, purchased: 1, rate: 1, total: 150000 });

  // 入庫待ち: 店頭買取の印と、店舗・店舗スタッフが残る。見送り品（セイコー）は入庫しない
  const units = S.loadUnits();
  assert.deepEqual(units.map((u) => [u.code, u.channel, u.storeId, u.userId, u.status]), [['RQ-FLOW0001', 'store', store.id, 'st01', 'pending']]);

  // 倉庫: 入庫すれば、買取の当日から出品できる（保管期間なし）。クーリングオフの検索では対象外
  const { list: stored } = S.receive(units, null, 'RQ-FLOW0001', { location: 'A棚（バッグ・小物）', by: '小川', warehouseId: store.warehouseId, method: 'manual' });
  const state = { units: stored, records: {}, returns: [], transfers: [] };
  assert.equal(W.buildRows(state, NOW)[0].canList, true);
  const found = W.cooloffContracts(state, '新規', NOW);
  assert.equal(found[0].store, true);
  assert.equal(found[0].rows[0].check.kind, 'store');

  // お客様の履歴: 契約が電話番号で結びつき、次回はリピーター。見送り品も、次回の確認で出る
  assert.equal(H.historyOf({ phone }).isRepeat, true);
  assert.equal(H.historyOf({ phone }).ordinal, 2);
});

test('データ初期化: 来店の記録と作業中の内容、店舗スタッフのログイン状態も消える（店舗マスタは残る）', () => {
  mem.set(St.STORE_VISITS_KEY, '[1]');
  mem.set(St.STORE_DRAFT_KEY, '{}');
  mem.set('rq-mock-stores', '[{"id":"S-X","name":"x"}]');
  St.clearTransactions();
  assert.equal(mem.has(St.STORE_VISITS_KEY), false);
  assert.equal(mem.has(St.STORE_DRAFT_KEY), false);
  assert.equal(mem.has('rq-mock-stores'), true);
});
