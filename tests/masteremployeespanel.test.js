import { test } from 'node:test';
import assert from 'node:assert/strict';

const { employeesPanelHtml: usersHtml, listHtml, blankForm, formFromEmployee } = await import('../master/employeesPanel.js');
const { REASON_TEXT } = await import('../master/view.js');
const { DEFAULT_EMPLOYEES, saveEmployee, setEmployeeActive } = await import('../src/employees.js');
const { DEFAULT_DEPARTMENTS } = await import('../src/departments.js');
const { DEFAULT_MASTER } = await import('../src/warehouseMaster.js');

const text = (h) => h.replace(/data-help="([^"]*)"/g, '> $1 <').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const base = { employees: DEFAULT_EMPLOYEES, warehouses: DEFAULT_MASTER.warehouses, departments: DEFAULT_DEPARTMENTS, ui: { role: '', q: '', status: '', departmentId: '', form: null } };

test('一覧: 役割の見出しに人数が出る。すべて・営業・オペレーター・配車係・査定員・経理担当・倉庫担当', () => {
  const t = text(usersHtml(base));
  for (const label of ['すべて', '営業', 'オペレーター', '配車係', '査定員', '経理担当', '倉庫担当']) assert.ok(t.includes(label), label);
  assert.ok(t.includes(`すべて ${DEFAULT_EMPLOYEES.length}`) && t.includes('営業 16'));
});

test('一覧: 営業は参照のみ（編集・無効化のボタンがない）。所属の営業所とグループ、グループリーダーが分かる', () => {
  const html = listHtml({ ...base, ui: { ...base.ui, role: 'sales' } });
  assert.ok(!html.includes('data-edit') && !html.includes('data-toggle'));
  const t = text(html);
  assert.ok(t.includes('鈴木 一郎') && t.includes('sales01') && t.includes('参照のみ'));
  assert.ok(t.includes('グループA') && t.includes('大阪')); // u01
  assert.ok(/田中 健.*グループリーダー/.test(t));
  assert.ok(text(usersHtml({ ...base, ui: { ...base.ui, role: 'sales' } })).includes('まだこの名簿とつながっていない')); // なぜ参照のみかを説明する
});

test('一覧: 倉庫担当は所属倉庫、査定員は担当グループが出る。編集・有効/無効のボタンがある。無効な社員は薄く表示して「無効」', () => {
  const off = setEmployeeActive(DEFAULT_EMPLOYEES, 'wh01', false).employees;
  const html = listHtml({ ...base, employees: off, ui: { ...base.ui, role: '' } });
  const t = text(html);
  assert.ok(/小川 直樹.*大阪倉庫/.test(t) && /青木.*グループA/.test(t));
  assert.ok(html.includes('data-edit="wh01"') && html.includes('data-toggle="wh01"'));
  assert.match(html, /data-toggle="wh01"[^>]*>有効にする/);
  assert.match(html, /data-toggle="wh02"[^>]*>無効にする/);
  assert.ok(t.includes('無効'));
});

test('一覧: 氏名・ログインIDで検索、状態で絞り込める。該当なしのときは、その旨を出す', () => {
  const q = text(listHtml({ ...base, ui: { ...base.ui, q: 'wh03' } }));
  assert.ok(q.includes('山本 大地') && !q.includes('小川 直樹'));
  const none = text(listHtml({ ...base, ui: { ...base.ui, q: 'zzzz' } }));
  assert.ok(none.includes('該当する社員はいません'));
  const inactive = text(listHtml({ ...base, ui: { ...base.ui, status: 'inactive' } }));
  assert.ok(inactive.includes('該当する社員はいません'));
});

