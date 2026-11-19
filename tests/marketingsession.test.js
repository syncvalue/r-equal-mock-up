import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const ss = new Map();
globalThis.sessionStorage = { getItem: (k) => ss.get(k) ?? null, setItem: (k, v) => ss.set(k, String(v)), removeItem: (k) => ss.delete(k) };

const S = await import('../src/marketingSession.js');
const { DEFAULT_EMPLOYEES, setEmployeeActive, marketingStaffOf } = await import('../src/employees.js');
const { loginView } = await import('../marketing/loginView.js');

test('ログイン: マーケティング担当のIDで入れる。パスワードは何でもよいが、空は不可。IDの大文字・小文字・前後の空白は問わない', () => {
  const ok = S.login(' MK01 ', 'x', DEFAULT_EMPLOYEES);
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.staff.id, ok.staff.name], ['mk01', '宮田 彩']);
  assert.equal(S.login('mk01', '', DEFAULT_EMPLOYEES).ok, false);
  assert.equal(S.login('nope', 'x', DEFAULT_EMPLOYEES).ok, false);
  assert.equal(S.login('st01', 'x', DEFAULT_EMPLOYEES).ok, false); // 店舗スタッフは、マーケティング部に入れない
  assert.equal(S.login('mk01', 'x', setEmployeeActive(DEFAULT_EMPLOYEES, 'mk01', false).employees).ok, false); // 無効な社員は不可
  assert.deepEqual(marketingStaffOf(DEFAULT_EMPLOYEES).map((s) => s.loginId), ['mk01', 'mk02']);
});

test('ログイン状態: タブを閉じるまで保つ。無効になった・名簿にいない人は、ログアウト扱い', () => {
  assert.equal(S.loadSession(DEFAULT_EMPLOYEES), null);
  S.saveSession('mk02');
  assert.equal(S.loadSession(DEFAULT_EMPLOYEES).name, '長谷川 健');
  assert.equal(S.loadSession(setEmployeeActive(DEFAULT_EMPLOYEES, 'mk02', false).employees), null);
  S.clearSession();
  assert.equal(S.loadSession(DEFAULT_EMPLOYEES), null);
});

test('ログイン画面: ID・パスワード・ログインボタン。エラーは出す。デモ用のアカウント一覧つき', () => {
  const html = loginView('IDまたはパスワードが違います', marketingStaffOf(DEFAULT_EMPLOYEES));
  assert.ok(html.includes('マーケティング部') && html.includes('data-login-id') && html.includes('data-login-pw') && html.includes('data-login'));
  assert.ok(html.includes('IDまたはパスワードが違います') && html.includes('mk01') && html.includes('宮田 彩'));
  assert.ok(!loginView('', []).includes('role="alert"'));
});
