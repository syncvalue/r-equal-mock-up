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
  assert.ok(m.staff.every((s) => m.warehouses.some((w) => w.id === s.warehouseId))); // 倉庫担当は、いずれかの倉庫に所属
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

test('倉庫担当は、マスタ管理の社員（倉庫担当）から読み込む。倉庫マスタには保存しない（登録・所属変更・有効/無効は社員管理）', async () => {
  const U = await import('../src/employees.js');
  assert.deepEqual(M.loadMaster().staff, U.warehouseStaffOf(U.DEFAULT_EMPLOYEES));
  const added = U.saveEmployee(U.loadEmployees(), { loginId: 'wh09', name: '新人 太郎', role: 'warehouse', departmentId: 'D-LOGISTICS', warehouseId: 'W-KANTO' }, { warehouseIds: ['W-KANTO'], departmentIds: ['D-LOGISTICS'] });
  U.saveEmployees(added.employees);
  assert.equal(M.loadMaster().staff.at(-1).loginId, 'wh09'); // 登録すると、倉庫マスタの倉庫担当にも出る
  M.saveMaster(M.loadMaster());
  assert.equal('staff' in JSON.parse(mem.get('rq-mock-warehouse-master')), false);
  mem.delete('rq-mock-employees');
  mem.delete('rq-mock-warehouse-master');
});

