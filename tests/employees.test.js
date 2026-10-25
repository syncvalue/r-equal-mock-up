import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const U = await import('../src/employees.js');
const { USERS: SALES } = await import('../src/dashboard.js');

const { DEFAULT_DEPARTMENTS: DEPTS, defaultDepartmentOf } = await import('../src/departments.js');

const WH = ['W-OSAKA', 'W-KANTO'];
const ST = ['S-NAMBA', 'S-SHINJUKU'];
const opts = { warehouseIds: WH, storeIds: ST, departmentIds: DEPTS.map((d) => d.id) };
// 部署を指定しない入力には、役割ごとの初期の部署を入れる
const save = (list, input, o = opts) => U.saveEmployee(list, { departmentId: defaultDepartmentOf(input.role), ...input }, o);
const roleCount = (list, role) => list.filter((u) => u.role === role).length;

test('役割: 営業・オペレーター・配車係・査定員・経理担当・倉庫担当・店舗スタッフの7つ。表示名は用語集のとおり', () => {
  assert.deepEqual(U.ROLES.map((r) => r.label), ['営業', 'オペレーター', '配車係', '査定員', '経理担当', '倉庫担当', '店舗スタッフ']);
  assert.equal(U.roleLabel('appraiser'), '査定員');
  assert.equal(U.roleLabel('nope'), '');
});

test('初期の社員: 営業は既存の16名と同じ。どの役割にも有効な社員がいる。IDは重複しない', () => {
  const list = U.DEFAULT_EMPLOYEES;
  assert.deepEqual(list.filter((u) => u.role === 'sales').map((u) => u.id), SALES.map((u) => u.id));
  assert.ok(U.ROLES.every((r) => list.some((u) => u.role === r.key && u.active)));
  assert.equal(new Set(list.map((u) => u.loginId)).size, list.length);
  assert.equal(new Set(list.map((u) => u.id)).size, list.length);
  const leader = list.find((u) => u.id === 'u02');
  assert.deepEqual([leader.leader, leader.groups], [true, ['A']]); // グループリーダー・グループは既存のとおり
  assert.equal(list.find((u) => u.id === 'u01').loginId, 'sales01'); // 営業のログインIDは、営業タブレットのログインと同じ
});

test('保存と読み込み: 保存した社員を読み戻せる。保存がない・壊れていれば初期値', () => {
  assert.deepEqual(U.loadEmployees(), U.DEFAULT_EMPLOYEES);
  const added = save(U.DEFAULT_EMPLOYEES, { loginId: 'op09', name: '新人', role: 'operator' }, opts);
  assert.equal(U.saveEmployees(added.employees), true);
  assert.equal(U.loadEmployees().length, U.DEFAULT_EMPLOYEES.length + 1);
  mem.set(U.EMPLOYEES_KEY, '{broken');
  assert.deepEqual(U.loadEmployees(), U.DEFAULT_EMPLOYEES);
  mem.set(U.EMPLOYEES_KEY, '[]');
  assert.deepEqual(U.loadEmployees(), U.DEFAULT_EMPLOYEES); // 空は、誰もログインできなくなるので初期値
  mem.clear();
});

test('登録: 氏名・ログインID・役割が必要。IDは小文字にそろえ、重複不可（大文字小文字を区別しない）', () => {
  const base = U.DEFAULT_EMPLOYEES;
  const ok = save(base, { loginId: ' OP09 ', name: ' 新人 花子 ', role: 'operator' }, opts);
  assert.equal(ok.ok, true);
  const u = ok.employees.at(-1);
  assert.deepEqual({ loginId: u.loginId, name: u.name, role: u.role, active: u.active }, { loginId: 'op09', name: '新人 花子', role: 'operator', active: true });
  assert.ok(u.id && !base.some((x) => x.id === u.id));
  assert.equal(base.length + 1, ok.employees.length); // 元の配列は変えない
  assert.equal(save(ok.employees, { loginId: 'Op09', name: 'x', role: 'operator' }, opts).reason, 'dupLoginId');
  assert.equal(save(base, { loginId: 'op10', name: '', role: 'operator' }, opts).reason, 'noName');
  assert.equal(save(base, { loginId: 'a b', name: 'x', role: 'operator' }, opts).reason, 'badLoginId');
  assert.equal(save(base, { loginId: 'op10', name: 'x', role: 'boss' }, opts).reason, 'badRole');
  assert.equal(save(base, { id: 'nope', loginId: 'op10', name: 'x', role: 'operator' }, opts).reason, 'notFound');
});

