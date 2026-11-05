// 経費精算のやり取り（経理部 ⇄ 鑑定士のチャット）。日ごと・鑑定士ごとに1つ。差戻し・チェック済みなどの記録（kind）も、やり取りの中に残す。
import { CHAT_KEY } from './store.js';

const keyOf = (userId, date) => `${userId}:${date}`;
const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
export const loadChats = () => readJson(CHAT_KEY, {});
export const saveChats = (c) => { try { localStorage.setItem(CHAT_KEY, JSON.stringify(c)); return true; } catch { return false; } };

export const blankThread = () => ({ messages: [], accountingReadAt: 0, salesReadAt: 0 });
export const threadOf = (chats, userId, date) => chats[keyOf(userId, date)] ?? blankThread();

// 発言を足した新しいやり取りを返す。from: 'accounting'（経理部）| 'sales'（鑑定士）。kind: ''（普通の発言）| 'returned' | 'ok' | 'revised'（記録）
export function post(chats, userId, date, { from, text, by = '', kind = '', now = Date.now() }) {
  if (!text?.trim()) return chats;
  const t = threadOf(chats, userId, date);
  const msg = { id: `${keyOf(userId, date)}-${t.messages.length}`, from, by, text: text.trim(), kind, at: now };
  return { ...chats, [keyOf(userId, date)]: { ...t, messages: [...t.messages, msg] } };
}

// who（'accounting' | 'sales'）が、まだ読んでいない、相手の発言の数
export function unreadCount(chats, userId, date, who) {
  const t = threadOf(chats, userId, date);
  return t.messages.filter((m) => m.from !== who && m.at > (t[`${who}ReadAt`] ?? 0)).length;
}
// 読んだことにする（未読がなければ、そのまま返す）
export function markRead(chats, userId, date, who, now = Date.now()) {
  if (!unreadCount(chats, userId, date, who)) return chats;
  const t = threadOf(chats, userId, date);
  return { ...chats, [keyOf(userId, date)]: { ...t, [`${who}ReadAt`]: Math.max(now, ...t.messages.map((m) => m.at)) } };
}
