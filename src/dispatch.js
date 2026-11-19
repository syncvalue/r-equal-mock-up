// コールセンターの配車ロジック（画面に依存しない純関数）。
// 訪問先の住所 → 担当エリア → そのエリアの鑑定士のうち、希望日時に空いている人 → 女性のお客様の担当が偏らないように選ぶ。
import { RANK_VALUES, currentStaffRank } from './staffRank.js';
import { SPOTS, spotAddress, spotPos } from './landmarks.js';
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

// 鑑定士の担当エリア（ダミー）
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

// ---- 鑑定士の得意分野 ------------------------------------------------------------------
// 鑑定士ごとの得意分野（ダミー）。お客様の売りたいものと合う鑑定士を選ぶ手がかりにする
const USER_SPECIALTY = {
  u01: ['腕時計', '貴金属・ジュエリー'], u02: ['腕時計', 'カメラ・家電', '貴金属・ジュエリー'], u03: ['ブランドバッグ', '着物・骨董'], u04: ['ゲーム・ホビー', 'カメラ・家電'],
  u05: ['ブランドバッグ', '婦人服'], u06: ['貴金属・ジュエリー', '腕時計'], u07: ['婦人服', '婦人靴', 'ブランドバッグ'], u08: ['背広', '紳士靴'], u09: ['ゲーム・ホビー'],
  u10: ['着物・骨董', '婦人服'], u11: ['背広', '紳士靴', '腕時計'], u12: ['婦人服', '婦人靴'], u13: ['カメラ・家電', 'ゲーム・ホビー'], u14: ['ブランドバッグ', '貴金属・ジュエリー', '婦人靴'],
  u15: ['腕時計', '背広', '貴金属・ジュエリー'], u16: ['着物・骨董', 'ブランドバッグ'],
};
export const specialtiesOf = (userId) => USER_SPECIALTY[userId] ?? [];

// ---- 鑑定士のランク ------------------------------------------------------------------
// ダミーのお客様に付けるランク（SS・S・A・B。偏らないよう、SS 15%・S 25%・A 35%・B 25% で、キーごとに決まる）。
// 顧客ランクは、新規かリピーターかとは別。新規のお客様にも付ける（住所から高級住宅街と分かるなど、実績がなくても推測できる）
export function dummyCustomerRank(key) {
  const r = hash(`顧客ランク/${key}`)();
  return r < 0.15 ? 'SS' : r < 0.4 ? 'S' : r < 0.75 ? 'A' : 'B';
}

// 鑑定士ごとのランク（ダミー。SS が最上位。SS・S・A・B の4段階、仮の設定）
const USER_RANK = { u01: 'A', u02: 'SS', u03: 'S', u04: 'B', u05: 'A', u06: 'SS', u07: 'A', u08: 'B', u09: 'S', u10: 'A', u11: 'S', u12: 'A', u13: 'B', u14: 'A', u15: 'S', u16: 'B' };
export const RANKS = RANK_VALUES;
export const rankOfUser = (userId) => currentStaffRank(userId) ?? USER_RANK[userId] ?? null; // 変更していなければ、見本のランク（変更は、マスタ管理の社員。src/staffRank.js）

// ---- 出勤状況 ------------------------------------------------------------------------
// 全員が1日中出勤しているとは限らない。休み（終日）の鑑定士は担当に選べない。
// 出勤する時間（from〜to）が短い日は、その外の時間を「休み」として扱い、働く時間の中だけ選べる（午前休・午後半休・夕方から・15時まで、などを区別しない）。
// kind: absent=休み（終日）／present=終日出勤／partial=出勤する時間が短い。
// ダミー: 鑑定士×日付で決まる。予定の入っている日は通常の出勤。見本として、日付を指定した勤怠も入れている
export const ATTENDANCE_LABEL = { absent: '休み', partial: '出勤', present: '出勤' };
const NOON = 13 * 60;
const AM_OFF = { from: NOON, to: WORK_END }; // 午前は休み（13:00から出社）
const PM_OFF = { from: WORK_START, to: NOON }; // 午後は休み（13:00まで）
const FIXED_ATTENDANCE = { u03: { 2: PM_OFF }, u12: { 2: AM_OFF }, u15: { 1: { from: 17 * 60, to: WORK_END } }, u16: { 3: { from: WORK_START, to: 15 * 60 } }, u14: { 2: 'absent' } }; // 今日からの日数 → 勤怠（'absent' か、出勤する時間）

// 予定が、休みの時間（休みの日・出勤する時間の外）にかかっているか
export const inOffTime = (att, start, end) => att.kind === 'absent' || start < att.from || end > att.to;

