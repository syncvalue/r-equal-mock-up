// 倉庫・物流の担当者とログイン（モック）。担当者ごとにログインし、入庫・販売などの操作を誰がしたかを記録する。
// モックのため、パスワードは空でなければ何でも通る。実装時はサーバー側で認証する。
export const STAFF_SESSION_KEY = 'rq-mock-wh-session';

export const STAFF = [
  { id: 'wh01', loginId: 'wh01', name: '小川 直樹' },
  { id: 'wh02', loginId: 'wh02', name: '中島 里奈' },
  { id: 'wh03', loginId: 'wh03', name: '山本 大地' },
  { id: 'wh04', loginId: 'wh04', name: '藤田 結衣' },
];

export const findStaff = (loginId) => STAFF.find((s) => s.loginId === String(loginId ?? '').trim().toLowerCase()) ?? null;

export function login(loginId, password) {
  const staff = findStaff(loginId);
  if (!staff || !String(password ?? '')) return { ok: false, error: 'IDまたはパスワードが違います' };
  return { ok: true, staff };
}

export const loadSession = () => {
  try {
    return STAFF.find((s) => s.id === sessionStorage.getItem(STAFF_SESSION_KEY)) ?? null;
  } catch {
    return null;
  }
};
export const saveSession = (id) => { try { sessionStorage.setItem(STAFF_SESSION_KEY, id); } catch { /* ログイン状態を保てないだけ（モック） */ } };
export const clearSession = () => { try { sessionStorage.removeItem(STAFF_SESSION_KEY); } catch { /* 何もしない */ } };
