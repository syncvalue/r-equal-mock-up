// 倉庫・物流のログイン（モック）。担当者（倉庫マスタ）ごとにログインし、入庫・出品・売却などの操作を誰がしたかを記録する。
// モックのため、パスワードは空でなければ何でも通る。実装時はサーバー側で認証する。
import { loadMaster, findStaff } from './warehouseMaster.js';

export const STAFF_SESSION_KEY = 'rq-mock-wh-session';

export function login(loginId, password, master = loadMaster()) {
  const staff = findStaff(master, loginId);
  if (!staff || !String(password ?? '')) return { ok: false, error: 'IDまたはパスワードが違います' };
  return { ok: true, staff };
}

// ログイン状態は、タブを閉じるまで。無効になった担当者・マスタにいない担当者は、ログアウト扱い
export const loadSession = (master = loadMaster()) => {
  try {
    const id = sessionStorage.getItem(STAFF_SESSION_KEY);
    return master.staff.find((s) => s.active && s.id === id) ?? null;
  } catch {
    return null;
  }
};
export const saveSession = (id) => { try { sessionStorage.setItem(STAFF_SESSION_KEY, id); } catch { /* ログイン状態を保てないだけ（モック） */ } };
export const clearSession = () => { try { sessionStorage.removeItem(STAFF_SESSION_KEY); } catch { /* 何もしない */ } };
