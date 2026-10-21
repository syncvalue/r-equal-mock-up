// 営業アプリのログイン（モック）。ID・パスワード → SMS認証コード（2要素認証）。パスワード再設定もSMSコードで本人確認する。
// モックのため、パスワードは平文で保持し、SMSは送らず画面に認証コードを表示する。実装時はサーバー側で、ハッシュ化・SMS送信・試行回数制限を行う。
import { USERS } from './dashboard.js';
import { PASSWORD_KEY, AUTH_FAIL_KEY, SESSION_KEY } from './store.js';

export const DEMO_PASSWORD = 'demo1234';
export const CODE_TTL = 5 * 60 * 1000; // 認証コードの有効期間
export const RESEND_WAIT = 30 * 1000; // 再送までの待ち時間
export const MAX_CODE_TRIES = 3; // コードの入力ミス上限
const MAX_LOGIN_FAILS = 5; // ID・パスワードの入力ミス上限（超えると一定時間ロック）
const LOCK_MS = 60 * 1000;

// ログインID・登録電話番号は、営業ごとに固定のダミー
export const ACCOUNTS = USERS.map((u, i) => ({ userId: u.id, loginId: `sales${String(i + 1).padStart(2, '0')}`, phone: `090-5550-01${String(i + 1).padStart(2, '0')}` }));
export const maskPhone = (p) => p.replace(/^(\d{3})-\d{4}-(\d{4})$/, '$1-****-$2');
export const findAccount = (loginId) => ACCOUNTS.find((a) => a.loginId === String(loginId ?? '').trim().toLowerCase()) ?? null;

const readJson = (store, key, fallback) => {
  try {
    return JSON.parse(store.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

export const passwordOf = (userId) => readJson(localStorage, PASSWORD_KEY, {})[userId] ?? DEMO_PASSWORD;
export const setPassword = (userId, pw) => {
  try {
    localStorage.setItem(PASSWORD_KEY, JSON.stringify({ ...readJson(localStorage, PASSWORD_KEY, {}), [userId]: pw }));
    return true;
  } catch {
    return false;
  }
};

// パスワードの条件: 8文字以上・英字と数字を含む・IDと同じでない
export function passwordProblem(pw, loginId) {
  if (pw.length < 8) return 'パスワードは8文字以上にしてください';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'パスワードには、英字と数字の両方を含めてください';
  if (pw.toLowerCase() === String(loginId).toLowerCase()) return 'パスワードをIDと同じにはできません';
  return '';
}

// ---- 入力ミスによる一時ロック -----------------------------------------------------
const fails = () => readJson(localStorage, AUTH_FAIL_KEY, {});
const saveFails = (v) => { try { localStorage.setItem(AUTH_FAIL_KEY, JSON.stringify(v)); } catch { /* 保存できなくても動作は継続（モック） */ } };
export const lockedUntil = (loginId, now = Date.now()) => { const f = fails()[loginId]; return f?.until > now ? f.until : 0; };
export function recordFail(loginId, now = Date.now()) {
  const all = fails();
  const count = (all[loginId]?.until > now ? 0 : all[loginId]?.count ?? 0) + 1;
  saveFails({ ...all, [loginId]: count >= MAX_LOGIN_FAILS ? { count: 0, until: now + LOCK_MS } : { count, until: 0 } });
}
export function clearFails(loginId) { const { [loginId]: _x, ...rest } = fails(); saveFails(rest); }

// ---- SMS認証コード ---------------------------------------------------------------
export function newCode() {
  const buf = new Uint32Array(1);
  (globalThis.crypto ?? { getRandomValues: (a) => { a[0] = Math.floor(Math.random() * 2 ** 32); return a; } }).getRandomValues(buf);
  return String(buf[0] % 1000000).padStart(6, '0');
}
// userId が null（存在しないID）の場合も、画面上は同じように進める（IDの有無を知られないため）。コードは誰にも届かない
export const issueCode = (userId, purpose, now = Date.now()) => ({ userId, purpose, code: newCode(), sentAt: now, expires: now + CODE_TTL, tries: 0 });

// 'ok' | 'wrong' | 'expired' | 'locked'
export function checkCode(pending, input, now = Date.now()) {
  if (!pending || pending.tries >= MAX_CODE_TRIES) return 'locked';
  if (now > pending.expires) return 'expired';
  return pending.userId && input === pending.code ? 'ok' : 'wrong';
}

// ---- ログイン状態（タブを閉じるまで） ---------------------------------------------
export const loadSession = () => { try { const id = sessionStorage.getItem(SESSION_KEY); return USERS.some((u) => u.id === id) ? id : null; } catch { return null; } };
export const saveSession = (userId) => { try { sessionStorage.setItem(SESSION_KEY, userId); } catch { /* ログイン状態を保てないだけ（モック） */ } };
export const clearSession = () => { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* 何もしない */ } };
