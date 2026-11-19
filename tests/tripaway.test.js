import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { rankCandidates, findWeekSlots, canPlace, conflictText } = await import('../src/dispatch.js');
const { sampleTrips, tripAreas, tripAwayOf } = await import('../src/trips.js');
const { dayColumns } = await import('../src/visitCalendar.js');
const { EVENTS } = await import('../src/schedule.js');
const { USERS } = await import('../src/dashboard.js');

const NOW = new Date(2026, 10, 19, 9, 0);
const ids = USERS.map((u) => u.id);
const trips = sampleTrips(NOW, ids);
const fukuoka = trips[0]; // 今日の2日前〜4日後（出張中）
const member = fukuoka.memberIds[0];
const ymd = (n) => { const d = new Date(2026, 10, 19 + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const today = ymd(1); // 見本の鑑定士が、休み・半日出勤でない日（出張の期間内）
const extra = tripAreas(trips, today);

test('出張中の鑑定士は、本来のエリア（大阪）では、休みと同じ扱い。担当候補に出るが、空きにならず、出張中と分かる', () => {
  const r = rankCandidates({ gender: 'f', areaId: 'osaka', date: today, start: 600, dur: 90, reservations: [], now: NOW, extraAreas: extra });
  const c = [...r.inArea, ...r.others].find((x) => x.user.id === member);
  assert.equal(c.free, false);
  assert.equal(c.absent, true);
  assert.equal(c.awayName, '福岡出張');
  assert.deepEqual(c.blocks, []);
  assert.match(conflictText(c.conflict), /出張中（福岡出張）/);
  assert.ok(!r.inArea.find((x) => x.recommended && x.user.id === member));
});

test('出張中の鑑定士は、出張エリアの訪問は受けられる（空きになる）', () => {
  const r = rankCandidates({ gender: 'f', areaId: extra[0].id, date: today, start: 600, dur: 90, reservations: [], now: NOW, extraAreas: extra });
  const c = r.inArea.find((x) => x.user.id === member);
  assert.ok(c, '出張エリアの候補に入る');
  assert.equal(c.free, true);
  assert.equal(c.awayName, null);
});

test('出張の期間の外の日は、本来のエリアで、ふつうに受けられる', () => {
  const day = ymd(7); // 出張が終わったあと
  const r = rankCandidates({ gender: 'f', areaId: 'osaka', date: day, start: 600, dur: 90, reservations: [], now: NOW, extraAreas: tripAreas(trips, day) });
  assert.equal([...r.inArea, ...r.others].find((x) => x.user.id === member).awayName, null);
});

test('tripAwayOf: 出張エリアなら null、それ以外のエリアなら出張を返す', () => {
  assert.equal(tripAwayOf(trips, member, today, `trip:${fukuoka.id}`), null);
  assert.equal(tripAwayOf(trips, member, today, 'osaka')?.name, '福岡出張');
  assert.equal(tripAwayOf(trips, member, ymd(7), 'osaka'), null);
});

test('週の空き枠: 出張中の鑑定士は数えない', () => {
  const isAway = (id, date) => Boolean(tripAwayOf(trips, id, date, 'osaka'));
  const base = { userIds: [member], startDate: ymd(-1), dur: 60, reservations: [], now: NOW };
  const day = (w, d) => w.find((x) => x.date === d).slots.reduce((n, s) => n + s.freeIds.length, 0);
  assert.equal(day(findWeekSlots({ ...base, isAway }), today), 0);
  assert.ok(day(findWeekSlots(base), today) >= 0);
});

test('配車で動かす: 出張中の鑑定士の列（出張先以外の訪問）には動かせない', () => {
  const rec = { id: 'R9', date: today, start: '14:00', end: '15:00', userId: 'u10', areaId: 'osaka', customer: {} };
  const awayOf = (userId, date, areaId) => tripAwayOf(trips, userId, date, areaId);
  const v = canPlace(rec, member, 14 * 60, [], NOW, awayOf);
  assert.equal(v.ok, false);
  assert.match(v.reason, /出張中（福岡出張）/);
  assert.equal(canPlace(rec, 'u10', 14 * 60, [], NOW, awayOf).ok !== undefined, true);
});

test('訪問カレンダーの日別: 出張中の鑑定士の列は、休みと同じ扱い（予定を置かず、出張中と分かる）', () => {
  const awayOf = (userId, date, areaId) => tripAwayOf(trips, userId, date, areaId)?.name ?? null;
  const col = dayColumns({ areaId: 'osaka', date: today, reservations: [], now: NOW, awayOf }).find((c) => c.user.id === member);
  assert.equal(col.absent, true);
  assert.equal(col.awayName, '福岡出張');
  assert.deepEqual(col.blocks, []);
});

test('見本の出張: メンバーは、鑑定士アプリの見本の予定（src/schedule.js）が、出張の期間に入っていない（食い違わない）', () => {
  trips.forEach((t) => {
    const from = Math.round((new Date(`${t.start}T00:00:00`) - new Date(2026, 10, 19)) / 86400000);
    const to = Math.round((new Date(`${t.end}T00:00:00`) - new Date(2026, 10, 19)) / 86400000);
    t.memberIds.forEach((id) => assert.ok(!EVENTS.some((e) => e.userId === id && e.day >= from && e.day <= to), `${t.name}の${id}に、期間中の予定がある`));
  });
});
