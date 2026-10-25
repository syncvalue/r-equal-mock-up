import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { masterHtml, MASTERS, REASON_TEXT } = await import('../master/view.js');
const { DEFAULT_EMPLOYEES } = await import('../src/employees.js');
const { DEFAULT_OFFICES } = await import('../src/offices.js');
const { DEFAULT_DEPARTMENTS } = await import('../src/departments.js');
const { DEFAULT_MASTER } = await import('../src/warehouseMaster.js');
const { blankForm } = await import('../master/employeesPanel.js');
const { blankOffice, formFromOffice } = await import('../master/officesPanel.js');
const { blankStore, formFromStore } = await import('../master/storesPanel.js');
const { DEFAULT_STORES } = await import('../src/stores.js');

const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const blankWh = { id: '', name: '', zip: '', address: '', phone: '', officeId: '', locations: '', highValue: false };
const blankVd = { id: '', name: '', zip: '', address: '', phone: '' };
const ctx = (tab, over = {}) => ({
  tab, employees: DEFAULT_EMPLOYEES, departments: DEFAULT_DEPARTMENTS, offices: DEFAULT_OFFICES, wmaster: DEFAULT_MASTER, holding: { 'W-OSAKA': { count: 3, cost: 120000 } },
  ui: { employees: { role: '', q: '', status: '', departmentId: '', form: null }, departments: { md: { id: '', name: '' } }, offices: { mo: blankOffice() }, trips: { mt: { id: '', name: '', prefs: '', start: '', end: '', memberIds: [] } }, stores: { ms: blankStore() }, warehouses: { mw: blankWh, hv: null }, vendors: { mv: blankVd } }, stores: DEFAULT_STORES, storeStaffCount: { 'S-NAMBA': 2, 'S-SHINJUKU': 1 }, ...over,
});

