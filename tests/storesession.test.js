import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const ss = new Map();
globalThis.sessionStorage = { getItem: (k) => ss.get(k) ?? null, setItem: (k, v) => ss.set(k, String(v)), removeItem: (k) => ss.delete(k) };

const S = await import('../src/storeSession.js');
const { DEFAULT_EMPLOYEES, setEmployeeActive } = await import('../src/employees.js');

test('ログイン: 店舗スタッフのIDで入れる。パスワードは何でもよいが、空は不可。IDの大文字・小文字・前後の空白は問わない', () => {
  const ok = S.login(' ST01 ', 'x', DEFAULT_EMPLOYEES);
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.staff.id, ok.staff.storeId], ['st01', 'S-NAMBA']);
  assert.equal(S.login('st01', '', DEFAULT_EMPLOYEES).ok, false);
  assert.equal(S.login('nope', 'x', DEFAULT_EMPLOYEES).ok, false);
  assert.equal(S.login('wh01', 'x', DEFAULT_EMPLOYEES).ok, false); // 倉庫担当は、店舗に入れない
  assert.equal(S.login('st01', 'x', setEmployeeActive(DEFAULT_EMPLOYEES, 'st01', false).employees).ok, false); // 無効な社員は不可
});

test('ログイン状態: タブを閉じるまで保つ。無効になった・名簿にいない店舗スタッフは、ログアウト扱い', () => {
  assert.equal(S.loadSession(DEFAULT_EMPLOYEES), null);
  S.saveSession('st03');
  assert.equal(S.loadSession(DEFAULT_EMPLOYEES).name, '松井 彩花');
  assert.equal(S.loadSession(setEmployeeActive(DEFAULT_EMPLOYEES, 'st03', false).employees), null);
  S.clearSession();
  assert.equal(S.loadSession(DEFAULT_EMPLOYEES), null);
});
