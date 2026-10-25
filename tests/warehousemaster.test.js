import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const M = await import('../src/warehouseMaster.js');
const { AREAS } = await import('../src/dispatch.js');

test('初期のマスタ: 倉庫は営業所とは独立。営業所と一体の倉庫・倉庫のみ・倉庫のない営業所がある', () => {
  const m = M.loadMaster();
  assert.ok(m.warehouses.length >= 3);
  assert.ok(m.warehouses.some((w) => w.officeId)); // 営業所と一体
  assert.ok(m.warehouses.some((w) => !w.officeId)); // 倉庫のみ
  const withOffice = new Set(m.warehouses.map((w) => w.officeId).filter(Boolean));
  assert.ok(AREAS.some((a) => !withOffice.has(a.id))); // 営業のみ（倉庫のない営業所）
  assert.ok([...withOffice].every((id) => AREAS.some((a) => a.id === id))); // 併設先は、実在する営業所
  assert.ok(m.warehouses.every((w) => w.locations.length >= 1 && w.active));
  assert.ok(m.staff.every((s) => m.warehouses.some((w) => w.id === s.warehouseId))); // 担当者は、いずれかの倉庫に所属
  assert.ok(new Set(m.staff.map((s) => s.warehouseId)).size >= 2);
});

test('保存と読み込み: 保存したマスタを読み戻せる。壊れたデータは初期値に戻す', () => {
  const m = M.loadMaster();
  assert.equal(M.saveMaster({ ...m, warehouses: m.warehouses.slice(0, 2) }), true);
  assert.equal(M.loadMaster().warehouses.length, 2);
  mem.set('rq-mock-warehouse-master', '{broken');
  assert.equal(M.loadMaster().warehouses.length, M.DEFAULT_MASTER.warehouses.length);
  mem.set('rq-mock-warehouse-master', '{"warehouses":"x"}');
  assert.equal(M.loadMaster().staff.length, M.DEFAULT_MASTER.staff.length);
});

test('倉庫の登録: 名前・保管場所が必須。名前は重複不可。保管場所は改行・カンマ区切りの文字列でも渡せる', () => {
  const m = M.DEFAULT_MASTER;
  const ok = M.saveWarehouse(m, { name: '札幌倉庫', address: '北海道札幌市', officeId: '', locations: 'A棚, B棚\n金庫室' });
  assert.equal(ok.ok, true);
  const w = ok.master.warehouses.at(-1);
  assert.deepEqual({ name: w.name, officeId: w.officeId, locations: w.locations, active: w.active }, { name: '札幌倉庫', officeId: '', locations: ['A棚', 'B棚', '金庫室'], active: true });
  assert.ok(w.id && !m.warehouses.some((x) => x.id === w.id));
  assert.equal(m.warehouses.length + 1, ok.master.warehouses.length); // 元は変わらない
  assert.equal(M.saveWarehouse(m, { name: ' ', locations: 'A' }).reason, 'noName');
  assert.equal(M.saveWarehouse(m, { name: '札幌倉庫', locations: '' }).reason, 'noLocations');
  assert.equal(M.saveWarehouse(ok.master, { name: '札幌倉庫', locations: 'A' }).reason, 'dupName');
  assert.equal(M.saveWarehouse(m, { name: 'x', locations: 'A', officeId: 'nowhere' }).reason, 'badOffice');
});

test('倉庫の更新: idを指定すると、その倉庫を直す（自分自身との名前の重複は問題にしない）', () => {
  const m = M.DEFAULT_MASTER;
  const id = m.warehouses[0].id;
  const r = M.saveWarehouse(m, { id, name: m.warehouses[0].name, address: '新住所', officeId: m.warehouses[0].officeId, locations: 'X棚' });
  assert.equal(r.ok, true);
  assert.equal(r.master.warehouses[0].address, '新住所');
  assert.deepEqual(r.master.warehouses[0].locations, ['X棚']);
  assert.equal(M.saveWarehouse(m, { id, name: m.warehouses[1].name, locations: 'X' }).reason, 'dupName');
  assert.equal(M.saveWarehouse(m, { id: 'nope', name: 'q', locations: 'X' }).reason, 'notFound');
});

