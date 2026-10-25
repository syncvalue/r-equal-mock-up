import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const U = await import('../src/users.js');
const { USERS: SALES } = await import('../src/dashboard.js');

const WH = ['W-OSAKA', 'W-KANTO'];
const opts = { warehouseIds: WH };
const roleCount = (list, role) => list.filter((u) => u.role === role).length;

test('役割: 営業・オペレーター・配車係・査定員・経理担当・倉庫担当の6つ。表示名は用語集のとおり', () => {
  assert.deepEqual(U.ROLES.map((r) => r.label), ['営業', 'オペレーター', '配車係', '査定員', '経理担当', '倉庫担当']);
  assert.equal(U.roleLabel('appraiser'), '査定員');
  assert.equal(U.roleLabel('nope'), '');
});

test('初期のユーザー: 営業は既存の16名と同じ。どの役割にも有効なユーザーがいる。IDは重複しない', () => {
  const list = U.DEFAULT_USERS;
  assert.deepEqual(list.filter((u) => u.role === 'sales').map((u) => u.id), SALES.map((u) => u.id));
  assert.ok(U.ROLES.every((r) => list.some((u) => u.role === r.key && u.active)));
  assert.equal(new Set(list.map((u) => u.loginId)).size, list.length);
  assert.equal(new Set(list.map((u) => u.id)).size, list.length);
  const leader = list.find((u) => u.id === 'u02');
  assert.deepEqual([leader.leader, leader.groups], [true, ['A']]); // グループリーダー・グループは既存のとおり
  assert.equal(list.find((u) => u.id === 'u01').loginId, 'sales01'); // 営業のログインIDは、営業タブレットのログインと同じ
});

test('保存と読み込み: 保存したユーザーを読み戻せる。保存がない・壊れていれば初期値', () => {
  assert.deepEqual(U.loadUsers(), U.DEFAULT_USERS);
  const added = U.saveUser(U.DEFAULT_USERS, { loginId: 'op09', name: '新人', role: 'operator' }, opts);
  assert.equal(U.saveUsers(added.users), true);
  assert.equal(U.loadUsers().length, U.DEFAULT_USERS.length + 1);
  mem.set(U.USERS_KEY, '{broken');
  assert.deepEqual(U.loadUsers(), U.DEFAULT_USERS);
  mem.set(U.USERS_KEY, '[]');
  assert.deepEqual(U.loadUsers(), U.DEFAULT_USERS); // 空は、誰もログインできなくなるので初期値
  mem.clear();
});

test('登録: 氏名・ログインID・役割が必要。IDは小文字にそろえ、重複不可（大文字小文字を区別しない）', () => {
  const base = U.DEFAULT_USERS;
  const ok = U.saveUser(base, { loginId: ' OP09 ', name: ' 新人 花子 ', role: 'operator' }, opts);
  assert.equal(ok.ok, true);
  const u = ok.users.at(-1);
  assert.deepEqual({ loginId: u.loginId, name: u.name, role: u.role, active: u.active }, { loginId: 'op09', name: '新人 花子', role: 'operator', active: true });
  assert.ok(u.id && !base.some((x) => x.id === u.id));
  assert.equal(base.length + 1, ok.users.length); // 元の配列は変えない
  assert.equal(U.saveUser(ok.users, { loginId: 'Op09', name: 'x', role: 'operator' }, opts).reason, 'dupLoginId');
  assert.equal(U.saveUser(base, { loginId: 'op10', name: '', role: 'operator' }, opts).reason, 'noName');
  assert.equal(U.saveUser(base, { loginId: 'a b', name: 'x', role: 'operator' }, opts).reason, 'badLoginId');
  assert.equal(U.saveUser(base, { loginId: 'op10', name: 'x', role: 'boss' }, opts).reason, 'badRole');
  assert.equal(U.saveUser(base, { id: 'nope', loginId: 'op10', name: 'x', role: 'operator' }, opts).reason, 'notFound');
});

test('役割ごとの項目: 倉庫担当は所属倉庫、査定員は担当グループが必要。営業は、ここでは登録・変更できない', () => {
  const base = U.DEFAULT_USERS;
  assert.equal(U.saveUser(base, { loginId: 'wh09', name: 'x', role: 'warehouse' }, opts).reason, 'noWarehouse');
  assert.equal(U.saveUser(base, { loginId: 'wh09', name: 'x', role: 'warehouse', warehouseId: 'nope' }, opts).reason, 'noWarehouse');
  assert.equal(U.saveUser(base, { loginId: 'wh09', name: 'x', role: 'warehouse', warehouseId: '' }, { warehouseIds: ['', ...WH] }).reason, 'noWarehouse'); // 空は、倉庫として扱わない
  const wh = U.saveUser(base, { loginId: 'wh09', name: 'x', role: 'warehouse', warehouseId: 'W-KANTO' }, opts);
  assert.equal(wh.users.at(-1).warehouseId, 'W-KANTO');
  assert.equal(U.saveUser(base, { loginId: 'ap09', name: 'x', role: 'appraiser', groups: [] }, opts).reason, 'noGroup');
  assert.equal(U.saveUser(base, { loginId: 'ap09', name: 'x', role: 'appraiser', groups: ['Z'] }, opts).reason, 'noGroup');
  const ap = U.saveUser(base, { loginId: 'ap09', name: 'x', role: 'appraiser', groups: ['A', 'B', 'A'] }, opts);
  assert.deepEqual(ap.users.at(-1).groups, ['A', 'B']);
  assert.equal(U.saveUser(base, { loginId: 'sales99', name: 'x', role: 'sales' }, opts).reason, 'readOnly');
  assert.equal(U.saveUser(base, { id: 'u01', loginId: 'sales01', name: '変更', role: 'sales' }, opts).reason, 'readOnly');
  assert.equal(U.isReadOnlyRole('sales'), true);
  assert.equal(U.isReadOnlyRole('operator'), false);
});