test('無効化: 在庫を持つ倉庫・有効な倉庫担当がいる倉庫は無効にできない。無効にした倉庫担当はログインできない', () => {
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
  const disabled = { ...m, staff: m.staff.map((x) => (x.id === st.id ? { ...x, active: false } : x)) };
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

test('本社: 高額品の保管先として、倉庫マスタの1つ（本社も、倉庫と同じ保管場所の1つ）。倉庫担当もいる', () => {
  assert.ok(hon && hon.active && hon.officeId === '');
  assert.equal(M.honshaOf(HM).id, hon.id);
  assert.equal(HM.warehouses.filter((w) => w.highValue).length, 1);
  assert.ok(HM.staff.some((s) => s.warehouseId === hon.id));
  assert.equal(M.honshaOf({ ...HM, warehouses: HM.warehouses.map((w) => ({ ...w, highValue: false })) }), null);
});

test('高額品: シールの色が、紫・赤の商品（本社管理）。黄・緑・青（その他）は高額品ではない。マスタの設定で決まる', () => {
  assert.deepEqual(HM.highValue, { colors: ['purple', 'red'] });
  assert.equal(M.isHighValue({ sealColor: 'purple' }, HM), true);
  assert.equal(M.isHighValue({ sealColor: 'red' }, HM), true);
  assert.equal(M.isHighValue({ sealColor: 'other' }, HM), false);
  for (const c of ['yellow', 'green', 'blue']) assert.equal(M.isHighValue({ sealColor: c }, HM), false, c);
  assert.equal(M.isHighValue({ sealColor: null }, HM), false); // 色のない古い商品は、高額品として扱わない
  assert.equal(M.isHighValue({ sealColor: 'other' }, { ...HM, highValue: { colors: ['other'] } }), true);
});

test('納入先の規則: 高額品は本社だけ、高額品以外は本社以外の倉庫だけ', () => {
  const w = HM.warehouses.find((x) => !x.highValue);
  const high = { sealColor: 'purple' };
  const normal = { sealColor: 'other' };
  assert.equal(M.destinationProblem(HM, high, hon.id), '');
  assert.equal(M.destinationProblem(HM, high, w.id), 'highToHonsha');
  assert.equal(M.destinationProblem(HM, normal, w.id), '');
  assert.equal(M.destinationProblem(HM, normal, hon.id), 'normalToWarehouse');
  assert.equal(M.destinationProblem({ ...HM, warehouses: HM.warehouses.filter((x) => !x.highValue) }, high, w.id), ''); // 本社が登録されていなければ、制限しない
});

test('入庫: 色にかかわらず、営業所と一体の倉庫に入る（高額品も、いったん倉庫に入り、倉庫間移動で本社へ移す）。本社には、入庫ではなく移動でだけ入る', () => {
  const w = HM.warehouses.find((x) => x.officeId === 'osaka');
  assert.equal(M.receiveTarget(HM, 'osaka', {}).warehouse.id, w.id);
  assert.ok(!M.receiveTarget(HM, 'nowhere', {}).warehouse.highValue); // 営業所に倉庫がなくても、本社にはならない
  assert.equal(M.receiveTargetFor, undefined); // 色で納入先を変える仕組みはない
  assert.equal(M.receiveProblem(HM, w.id), '');
  assert.equal(M.receiveProblem(HM, hon.id), 'toHonsha'); // 本社への入庫は不可（移動で入る）
  assert.equal(M.receiveProblem({ ...HM, warehouses: HM.warehouses.filter((x) => !x.highValue) }, w.id), '');
});

test('本社の登録: 本社（高額品の保管先）は1つだけ。高額品の判定の設定は保存できる', () => {
  const dup = M.saveWarehouse(HM, { name: '第二本社', locations: 'A', highValue: true });
  assert.equal(dup.reason, 'dupHonsha');
  const ok = M.saveWarehouse(HM, { id: hon.id, name: hon.name, address: hon.address, officeId: '', locations: hon.locations, highValue: true });
  assert.equal(ok.ok, true);
  const rule = M.saveHighValueRule(HM, { colors: ['purple'] });
  assert.deepEqual(rule.master.highValue, { colors: ['purple'] });
  assert.equal(M.saveHighValueRule(HM, { colors: [] }).reason, 'noRule');
  assert.equal(M.saveHighValueRule(HM, { colors: ['purple', 'pink'] }).reason, 'badColor');
  mem.set('rq-mock-warehouse-master', JSON.stringify({ warehouses: HM.warehouses, staff: HM.staff })); 
  assert.deepEqual(M.loadMaster().highValue, HM.highValue);
});

test('古い保存データ: 高額品の設定がない、または古い形式（カテゴリ・金額）なら、シールの色の初期設定を補う', () => {
  mem.set('rq-mock-warehouse-master', JSON.stringify({ warehouses: HM.warehouses, staff: HM.staff, highValue: { categories: ['x'], minPrice: 1 } }));
  assert.deepEqual(M.loadMaster().highValue, { colors: ['purple', 'red'] });
});

test('送り状に必要な情報: 倉庫（本社を含む）に、郵便番号・住所・電話番号がある。登録・更新できる。郵便番号は形式を確かめる', () => {
  for (const w of HM.warehouses) {
    assert.match(w.zip, /^\d{3}-\d{4}$/, w.name);
    assert.ok(w.address && w.phone, w.name);
  }
  const ok = M.saveWarehouse(HM, { name: '札幌倉庫', address: '北海道札幌市中央区1-1', zip: '060-0001', phone: '011-000-0000', locations: 'A棚' });
  assert.equal(ok.ok, true);
  const w = ok.master.warehouses.at(-1);
  assert.deepEqual({ zip: w.zip, phone: w.phone }, { zip: '060-0001', phone: '011-000-0000' });
  assert.equal(M.saveWarehouse(HM, { name: 'x', zip: '1234567', locations: 'A' }).master.warehouses.at(-1).zip, '123-4567'); // ハイフンなしは、整える
  assert.equal(M.saveWarehouse(HM, { name: 'x', zip: '12-34', locations: 'A' }).reason, 'badZip');
  assert.equal(M.saveWarehouse(HM, { name: 'y', locations: 'A' }).ok, true); // 郵便番号は、空でもよい（伝票の出力のときに確認する）
  const upd = M.saveWarehouse(HM, { id: HM.warehouses[0].id, name: HM.warehouses[0].name, address: HM.warehouses[0].address, officeId: HM.warehouses[0].officeId, locations: HM.warehouses[0].locations });
  assert.equal(upd.master.warehouses[0].zip, HM.warehouses[0].zip); // 更新で指定しなければ、いまの値を保つ
});

test('委託先（業者）のマスタ: 名前・郵便番号・住所・電話番号を持つ。登録・更新・有効無効。名前の重複、郵便番号の形式は確かめる', () => {
  assert.ok(HM.vendors.length >= 2 && HM.vendors.every((v) => v.name && /^\d{3}-\d{4}$/.test(v.zip) && v.address && v.phone && v.active));
  assert.equal(M.vendorById(HM, HM.vendors[0].id).name, HM.vendors[0].name);
  assert.equal(M.activeVendors(HM).length, HM.vendors.length);
  const ok = M.saveVendor(HM, { name: '名古屋時計市場', zip: '4600008', address: '愛知県名古屋市中区栄1-1-1', phone: '052-000-0000' });
  assert.equal(ok.ok, true);
  const v = ok.master.vendors.at(-1);
  assert.deepEqual({ name: v.name, zip: v.zip, active: v.active }, { name: '名古屋時計市場', zip: '460-0008', active: true });
  assert.equal(M.saveVendor(HM, { name: ' ' }).reason, 'noName');
  assert.equal(M.saveVendor(HM, { name: HM.vendors[0].name }).reason, 'dupName');
  assert.equal(M.saveVendor(HM, { name: 'x', zip: '12' }).reason, 'badZip');
  const upd = M.saveVendor(HM, { id: HM.vendors[0].id, name: HM.vendors[0].name, address: '新住所' });
  assert.equal(upd.master.vendors[0].address, '新住所'); assert.equal(upd.master.vendors[0].zip, HM.vendors[0].zip); // 指定しなければ、いまの値を保つ
  assert.equal(M.saveVendor(HM, { id: 'nope', name: 'q' }).reason, 'notFound');
  const off = M.setVendorActive(HM, HM.vendors[0].id, false);
  assert.equal(off.ok, true);
  assert.equal(M.activeVendors(off.master).length, HM.vendors.length - 1);
  assert.equal(M.setVendorActive(HM, 'nope', false).reason, 'notFound');
});

test('古い保存データ: 委託先がなければ、初期の委託先を補う', () => {
  mem.set('rq-mock-warehouse-master', JSON.stringify({ warehouses: HM.warehouses, staff: HM.staff, highValue: HM.highValue }));
  assert.equal(M.loadMaster().vendors.length, HM.vendors.length);
});

test('営業所との関係: 営業所マスタで登録した営業所も指定できる（指定しなければ、初期の営業所）。名前は営業所マスタから引く', async () => {
  const m = M.DEFAULT_MASTER;
  assert.equal(M.saveWarehouse(m, { name: '名古屋倉庫', officeId: 'O-NEW', locations: 'A' }).reason, 'badOffice');
  assert.equal(M.saveWarehouse(m, { name: '名古屋倉庫', officeId: 'O-NEW', locations: 'A' }, { officeIds: ['O-NEW'] }).ok, true);
  const { saveOffice, saveOffices, DEFAULT_OFFICES } = await import('../src/offices.js');
  const added = saveOffice(DEFAULT_OFFICES, { id: undefined, name: '福岡', prefs: '福岡県' }).offices;
  saveOffices(added);
  assert.equal(M.officeName(added.at(-1).id), '福岡');
  mem.delete('rq-mock-offices');
  assert.equal(M.officeName('osaka'), '大阪');
});