test('担当者の登録: 名前・ログインID・所属倉庫が必要。IDは重複不可。所属の変更もできる', () => {
  const m = M.DEFAULT_MASTER;
  const wid = m.warehouses[1].id;
  const ok = M.saveStaff(m, { loginId: 'WH09', name: '新人 太郎', warehouseId: wid });
  assert.equal(ok.ok, true);
  const s = ok.master.staff.at(-1);
  assert.deepEqual({ loginId: s.loginId, warehouseId: s.warehouseId, active: s.active }, { loginId: 'wh09', warehouseId: wid, active: true }); // IDは小文字にそろえる
  assert.equal(M.saveStaff(ok.master, { loginId: 'wh09', name: 'x', warehouseId: wid }).reason, 'dupLoginId');
  assert.equal(M.saveStaff(m, { loginId: 'wh10', name: '', warehouseId: wid }).reason, 'noName');
  assert.equal(M.saveStaff(m, { loginId: 'a b', name: 'x', warehouseId: wid }).reason, 'badLoginId');
  assert.equal(M.saveStaff(m, { loginId: 'wh10', name: 'x', warehouseId: 'nope' }).reason, 'noWarehouse');
  const moved = M.saveStaff(ok.master, { id: s.id, loginId: 'wh09', name: s.name, warehouseId: m.warehouses[0].id, active: true });
  assert.equal(moved.master.staff.at(-1).warehouseId, m.warehouses[0].id);
});

test('無効化: 在庫を持つ倉庫・有効な担当者がいる倉庫は無効にできない。無効にした担当者はログインできない', () => {
  const m = M.DEFAULT_MASTER;
  const wid = m.warehouses[0].id;
  assert.equal(M.setWarehouseActive(m, wid, false, { holding: 3 }).reason, 'inUse');
  assert.equal(M.setWarehouseActive(m, wid, false, { holding: 0 }).reason, 'hasStaff');
  const empty = M.saveWarehouse(m, { name: '空の倉庫', locations: 'A' }).master;
  const eid = empty.warehouses.at(-1).id;
  const off = M.setWarehouseActive(empty, eid, false, { holding: 0 });
  assert.equal(off.ok, true);
  assert.equal(M.activeWarehouses(off.master).some((w) => w.id === eid), false);
  assert.equal(M.setWarehouseActive(off.master, eid, true, {}).ok, true);
  const st = m.staff[0];
  const disabled = M.saveStaff(m, { ...st, active: false }).master;
  assert.equal(M.findStaff(disabled, st.loginId), null);
  assert.equal(M.findStaff(m, ` ${st.loginId.toUpperCase()} `).id, st.id);
});

test('倉庫の引き当て: 営業所に併設の倉庫を優先し、なければ先頭の有効な倉庫。古い商品（倉庫の記録なし）は先頭の倉庫として扱う', () => {
  const m = M.DEFAULT_MASTER;
  const withOffice = m.warehouses.find((w) => w.officeId);
  assert.equal(M.defaultWarehouseFor(m, withOffice.officeId).id, withOffice.id);
  const noWh = AREAS.find((a) => !m.warehouses.some((w) => w.officeId === a.id));
  assert.equal(M.defaultWarehouseFor(m, noWh.id).id, m.warehouses[0].id);
  assert.equal(M.warehouseIdOf({ warehouseId: 'X' }, m), 'X');
  assert.equal(M.warehouseIdOf({}, m), m.warehouses[0].id);
});

test('営業の納入先: 選んだ倉庫・保管場所を使う。未選択、または無効・存在しない倉庫なら、営業所に併設の倉庫（なければ先頭）。保管場所は、その倉庫の棚から選ぶ', () => {
  const m = M.DEFAULT_MASTER;
  const [osaka, kanto] = m.warehouses;
  const noWh = AREAS.find((a) => !m.warehouses.some((w) => w.officeId === a.id)).id;
  const t1 = M.receiveTarget(m, 'kanto', {});
  assert.equal(t1.warehouse.id, kanto.id); assert.equal(t1.location, kanto.locations[0]);
  assert.equal(M.receiveTarget(m, noWh, {}).warehouse.id, osaka.id);
  const t2 = M.receiveTarget(m, 'kanto', { warehouseId: osaka.id, location: osaka.locations[2] });
  assert.equal(t2.warehouse.id, osaka.id); assert.equal(t2.location, osaka.locations[2]);
  assert.equal(M.receiveTarget(m, 'kanto', { warehouseId: kanto.id, location: osaka.locations[2] }).location, kanto.locations[0]); // 別の倉庫の棚は使えない
  assert.equal(M.receiveTarget(m, 'kanto', { warehouseId: 'gone' }).warehouse.id, kanto.id);
});

const HM = M.DEFAULT_MASTER;
const hon = HM.warehouses.find((w) => w.highValue);

