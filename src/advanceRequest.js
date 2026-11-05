// 補充の依頼: 鑑定士が、経理部に、補充金（買取資金）の振込を頼む。経理部が、振り込む（補充金を入力する）か、却下する。
// 振り込んでも、鑑定士の所持金に入るのは、鑑定士が引き出し金額を登録してから（workday.js）。
import { ADVANCE_REQ_KEY } from './store.js';
import { newId } from './workday.js';
import { post, threadOf, unreadCount, markRead } from './expenseChat.js';

export const REQUEST_STATUS = {
  pending: { label: '依頼中', cls: 'bg-amber-100 text-amber-800' },
  done: { label: '振込済み', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: '却下', cls: 'bg-rose-100 text-rose-700' },
};

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
export const loadRequests = () => readJson(ADVANCE_REQ_KEY, []);
export const saveRequests = (list) => { try { localStorage.setItem(ADVANCE_REQ_KEY, JSON.stringify(list)); return true; } catch { return false; } };

export const blankRequestForm = () => ({ amount: 0, memo: '' });
export const requestReady = (d) => Number(d?.amount) > 0;

export const makeRequest = (userId, d, now = Date.now()) => ({
  id: newId('AR'), userId, amount: d.amount, memo: (d.memo ?? '').trim(), status: 'pending', at: now, decidedAt: null, by: '', reason: '', paidAmount: 0,
});
export const addRequest = (list, r) => [r, ...list];
// 鑑定士が、自分の依頼中の依頼を取り下げる（ほかの鑑定士の依頼・決まった依頼は取り下げられない）
export const withdrawRequest = (list, id, userId) => list.filter((r) => !(r.id === id && r.userId === userId && r.status === 'pending'));
// 経理部が、振り込んだ記録にする（依頼中だけが対象）。振り込んだ金額は、チャットで相談して、依頼と違ってもよい
export const approveRequest = (list, id, { by = '経理部', now = Date.now(), paidAmount } = {}) =>
  list.map((r) => (r.id === id && r.status === 'pending' ? { ...r, status: 'done', paidAmount: paidAmount > 0 ? paidAmount : r.amount, by, decidedAt: now } : r));
// 却下は理由必須（空なら変えない）
export function rejectRequest(list, id, reason, { by = '経理部', now = Date.now() } = {}) {
  if (!reason?.trim()) return list;
  return list.map((r) => (r.id === id && r.status === 'pending' ? { ...r, status: 'rejected', reason: reason.trim(), by, decidedAt: now } : r));
}

export const pendingRequests = (list, userIds = null) => list.filter((r) => r.status === 'pending' && (!userIds || userIds.includes(r.userId))).sort((a, b) => a.at - b.at);
export const requestsOf = (list, userId) => list.filter((r) => r.userId === userId).sort((a, b) => b.at - a.at);

// ---- 依頼ごとのチャット（鑑定士 ⇄ 経理部）。経費精算のチャット（expenseChat.js）と同じ仕組みで、「鑑定士ID」の代わりに 'adv'、「日付」の代わりに依頼のIDで分ける
const ADV = 'adv';
export const advThread = (chats, reqId) => threadOf(chats, ADV, reqId);
export const postAdv = (chats, reqId, msg) => post(chats, ADV, reqId, msg);
export const advUnread = (chats, reqId, who) => unreadCount(chats, ADV, reqId, who);
export const markAdvRead = (chats, reqId, who, now) => markRead(chats, ADV, reqId, who, now);
