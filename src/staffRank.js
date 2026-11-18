// 鑑定士のランク（SS・S・A・B）の変更と、変遷。ランクは、変わっていくもの。変更のたびに、ランク・いつ・誰が、を足していく（消さない）。
// 変更していない鑑定士は、dispatch.js の見本（固定値）のランク。マスタ管理の社員の画面から変更する。画面から独立した純関数
export const RANK_VALUES = ['SS', 'S', 'A', 'B'];
export const STAFF_RANK_KEY = 'rq-mock-staff-ranks';

const loadAll = () => {
  if (typeof localStorage === 'undefined') return {}; // 画面のない環境（テストなど）では、見本のまま
  try {
    const v = JSON.parse(localStorage.getItem(STAFF_RANK_KEY));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
};

export const staffRankHistory = (userId) => loadAll()[userId] ?? [];
export const currentStaffRank = (userId) => staffRankHistory(userId).at(-1)?.rank ?? null;

// 変更する。base＝変更前の（見本の）ランク。最初の変更のときに、「初期値」として履歴の先頭に残す
export function setStaffRank(userId, rank, { by, now = Date.now(), base = null } = {}) {
  if (!RANK_VALUES.includes(rank)) return { ok: false, reason: 'ランクを選んでください' };
  if (!String(by ?? '').trim()) return { ok: false, reason: '変更する人が分かりません' };
  const all = loadAll();
  const history = all[userId] ?? (RANK_VALUES.includes(base) ? [{ rank: base, at: null, by: '' }] : []);
  if ((history.at(-1)?.rank ?? base) === rank) return { ok: false, reason: 'いまと同じランクです' };
  all[userId] = [...history, { rank, at: now, by: String(by).trim() }];
  localStorage.setItem(STAFF_RANK_KEY, JSON.stringify(all));
  return { ok: true };
}

export const clearStaffRanks = () => { if (typeof localStorage !== 'undefined') localStorage.removeItem(STAFF_RANK_KEY); };

// 変遷の文（新しい順）。例「A（11/18） ← SS（10/1） ← S（初期値）」。変更がなければ空
export function staffRankHistoryText(userId) {
  const h = staffRankHistory(userId);
  if (h.length < 2) return '';
  const md = (ms) => (ms == null ? '初期値' : `${new Date(ms).getMonth() + 1}/${new Date(ms).getDate()}`);
  return [...h].reverse().map((x) => `${x.rank}（${md(x.at)}）`).join(' ← ');
}
