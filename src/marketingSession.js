// マーケティング部のログイン（モック）。マーケティング担当（マスタ管理の社員）ごとにログインする。
// モックのため、パスワードは空でなければ何でも通る。実装時はサーバー側で認証する。
import { marketingStaffOf } from './employees.js';
import { MARKETING_SESSION_KEY } from './store.js';

export function login(loginId, password, employees) {
  const id = String(loginId ?? '').trim().toLowerCase();
  const staff = marketingStaffOf(employees).find((s) => s.loginId === id);
  if (!staff || !String(password ?? '')) return { ok: false, error: 'IDまたはパスワードが違います' };
  return { ok: true, staff };
}

// ログイン状態は、タブを閉じるまで。無効になった人・名簿にいない人は、ログアウト扱い
export const loadSession = (employees) => {
  try {
    const id = sessionStorage.getItem(MARKETING_SESSION_KEY);
    return marketingStaffOf(employees).find((s) => s.id === id) ?? null;
  } catch {
    return null;
  }
};
export const saveSession = (id) => { try { sessionStorage.setItem(MARKETING_SESSION_KEY, id); } catch { /* ログイン状態を保てないだけ（モック） */ } };
export const clearSession = () => { try { sessionStorage.removeItem(MARKETING_SESSION_KEY); } catch { /* 何もしない */ } };