test('役割ごとの項目: 倉庫担当は所属倉庫、査定員は担当グループが必要。営業は、ここでは登録・変更できない', () => {
  const base = U.DEFAULT_EMPLOYEES;
  assert.equal(save(base, { loginId: 'wh09', name: 'x', role: 'warehouse' }, opts).reason, 'noWarehouse');
  assert.equal(save(base, { loginId: 'wh09', name: 'x', role: 'warehouse', warehouseId: 'nope' }, opts).reason, 'noWarehouse');
  assert.equal(save(base, { loginId: 'wh09', name: 'x', role: 'warehouse', warehouseId: '' }, { warehouseIds: ['', ...WH] }).reason, 'noWarehouse'); // 空は、倉庫として扱わない
  const wh = save(base, { loginId: 'wh09', name: 'x', role: 'warehouse', warehouseId: 'W-KANTO' }, opts);
  assert.equal(wh.employees.at(-1).warehouseId, 'W-KANTO');
  assert.equal(save(base, { loginId: 'ap09', name: 'x', role: 'appraiser', groups: [] }, opts).reason, 'noGroup');
  assert.equal(save(base, { loginId: 'ap09', name: 'x', role: 'appraiser', groups: ['Z'] }, opts).reason, 'noGroup');
  const ap = save(base, { loginId: 'ap09', name: 'x', role: 'appraiser', groups: ['A', 'B', 'A'] }, opts);
  assert.deepEqual(ap.employees.at(-1).groups, ['A', 'B']);
  assert.equal(save(base, { loginId: 'sales99', name: 'x', role: 'sales' }, opts).reason, 'readOnly');
  assert.equal(save(base, { id: 'u01', loginId: 'sales01', name: '変更', role: 'sales' }, opts).reason, 'readOnly');
  assert.equal(U.isReadOnlyRole('sales'), true);
  assert.equal(U.isReadOnlyRole('operator'), false);
});

test('更新: 役割は変えられない（別の役割にするときは、新しく登録する）。他の項目は変えられる。他の役割の項目は持ち越さない', () => {
  const base = U.DEFAULT_EMPLOYEES;
  const wh = base.find((u) => u.role === 'warehouse');
  const moved = save(base, { ...wh, name: '改名 太郎', warehouseId: 'W-KANTO' }, opts);
  assert.equal(moved.ok, true);
  const after = moved.employees.find((u) => u.id === wh.id);
  assert.deepEqual([after.name, after.warehouseId, after.active], ['改名 太郎', 'W-KANTO', wh.active]);
  assert.equal(moved.employees.length, base.length);
  assert.equal(save(base, { ...wh, role: 'operator' }, opts).reason, 'roleLocked');
  const op = base.find((u) => u.role === 'operator');
  const saved = save(base, { ...op, warehouseId: 'W-KANTO', groups: ['A'] }, opts).employees.find((u) => u.id === op.id);
  assert.equal('warehouseId' in saved || 'groups' in saved, false);
  assert.equal(save(base, { ...op, loginId: wh.loginId }, opts).reason, 'dupLoginId');
  assert.equal(save(base, { ...op }, opts).ok, true); // 自分自身のIDは重複ではない
});

test('有効・無効: 無効にした社員は使えなくなる。役割ごとに、有効な社員を最低1人は残す。営業はここでは変えられない', () => {
  let list = U.DEFAULT_EMPLOYEES;
  const ops = list.filter((u) => u.role === 'operator');
  assert.ok(ops.length >= 2);
  list = U.setEmployeeActive(list, ops[0].id, false).employees;
  assert.equal(list.find((u) => u.id === ops[0].id).active, false);
  assert.deepEqual(U.operatorNames(list), ops.slice(1).map((u) => u.name));
  const last = U.setEmployeeActive(list, ops[1].id, false);
  assert.equal(last.reason, 'lastActive'); // 最後の1人は、無効にできない
  assert.equal(U.setEmployeeActive(list, ops[0].id, true).ok, true); // 有効に戻すのはいつでも
  assert.equal(U.setEmployeeActive(list, 'nope', false).reason, 'notFound');
  assert.equal(U.setEmployeeActive(list, 'u01', false).reason, 'readOnly');
});

