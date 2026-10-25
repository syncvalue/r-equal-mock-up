import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const S = await import('../src/warehouseStaff.js');

test('担当者: 複数名がいて、ログインIDで探せる（大文字・前後の空白は無視）', () => {
  assert.ok(S.STAFF.length >= 3);
  assert.equal(new Set(S.STAFF.map((s) => s.loginId)).size, S.STAFF.length);
  assert.equal(S.findStaff(' WH01 ').id, S.STAFF[0].id);
  assert.equal(S.findStaff('nobody'), null);
});

test('ログイン: 登録のあるIDと、空でないパスワードが必要（モックのため、パスワードの中身は問わない）', () => {
  assert.equal(S.login('wh02', 'x').ok, true);
  assert.equal(S.login('wh02', 'x').staff.id, S.findStaff('wh02').id);
  assert.equal(S.login('nobody', 'x').ok, false);
  assert.equal(S.login('wh02', '').ok, false);
  assert.equal(S.login('', 'x').ok, false);
});

test('ログイン状態: タブを閉じるまで保持し、ログアウトで消える。未知のIDは無効', () => {
  assert.equal(S.loadSession(), null);
  S.saveSession(S.STAFF[1].id);
  assert.equal(S.loadSession().id, S.STAFF[1].id);
  S.clearSession();
  assert.equal(S.loadSession(), null);
  store.set('rq-mock-wh-session', 'unknown');
  assert.equal(S.loadSession(), null);
});
