// コールセンターの配車ロジック（画面に依存しない純関数）。
// 訪問先の住所 → 担当エリア → そのエリアの営業のうち、希望日時に空いている人 → 女性のお客様の担当が偏らないように選ぶ。
import { USERS, stats, monthProgress, rangeOf } from './dashboard.js';
import { EVENTS, toMin } from './schedule.js';
import { dayOffset, minToHHMM, ymdOf, isReverted } from './reservations.js';

// ---- エリア ----------------------------------------------------------------------
// 訪問先の都道府県ごとに、担当エリアが決まっている。一覧にない都道府県は「対応エリア外」。lat/lng は、予定の地図表示用の代用座標
export const AREAS = [
  { id: 'osaka', name: '大阪エリア', prefs: ['大阪府', '奈良県', '和歌山県'], lat: 34.6937, lng: 135.5023 },
  { id: 'hyogo', name: '兵庫・京都エリア', prefs: ['兵庫県', '京都府', '滋賀県'], lat: 34.6913, lng: 135.183 },
  { id: 'kanto', name: '関東エリア', prefs: ['東京都', '神奈川県', '埼玉県', '千葉県', '茨城県', '栃木県', '群馬県'], lat: 35.6812, lng: 139.7671 },
  { id: 'tokai', name: '東海エリア', prefs: ['愛知県', '岐阜県', '三重県', '静岡県'], lat: 35.1815, lng: 136.9066 },
];
// extraAreas: 出張エリア（src/trips.js の tripAreas）。営業所のエリア（AREAS）と同じ形で、memberIds（出張メンバー）を持つ
export const areaById = (id, extraAreas = []) => AREAS.find((a) => a.id === id) ?? extraAreas.find((a) => a.id === id) ?? null;

// 営業の担当エリア（ダミー）
const USER_AREA = { u01: 'osaka', u02: 'osaka', u03: 'osaka', u06: 'hyogo', u07: 'hyogo', u04: 'kanto', u05: 'kanto', u08: 'tokai', u09: 'osaka', u10: 'tokai', u11: 'osaka', u12: 'osaka', u13: 'osaka', u14: 'osaka', u15: 'osaka', u16: 'osaka' };
export const areaOfUser = (userId) => USER_AREA[userId] ?? null;

export const PREFS = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県',
  '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県',
  '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

