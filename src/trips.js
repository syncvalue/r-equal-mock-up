// 出張のマスタ。営業所のないエリアへ、期間を決めて出張する営業（出張メンバー）と、そのエリア（担当の都道府県）。操作はすべて新しい配列を返す。
// 出張メンバーの本来の営業所は変えない。期間中だけ、出張エリアの候補にも加わる（配車・エリア判定は src/dispatch.js の extraAreas で受け取る）。
import { AREAS, PREFS } from './dispatch.js';
import { USERS } from './dashboard.js';

export const TRIPS_KEY = 'rq-mock-trips';

// 都道府県の代用座標（地図・距離の概算用。県庁所在地のおおよその位置）
const PREF_CENTER = {
  北海道: [43.06, 141.35], 青森県: [40.82, 140.74], 岩手県: [39.7, 141.15], 宮城県: [38.27, 140.87], 秋田県: [39.72, 140.1], 山形県: [38.24, 140.36], 福島県: [37.75, 140.47],
  茨城県: [36.34, 140.45], 栃木県: [36.57, 139.88], 群馬県: [36.39, 139.06], 埼玉県: [35.86, 139.65], 千葉県: [35.6, 140.12], 東京都: [35.68, 139.76], 神奈川県: [35.45, 139.64],
  新潟県: [37.9, 139.02], 富山県: [36.7, 137.21], 石川県: [36.59, 136.63], 福井県: [36.07, 136.22], 山梨県: [35.66, 138.57], 長野県: [36.65, 138.18], 岐阜県: [35.39, 136.72],
  静岡県: [34.98, 138.38], 愛知県: [35.18, 136.91], 三重県: [34.73, 136.51], 滋賀県: [35.0, 135.87], 京都府: [35.02, 135.76], 大阪府: [34.69, 135.52], 兵庫県: [34.69, 135.18],
  奈良県: [34.69, 135.83], 和歌山県: [34.23, 135.17], 鳥取県: [35.5, 134.24], 島根県: [35.47, 133.05], 岡山県: [34.66, 133.93], 広島県: [34.4, 132.46], 山口県: [34.19, 131.47],
  徳島県: [34.07, 134.56], 香川県: [34.34, 134.04], 愛媛県: [33.84, 132.77], 高知県: [33.56, 133.53], 福岡県: [33.61, 130.42], 佐賀県: [33.25, 130.3], 長崎県: [32.74, 129.87],
  熊本県: [32.79, 130.74], 大分県: [33.24, 131.61], 宮崎県: [31.91, 131.42], 鹿児島県: [31.56, 130.56], 沖縄県: [26.21, 127.68],
};
const OFFICE_PREFS = new Set(AREAS.flatMap((a) => a.prefs));

const isValid = (v) => Array.isArray(v) && v.length > 0 && v.every((t) => t && t.id && t.name && Array.isArray(t.prefs) && Array.isArray(t.memberIds));

// 初期値（ダミー）。今日を基準に、出張中・これから・終了の3つ。営業所のないエリアへの出張
export function sampleTrips(now = new Date(), userIds = []) {
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const at = (n) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
  const pick = (from, n) => userIds.slice(from, from + n);
  return [
    { id: 'T-SAMPLE1', name: '福岡出張', prefs: ['福岡県', '佐賀県'], start: at(-2), end: at(4), memberIds: pick(0, 2), active: true },
    { id: 'T-SAMPLE2', name: '四国出張', prefs: ['香川県', '愛媛県'], start: at(10), end: at(16), memberIds: pick(2, 2), active: true },
    { id: 'T-SAMPLE3', name: '北海道出張', prefs: ['北海道'], start: at(-20), end: at(-14), memberIds: pick(4, 2), active: true },
  ];
}

// 画面で使う出張。保存がなければ、今日を基準にした見本（営業の ID は USERS から）
export const loadCurrentTrips = (now = new Date()) => loadTrips(now, USERS.map((u) => u.id));

// 保存がなければ、now があるときだけ見本（now なし＝空）
export function loadTrips(now = null, userIds = []) {
  try {
    const saved = JSON.parse(localStorage.getItem(TRIPS_KEY));
    if (isValid(saved)) return saved;
  } catch { /* 保存が壊れていれば、保存がないものとして扱う */ }
  return now ? sampleTrips(now, userIds) : [];
}

export function saveTrips(list) {
  try {
    localStorage.setItem(TRIPS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const newId = () => `T-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const fail = (trips, reason) => ({ ok: false, trips, reason });
const toList = (v) => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(/[,、\s　]+/)).map((x) => String(x).trim()).filter(Boolean))];
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''));

// 登録・更新（id があれば更新）。userIds: 出張メンバーに選べる営業の ID。
// reason: notFound／noName／dupName／noPref／badPref／inOffice／badPeriod／noMember／badMember
export function saveTrip(trips, { id, name, prefs, start, end, memberIds }, { userIds = [] } = {}) {
  const old = id ? trips.find((t) => t.id === id) : null;
  if (id && !old) return fail(trips, 'notFound');
  const n = String(name ?? '').trim();
  if (!n) return fail(trips, 'noName');
  if (trips.some((t) => t.name === n && t.id !== id)) return fail(trips, 'dupName');
  const list = toList(prefs);
  if (!list.length) return fail(trips, 'noPref');
  if (list.some((p) => !PREFS.includes(p))) return fail(trips, 'badPref');
  if (list.some((p) => OFFICE_PREFS.has(p))) return fail(trips, 'inOffice');
  if (!isYmd(start) || !isYmd(end) || end < start) return fail(trips, 'badPeriod');
  const members = toList(memberIds);
  if (!members.length) return fail(trips, 'noMember');
  if (members.some((m) => !userIds.includes(m))) return fail(trips, 'badMember');
  const item = { id: id ?? newId(), name: n, prefs: list, start, end, memberIds: members, active: old?.active ?? true };
  return { ok: true, trips: old ? trips.map((t) => (t.id === id ? item : t)) : [...trips, item] };
}

export function setTripActive(trips, id, active) {
  if (!trips.some((t) => t.id === id)) return fail(trips, 'notFound');
  return { ok: true, trips: trips.map((t) => (t.id === id ? { ...t, active } : t)) };
}

// その日（YYYY-MM-DD。期間の両端を含む）に行われる、有効な出張
export const tripsOn = (trips, date) => trips.filter((t) => t.active && t.start <= date && date <= t.end);

// その日に、その営業が出張メンバーである出張
export const tripsOfUser = (trips, userId, date) => tripsOn(trips, date).filter((t) => t.memberIds.includes(userId));

// 営業所のエリア（AREAS）と同じ形の出張エリア。date があればその日の有効な出張だけ、なければ出張すべて（過去の受付の表示用）
export function tripAreas(trips, date = null) {
  const list = date ? tripsOn(trips, date) : trips;
  return list.map((t) => {
    const [lat, lng] = PREF_CENTER[t.prefs[0]] ?? [35.68, 139.76];
    return { id: `trip:${t.id}`, name: t.name, prefs: t.prefs, memberIds: t.memberIds, trip: true, start: t.start, end: t.end, lat, lng };
  });
}

// 日付（YYYY-MM-DD）から見た出張の状態: ongoing（出張中）／upcoming（これから）／ended（終了）／inactive（無効）
export const tripStatus = (trip, date) => (!trip.active ? 'inactive' : date < trip.start ? 'upcoming' : date > trip.end ? 'ended' : 'ongoing');