test('更新: 役割は変えられない（別の役割にするときは、新しく登録する）。他の項目は変えられる。他の役割の項目は持ち越さない', () => {
  const base = U.DEFAULT_USERS;
  const wh = base.find((u) => u.role === 'warehouse');
  const moved = U.saveUser(base, { ...wh, name: '改名 太郎', warehouseId: 'W-KANTO' }, opts);
  assert.equal(moved.ok, true);
  const after = moved.users.find((u) => u.id === wh.id);
  assert.deepEqual([after.name, after.warehouseId, after.active], ['改名 太郎', 'W-KANTO', wh.active]);
  assert.equal(moved.users.length, base.length);
  assert.equal(U.saveUser(base, { ...wh, role: 'operator' }, opts).reason, 'roleLocked');
  const op = base.find((u) => u.role === 'operator');
  const saved = U.saveUser(base, { ...op, warehouseId: 'W-KANTO', groups: ['A'] }, opts).users.find((u) => u.id === op.id);
  assert.equal('warehouseId' in saved || 'groups' in saved, false);
  assert.equal(U.saveUser(base, { ...op, loginId: wh.loginId }, opts).reason, 'dupLoginId');
  assert.equal(U.saveUser(base, { ...op }, opts).ok, true); // 自分自身のIDは重複ではない
});

test('有効・無効: 無効にしたユーザーは使えなくなる。役割ごとに、有効なユーザーを最低1人は残す。営業はここでは変えられない', () => {
  let list = U.DEFAULT_USERS;
  const ops = list.filter((u) => u.role === 'operator');
  assert.ok(ops.length >= 2);
  list = U.setUserActive(list, ops[0].id, false).users;
  assert.equal(list.find((u) => u.id === ops[0].id).active, false);
  assert.deepEqual(U.operatorNames(list), ops.slice(1).map((u) => u.name));
  const last = U.setUserActive(list, ops[1].id, false);
  assert.equal(last.reason, 'lastActive'); // 最後の1人は、無効にできない
  assert.equal(U.setUserActive(list, ops[0].id, true).ok, true); // 有効に戻すのはいつでも
  assert.equal(U.setUserActive(list, 'nope', false).reason, 'notFound');
  assert.equal(U.setUserActive(list, 'u01', false).reason, 'readOnly');
});

test('参照する側へ渡す形: 倉庫担当（倉庫マスタ形式）・オペレーター名・査定員（担当グループつき）。無効なユーザーは含めない', () => {
  const list = U.DEFAULT_USERS;
  const staff = U.warehouseStaffOf(list);
  assert.equal(staff.length, roleCount(list, 'warehouse'));
  assert.deepEqual(Object.keys(staff[0]).sort(), ['active', 'id', 'loginId', 'name', 'warehouseId']);
  const off = U.setUserActive(list, 'wh01', false).users;
  assert.equal(U.warehouseStaffOf(off).find((s) => s.id === 'wh01').active, false); // 倉庫側で、無効の判定をするため、一覧には残す
  const aps = U.appraisersOf(list);
  assert.deepEqual(aps.map((a) => [a.id, a.groups]), [['a1', ['A']], ['a2', ['B']]]);
  assert.deepEqual(U.appraisersOf(U.setUserActive(list, 'a1', false).users).map((a) => a.id), ['a2']);
});

test('検索と絞り込み: 役割・氏名・ログインID（部分一致・大文字小文字を問わない）・状態。件数は役割ごと', () => {
  const list = U.setUserActive(U.DEFAULT_USERS, 'wh01', false).users;
  assert.equal(U.filterUsers(list, {}).length, list.length);
  assert.ok(U.filterUsers(list, { role: 'warehouse' }).every((u) => u.role === 'warehouse'));
  assert.deepEqual(U.filterUsers(list, { q: 'SALES01' }).map((u) => u.id), ['u01']);
  assert.deepEqual(U.filterUsers(list, { q: '鈴木 一' }).map((u) => u.id), ['u01']);
  assert.deepEqual(U.filterUsers(list, { q: '鈴木　一' }).map((u) => u.id), ['u01']); // 全角の空白でも探せる
  assert.deepEqual(U.filterUsers(list, { role: 'warehouse', status: 'inactive' }).map((u) => u.id), ['wh01']);
  assert.ok(U.filterUsers(list, { status: 'active' }).every((u) => u.active));
  const c = U.countByRole(list);
  assert.equal(c.sales, 16);
  assert.equal(c.all, list.length);
});

test('古い保存データの引き継ぎ: ユーザーの保存がなく、倉庫マスタに倉庫担当が保存されていれば、その倉庫担当を倉庫担当にする', () => {
  mem.clear();
  mem.set('rq-mock-warehouse-master', JSON.stringify({ warehouses: [], staff: [{ id: 'wh01', loginId: 'wh01', name: '旧 担当', warehouseId: 'W-KANTO', active: true }, { id: 'ST-X', loginId: 'x01', name: '追加 済み', warehouseId: 'W-OSAKA', active: false }] }));
  const list = U.loadUsers();
  const whs = list.filter((u) => u.role === 'warehouse');
  assert.deepEqual(whs.map((u) => [u.id, u.name, u.warehouseId, u.active]), [['wh01', '旧 担当', 'W-KANTO', true], ['ST-X', '追加 済み', 'W-OSAKA', false]]);
  assert.equal(roleCount(list, 'sales'), 16); // 他の役割は初期値
  assert.ok(mem.has(U.USERS_KEY)); // 引き継いだ内容は保存する（倉庫マスタの保存で消えても失われない）
  mem.clear();
});
