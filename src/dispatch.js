// コールセンターの配車ロジック（画面に依存しない純関数）。
// 訪問先の住所 → 担当エリア → そのエリアの営業のうち、希望日時に空いている人 → 女性のお客様の担当が偏らないように選ぶ。
import { USERS, stats, monthProgress, rangeOf } from './dashboard.js';
import { EVENTS, toMin } from './schedule.js';
import { dayOffset, minToHHMM, ymdOf } from './reservations.js';

// ---- エリア ----------------------------------------------------------------------
// 訪問先の都道府県ごとに、担当エリアが決まっている。一覧にない都道府県は「対応エリア外」。lat/lng は、予定の地図表示用の代用座標
export const AREAS = [
  { id: 'osaka', name: '大阪エリア', prefs: ['大阪府', '奈良県', '和歌山県'], lat: 34.6937, lng: 135.5023 },
  { id: 'hyogo', name: '兵庫・京都エリア', prefs: ['兵庫県', '京都府', '滋賀県'], lat: 34.6913, lng: 135.183 },
  { id: 'kanto', name: '関東エリア', prefs: ['東京都', '神奈川県', '埼玉県', '千葉県', '茨城県', '栃木県', '群馬県'], lat: 35.6812, lng: 139.7671 },
  { id: 'tokai', name: '東海エリア', prefs: ['愛知県', '岐阜県', '三重県', '静岡県'], lat: 35.1815, lng: 136.9066 },
];
export const areaById = (id) => AREAS.find((a) => a.id === id) ?? null;

// 営業の担当エリア（ダミー）
const USER_AREA = { u01: 'osaka', u02: 'osaka', u03: 'osaka', u06: 'hyogo', u07: 'hyogo', u04: 'kanto', u05: 'kanto', u08: 'tokai', u09: 'osaka', u10: 'tokai', u11: 'osaka', u12: 'osaka', u13: 'osaka', u14: 'osaka', u15: 'osaka', u16: 'osaka' };
export const areaOfUser = (userId) => USER_AREA[userId] ?? null;

const PREFS = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県',
  '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県',
  '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

// 住所の都道府県から判定。判定できなければ null、担当のない都道府県なら { id: null, outside: true }
export function areaOfAddress(address) {
  const pref = PREFS.find((p) => String(address ?? '').includes(p));
  if (!pref) return null;
  const area = AREAS.find((a) => a.prefs.includes(pref));
  return area ? { ...area, pref } : { id: null, outside: true, pref };
}

// ---- 営業時間・空き ------------------------------------------------------------------
export const WORK_START = 9 * 60;
export const WORK_END = 19 * 60;
export const SLOT_STEP = 30;
export const TRAVEL_BUFFER = 30; // 訪問と訪問の間に必要な移動時間（分）
export const DURATIONS = [60, 90, 120];

const hash = (str) => {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000;
};

// ---- 営業のランク ------------------------------------------------------------------
// 営業ごとのランク（ダミー。S が最上位）
const USER_RANK = { u01: 'B', u02: 'S', u03: 'A', u04: 'C', u05: 'B', u06: 'S', u07: 'B', u08: 'C', u09: 'A', u10: 'B', u11: 'A', u12: 'B', u13: 'C', u14: 'B', u15: 'A', u16: 'C' };
export const RANKS = ['S', 'A', 'B', 'C'];
export const rankOfUser = (userId) => USER_RANK[userId] ?? null;

// ---- 出勤状況 ------------------------------------------------------------------------
// 全員が出勤しているとは限らない。欠勤の営業は、担当に選べない（ダミー: 営業×日付で決まる。予定の入っている日は出勤）
export function isAbsent(userId, date, now = new Date()) {
  const day = dayOffset(date, now);
  if (EVENTS.some((e) => e.userId === userId && e.day === day)) return false;
  return mixedRandom(`${userId}/${date}/欠勤`)() < 0.12;
}

// ---- 位置と移動距離（概算） ----------------------------------------------------------------
// 住所の座標は、モックのため、エリアの中心から住所の文字で決まる位置（約10km圏内）で代用する。本番は、Googleマップの住所検索で座標を取得する
const AVG_SPEED_KMH = 25; // 市街地の移動の目安