test('フォーム: 新規は、役割に応じた入力欄が出る。営業は選べない。編集では、役割を変えられない', () => {
  const op = usersHtml({ ...base, ui: { ...base.ui, form: blankForm('operator') } });
  assert.ok(op.includes('data-f="name"') && op.includes('data-f="loginId"') && op.includes('data-f="role"'));
  assert.ok(!op.includes('data-f="warehouseId"') && !op.includes('data-group'));
  const roleOptions = op.match(/data-f="role"[\s\S]*?<\/select>/)[0];
  assert.ok(!roleOptions.includes('>営業<') && roleOptions.includes('倉庫担当'));
  const wh = usersHtml({ ...base, ui: { ...base.ui, form: blankForm('warehouse') } });
  assert.ok(wh.includes('data-f="warehouseId"') && wh.includes('大阪倉庫') && wh.includes('本社'));
  const ap = usersHtml({ ...base, ui: { ...base.ui, form: blankForm('appraiser') } });
  assert.equal((ap.match(/data-group=/g) || []).length, 2); // グループA・B
  const edit = usersHtml({ ...base, ui: { ...base.ui, form: formFromEmployee(DEFAULT_EMPLOYEES.find((u) => u.id === 'a1')) } });
  assert.match(edit, /data-f="role"[^>]*disabled/);
  assert.ok(text(edit).includes('更新する') && edit.includes('data-cancel'));
  assert.match(edit, /data-group="A"[^>]*checked/);
});

test('フォームの初期値: 編集は、いまの内容を入れる。無効な倉庫には所属させられない（選択肢に出さない）', () => {
  const f = formFromEmployee(DEFAULT_EMPLOYEES.find((u) => u.id === 'wh02'));
  assert.deepEqual([f.id, f.role, f.name, f.loginId, f.warehouseId], ['wh02', 'warehouse', '中島 里奈', 'wh02', 'W-OSAKA']);
  const warehouses = DEFAULT_MASTER.warehouses.map((w) => (w.id === 'W-KANTO' ? { ...w, active: false } : w));
  const select = (h) => h.match(/data-f="warehouseId"[\s\S]*?<\/select>/)[0];
  const html = select(usersHtml({ ...base, warehouses, ui: { ...base.ui, form: blankForm('warehouse') } }));
  assert.ok(html.includes('大阪倉庫') && !html.includes('関東倉庫'));
  const own = select(usersHtml({ ...base, warehouses, ui: { ...base.ui, form: formFromEmployee(DEFAULT_EMPLOYEES.find((u) => u.id === 'wh03')) } }));
  assert.ok(own.includes('関東倉庫')); // いま所属している倉庫は、無効でも出す
});

test('エラーの文言: 保存・無効化で返る理由すべてに、利用者向けの文言がある', () => {
  const reasons = new Set();
  const warehouseIds = DEFAULT_MASTER.warehouses.map((w) => w.id);
  const tries = [
    saveEmployee(DEFAULT_EMPLOYEES, { loginId: 'x', name: 'x', role: 'boss' }),
    saveEmployee(DEFAULT_EMPLOYEES, { loginId: 'sales99', name: 'x', role: 'sales' }),
    saveEmployee(DEFAULT_EMPLOYEES, { id: 'zz', loginId: 'op99', name: 'x', role: 'operator' }),
    saveEmployee(DEFAULT_EMPLOYEES, { id: 'wh01', loginId: 'wh01', name: 'x', role: 'operator' }),
    saveEmployee(DEFAULT_EMPLOYEES, { loginId: 'op99', name: '', role: 'operator' }),
    saveEmployee(DEFAULT_EMPLOYEES, { loginId: 'a b', name: 'x', role: 'operator' }),
    saveEmployee(DEFAULT_EMPLOYEES, { loginId: 'op01', name: 'x', role: 'operator' }),
    saveEmployee(DEFAULT_EMPLOYEES, { loginId: 'wh99', name: 'x', role: 'warehouse' }, { warehouseIds }),
    saveEmployee(DEFAULT_EMPLOYEES, { loginId: 'ap99', name: 'x', role: 'appraiser' }),
    setEmployeeActive(DEFAULT_EMPLOYEES, 'zz', false),
    setEmployeeActive(DEFAULT_EMPLOYEES, 'u01', false),
    setEmployeeActive(DEFAULT_EMPLOYEES.filter((u) => u.id !== 'op02'), 'op01', false),
  ];
  for (const r of tries) { assert.equal(r.ok, false); reasons.add(r.reason); assert.ok(REASON_TEXT[r.reason], r.reason); }
  assert.equal(reasons.size, 10);
});

test('パネル: 描画できる。役割ごとの使う画面の説明がある', () => {
  const t = text(usersHtml(base));
  assert.ok(t.includes('社員') && t.includes('営業タブレット') && t.includes('本社 査定部') && t.includes('倉庫・物流'));
});
