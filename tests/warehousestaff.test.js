import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const S = await import('../src/warehouseStaff.js');
const { DEFAULT_MASTER: M, saveStaff } = await import('../src/warehouseMaster.js');

test('ログイン: 登録のある有効な担当者のIDと、空でないパスワードが必要（モックのため、パスワードの中身は問わない）', () => {
  const r = S.login(' WH02 ', 'x');
  assert.equal(r.ok, true);
  assert.equal(r.staff.id, 'wh02');
  assert.equal(r.staff.warehouseId, M.staff[1].warehouseId); // 所属倉庫が分かる
  assert.equal(S.login('nobody', 'x').ok, false);
  assert.equal(S.login('wh02', '').ok, false);
  assert.equal(S.login('', 'x').ok, false);
  const off = saveStaff(M, { ...M.staff[1], active: false }).master;
  assert.equal(S.login('wh02', 'x', off).ok, false); // 無効な担当者は、ログインできない
});

test('ログイン状態: タブを閉じるまで保持し、ログアウトで消える。未知・無効の担当者は無効', () => {
  assert.equal(S.loadSession(), null);
  S.saveSession('wh02');
  assert.equal(S.loadSession().id, 'wh02');
  const off = saveStaff(M, { ...M.staff[1], active: false }).master;
  assert.equal(S.loadSession(off), null);
  S.clearSession();
  assert.equal(S.loadSession(), null);
  store.set('rq-mock-wh-session', 'unknown');
  assert.equal(S.loadSession(), null);
});