test('参照する側へ渡す形: 倉庫担当（倉庫マスタ形式）・オペレーター名・査定員（担当グループつき）。無効な社員は含めない', () => {
  const list = U.DEFAULT_EMPLOYEES;
  const staff = U.warehouseStaffOf(list);
  assert.equal(staff.length, roleCount(list, 'warehouse'));
  assert.deepEqual(Object.keys(staff[0]).sort(), ['active', 'id', 'loginId', 'name', 'warehouseId']);
  const off = U.setEmployeeActive(list, 'wh01', false).employees;
  assert.equal(U.warehouseStaffOf(off).find((s) => s.id === 'wh01').active, false); // 倉庫側で、無効の判定をするため、一覧には残す
  const aps = U.appraisersOf(list);
  assert.deepEqual(aps.map((a) => [a.id, a.groups]), [['a1', ['A']], ['a2', ['B']]]);
  assert.deepEqual(U.appraisersOf(U.setEmployeeActive(list, 'a1', false).employees).map((a) => a.id), ['a2']);
});

test('検索と絞り込み: 役割・氏名・ログインID（部分一致・大文字小文字を問わない）・状態。件数は役割ごと', () => {
  const list = U.setEmployeeActive(U.DEFAULT_EMPLOYEES, 'wh01', false).employees;
  assert.equal(U.filterEmployees(list, {}).length, list.length);
  assert.ok(U.filterEmployees(list, { role: 'warehouse' }).every((u) => u.role === 'warehouse'));
  assert.deepEqual(U.filterEmployees(list, { q: 'SALES01' }).map((u) => u.id), ['u01']);
  assert.deepEqual(U.filterEmployees(list, { q: '鈴木 一' }).map((u) => u.id), ['u01']);
  assert.deepEqual(U.filterEmployees(list, { q: '鈴木　一' }).map((u) => u.id), ['u01']); // 全角の空白でも探せる
  assert.deepEqual(U.filterEmployees(list, { role: 'warehouse', status: 'inactive' }).map((u) => u.id), ['wh01']);
  assert.ok(U.filterEmployees(list, { status: 'active' }).every((u) => u.active));
  const c = U.countByRole(list);
  assert.equal(c.sales, 16);
  assert.equal(c.all, list.length);
});

test('古い保存データの引き継ぎ: 社員の保存がなく、倉庫マスタに倉庫担当が保存されていれば、その倉庫担当を倉庫担当にする', () => {
  mem.clear();
  mem.set('rq-mock-warehouse-master', JSON.stringify({ warehouses: [], staff: [{ id: 'wh01', loginId: 'wh01', name: '旧 担当', warehouseId: 'W-KANTO', active: true }, { id: 'ST-X', loginId: 'x01', name: '追加 済み', warehouseId: 'W-OSAKA', active: false }] }));
  const list = U.loadEmployees();
  const whs = list.filter((u) => u.role === 'warehouse');
  assert.deepEqual(whs.map((u) => [u.id, u.name, u.warehouseId, u.active]), [['wh01', '旧 担当', 'W-KANTO', true], ['ST-X', '追加 済み', 'W-OSAKA', false]]);
  assert.equal(roleCount(list, 'sales'), 16); // 他の役割は初期値
  assert.ok(mem.has(U.EMPLOYEES_KEY)); // 引き継いだ内容は保存する（倉庫マスタの保存で消えても失われない）
  mem.clear();
});

