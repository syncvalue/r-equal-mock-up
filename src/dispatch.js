// コールセンターの配車ロジック（画面に依存しない純関数）。
// 訪問先の住所 → 担当エリア → そのエリアの営業のうち、希望日時に空いている人 → 女性のお客様の担当が偏らないように選ぶ。
import { USERS } from './dashboard.js';
import { EVENTS, toMin } from './schedule.js';
import { dayOffset, minToHHMM } from './reservations.js';

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
const USER_AREA = { u01: 'osaka', u02: 'osaka', u03: 'osaka', u06: 'hyogo', u07: 'hyogo', u04: 'kanto', u05: 'kanto', u08: 'tokai' };
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

// 予定のない日は、営業ごとに日付で決まる「他の訪問」（ダミー）を入れて、空き状況が見本になるようにする
function fillerBlocks(userId, date) {
  const rnd = hash(`${userId}/${date}`);
  const blocks = [];
  for (let i = 0, n = Math.floor(rnd() * 3); i < n; i += 1) {
    const start = 570 + Math.floor(rnd() * 14) * SLOT_STEP;
    const end = start + (rnd() < 0.5 ? 60 : 90);
    if (!blocks.some((b) => start < b.end + TRAVEL_BUFFER && b.start < end + TRAVEL_BUFFER)) blocks.push({ start, end, label: '訪問予定', source: 'dummy' });
  }
  return blocks;
}

// その日の、営業の埋まっている時間帯。既存の予定があればそれを、なければダミーを使い、コールセンターで確定済みの予約を加える
export function busyBlocks(userId, date, reservations, now = new Date()) {
  const day = dayOffset(date, now);
  const real = EVENTS.filter((e) => e.userId === userId && e.day === day).map((e) => ({ start: toMin(e.start), end: toMin(e.end), label: `${e.customer.name} 様`, source: 'event' }));
  const base = real.length ? real : fillerBlocks(userId, date);
  const mine = reservations
    .filter((r) => r.userId === userId && r.date === date)
    .map((r) => ({ start: toMin(r.start), end: toMin(r.end), label: `${r.customer.name} 様`, source: 'reservation' }));
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
  const t = `${minToHHMM(c.block.start)}–${minToHHMM(c.block.end)} ${c.block.label}`;
  return c.kind === 'overlap' ? `${t} の予定と重なる` : `${t} の予定の前後30分（移動時間）にかかる`;
};

// ---- 公平性（女性のお客様の担当件数） ---------------------------------------------------
// 女性のお客様は客単価が高いため、女性の担当が特定の営業に偏らないようにする。今月の件数＝実績（ダミー）＋コールセンターで確定した予約
const SEED = {
  u01: [12, 5], u02: [14, 7], u03: [13, 4], u04: [10, 3], u05: [9, 5], u06: [15, 6], u07: [11, 2], u08: [8, 4],
};

export function fairnessStats(reservations, now = new Date()) {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const out = {};
  USERS.forEach((u) => {
    const [total, female] = SEED[u.id] ?? [0, 0];
    const mine = reservations.filter((r) => r.userId === u.id && r.date.startsWith(month));
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

export function rankCandidates({ gender, areaId, date, start, dur, reservations, now = new Date() }) {
  const stats = fairnessStats(reservations, now);
  const end = start + dur;
  const all = USERS.map((user) => {
    const blocks = busyBlocks(user.id, date, reservations, now);
    const conflict = conflictOf(blocks, start, end);
    return { user, areaId: areaOfUser(user.id), blocks, free: !conflict, conflict, stats: stats[user.id], recommended: false };
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
