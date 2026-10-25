// 店舗への来店の記録。来店予約（コールセンターが受ける）と飛び込み（予約なし）を、同じ記録で持つ。
// 状態: reserved（予約）→ waiting（来店済み・待ち）→ serving（対応中。担当の店舗スタッフ）→ done（完了）。取消（cancelled）・来ず（noshow）もある。
// 訪問買取の「仮確定・確定・配車」はない（店舗は、お客様が来る側）。操作はすべて新しい配列を返す（now を引数で受ける）。
import { dateKey } from './workday.js';
import { STORE_VISITS_KEY } from './store.js';

export { STORE_VISITS_KEY };

export const STATUS_LABEL = { reserved: '予約', waiting: '待ち', serving: '対応中', done: '完了', cancelled: '取消', noshow: '来ず' };

export const loadStoreVisits = () => {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_VISITS_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export function saveStoreVisits(list) {
  try {
    localStorage.setItem(STORE_VISITS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const newId = (now) => `SV-${now.toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const text = (v) => String(v ?? '').trim();
const fail = (list, reason) => ({ ok: false, list, reason });
const todayOf = (now) => dateKey(new Date(now));
const customerOf = ({ name, kana, phone }) => ({ name: text(name), kana: text(kana), phone: text(phone) });
const replace = (list, id, patch) => list.map((v) => (v.id === id ? { ...v, ...patch } : v));
const validTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

// 来店予約。reason: noStore／noName／noPhone／badDate（今日より前・不正）／badTime
export function reserveVisit(list, { storeId, date, time, name, kana, phone, wants, by }, { storeIds = [], now = Date.now() } = {}) {
  if (!storeIds.includes(storeId)) return fail(list, 'noStore');
  if (!text(name)) return fail(list, 'noName');
  if (!text(phone)) return fail(list, 'noPhone');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(date)) || text(date) < todayOf(now)) return fail(list, 'badDate');
  if (!validTime(text(time))) return fail(list, 'badTime');
  const visit = { id: newId(now), storeId, source: 'reserved', status: 'reserved', date: text(date), time: text(time), customer: customerOf({ name, kana, phone }), wants: text(wants), createdAt: now, createdBy: text(by) };
  return { ok: true, list: [...list, visit], visit };
}

// 飛び込み（予約なしの来店）。お名前だけで受け付け、そのまま「待ち」になる。reason: noStore／noName
export function walkIn(list, { storeId, name, kana, phone, wants, by }, { storeIds = [], now = Date.now() } = {}) {
  if (!storeIds.includes(storeId)) return fail(list, 'noStore');
  if (!text(name)) return fail(list, 'noName');
  const visit = { id: newId(now), storeId, source: 'walkin', status: 'waiting', date: todayOf(now), time: '', customer: customerOf({ name, kana, phone }), wants: text(wants), createdAt: now, createdBy: text(by), arrivedAt: now };
  return { ok: true, list: [...list, visit], visit };
}

// 状態を進める共通の処理。from: 進められる元の状態。reason: notFound／badStatus
function advance(list, id, from, patch) {
  const v = list.find((x) => x.id === id);
  if (!v) return fail(list, 'notFound');
  if (!from.includes(v.status)) return fail(list, 'badStatus');
  return { ok: true, list: replace(list, id, patch(v)) };
}

export const arrive = (list, id, { now = Date.now() } = {}) => advance(list, id, ['reserved'], () => ({ status: 'waiting', arrivedAt: now }));

// 対応の開始。予約のままでも始められる（来店済みの操作を省く）
export const startServing = (list, id, staff, { now = Date.now() } = {}) =>
  advance(list, id, ['reserved', 'waiting'], (v) => ({ status: 'serving', arrivedAt: v.arrivedAt ?? now, staffId: staff.id, staffName: staff.name, startedAt: now }));

// 完了。result: { type: 'purchased', contractId, total, count } または { type: 'declined' }（見送り）
export const completeVisit = (list, id, result, { now = Date.now() } = {}) => advance(list, id, ['serving'], () => ({ status: 'done', endedAt: now, result }));

// 取消（理由つきで記録を残す。予約・待ちのみ）。reason: noReason／notFound／badStatus
export function cancelVisit(list, id, reason, by, { now = Date.now() } = {}) {
  if (!text(reason)) return fail(list, 'noReason');
  return advance(list, id, ['reserved', 'waiting'], () => ({ status: 'cancelled', cancelReason: text(reason), cancelledBy: text(by), cancelledAt: now }));
}

// 来ず（予約の日になった予約だけ）。reason: tooEarly／notFound／badStatus
export function markNoShow(list, id, { now = Date.now() } = {}) {
  const v = list.find((x) => x.id === id);
  if (v?.status === 'reserved' && v.date > todayOf(now)) return fail(list, 'tooEarly');
  return advance(list, id, ['reserved'], () => ({ status: 'noshow', noShowAt: now }));
}

// ---- 一覧・集計 -----------------------------------------------------------------
const byTime = (a, b) => a.time.localeCompare(b.time) || a.createdAt - b.createdAt;
const byArrival = (a, b) => a.arrivedAt - b.arrivedAt;

// 店舗・日ごとの来店を、状態別に並べる。予約は時刻順、待ちは来店順、対応中は開始順、完了は終了の新しい順
export function boardOf(list, storeId, date) {
  const day = list.filter((v) => v.storeId === storeId && v.date === date);
  const of = (s) => day.filter((v) => v.status === s);
  return {
    reserved: of('reserved').sort(byTime),
    waiting: of('waiting').sort(byArrival),
    serving: of('serving').sort((a, b) => a.startedAt - b.startedAt),
    done: of('done').sort((a, b) => b.endedAt - a.endedAt),
    cancelled: [...of('cancelled'), ...of('noshow')],
  };
}

// 今日以降の予約（まだ来店していないもの）を、日付・時刻順に。storeId で絞れる
export const upcomingReservations = (list, today, storeId = '') =>
  list.filter((v) => v.status === 'reserved' && v.date >= today && (!storeId || v.storeId === storeId)).sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));

// 店舗・日ごとの集計。来店 ＝ 来店済み（待ち・対応中・完了）。成約率 ＝ 買取に至った数 ÷ 完了した数。取消・来ずは来店に数えない
export function summaryOf(list, storeId, date) {
  const day = list.filter((v) => v.storeId === storeId && v.date === date);
  const done = day.filter((v) => v.status === 'done');
  const purchased = done.filter((v) => v.result?.type === 'purchased');
  return {
    visits: day.filter((v) => ['waiting', 'serving', 'done'].includes(v.status)).length,
    done: done.length,
    purchased: purchased.length,
    rate: done.length ? purchased.length / done.length : 0,
    total: purchased.reduce((sum, v) => sum + (v.result.total ?? 0), 0),
  };
}
