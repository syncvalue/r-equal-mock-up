// 補充の依頼: 鑑定士が、経理部に、補充金の振込を頼む。経理部とは、依頼ごとのチャットで、やり取りする。
// 実際の振込は、銀行システムで行うので、このシステムは、振込の金額・結果を扱わない。やり取りが終わったかどうか（やり取り中／完了）だけを管理する。
// 完了にできるのは、依頼を出した鑑定士（振り込まれても、却下されても、完了）。補充金の入力（経理部）は、残高・入出金管理で、別に行う。
import { ADVANCE_REQ_KEY } from './store.js';
import { newId } from './workday.js';
import { post, threadOf, unreadCount, markRead } from './expenseChat.js';

export const REQUEST_STATUS = {
  open: { label: 'やり取り中', cls: 'bg-amber-100 text-amber-800' },
  closed: { label: '完了', cls: 'bg-emerald-100 text-emerald-800' },
};

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
// 昔の状態名（依頼中・振込済み・却下）は、やり取り中・完了として読む
const normalize = (r) => ({ ...r, status: r.status === 'pending' || r.status === 'open' ? 'open' : 'closed' });
export const loadRequests = () => readJson(ADVANCE_REQ_KEY, []).map(normalize);
export const saveRequests = (list) => { try { localStorage.setItem(ADVANCE_REQ_KEY, JSON.stringify(list)); return true; } catch { return false; } };

export const blankRequestForm = () => ({ amount: 0, memo: '' });
export const requestReady = (d) => Number(d?.amount) > 0;

export const makeRequest = (userId, d, now = Date.now()) => ({
  id: newId('AR'), userId, amount: d.amount, memo: (d.memo ?? '').trim(), status: 'open', at: now, closedAt: null,
});
export const addRequest = (list, r) => [r, ...list];
// 完了にする。依頼を出した鑑定士だけができる（ほかの人・完了済みの依頼は、そのまま）
export const closeRequest = (list, id, userId, { now = Date.now() } = {}) => {
  const target = list.find((r) => r.id === id);
  if (!target || target.userId !== userId || target.status !== 'open') return list;
  return list.map((r) => (r.id === id ? { ...r, status: 'closed', closedAt: now } : r));
};

export const openRequests = (list, userIds = null) => list.filter((r) => r.status === 'open' && (!userIds || userIds.includes(r.userId))).sort((a, b) => a.at - b.at);
export const requestsOf = (list, userId) => list.filter((r) => r.userId === userId).sort((a, b) => b.at - a.at);

// ボール: 完了した依頼は、誰も持たない。経理部が最後に話した（鑑定士の返信・完了待ち）なら鑑定士、それ以外（鑑定士の発言・まだ発言なし）なら経理部
export function requestBall(request, thread) {
  if (request.status !== 'open') return null;
  const last = thread.messages.filter((m) => !m.kind).at(-1);
  return last?.from === 'accounting' ? 'sales' : 'accounting';
}
// 経理部の番（対応待ち）の依頼。メニュー・ヘッダーの件数に使う
export const accountingTurn = (list, chats, userIds = null) => openRequests(list, userIds).filter((r) => requestBall(r, threadOf(chats, 'adv', r.id)) === 'accounting');

// ---- 依頼ごとのチャット（鑑定士 ⇄ 経理部）。経費精算のチャット（expenseChat.js）と同じ仕組みで、「鑑定士ID」の代わりに 'adv'、「日付」の代わりに依頼のIDで分ける
const ADV = 'adv';
export const advThread = (chats, reqId) => threadOf(chats, ADV, reqId);
export const postAdv = (chats, reqId, msg) => post(chats, ADV, reqId, msg);
export const advUnread = (chats, reqId, who) => unreadCount(chats, ADV, reqId, who);
export const markAdvRead = (chats, reqId, who, now) => markRead(chats, ADV, reqId, who, now);