test('店舗スタッフ: 所属店舗が必要（有効な店舗から選ぶ）。初期の部署は店舗部。店舗スタッフの一覧が取れる', () => {
  const base = U.DEFAULT_EMPLOYEES;
  assert.equal(save(base, { loginId: 'st09', name: 'x', role: 'store' }, opts).reason, 'noStore');
  assert.equal(save(base, { loginId: 'st09', name: 'x', role: 'store', storeId: 'nope' }, opts).reason, 'noStore');
  const ok = save(base, { loginId: 'st09', name: '新人', role: 'store', storeId: 'S-SHINJUKU' }, opts);
  assert.deepEqual([ok.employees.at(-1).storeId, ok.employees.at(-1).departmentId], ['S-SHINJUKU', 'D-STORE']);
  assert.deepEqual(base.filter((u) => u.role === 'store').map((u) => [u.id, u.storeId]), [['st01', 'S-NAMBA'], ['st02', 'S-NAMBA'], ['st03', 'S-SHINJUKU']]);
  assert.deepEqual(U.storeStaffOf(base).map((u) => u.id), ['st01', 'st02', 'st03']);
  assert.deepEqual(U.storeStaffOf(U.setEmployeeActive(base, 'st02', false).employees).map((u) => u.id), ['st01', 'st03']); // 無効は出さない
  assert.equal(U.setEmployeeActive(U.setEmployeeActive(base, 'st03', false).employees, 'st01', false).ok, true);
});

test('古い保存データ: 店舗スタッフがいない保存は、見本の店舗スタッフを足して読み込む', () => {
  mem.clear();
  mem.set(U.EMPLOYEES_KEY, JSON.stringify(U.DEFAULT_EMPLOYEES.filter((u) => u.role !== 'store')));
  assert.equal(U.loadEmployees().filter((u) => u.role === 'store').length, 3);
  mem.clear();
});

test('部署: 社員は、いずれかの部署に属する。初期の社員は、役割ごとの初期の部署。登録・更新には、有効な部署の指定が必要', () => {
  const list = U.DEFAULT_EMPLOYEES;
  assert.ok(list.every((e) => e.departmentId === defaultDepartmentOf(e.role)));
  assert.equal(list.find((e) => e.id === 'op01').departmentId, 'D-CALLCENTER');
  assert.equal(list.find((e) => e.id === 'wh01').departmentId, 'D-LOGISTICS');
  const ok = U.saveEmployee(list, { loginId: 'op09', name: '新人', role: 'operator', departmentId: 'D-ACCOUNTING' }, opts); // 役割と部署は、独立した項目
  assert.equal(ok.employees.at(-1).departmentId, 'D-ACCOUNTING');
  assert.equal(U.saveEmployee(list, { loginId: 'op09', name: 'x', role: 'operator' }, opts).reason, 'noDepartment');
  assert.equal(U.saveEmployee(list, { loginId: 'op09', name: 'x', role: 'operator', departmentId: 'nope' }, opts).reason, 'noDepartment');
  const moved = U.saveEmployee(list, { ...list.find((e) => e.id === 'op01'), departmentId: 'D-SALES' }, opts);
  assert.equal(moved.employees.find((e) => e.id === 'op01').departmentId, 'D-SALES');
});

test('絞り込み: 部署でも絞り込める。部署の人数も数えられる', () => {
  const list = U.DEFAULT_EMPLOYEES;
  assert.ok(U.filterEmployees(list, { departmentId: 'D-CALLCENTER' }).every((e) => e.departmentId === 'D-CALLCENTER'));
  assert.deepEqual(U.filterEmployees(list, { departmentId: 'D-CALLCENTER' }).map((e) => e.id), ['op01', 'op02', 'dp01']);
  assert.equal(U.countByDepartment(list)['D-SALES'], 16);
  assert.equal(U.countByDepartment(U.setEmployeeActive(list, 'wh01', false).employees)['D-LOGISTICS'], 4); // 有効な社員だけ数える
});

test('古い保存データの引き継ぎ: 以前の「社員」の保存（部署なし）は、社員として引き継ぎ、役割ごとの初期の部署を入れる', () => {
  mem.clear();
  const old = U.DEFAULT_EMPLOYEES.map(({ departmentId, ...rest }) => rest).map((e) => (e.id === 'op01' ? { ...e, name: '旧 佐藤' } : e));
  mem.set('rq-mock-users', JSON.stringify(old));
  const list = U.loadEmployees();
  assert.equal(list.find((e) => e.id === 'op01').name, '旧 佐藤');
  assert.ok(list.every((e) => e.departmentId));
  assert.ok(mem.has(U.EMPLOYEES_KEY));
  mem.clear();
});
