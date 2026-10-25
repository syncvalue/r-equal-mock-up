import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const D = await import('../src/departments.js');

test('会社は1社だけ（クライアントのREqual）。部署はすべて、この会社に属する', () => {
  assert.equal(D.COMPANY.name, 'REqual');
  assert.ok(D.DEFAULT_DEPARTMENTS.every((d) => d.companyId === D.COMPANY.id));
});

test('初期の部署: 営業部・コールセンター・査定部・経理部・物流部・店舗部。役割ごとの、初期の所属部署が決まっている', () => {
  assert.deepEqual(D.DEFAULT_DEPARTMENTS.map((d) => d.name), ['営業部', 'コールセンター', '査定部', '経理部', '物流部', '店舗部']);
  assert.ok(D.DEFAULT_DEPARTMENTS.every((d) => d.active && d.id));
  const ids = new Set(D.DEFAULT_DEPARTMENTS.map((d) => d.id));
  for (const role of ['sales', 'operator', 'dispatcher', 'appraiser', 'accountant', 'warehouse', 'store']) assert.ok(ids.has(D.defaultDepartmentOf(role)), role);
  assert.equal(D.defaultDepartmentOf('operator'), D.defaultDepartmentOf('dispatcher')); // コールセンター
  assert.equal(D.defaultDepartmentOf('nope'), '');
});

test('古い保存データ: 店舗部がない保存は、店舗部を足して読み込む（店舗スタッフの所属先がなくならないように）', () => {
  mem.clear();
  mem.set(D.DEPARTMENTS_KEY, JSON.stringify(D.DEFAULT_DEPARTMENTS.filter((d) => d.id !== 'D-STORE')));
  assert.ok(D.loadDepartments().some((d) => d.id === 'D-STORE' && d.name === '店舗部' && d.active));
  mem.clear();
});

test('保存と読み込み: 保存した部署を読み戻せる。保存がない・壊れている・空なら初期値', () => {
  assert.deepEqual(D.loadDepartments(), D.DEFAULT_DEPARTMENTS);
  const r = D.saveDepartment(D.DEFAULT_DEPARTMENTS, { name: '総務部' });
  assert.equal(D.saveDepartments(r.departments), true);
  assert.equal(D.loadDepartments().length, D.DEFAULT_DEPARTMENTS.length + 1);
  mem.set(D.DEPARTMENTS_KEY, '{broken');
  assert.deepEqual(D.loadDepartments(), D.DEFAULT_DEPARTMENTS);
  mem.set(D.DEPARTMENTS_KEY, '[]');
  assert.deepEqual(D.loadDepartments(), D.DEFAULT_DEPARTMENTS);
  mem.clear();
});

test('登録・更新: 名前が必要で、重複不可（前後の空白は除く）。会社は、いつも REqual。自分自身の名前は重複ではない', () => {
  const base = D.DEFAULT_DEPARTMENTS;
  const ok = D.saveDepartment(base, { name: ' 総務部 ' });
  assert.equal(ok.ok, true);
  const d = ok.departments.at(-1);
  assert.deepEqual([d.name, d.companyId, d.active], ['総務部', D.COMPANY.id, true]);
  assert.ok(d.id && !base.some((x) => x.id === d.id));
  assert.equal(base.length + 1, ok.departments.length); // 元の配列は変えない
  assert.equal(D.saveDepartment(base, { name: '' }).reason, 'noName');
  assert.equal(D.saveDepartment(base, { name: '営業部' }).reason, 'dupName');
  assert.equal(D.saveDepartment(base, { id: 'nope', name: 'x' }).reason, 'notFound');
  const off = D.setDepartmentActive(base, base[0].id, false, { employees: [] }).departments;
  const renamed = D.saveDepartment(off, { id: base[0].id, name: '営業部', companyId: 'OTHER' });
  assert.equal(renamed.ok, true);
  const r = renamed.departments[0];
  assert.deepEqual([r.active, r.companyId], [false, D.COMPANY.id]); // 有効/無効は保つ。会社は変えられない
});

test('有効・無効: 有効な社員が所属している部署は、無効にできない。有効な部署は最低1つ残す。有効に戻すのはいつでも', () => {
  const base = D.DEFAULT_DEPARTMENTS;
  const [a, b] = base;
  assert.equal(D.setDepartmentActive(base, 'nope', false, { employees: [] }).reason, 'notFound');
  assert.equal(D.setDepartmentActive(base, a.id, false, { employees: [{ departmentId: a.id, active: true }] }).reason, 'hasEmployees');
  assert.equal(D.setDepartmentActive(base, a.id, false, { employees: [{ departmentId: a.id, active: false }, { departmentId: b.id, active: true }] }).ok, true); // 無効な社員だけなら可
  let list = base;
  for (const d of base.slice(0, -1)) list = D.setDepartmentActive(list, d.id, false, { employees: [] }).departments;
  assert.equal(D.setDepartmentActive(list, base.at(-1).id, false, { employees: [] }).reason, 'lastActive');
  assert.equal(D.setDepartmentActive(list, base[0].id, true, { employees: [] }).ok, true);
  assert.deepEqual(D.activeDepartments(list).map((d) => d.id), [base.at(-1).id]);
});

test('名前の引き当て: 部署の名前（なければ空）', () => {
  assert.equal(D.departmentName(D.DEFAULT_DEPARTMENTS[0].id, D.DEFAULT_DEPARTMENTS), '営業部');
  assert.equal(D.departmentName('zzz', D.DEFAULT_DEPARTMENTS), '');
});