test('本社: 高額品の保管先として、倉庫マスタの1つ（本社も、倉庫と同じ保管場所の1つ）。担当者もいる', () => {
  assert.ok(hon && hon.active && hon.officeId === '');
  assert.equal(M.honshaOf(HM).id, hon.id);
  assert.equal(HM.warehouses.filter((w) => w.highValue).length, 1);
  assert.ok(HM.staff.some((s) => s.warehouseId === hon.id));
  assert.equal(M.honshaOf({ ...HM, warehouses: HM.warehouses.map((w) => ({ ...w, highValue: false })) }), null);
});

test('高額品: 貴金属などのカテゴリ、または一定額以上の商品。マスタの設定で決まる', () => {
  assert.equal(M.isHighValue({ category: 'ジュエリー・貴金属', price: 1000 }, HM), true);
  assert.equal(M.isHighValue({ category: 'ブランドバッグ', price: HM.highValue.minPrice }, HM), true);
  assert.equal(M.isHighValue({ category: 'ブランドバッグ', price: HM.highValue.minPrice - 1 }, HM), false);
  assert.equal(M.isHighValue({ category: '腕時計', price: 100 }, { ...HM, highValue: { categories: ['腕時計'], minPrice: 0 } }), true);
  assert.equal(M.isHighValue({ category: 'x', price: 99999999 }, { ...HM, highValue: { categories: [], minPrice: 0 } }), false); // 金額の設定が0なら、金額では判定しない
});

test('納入先の規則: 高額品は本社だけ、高額品以外は本社以外の倉庫だけ', () => {
  const w = HM.warehouses.find((x) => !x.highValue);
  const high = { category: 'ジュエリー・貴金属', price: 1 };
  const normal = { category: 'ブランドバッグ', price: 1 };
  assert.equal(M.destinationProblem(HM, high, hon.id), '');
  assert.equal(M.destinationProblem(HM, high, w.id), 'highToHonsha');
  assert.equal(M.destinationProblem(HM, normal, w.id), '');
  assert.equal(M.destinationProblem(HM, normal, hon.id), 'normalToWarehouse');
  assert.equal(M.destinationProblem({ ...HM, warehouses: HM.warehouses.filter((x) => !x.highValue) }, high, w.id), ''); // 本社が登録されていなければ、制限しない
});

test('営業の納入先（商品ごと）: 高額品は本社に自動で、それ以外は選んだ倉庫（本社は選べない）', () => {
  const w = HM.warehouses.find((x) => x.officeId === 'osaka');
  const high = { category: 'ジュエリー・貴金属', price: 1 };
  const normal = { category: 'ブランドバッグ', price: 1 };
  const th = M.receiveTargetFor(HM, high, 'osaka', { warehouseId: w.id, location: w.locations[1] });
  assert.equal(th.warehouse.id, hon.id); assert.equal(th.location, hon.locations[0]);
  const tn = M.receiveTargetFor(HM, normal, 'osaka', { warehouseId: w.id, location: w.locations[1] });
  assert.equal(tn.warehouse.id, w.id); assert.equal(tn.location, w.locations[1]);
  assert.equal(M.receiveTargetFor(HM, normal, 'osaka', { warehouseId: hon.id }).warehouse.id, w.id); // 本社は、通常の納入先に選べない
  assert.ok(!M.receiveTarget(HM, 'nowhere', {}).warehouse.highValue); // 営業所に倉庫がなくても、本社にはならない
});

test('本社の登録: 本社（高額品の保管先）は1つだけ。高額品の判定の設定は保存できる', () => {
  const dup = M.saveWarehouse(HM, { name: '第二本社', locations: 'A', highValue: true });
  assert.equal(dup.reason, 'dupHonsha');
  const ok = M.saveWarehouse(HM, { id: hon.id, name: hon.name, address: hon.address, officeId: '', locations: hon.locations, highValue: true });
  assert.equal(ok.ok, true);
  const rule = M.saveHighValueRule(HM, { categories: 'ジュエリー・貴金属, 腕時計', minPrice: '500,000' });
  assert.deepEqual(rule.master.highValue, { categories: ['ジュエリー・貴金属', '腕時計'], minPrice: 500000 });
  assert.equal(M.saveHighValueRule(HM, { categories: '', minPrice: 0 }).reason, 'noRule');
  assert.equal(M.saveHighValueRule(HM, { categories: 'x', minPrice: -1 }).reason, 'badPrice');
  mem.set('rq-mock-warehouse-master', JSON.stringify({ warehouses: HM.warehouses, staff: HM.staff })); // 古い保存データ（設定なし）は、初期の設定を補う
  assert.deepEqual(M.loadMaster().highValue, HM.highValue);
});