export function attendanceOf(userId, date, now = new Date()) {
  const day = dayOffset(date, now);
  let pick = null;
  if (!EVENTS.some((e) => e.userId === userId && e.day === day)) {
    const r = mixedRandom(`${userId}/${date}/勤怠`)();
    pick = FIXED_ATTENDANCE[userId]?.[day] ?? (r < 0.08 ? 'absent' : r < 0.15 ? AM_OFF : r < 0.22 ? PM_OFF : null);
  }
  if (pick === 'absent') return { kind: 'absent', from: WORK_END, to: WORK_START, label: ATTENDANCE_LABEL.absent };
  const { from, to } = pick ?? { from: WORK_START, to: WORK_END };
  const kind = from > WORK_START || to < WORK_END ? 'partial' : 'present';
  return { kind, from, to, label: ATTENDANCE_LABEL[kind] };
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
  const real = spotPos(text); // ダミーに使っている実在の場所は、その場所の座標
  if (real) return real;
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
const DUMMY_NAMES = [['岡田 恵子', 'f'], ['石川 正一', 'm'], ['村上 久美', 'f'], ['前田 隆', 'm'], ['藤田 直子', 'f'], ['近藤 浩二', 'm'], ['長谷川 淳', 'm'], ['清水 明美', 'f']]; // [名前, 性別]
// 空き状況の見本に入れる「他の訪問」の場所（エリアごとに、実在する場所）
const DUMMY_SPOTS = { osaka: ['namba', 'sakai', 'toyonaka', 'higashiosaka'], hyogo: ['kobe', 'kyoto', 'koshien', 'otsu'], kanto: ['shinjuku', 'landmark', 'omiya', 'chiba'], tokai: ['nagoyajo', 'toyota', 'hamamatsu', 'gifu'] };

// 予定のない日は、鑑定士ごとに日付で決まる「他の訪問」（ダミー）を入れて、空き状況が見本になるようにする
// 予定が入っていない鑑定士（入社間もなく、まだ訪問が少ない想定）。「前の訪問なし（営業所から）」の例として、常に空く
const LIGHT_SCHEDULE = new Set(['u09']);

// 配車係が別の鑑定士・時間に動かして、予約として取り込んだ元の予定（動かしたあとは、元の位置には出さない）。画面側が、保存先から入れる
export const hiddenBlocks = new Set();

function spotOf(areaId, i) { // ダミーの訪問先: 実在する場所の住所と座標（なければ、エリアの中心）
  const key = (DUMMY_SPOTS[areaId] ?? [])[i];
  return key ? { lat: SPOTS[key].lat, lng: SPOTS[key].lng, place: spotAddress(key) } : { ...(locateAddress(`${areaId}/${i}`, areaById(areaId)) ?? {}), place: '' };
}
function fillerBlocks(userId, date, hidden, now) {
  if (LIGHT_SCHEDULE.has(userId)) return [];
  const att = attendanceOf(userId, date, now);
  if (att.kind === 'absent') return []; // 休みの日に、予定は入らない
  const rnd = hash(`${userId}/${date}`);
  const blocks = []; // 表に出す予定（取り込んで動かした元の予定は含めない）
  const taken = []; // 重なりの判定に使う、作った予定すべて（動かした元の位置にも、別の予定が現れないように）
  for (let i = 0, n = Math.floor(rnd() * 3); i < n; i += 1) {
    const start = 570 + Math.floor(rnd() * 14) * SLOT_STEP;
    const end = start + (rnd() < 0.5 ? 60 : 90);
    // 出勤する時間が短い日は、休みの時間帯に予定は入らない。乱数の並びは変えず、働く時間の外に出る予定だけを外す
    if (start >= att.from && end <= att.to && !taken.some((b) => start < b.end + TRAVEL_BUFFER && b.start < end + TRAVEL_BUFFER)) {
      const areaId = areaOfUser(userId);
      const pick = Math.floor(hash(`${userId}/${date}/${start}/客`)() * 100); // 空き状況の乱数列を変えないよう、別の乱数で決める
      const gid = `flr:${userId}/${date}/${start}`;
      const block = {
        gid, start, end, label: `${DUMMY_NAMES[pick % DUMMY_NAMES.length][0]} 様`, gender: DUMMY_NAMES[pick % DUMMY_NAMES.length][1], source: 'dummy', custRank: dummyCustomerRank(gid),
        ...spotOf(areaId, Math.floor(pick / 8) % 4),
      };
      taken.push(block);
      if (!hidden.has(gid)) blocks.push(block);
    }
  }
  return blocks;
}

// その日の、鑑定士の埋まっている時間帯。既存の予定があればそれを、なければダミーを使い、コールセンターで確定済みの予約を加える
export function busyBlocks(userId, date, reservations, now = new Date(), extraHidden = null) {
  const day = dayOffset(date, now);
  const hidden = extraHidden ? new Set([...hiddenBlocks, ...extraHidden]) : hiddenBlocks;
  const realAll = EVENTS.filter((e) => e.userId === userId && e.day === day);
  const real = realAll.filter((e) => !hidden.has(e.id)).map((e) => ({ gid: e.id, ev: e, start: toMin(e.start), end: toMin(e.end), label: `${e.customer.name} 様`, source: 'event', gender: e.gender, custRank: dummyCustomerRank(e.id), lat: e.lat, lng: e.lng, place: e.customer.address }));
  const base = realAll.length ? real : fillerBlocks(userId, date, hidden, now); // 既存の予定がある日は、ダミーを足さない（動かして空になっても、ダミーは出さない）
  const mine = reservations
    .filter((r) => r.userId === userId && r.date === date && r.status !== 'cancelled')
    .map((r) => ({ start: toMin(r.start), end: toMin(r.end), label: `${r.customer.name} 様`, source: 'reservation', rid: r.id, review: Boolean(r.needsReview), reverted: isReverted(r), status: r.status === 'tentative' ? 'tentative' : 'confirmed', lat: r.lat, lng: r.lng, place: r.customer.address }));
  return [...base, ...mine].sort((a, b) => a.start - b.start);
}

// null なら空き。kind: hours=営業時間外 / overlap=予定と重なる / buffer=予定との間に移動時間が足りない
// buffer: 予定の前後に確保する移動時間（分）。受付の空き確認は、既定の30分。配車係の移動は 0（仮置きがあるため、移動時間は見ない）
export function conflictOf(blocks, start, end, att = null, { buffer = TRAVEL_BUFFER } = {}) {
  if (att && att.kind !== 'present' && (start < att.from || end > att.to)) return { kind: att.kind === 'absent' ? 'absent' : 'shift', block: null, att }; // 休み・出勤する時間の外
  if (start < WORK_START || end > WORK_END) return { kind: 'hours', block: null };
  const hit = blocks.find((b) => start < b.end + buffer && b.start < end + buffer);
  if (!hit) return null;
  return { kind: start < hit.end && hit.start < end ? 'overlap' : 'buffer', block: hit };
}

export const conflictText = (c) => {
  if (!c) return '';
  if (c.kind === 'hours') return '営業時間外（9:00〜19:00）';
  if (c.kind === 'absent') return '休み';
  if (c.kind === 'trip') return `出張中（${c.trip.name}）のため、このエリアは受けられません`;
  if (c.kind === 'shift') return `休み（勤務は${[c.att.from > WORK_START ? `${minToHHMM(c.att.from)}から` : '', c.att.to < WORK_END ? `${minToHHMM(c.att.to)}まで` : ''].filter(Boolean).join('・')}）`; // 勤務する時間の外
  const t = `${minToHHMM(c.block.start)}–${minToHHMM(c.block.end)} ${c.block.label}`;
  return c.kind === 'overlap' ? `${t} の予定と重なる` : `${t} の予定の前後30分（移動時間）にかかる`;
};

// ---- 公平性（女性のお客様の担当件数） ---------------------------------------------------
// 女性のお客様は客単価が高いため、女性の担当が特定の鑑定士に偏らないようにする。今月の件数＝実績（ダミー）＋コールセンターで確定した予約
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

// extraAreas: その日の出張エリア。出張メンバーは、出張エリアの候補になる。出張中は、出張エリア以外（本来の営業所のエリアを含む）では、休みと同じ扱い（awayName＝出張の名前）
export function rankCandidates({ gender, areaId, date, start, dur, reservations, here = null, now = new Date(), extraAreas = [] }) {
  const stats = fairnessStats(reservations, now);
  const end = start + dur;
  const all = USERS.map((user) => {
    const trips = extraAreas.filter((a) => a.memberIds?.includes(user.id)).map((a) => ({ id: a.id, name: a.name, start: a.start, end: a.end }));
    // 出張中は、本来のエリアの元からの予定・ダミーの予定は置かない。出張先（出張エリア）の訪問だけが、埋まっている時間
    const tripRes = new Set(reservations.filter((r) => String(r.areaId).startsWith('trip:')).map((r) => r.id));
    const all0 = busyBlocks(user.id, date, reservations, now);
    const blocks = trips.length ? all0.filter((b) => tripRes.has(b.rid)) : all0;
    const att = attendanceOf(user.id, date, now);
    const away = trips.find((t) => t.id !== areaId) ?? null; // 出張中は、出張エリア以外の訪問を受けられない（本来のエリアでは、休みと同じ扱い）
    const absent = att.kind === 'absent' || Boolean(away);
    const conflict = away ? { kind: 'trip', block: null, trip: away } : conflictOf(blocks, start, end, att);
    return { user, areaId: areaOfUser(user.id), trips, awayName: away?.name ?? null, rank: rankOfUser(user.id), blocks: away ? [] : blocks, att, absent, free: !conflict, conflict, travel: travelAround(blocks, start, end, here), stats: stats[user.id], recommended: false };
  });
  const tripArea = extraAreas.find((a) => a.id === areaId);
  const inArea = all.filter((c) => areaId && (tripArea ? tripArea.memberIds.includes(c.user.id) : c.areaId === areaId)).sort(byFairness(gender));
  const others = all.filter((c) => !inArea.includes(c)).sort(byFairness(gender));
  const first = inArea[0];
  if (first?.free) first.recommended = true;
  return { inArea, others };
}

// 担当を選んだときの公平性の注意: 選んだ人より、女性の担当が少ない空き鑑定士がいれば、その人を返す
export function fairerAlternative(gender, picked, candidates) {
  if (gender !== 'f' || !picked) return null;
  return candidates.filter((c) => c.free && c.user.id !== picked.user.id && c.stats.female < picked.stats.female).sort(byFairness('f'))[0] ?? null;
}

// 空き枠の検索: 30分刻みの開始時刻ごとに、空いている鑑定士の人数
export function findSlots({ userIds, date, dur, reservations, now = new Date() }) {
  const blocks = userIds.map((id) => busyBlocks(id, date, reservations, now));
  const slots = [];
  for (let start = WORK_START; start + dur <= WORK_END; start += SLOT_STEP) {
    slots.push({ start, freeCount: blocks.filter((b) => !conflictOf(b, start, start + dur)).length });
  }
  return slots;
}

// 1週間分の空き枠: 日付ごとに、30分刻みの開始時刻と、空いている鑑定士（鑑定士の id）。カレンダーで候補日を見比べるために使う
// isAway(userId, date): その日、出張中で、このエリアの訪問を受けられない鑑定士は、数えない
export function findWeekSlots({ userIds, startDate, days = 7, dur, reservations, now = new Date(), isAway = () => false }) {
  const [y, m, d] = startDate.split('-').map(Number);
  return Array.from({ length: days }, (_, i) => {
    const date = ymdOf(new Date(y, m - 1, d + i));
    const blocks = userIds.map((id) => ({ id, att: attendanceOf(id, date, now), blocks: busyBlocks(id, date, reservations, now) })).filter((b) => b.att.kind !== 'absent' && !isAway(b.id, date)); // 休み・出張中の鑑定士は数えない
    const slots = [];
    for (let start = WORK_START; start + dur <= WORK_END; start += SLOT_STEP) {
      slots.push({ start, freeIds: blocks.filter((b) => !conflictOf(b.blocks, start, start + dur, b.att)).map((b) => b.id) });
    }
    return { date, slots };
  });
}

// 鑑定士の詳細（日別表示で、鑑定士の枠を選んだときに出す）。今月の実績・担当件数・その日の予定と空き枠
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

// 配車係が、予約を別の鑑定士・別の時刻に動かせるか。動かす予約自身は、重なりに数えない。同じ日の中で動かす。
// 前後の予定との移動時間は見ない（仮置きをする場合があるため）。重なり・休み・営業時間外だけを止める
// awayOf(userId, date, areaId): 出張中で、そのエリアの訪問を受けられない鑑定士なら、その出張（なければ null）
export function canPlace(rec, userId, start, reservations, now = new Date(), awayOf = null) {
  if (rec.nominated && rec.userId && userId !== rec.userId) return { ok: false, reason: '鑑定士指名のため、鑑定士は変えられません（時間は変えられます）' }; // お客様が鑑定士を指名している予約
  const away = awayOf?.(userId, rec.date, rec.areaId);
  if (away) return { ok: false, reason: conflictText({ kind: 'trip', trip: away }) };
  const end = start + (toMin(rec.end) - toMin(rec.start));
  if (start < WORK_START || end > WORK_END) return { ok: false, reason: '営業時間外' };
  const att = attendanceOf(userId, rec.date, now);
  const others = reservations.filter((r) => r.id !== rec.id);
  const conflict = conflictOf(busyBlocks(userId, rec.date, others, now, rec.gid ? [rec.gid] : null), start, end, att, { buffer: 0 }); // 取り込む前の予定を動かすときは、その予定自身を除く
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

// 地図に出す、その日の訪問の順番（開始時刻順に①②③）。座標のない予定は飛ばし、番号は詰める。legs・km は、座標のある予定を順につないだもの（全部に座標があれば、列の見出しの走行距離と同じ）
export function routeStops(blocks) {
  const list = [...blocks].filter((b) => b.lat != null && b.lng != null).sort((a, b) => a.start - b.start);
  const stops = list.map((b, i) => ({ n: i + 1, lat: b.lat, lng: b.lng, label: b.label, start: b.start, end: b.end, place: b.place ?? '', tentative: b.status === 'tentative' }));
  const { legs, km } = dayTravel(list); // 座標のある予定どうしを、順番につなぐ
  return { stops, legs, km };
}