// 住所の都道府県から判定。判定できなければ null、担当のない都道府県なら { id: null, outside: true }
export function areaOfAddress(address, extraAreas = []) {
  const pref = PREFS.find((p) => String(address ?? '').includes(p));
  if (!pref) return null;
  const area = [...AREAS, ...extraAreas].find((a) => a.prefs.includes(pref));
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

// ---- 営業の得意分野 ------------------------------------------------------------------
// 営業ごとの得意分野（ダミー）。お客様の売りたいものと合う営業を選ぶ手がかりにする
const USER_SPECIALTY = {
  u01: ['腕時計', '貴金属・ジュエリー'], u02: ['腕時計', 'カメラ・家電', '貴金属・ジュエリー'], u03: ['ブランドバッグ', '着物・骨董'], u04: ['ゲーム・ホビー', 'カメラ・家電'],
  u05: ['ブランドバッグ', '婦人服'], u06: ['貴金属・ジュエリー', '腕時計'], u07: ['婦人服', '婦人靴', 'ブランドバッグ'], u08: ['背広', '紳士靴'], u09: ['ゲーム・ホビー'],
  u10: ['着物・骨董', '婦人服'], u11: ['背広', '紳士靴', '腕時計'], u12: ['婦人服', '婦人靴'], u13: ['カメラ・家電', 'ゲーム・ホビー'], u14: ['ブランドバッグ', '貴金属・ジュエリー', '婦人靴'],
  u15: ['腕時計', '背広', '貴金属・ジュエリー'], u16: ['着物・骨董', 'ブランドバッグ'],
};
export const specialtiesOf = (userId) => USER_SPECIALTY[userId] ?? [];

// ---- 営業のランク ------------------------------------------------------------------
// 営業ごとのランク（ダミー。S が最上位）
const USER_RANK = { u01: 'B', u02: 'S', u03: 'A', u04: 'C', u05: 'B', u06: 'S', u07: 'B', u08: 'C', u09: 'A', u10: 'B', u11: 'A', u12: 'B', u13: 'C', u14: 'B', u15: 'A', u16: 'C' };
export const RANKS = ['S', 'A', 'B', 'C'];
export const rankOfUser = (userId) => USER_RANK[userId] ?? null;

// ---- 出勤状況 ------------------------------------------------------------------------
// 全員が1日中出勤しているとは限らない。欠勤の営業は担当に選べない。午後出社（午前休）・午後半休は、働く時間の中だけ選べる。
// ダミー: 営業×日付で決まる。予定の入っている日は通常の出勤。見本として、日付を指定した勤怠も入れている
export const ATTENDANCE_LABEL = { absent: '欠勤', pm: '午後出社', am: '午後半休', present: '出勤' };
const NOON = 13 * 60; // 午前と午後の境
const FIXED_ATTENDANCE = { u03: { 2: 'am' }, u12: { 2: 'pm' }, u15: { 1: 'pm' }, u16: { 3: 'am' }, u14: { 2: 'absent' } }; // 今日からの日数 → 勤怠

// 予定が、休みの時間（欠勤の日・午前休・午後半休）にかかっているか
export const inOffTime = (att, start, end) => att.kind === 'absent' || start < att.from || end > att.to;

export function attendanceOf(userId, date, now = new Date()) {
  const day = dayOffset(date, now);
  let kind = 'present';
  if (!EVENTS.some((e) => e.userId === userId && e.day === day)) {
    const r = mixedRandom(`${userId}/${date}/勤怠`)();
    kind = FIXED_ATTENDANCE[userId]?.[day] ?? (r < 0.08 ? 'absent' : r < 0.15 ? 'pm' : r < 0.22 ? 'am' : 'present');
  }
  const from = kind === 'pm' ? NOON : WORK_START;
  const to = kind === 'am' ? NOON : WORK_END;
  return { kind, from: kind === 'absent' ? WORK_END : from, to: kind === 'absent' ? WORK_START : to, label: ATTENDANCE_LABEL[kind] };
}
export const isAbsent = (userId, date, now = new Date()) => attendanceOf(userId, date, now).kind === 'absent';

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
  const leg = (from, label, at, gap) => {
    if (!from || from.lat == null) return null;
    const km = Math.round(haversineKm(from, here) * 10) / 10;
    return { label, at, km, min: Math.round((km * 60) / AVG_SPEED_KMH), place: from.place ?? '', gap }; // gap: 訪問と訪問のあいだの空き（分）
  };
  const before = [...blocks].filter((b) => b.end <= start).sort((a, b) => b.end - a.end)[0];
  const after = blocks.find((b) => b.start >= end);
  return {
    prev: before ? leg(before, before.label, before.end, start - before.end) : null, // 直前の訪問がなければ、距離は出さない（営業所からの距離は見ない）
    next: after ? leg(after, after.label, after.start, after.start - end) : null,
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
// 予定が入っていない営業（入社間もなく、まだ訪問が少ない想定）。「前の訪問なし（営業所から）」の例として、常に空く
const LIGHT_SCHEDULE = new Set(['u09']);

// 配車係が別の営業・時間に動かして、予約として取り込んだ元の予定（動かしたあとは、元の位置には出さない）。画面側が、保存先から入れる
export const hiddenBlocks = new Set();

function fillerBlocks(userId, date, hidden, now) {
  if (LIGHT_SCHEDULE.has(userId)) return [];
  const att = attendanceOf(userId, date, now);
  if (att.kind === 'absent') return []; // 欠勤の日に、予定は入らない
  const rnd = hash(`${userId}/${date}`);
  const blocks = []; // 表に出す予定（取り込んで動かした元の予定は含めない）
  const taken = []; // 重なりの判定に使う、作った予定すべて（動かした元の位置にも、別の予定が現れないように）
  for (let i = 0, n = Math.floor(rnd() * 3); i < n; i += 1) {
    const start = 570 + Math.floor(rnd() * 14) * SLOT_STEP;
    const end = start + (rnd() < 0.5 ? 60 : 90);
    // 午後出社・午後半休の日は、休みの時間帯に予定は入らない。乱数の並びは変えず、働く時間の外に出る予定だけを外す
    if (start >= att.from && end <= att.to && !taken.some((b) => start < b.end + TRAVEL_BUFFER && b.start < end + TRAVEL_BUFFER)) {
      const areaId = areaOfUser(userId);
      const pick = Math.floor(hash(`${userId}/${date}/${start}/客`)() * 100); // 空き状況の乱数列を変えないよう、別の乱数で決める
      const gid = `flr:${userId}/${date}/${start}`;
      const block = {
        gid, start, end, label: `${DUMMY_NAMES[pick % DUMMY_NAMES.length]} 様`, source: 'dummy',
        ...locateAddress(`${userId}/${date}/${start}`, areaById(areaId)), place: (DUMMY_ADDRESS[areaId] ?? [''])[Math.floor(pick / 8) % 4],
      };
      taken.push(block);
      if (!hidden.has(gid)) blocks.push(block);
    }
  }
  return blocks;
}

// その日の、営業の埋まっている時間帯。既存の予定があればそれを、なければダミーを使い、コールセンターで確定済みの予約を加える
export function busyBlocks(userId, date, reservations, now = new Date(), extraHidden = null) {
  const day = dayOffset(date, now);
  const hidden = extraHidden ? new Set([...hiddenBlocks, ...extraHidden]) : hiddenBlocks;
  const realAll = EVENTS.filter((e) => e.userId === userId && e.day === day);
  const real = realAll.filter((e) => !hidden.has(e.id)).map((e) => ({ gid: e.id, ev: e, start: toMin(e.start), end: toMin(e.end), label: `${e.customer.name} 様`, source: 'event', lat: e.lat, lng: e.lng, place: e.customer.address }));
  const base = realAll.length ? real : fillerBlocks(userId, date, hidden, now); // 既存の予定がある日は、ダミーを足さない（動かして空になっても、ダミーは出さない）
  const mine = reservations
    .filter((r) => r.userId === userId && r.date === date && r.status !== 'cancelled')
    .map((r) => ({ start: toMin(r.start), end: toMin(r.end), label: `${r.customer.name} 様`, source: 'reservation', rid: r.id, review: Boolean(r.needsReview), reverted: isReverted(r), status: r.status === 'tentative' ? 'tentative' : 'confirmed', lat: r.lat, lng: r.lng, place: r.customer.address }));
  return [...base, ...mine].sort((a, b) => a.start - b.start);
}

// null なら空き。kind: hours=営業時間外 / overlap=予定と重なる / buffer=予定との間に移動時間が足りない
export function conflictOf(blocks, start, end, att = null) {
  if (att && att.kind !== 'present' && (start < att.from || end > att.to)) return { kind: att.kind === 'absent' ? 'absent' : 'shift', block: null, att }; // 欠勤・午後出社・午後半休
  if (start < WORK_START || end > WORK_END) return { kind: 'hours', block: null };
  const hit = blocks.find((b) => start < b.end + TRAVEL_BUFFER && b.start < end + TRAVEL_BUFFER);
  if (!hit) return null;
  return { kind: start < hit.end && hit.start < end ? 'overlap' : 'buffer', block: hit };
}

export const conflictText = (c) => {
  if (!c) return '';
  if (c.kind === 'hours') return '営業時間外（9:00〜19:00）';
  if (c.kind === 'absent') return '欠勤';
  if (c.kind === 'shift') return c.att.kind === 'pm' ? `午後出社（${minToHHMM(c.att.from)}から）` : `午後半休（${minToHHMM(c.att.to)}まで）`;
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

// extraAreas: その日の出張エリア。出張メンバーは、出張エリアの候補になり、本来の営業所のエリアにも残る（trips に、出張中の印として出張を入れる）
export function rankCandidates({ gender, areaId, date, start, dur, reservations, here = null, now = new Date(), extraAreas = [] }) {
  const stats = fairnessStats(reservations, now);
  const end = start + dur;
  const all = USERS.map((user) => {
    const blocks = busyBlocks(user.id, date, reservations, now);
    const att = attendanceOf(user.id, date, now);
    const absent = att.kind === 'absent';
    const conflict = conflictOf(blocks, start, end, att);
    const trips = extraAreas.filter((a) => a.memberIds?.includes(user.id)).map((a) => ({ id: a.id, name: a.name, start: a.start, end: a.end }));
    return { user, areaId: areaOfUser(user.id), trips, rank: rankOfUser(user.id), blocks, att, absent, free: !conflict, conflict, travel: travelAround(blocks, start, end, here), stats: stats[user.id], recommended: false };
  });
  const tripArea = extraAreas.find((a) => a.id === areaId);
  const inArea = all.filter((c) => areaId && (tripArea ? tripArea.memberIds.includes(c.user.id) : c.areaId === areaId)).sort(byFairness(gender));
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
    const blocks = userIds.map((id) => ({ id, att: attendanceOf(id, date, now), blocks: busyBlocks(id, date, reservations, now) })).filter((b) => b.att.kind !== 'absent'); // 欠勤の営業は数えない
    const slots = [];
    for (let start = WORK_START; start + dur <= WORK_END; start += SLOT_STEP) {
      slots.push({ start, freeIds: blocks.filter((b) => !conflictOf(b.blocks, start, start + dur, b.att)).map((b) => b.id) });
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
  const att = attendanceOf(userId, date, now);
  const absent = att.kind === 'absent';
  const starts = [];
  if (!absent) for (let m = WORK_START; m + dur <= WORK_END; m += SLOT_STEP) if (!conflictOf(blocks, m, m + dur, att)) starts.push(m);
  // 開始できる時刻を、つながっている範囲にまとめる（例: 9:00〜10:30）
  const windows = starts.reduce((acc, m) => {
    const last = acc[acc.length - 1];
    if (last && m - last.to === SLOT_STEP) last.to = m; else acc.push({ from: m, to: m });
    return acc;
  }, []);
  const conflict = conflictOf(blocks, start, start + dur, att);
  return {
    user, absent, att, rank: rankOfUser(userId), areaId: areaOfUser(userId),
    month: { ...month, target: user.target, achieve: progress.rate, pace: progress.pace },
    fairness: fairnessStats(reservations, now)[userId],
    blocks, windows, conflict, travel: travelAround(blocks, start, start + dur, here),
  };
}

// 配車係が、予約を別の営業・別の時刻に動かせるか。動かす予約自身は、重なりに数えない。同じ日の中で動かす
export function canPlace(rec, userId, start, reservations, now = new Date()) {
  const end = start + (toMin(rec.end) - toMin(rec.start));
  if (start < WORK_START || end > WORK_END) return { ok: false, reason: '営業時間外' };
  const att = attendanceOf(userId, rec.date, now);
  const others = reservations.filter((r) => r.id !== rec.id);
  const conflict = conflictOf(busyBlocks(userId, rec.date, others, now, rec.gid ? [rec.gid] : null), start, end, att); // 取り込む前の予定を動かすときは、その予定自身を除く
  return conflict ? { ok: false, reason: conflictText(conflict) } : { ok: true, reason: '', start, end };
}

// ---- 1日の移動（訪問から訪問へ） --------------------------------------------------------
// 連続する訪問の間の移動距離（概算）。gap=訪問と訪問の間の時間（分）、tight=移動時間が間隔に収まらない
export function travelLegs(blocks) {
  const list = [...blocks].sort((a, b) => a.start - b.start);
  const legs = [];
  for (let i = 0; i + 1 < list.length; i += 1) {
    const a = list[i];
    const b = list[i + 1];
    if (a.lat == null || b.lat == null) continue;
    const km = Math.round(haversineKm(a, b) * 10) / 10;
    const min = Math.round((km * 60) / AVG_SPEED_KMH);
    const gap = b.start - a.end;
    legs.push({ from: a, to: b, km, min, gap, tight: min > gap });
  }
  return legs;
}

// その日の総移動距離（訪問から訪問への合計）。訪問が2件未満なら、移動なし
export function dayTravel(blocks) {
  const legs = travelLegs(blocks);
  const km = Math.round(legs.reduce((n, l) => n + l.km, 0) * 10) / 10;
  return { legs, km, min: legs.reduce((n, l) => n + l.min, 0), count: blocks.length };
}
