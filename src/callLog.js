// 電話の記録（誰が電話しても、お客様から見れば、かかってきた電話は同じ）。鑑定士が、お客様に電話した結果を残し、オペレーターを含む他の人にも見えるようにする。
// 受電履歴（callHistory.js）にまとめて出す。画面から独立した純関数（保存は localStorage）。
export const CALL_LOG_KEY = 'rq-mock-call-log';

export const CALL_RESULTS = {
  appo: '再訪のアポが取れた',
  talked: 'つながった（アポは取れず）',
  noanswer: 'つながらなかった（不在・留守電）',
  ng: '今後の連絡は不要と言われた',
};

const digits = (s) => String(s ?? '').replace(/\D/g, '');
const DAY = 86400000;
export const TOO_SOON_DAYS = 7; // この日数以内に電話していたら、しつこいと思われないよう、注意を出す

// 記録を作る。結果・電話番号・記録した人は必須。再訪のアポが取れたときは、希望日時も必須
export function makeCall({ phone, customerName, by, userId, result, memo, wish, at = Date.now() }) {
  if (digits(phone).length < 10) return { ok: false, reason: '電話番号が正しくありません' };
  if (!(result in CALL_RESULTS)) return { ok: false, reason: '電話の結果を選んでください' };
  if (!String(by ?? '').trim()) return { ok: false, reason: '電話した人が分かりません' };
  if (result === 'appo' && !String(wish ?? '').trim()) return { ok: false, reason: '再訪の希望日時を入力してください' };
  return { ok: true, call: { id: `TC-${at.toString(36).toUpperCase()}-${Math.floor(Math.random() * 1296).toString(36)}`, phone, customerName: String(customerName ?? ''), by: String(by).trim(), userId: userId ?? null, result, memo: String(memo ?? '').trim(), wish: result === 'appo' ? String(wish).trim() : '', at } };
}

export const addCall = (list, call) => [call, ...list];

// 電話番号（複数可。ハイフンの有無は問わない）に当たる記録。新しい順
export function callsOfPhones(list, phones) {
  const mine = new Set(phones.map(digits).filter((d) => d.length >= 10));
  return list.filter((c) => mine.has(digits(c.phone))).sort((a, b) => b.at - a.at);
}
export const lastCallOf = (list, phones) => callsOfPhones(list, phones)[0] ?? null;

export const daysSince = (at, now = new Date()) => Math.max(0, Math.floor((startOfDay(now) - startOfDay(new Date(at))) / DAY));
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const tooSoon = (call, now = new Date()) => Boolean(call) && daysSince(call.at, now) <= TOO_SOON_DAYS;

// 受電履歴に出す1行の説明
export const callNote = (c) => `${CALL_RESULTS[c.result] ?? c.result}${c.wish ? `（希望 ${c.wish}）` : ''}${c.memo ? `：${c.memo}` : ''}`;

export const loadCallLog = () => {
  try { return JSON.parse(localStorage.getItem(CALL_LOG_KEY)) ?? []; } catch { return []; }
};
export const saveCallLog = (list) => {
  try { localStorage.setItem(CALL_LOG_KEY, JSON.stringify(list)); return true; } catch { return false; }
};
