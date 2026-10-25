// 店舗のログイン（モック）。店舗スタッフ（マスタ管理の社員）ごとにログインし、受付・買取を誰がしたかを記録する。
// モックのため、パスワードは空でなければ何でも通る。実装時はサーバー側で認証する。
import { storeStaffOf } from './employees.js';
import { STORE_SESSION_KEY } from './store.js';

export function login(loginId, password, employees) {
  const id = String(loginId ?? '').trim().toLowerCase();
  const staff = storeStaffOf(employees).find((s) => s.loginId === id);
  if (!staff || !String(password ?? '')) return { ok: false, error: 'IDまたはパスワードが違います' };
  return { ok: true, staff };
}

// ログイン状態は、タブを閉じるまで。無効になった店舗スタッフ・名簿にいない店舗スタッフは、ログアウト扱い
export const loadSession = (employees) => {
  try {
    const id = sessionStorage.getItem(STORE_SESSION_KEY);
    return storeStaffOf(employees).find((s) => s.id === id) ?? null;
  } catch {
    return null;
  }
};
export const saveSession = (id) => { try { sessionStorage.setItem(STORE_SESSION_KEY, id); } catch { /* ログイン状態を保てないだけ（モック） */ } };
export const clearSession = () => { try { sessionStorage.removeItem(STORE_SESSION_KEY); } catch { /* 何もしない */ } };