export function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// 文字列から決まる乱数（文字が少し違うだけの住所でも、別の場所になるように、よく混ぜる）
function mixedRandom(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const c of str) {
    const k = c.codePointAt(0);
    h1 = Math.imul(h1 ^ k, 2654435761);
    h2 = Math.imul(h2 ^ k, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  let a = (h1 ^ h2) >>> 0;
  return () => { // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function locateAddress(address, area) {
  const text = String(address ?? '').trim();
  if (!text || !area) return null;
  const rnd = mixedRandom(text);
  return { lat: area.lat + (rnd() - 0.5) * 0.18, lng: area.lng + (rnd() - 0.5) * 0.22 };
}

// 直前・直後の予定から、今回のお客様の住所までの距離。直前・直後の予定がなければ、その側は null。km は小数1桁、min は移動時間の目安（分）
export function travelAround(blocks, start, end, here) {
  if (!here) return null;
  const leg = (from, label, at) => {
    if (!from || from.lat == null) return null;
    const km = Math.round(haversineKm(from, here) * 10) / 10;
    return { label, at, km, min: Math.round((km * 60) / AVG_SPEED_KMH) };
  };
  const before = [...blocks].filter((b) => b.end <= start).sort((a, b) => b.end - a.end)[0];
  const after = blocks.find((b) => b.start >= end);
  return {
    prev: before ? leg(before, before.label, before.end) : null, // 直前のアポがなければ、距離は出さない（営業所からの距離は見ない）
    next: after ? leg(after, after.label, after.start) : null,
  };
}

// ダミーの他の訪問のお客様名と住所（エリアごと）。日別の表示で、予定のお客様と住所が分かるように
const DUMMY_NAMES = ['岡田 恵子', '石川 正一', '村上 久美', '前田 隆', '藤田 直子', '近藤 浩二', '長谷川 淳', '清水 明美'];
const DUMMY_ADDRESS = {
  osaka: ['大阪府大阪市中央区難波3-1-5', '大阪府堺市堺区南瓦町1-1', '大阪府豊中市本町2-3-4', '大阪府東大阪市長堂1-6-8'],
  hyogo: ['兵庫県神戸市中央区三宮町1-2-3', '京都府京都市下京区四条通3-4', '兵庫県西宮市池田町2-5', '滋賀県大津市浜大津1-3'],
  kanto: ['東京都新宿区西新宿2-8-1', '神奈川県横浜市西区みなとみらい3-1', '埼玉県さいたま市大宮区桜木町1-2', '千葉県千葉市中央区中央3-4'],
  tokai: ['愛知県名古屋市中村区名駅1-1', '愛知県豊田市西町3-5', '静岡県浜松市中区砂山町2-1', '岐阜県岐阜市橋本町1-10'],
};

// 予定のない日は、営業ごとに日付で決まる「他の訪問」（ダミー）を入れて、空き状況が見本になるようにする
// 予定が入っていない営業（入社間もなく、まだ訪問が少ない想定）。「前のアポなし（営業所から）」の例として、常に空く
const LIGHT_SCHEDULE = new Set(['u09']);

function fillerBlocks(userId, date) {
  if (LIGHT_SCHEDULE.has(userId)) return [];
  const rnd = hash(`${userId}/${date}`);
  const blocks = [];
  for (let i = 0, n = Math.floor(rnd() * 3); i < n; i += 1) {
    const start = 570 + Math.floor(rnd() * 14) * SLOT_STEP;
    const end = start + (rnd() < 0.5 ? 60 : 90);
    if (!blocks.some((b) => start < b.end + TRAVEL_BUFFER && b.start < end + TRAVEL_BUFFER)) {
      const areaId = areaOfUser(userId);
      const pick = Math.floor(hash(`${userId}/${date}/${start}/客`)() * 100); // 空き状況の乱数列を変えないよう、別の乱数で決める
      blocks.push({
        start, end, label: `${DUMMY_NAMES[pick % DUMMY_NAMES.length]} 様`, source: 'dummy',
        ...locateAddress(`${userId}/${date}/${start}`, areaById(areaId)), place: (DUMMY_ADDRESS[areaId] ?? [''])[Math.floor(pick / 8) % 4],
      });
    }
  }
  return blocks;
}

// その日の、営業の埋まっている時間帯。既存の予定があればそれを、なければダミーを使い、コールセンターで確定済みの予約を加える
export function busyBlocks(userId, date, reservations, now = new Date()) {
  const day = dayOffset(date, now);
  const real = EVENTS.filter((e) => e.userId === userId && e.day === day).map((e) => ({ start: toMin(e.start), end: toMin(e.end), label: `${e.customer.name} 様`, source: 'event', lat: e.lat, lng: e.lng, place: e.customer.address }));
  const base = real.length ? real : fillerBlocks(userId, date);
  const mine = reservations
    .filter((r) => r.userId === userId && r.date === date && r.status !== 'cancelled')
    .map((r) => ({ start: toMin(r.start), end: toMin(r.end), label: `${r.customer.name} 様`, source: 'reservation', status: r.status === 'tentative' ? 'tentative' : 'confirmed', lat: r.lat, lng: r.lng, place: r.customer.address }));
  return [...base, ...mine].sort((a, b) => a.start - b.start);
}

// null なら空き。kind: hours=営業時間外 / overlap=予定と重なる / buffer=予定との間に移動時間が足りない
export function conflictOf(blocks, start, end) {
  if (start < WORK_START || end > WORK_END) return { kind: 'hours', block: null };
  const hit = blocks.find((b) => start < b.end + TRAVEL_BUFFER && b.start < end + TRAVEL_BUFFER);
  if (!hit) return null;
  return { kind: start < hit.end && hit.start < end ? 'overlap' : 'buffer', block: hit };
}

export const conflictText = (c) => {
  if (!c) return '';
  if (c.kind === 'hours') return '営業時間外（9:00〜19:00）';
  if (c.kind === 'absent') return '欠勤';
  const t = `${minToHHMM(c.block.start)}–${minToHHMM(c.block.end)} ${c.block.label}`;
  return c.kind === 'overlap' ? `${t} の予定と重なる` : `${t} の予定の前後30分（移動時間）にかかる`;
};

// ---- 公平性（女性のお客様の担当件数） ---------------------------------------------------
// 女性のお客様は客単価が高いため、女性の担当が特定の営業に偏らないようにする。今月の件数＝実績（ダミー）＋コールセンターで確定した予約
const SEED = {
  u01: [12, 5], u02: [14, 7], u03: [13, 4], u04: [10, 3], u05: [9, 5], u06: [15, 6], u07: [11, 2], u08: [8, 4], u09: [10, 4], u10: [9, 3], u11: [13, 6], u12: [11, 3], u13: [9, 2], u14: [14, 8], u15: [15, 4], u16: [10, 5],
};

export function fairnessStats(reservations, now = new Date()) {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const out = {};
  USERS.forEach((u) => {
    const [total, female] = SEED[u.id] ?? [0, 0];
    const mine = reservations.filter((r) => r.userId === u.id && r.date.startsWith(month) && r.status !== 'cancelled');
    const f = female + mine.filter((r) => r.gender === 'f').length;
    const t = total + mine.length;
    out[u.id] = { total: t, female: f, male: t - f, femaleShare: t ? f / t : 0 };
  });
  return out;
}

// ---- 候補の選定 --------------------------------------------------------------------
// 空いている人が先。女性のお客様は女性の担当が少ない順、男性のお客様は担当が少ない順（同数なら女性比率が高い人を優先して、全体の比率を均す）
const byFairness = (gender) => (a, b) => {
  if (a.free !== b.free) return a.free ? -1 : 1;
  if (gender === 'f') return a.stats.female - b.stats.female || a.stats.total - b.stats.total || a.user.id.localeCompare(b.user.id);
  return a.stats.total - b.stats.total || b.stats.femaleShare - a.stats.femaleShare || a.user.id.localeCompare(b.user.id);
};

export function rankCandidates({ gender, areaId, date, start, dur, reservations, here = null, now = new Date() }) {
  const stats = fairnessStats(reservations, now);
  const end = start + dur;
  const all = USERS.map((user) => {
    const blocks = busyBlocks(user.id, date, reservations, now);
    const absent = isAbsent(user.id, date, now);
    const conflict = absent ? { kind: 'absent', block: null } : conflictOf(blocks, start, end);
    return { user, areaId: areaOfUser(user.id), rank: rankOfUser(user.id), blocks, absent, free: !conflict, conflict, travel: travelAround(blocks, start, end, here), stats: stats[user.id], recommended: false };
  });
  const inArea = all.filter((c) => areaId && c.areaId === areaId).sort(byFairness(gender));
  const others = all.filter((c) => !inArea.includes(c)).sort(byFairness(gender));
  const first = inArea[0];
  if (first?.free) first.recommended = true;
  return { inArea, others };
}

// 担当を選んだときの公平性の注意: 選んだ人より、女性の担当が少ない空き営業がいれば、その人を返す
export function fairerAlternative(gender, picked, candidates) {
  if (gender !== 'f' || !picked) return null;
  return candidates.filter((c) => c.free && c.user.id !== picked.user.id && c.stats.female < picked.stats.female).sort(byFairness('f'))[0] ?? null;
}

// 空き枠の検索: 30分刻みの開始時刻ごとに、空いている営業の人数
export function findSlots({ userIds, date, dur, reservations, now = new Date() }) {
  const blocks = userIds.map((id) => busyBlocks(id, date, reservations, now));
  const slots = [];
  for (let start = WORK_START; start + dur <= WORK_END; start += SLOT_STEP) {
    slots.push({ start, freeCount: blocks.filter((b) => !conflictOf(b, start, start + dur)).length });
  }
  return slots;
}

// 1週間分の空き枠: 日付ごとに、30分刻みの開始時刻と、空いている営業（営業の id）。カレンダーで候補日を見比べるために使う
export function findWeekSlots({ userIds, startDate, days = 7, dur, reservations, now = new Date() }) {
  const [y, m, d] = startDate.split('-').map(Number);
  return Array.from({ length: days }, (_, i) => {
    const date = ymdOf(new Date(y, m - 1, d + i));
    const blocks = userIds.filter((id) => !isAbsent(id, date, now)).map((id) => ({ id, blocks: busyBlocks(id, date, reservations, now) })); // 欠勤の営業は数えない
    const slots = [];
    for (let start = WORK_START; start + dur <= WORK_END; start += SLOT_STEP) {
      slots.push({ start, freeIds: blocks.filter((b) => !conflictOf(b.blocks, start, start + dur)).map((b) => b.id) });
    }
    return { date, slots };
  });
}

// 営業の詳細（日別表示で、営業の枠を選んだときに出す）。今月の実績・担当件数・その日の予定と空き枠
export function salesDetail({ userId, date, start, dur, reservations, here = null, now = new Date() }) {
  const user = USERS.find((u) => u.id === userId);
  if (!user) return null;
  const month = stats([user], rangeOf('month', now), now);
  const progress = monthProgress([user], now);
  const blocks = busyBlocks(userId, date, reservations, now);
  const absent = isAbsent(userId, date, now);
  const starts = [];
  if (!absent) for (let m = WORK_START; m + dur <= WORK_END; m += SLOT_STEP) if (!conflictOf(blocks, m, m + dur)) starts.push(m);
  // 開始できる時刻を、つながっている範囲にまとめる（例: 9:00〜10:30）
  const windows = starts.reduce((acc, m) => {
    const last = acc[acc.length - 1];
    if (last && m - last.to === SLOT_STEP) last.to = m; else acc.push({ from: m, to: m });
    return acc;
  }, []);
  const conflict = absent ? { kind: 'absent', block: null } : conflictOf(blocks, start, start + dur);
  return {
    user, absent, rank: rankOfUser(userId), areaId: areaOfUser(userId),
    month: { ...month, target: user.target, achieve: progress.rate, pace: progress.pace },
    fairness: fairnessStats(reservations, now)[userId],
    blocks, windows, conflict, travel: travelAround(blocks, start, start + dur, here),
  };
}

// 配車係が、仮確定の担当を確認・変更するための候補。その予約自身は、予定の重なりから除く
export function dispatchOptions(rec, reservations, now = new Date()) {
  const others = reservations.filter((r) => r.id !== rec.id);
  const start = toMin(rec.start);
  const end = toMin(rec.end);
  const stats = fairnessStats(reservations, now);
  return USERS.filter((u) => !rec.areaId || areaOfUser(u.id) === rec.areaId).map((user) => {
    const absent = isAbsent(user.id, rec.date, now);
    const conflict = absent ? { kind: 'absent', block: null } : conflictOf(busyBlocks(user.id, rec.date, others, now), start, end);
    return { user, rank: rankOfUser(user.id), absent, free: !conflict, conflict, current: user.id === rec.userId, stats: stats[user.id] };
  });
}
