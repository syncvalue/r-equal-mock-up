// 顧客検索の、お気に入りと自分用のメモ。鑑定士ごとに分かれる（ほかの人には見えない）。画面から独立した純関数（保存は localStorage）。
// 形: { 鑑定士ID: { 電話番号（数字のみ）: { favorite, memo } } }
export const CUST_NOTES_KEY = 'rq-mock-cust-notes';

const digits = (s) => String(s ?? '').replace(/\D/g, '');

export const notesOf = (all, userId) => all[userId] ?? {};

// お気に入りでなく、メモも空なら、記録ごと消す
const put = (all, userId, phone, patch) => {
  const key = digits(phone);
  const cur = { favorite: false, memo: '', ...(all[userId]?.[key] ?? {}), ...patch };
  const mine = { ...(all[userId] ?? {}) };
  if (cur.favorite || cur.memo) mine[key] = cur; else delete mine[key];
  return { ...all, [userId]: mine };
};
export const setFavorite = (all, userId, phone, favorite) => put(all, userId, phone, { favorite: Boolean(favorite) });
export const setMemo = (all, userId, phone, memo) => put(all, userId, phone, { memo: String(memo ?? '').trim() });
export const favoriteCount = (all, userId) => Object.values(notesOf(all, userId)).filter((n) => n.favorite).length;

export const loadCustNotes = () => {
  try { return JSON.parse(localStorage.getItem(CUST_NOTES_KEY)) ?? {}; } catch { return {}; }
};
export const saveCustNotes = (all) => {
  try { localStorage.setItem(CUST_NOTES_KEY, JSON.stringify(all)); return true; } catch { return false; }
};
