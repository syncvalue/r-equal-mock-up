// 前日確認の連絡（訪問の前日に、オペレーターがお客様へ電話する）の記録と、訪問カレンダーの集計。画面から独立した純関数。
// 記録は、受付の記録（reservations.js）の confirmCalls に、連絡ごとに足していく（不通のあとの再連絡も、すべて残す）。
export const CALL_RESULTS = { reached: 'つながった', noanswer: 'つながらなかった' };

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (date, n) => { const [y, m, d] = date.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)); };

export const confirmDateOf = (visitDate) => shift(visitDate, -1);

const isLive = (r) => r.status !== 'cancelled';

// 連絡の記録を足す。元の記録は変えず、保存する項目（confirmCalls）を返す。結果と記録した人は必須、お客様から告げられたこと（メモ）は任意
export function addConfirmCall(r, { result, memo, by, at }) {
  if (!isLive(r)) return { ok: false, reason: '取消した受付には記録できません' };
  if (!(result in CALL_RESULTS)) return { ok: false, reason: '連絡の結果を選んでください' };
  if (!String(by ?? '').trim()) return { ok: false, reason: '記録するオペレーターを選んでください' };
  const call = { result, memo: String(memo ?? '').trim(), by: String(by).trim(), at: (at ?? new Date()).getTime() };
  return { ok: true, fields: { confirmCalls: [...(r.confirmCalls ?? []), call] } };
}

// 前日確認の状態。一度でもつながれば連絡済み（そのあとの不通があっても）
export function confirmStatus(r) {
  const calls = r.confirmCalls ?? [];
  const last = calls.at(-1) ?? null;
  if (calls.some((c) => c.result === 'reached')) return { key: 'reached', label: '連絡済み', count: calls.length, last };
  if (calls.length) return { key: 'noanswer', label: `不通 ${calls.length}回`, count: calls.length, last };
  return { key: 'none', label: '未連絡', count: 0, last };
}

// 今日が前日確認の日（＝訪問が明日）で、まだつながっていない訪問
export const confirmPending = (list, today) => list.filter((r) => isLive(r) && confirmDateOf(r.date) === today && confirmStatus(r).key !== 'reached');

// 月の表（日曜はじまり）。日ごとの件数（取消は除く）・仮確定の件数・前日確認が未の件数。前後の月の日も、週を埋めるために含める
export function monthCells(ym, list, today) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const start = shift(ymd(first), -first.getDay());
  const lastDay = new Date(y, m, 0);
  const total = Math.ceil((first.getDay() + lastDay.getDate()) / 7) * 7;
  const live = list.filter(isLive);
  const pending = new Set(confirmPending(list, today).map((r) => r.id));
  return Array.from({ length: total / 7 }, (_, w) => Array.from({ length: 7 }, (_, i) => {
    const date = shift(start, w * 7 + i);
    const day = live.filter((r) => r.date === date);
    return { date, inMonth: date.startsWith(ym), today: date === today, count: day.length, tentative: day.filter((r) => r.status === 'tentative').length, pending: day.filter((r) => pending.has(r.id)).length };
  }));
}