test('マスタの切り替え: 左側の開閉式メニュー。初めは閉じていて、☰で開く。社員・部署・営業所・出張・店舗・倉庫・委託先の7つで、選んだものが強調される', () => {
  assert.deepEqual(MASTERS.map((m) => m.key), ['employees', 'departments', 'offices', 'trips', 'stores', 'warehouses', 'vendors']);
  const closed = masterHtml(ctx('offices'));
  assert.ok(closed.includes('data-menu-open') && !closed.includes('data-master=') && !closed.includes('メインメニュー'));
  assert.ok(/マスタ管理 › 営業所|マスタ管理\s*<\/span><span[^>]*>›<\/span><span[^>]*>営業所/.test(closed)); // いま開いているマスタが、見出しに出る
  const html = masterHtml(ctx('offices', { menuOpen: true }));
  assert.equal((html.match(/data-master="/g) || []).length, 7);
  assert.match(html, /bg-teal-700[^"]*"[^>]*data-master="offices"/);
  assert.ok(html.includes('メインメニュー') && html.includes('data-menu-close'));
});

test('社員: 社員の一覧と、新規登録ボタンが出る', () => {
  const t = text(masterHtml(ctx('employees')));
  assert.ok(t.includes('鈴木 一郎') && t.includes('小川 直樹') && t.includes('新規登録'));
});

test('営業所: 一覧に、担当の都道府県と、併設の倉庫が出る。編集・有効/無効のボタンと、登録フォームがある', () => {
  const html = masterHtml(ctx('offices'));
  const t = text(html);
  assert.ok(/大阪営業所 大阪府・奈良県・和歌山県 大阪倉庫/.test(t), t);
  assert.ok(/東海営業所.*なし（営業のみ）/.test(t));
  assert.ok(html.includes('data-mo-edit="osaka"') && html.includes('data-mo-toggle="osaka"') && html.includes('data-mo-save') && html.includes('data-f="mo.name"'));
  assert.ok(t.includes('営業所の新規登録'));
  const edit = masterHtml(ctx('offices', { ui: { ...ctx('offices').ui, offices: { mo: formFromOffice(DEFAULT_OFFICES[0]) } } }));
  assert.ok(text(edit).includes('営業所の編集') && edit.includes('data-mo-cancel') && edit.includes('大阪府、奈良県、和歌山県'));
});

test('倉庫: 一覧（保管中・倉庫担当・営業所との関係）、登録フォーム、高額品の判定が出る。営業所の選択肢は営業所マスタから', () => {
  const html = masterHtml(ctx('warehouses'));
  const t = text(html);
  assert.ok(/大阪倉庫.*大阪営業所と一体.*小川 直樹、中島 里奈.*3点/.test(t), t);
  assert.ok(t.includes('福岡倉庫') && t.includes('倉庫のみ') && t.includes('高額品の保管先'));
  for (const a of ['data-mw-edit="W-OSAKA"', 'data-mw-toggle="W-OSAKA"', 'data-mw-save', 'data-f="mw.name"', 'data-hv-save']) assert.ok(html.includes(a), a);
  assert.equal((html.match(/data-hv-color=/g) || []).length, 3); // 紫・赤・その他（黄・緑・青）
  const select = html.match(/data-f="mw.officeId"[\s\S]*?<\/select>/)[0];
  assert.ok(select.includes('大阪営業所と一体') && select.includes('東海営業所と一体'));
  const off = DEFAULT_OFFICES.map((o) => (o.id === 'tokai' ? { ...o, active: false } : o));
  assert.ok(!masterHtml(ctx('warehouses', { offices: off })).match(/data-f="mw.officeId"[\s\S]*?<\/select>/)[0].includes('東海'));
});

test('委託先: 一覧と登録フォームが出る', () => {
  const html = masterHtml(ctx('vendors'));
  assert.ok(text(html).includes('大阪時計オークション') && text(html).includes('委託先（業者）'));
  for (const a of ['data-mv-edit="V-OSAKA-WATCH"', 'data-mv-toggle="V-OSAKA-WATCH"', 'data-mv-save', 'data-f="mv.name"']) assert.ok(html.includes(a), a);
});

test('エラーの文言: 営業所・倉庫・委託先のエラー理由にも、利用者向けの文言がある', async () => {
  const { saveOffice, setOfficeActive } = await import('../src/offices.js');
  const W = await import('../src/warehouseMaster.js');
  const m = DEFAULT_MASTER;
  const reasons = [
    saveOffice(DEFAULT_OFFICES, { name: '', prefs: '' }), saveOffice(DEFAULT_OFFICES, { name: '大阪', prefs: '' }), saveOffice(DEFAULT_OFFICES, { name: 'x', prefs: 'zz' }), saveOffice(DEFAULT_OFFICES, { id: 'q', name: 'x' }),
    setOfficeActive(DEFAULT_OFFICES.map((o) => ({ ...o, active: o.id === 'osaka' })), 'osaka', false),
    W.saveWarehouse(m, { name: '', locations: 'A' }), W.saveWarehouse(m, { name: 'x', locations: '' }), W.saveWarehouse(m, { name: 'x', locations: 'A', officeId: 'zz' }), W.saveWarehouse(m, { name: 'x', locations: 'A', zip: '1' }),
    W.saveWarehouse(m, { name: '大阪倉庫', locations: 'A' }), W.saveWarehouse(m, { name: 'x', locations: 'A', highValue: true }), W.saveVendor(m, { name: '' }), W.saveHighValueRule(m, { colors: [] }), W.saveHighValueRule(m, { colors: ['pink'] }),
    W.setWarehouseActive(m, 'W-FUKUOKA', false, { holding: 1 }), W.setWarehouseActive(m, 'W-OSAKA', false, {}), W.setWarehouseActive(m, 'nope', false, {}),
  ];
  for (const r of reasons) { assert.equal(r.ok, false); assert.ok(REASON_TEXT[r.reason], r.reason); }
});

test('部署: 会社（REqual）・部署の一覧・社員の人数・登録フォームが出る。有効な社員がいる部署の人数が数えられる', async () => {
  const { formFromDepartment } = await import('../master/departmentsPanel.js');
  const html = masterHtml(ctx('departments'));
  const t = text(html);
  assert.ok(t.includes('REqual') && /営業部 REqual 16名/.test(t) && /コールセンター REqual 3名/.test(t) && /物流部 REqual 5名/.test(t), t);
  for (const a of ['data-md-edit="D-SALES"', 'data-md-toggle="D-SALES"', 'data-md-save', 'data-f="md.name"']) assert.ok(html.includes(a), a);
  const edit = masterHtml(ctx('departments', { ui: { ...ctx('departments').ui, departments: { md: formFromDepartment(DEFAULT_DEPARTMENTS[0]) } } }));
  assert.ok(text(edit).includes('部署の編集') && edit.includes('data-md-cancel'));
});

test('社員の一覧とフォーム: 部署の列・部署の絞り込み・部署の選択肢（有効な部署と、いまの所属）が出る', () => {
  const html = masterHtml(ctx('employees'));
  assert.ok(/小川 直樹 wh01 物流部 倉庫担当/.test(text(html)));
  assert.ok(html.includes('data-dept') && html.includes('すべての部署'));
  assert.ok(!html.includes('data-f="departmentId"')); // フォームは、開いたときだけ
  const form = { id: '', role: 'warehouse', name: '', loginId: '', departmentId: 'D-LOGISTICS', warehouseId: '', groups: [] };
  const withForm = masterHtml(ctx('employees', { ui: { ...ctx('employees').ui, employees: { ...ctx('employees').ui.employees, form } } }));
  const select = withForm.match(/data-f="departmentId"[\s\S]*?<\/select>/)[0];
  assert.ok(select.includes('営業部') && /selected[^>]*>物流部|value="D-LOGISTICS"\s+selected/.test(select));
  const off = DEFAULT_DEPARTMENTS.map((d) => (d.id === 'D-APPRAISAL' ? { ...d, active: false } : d));
  const sel2 = masterHtml(ctx('employees', { departments: off, ui: { ...ctx('employees').ui, employees: { ...ctx('employees').ui.employees, form } } })).match(/data-f="departmentId"[\s\S]*?<\/select>/)[0];
  assert.ok(!sel2.includes('査定部')); // 無効な部署は選べない
});

test('店舗: 一覧に、住所・営業時間・古物商許可番号・納入先の倉庫・店舗スタッフの人数・状態が出る。登録・編集の欄がある', () => {
  const t = text(masterHtml(ctx('stores')));
  assert.ok(/なんば店/.test(t) && /新宿店/.test(t) && /第000000001号/.test(t) && /大阪倉庫/.test(t) && /関東倉庫/.test(t) && /2名/.test(t) && /有効/.test(t), t);
  const html = masterHtml(ctx('stores'));
  assert.ok(html.includes('data-ms-edit="S-NAMBA"') && html.includes('data-ms-toggle="S-NAMBA"') && html.includes('data-ms-save') && html.includes('data-f="ms.licenseNo"') && html.includes('data-f="ms.warehouseId"'));
  assert.ok(text(html).includes('店舗の新規登録'));
  const edit = text(masterHtml(ctx('stores', { ui: { ...ctx('stores').ui, stores: { ms: formFromStore(DEFAULT_STORES[0]) } } })));
  assert.ok(edit.includes('店舗の編集'));
  assert.ok(!html.includes('本社</option>')); // 納入先に、本社（高額品の保管先）は選べない
});

test('社員の登録: 役割が店舗スタッフのときは、所属店舗を選ぶ。一覧には所属の店舗名が出る', () => {
  const form = { ...blankForm('store') };
  assert.equal(form.departmentId, 'D-STORE');
  const html = masterHtml(ctx('employees', { ui: { ...ctx('employees').ui, employees: { role: '', q: '', status: '', departmentId: '', form } } }));
  assert.ok(html.includes('data-f="storeId"') && text(html).includes('なんば店'));
  assert.match(text(masterHtml(ctx('employees'))), /田中 美咲 st01 店舗部 店舗スタッフ なんば店/);
});
