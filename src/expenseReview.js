// 経費精算: 鑑定士の経費（レシート付き）を確認し、精算する・差戻すを決める。買取代金は経費ではないので対象外。
import { REVIEW_KEY } from './store.js';
import { PURCHASE_TYPE, dateKey } from './workday.js';
import { HIGH_EXPENSE } from './accounting.js';

export const REVIEW_STATUS = {
  pending: { label: '未確認', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: '精算済み', cls: 'bg-emerald-100 text-emerald-800' },
  returned: { label: '差戻し', cls: 'bg-rose-100 text-rose-700' },
};

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
export const loadReviews = () => readJson(REVIEW_KEY, {});
export const saveReviews = (r) => { try { localStorage.setItem(REVIEW_KEY, JSON.stringify(r)); return true; } catch { return false; } };

// 確認のポイント（領収書がない・高額・「その他」）
export function claimFlags(e) {
  const flags = [];
  if (!e.photo && !e.proxy) flags.push({ level: 'danger', text: '領収書の写真がない' });
  if (e.amount >= HIGH_EXPENSE) flags.push({ level: 'warn', text: '高額（1万円以上）' });
  if (e.type === 'other') flags.push({ level: 'info', text: '用途が「その他」' });
  if (!e.memo?.trim()) flags.push({ level: 'warn', text: '内容の記入がない' });
  return flags;
}

// 鑑定士の1日の記録から、経費の一覧（精算の対象）を作る。新しい順
export function claimsFrom(days, reviews) {
  return days.flatMap((d) => (d.expenses ?? []).filter((e) => e.type !== PURCHASE_TYPE.key).map((e) => {
    const r = reviews[e.id] ?? null;
    return { ...e, userId: d.userId, date: d.date, status: r?.status ?? 'pending', review: r, flags: claimFlags(e) };
  })).sort((a, b) => b.at - a.at);
}

export const claimCounts = (claims) => ({
  pending: claims.filter((c) => c.status === 'pending').length,
  approved: claims.filter((c) => c.status === 'approved').length,
  returned: claims.filter((c) => c.status === 'returned').length,
  pendingAmount: claims.filter((c) => c.status === 'pending').reduce((n, c) => n + c.amount, 0),
  approvedAmount: claims.filter((c) => c.status === 'approved').reduce((n, c) => n + c.amount, 0),
});

// 精算する・差戻す・未確認に戻す（新しい確認結果を返す）。差戻しは理由必須（空なら変えない）
export const approve = (reviews, id, { by = '経理部', now = Date.now() } = {}) => ({ ...reviews, [id]: { status: 'approved', reason: '', by, at: now, date: dateKey(new Date(now)) } });
export function returnClaim(reviews, id, reason, { by = '経理部', now = Date.now() } = {}) {
  if (!reason?.trim()) return reviews;
  return { ...reviews, [id]: { status: 'returned', reason: reason.trim(), by, at: now, date: dateKey(new Date(now)) } };
}
export const reopen = (reviews, id) => Object.fromEntries(Object.entries(reviews).filter(([k]) => k !== id));
// 領収書のない経費は、そのままでは精算しない（差戻すか、理由を確認してから）
export const canApprove = (claim) => Boolean(claim.photo || claim.proxy);
