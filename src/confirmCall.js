// 前日確認の連絡（訪問の前日に、オペレーターがお客様へ電話する）の記録。画面から独立した純関数。
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

// 受付で聞いた「前日確認の連絡時間」（例「17:00〜19:00」「〜19:00」「指定なし」「未確認」）の、始まりの時刻（分）。
// 時間を指定している人は時刻の順、指定なしと未確認は、そのあとに並べる（rank: 0=時間あり・1=指定なし・2=未確認）
export function contactWindow(r) {
  const text = String(r.hearing?.contact ?? '').trim();
  const [from, to] = text.split('〜').map((x) => x?.trim() ?? '');
  const mins = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const start = mins(from);
  const end = mins(to);
  if (start !== null || end !== null) return { rank: 0, start: start ?? 0, end: end ?? 24 * 60 };
  return { rank: text === '指定なし' ? 1 : 2, start: 0, end: 0 };
}

// 前日確認の電話をかける順（連絡時間の早い順。同じなら訪問の時刻順）
export const sortByContactTime = (list) => [...list].sort((a, b) => {
  const x = contactWindow(a);
  const y = contactWindow(b);
  return x.rank - y.rank || x.start - y.start || x.end - y.end || String(a.start).localeCompare(String(b.start));
});

// まだつながっていない訪問（未連絡・不通）だけ
export const notYetReached = (list) => list.filter((r) => confirmStatus(r).key !== 'reached');
