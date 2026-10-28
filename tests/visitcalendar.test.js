import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotStarts, areaStaff, areaStaffOver, weekHeat, dayColumns, heatStyle } from '../src/visitCalendar.js';
import { areaOfUser } from '../src/dispatch.js';

const NOW = new Date(2026, 9, 29, 9, 0);
const dates = Array.from({ length: 7 }, (_, i) => `2026-11-${String(7 + i).padStart(2, '0')}`);
const rez = (userId, date, start, end, o = {}) => ({ id: `T-${userId}-${date}-${start}`, userId, date, start, end, status: 'confirmed', areaId: 'osaka', customer: { name: '試験 太郎', address: '大阪府' }, ...o });

test('時間の行は、営業時間（9:00〜19:00）を30分刻みで、開始時刻として並べる', () => {
  const s = slotStarts();
  assert.equal(s.length, 20);
  assert.deepEqual([s[0], s.at(-1)], [540, 1110]);
});

test('エリアの営業は、そのエリアの営業所の営業（その日に別エリアから訪問が入った営業も含む）', () => {
  const staff = areaStaff('osaka', dates[0], [], NOW);
  assert.ok(staff.length >= 5 && staff.every((u) => areaOfUser(u.id) === 'osaka'));
});

test('週の濃さ: 日ごと・時間ごとに、訪問が入っている営業の人数と割合を出す（0〜1）', () => {
  const heat = weekHeat({ areaId: 'osaka', dates, reservations: [], now: NOW });
  assert.equal(heat.length, 7);
  for (const d of heat) {
    assert.equal(d.slots.length, 20);
    assert.ok(d.total > 0 && d.total <= areaStaff('osaka', d.date, [], NOW).length); // 欠勤の営業は数えない
    for (const s of d.slots) assert.ok(s.busy >= 0 && s.busy <= s.total && s.ratio >= 0 && s.ratio <= 1);
  }
});

test('訪問が入ると、その時間の人数が増える（訪問の時間と重なる枠だけ）。取消は数えない', () => {
  const base = weekHeat({ areaId: 'osaka', dates, reservations: [], now: NOW });
  // 欠勤でなく、10:00〜11:30 に予定のない営業と日を探す
  let hit = null;
  for (const date of dates) for (const c of dayColumns({ areaId: 'osaka', date, reservations: [], now: NOW })) {
    if (!hit && !c.absent && c.att.kind === 'present' && !c.blocks.some((b) => b.start < 690 && b.end > 600)) hit = { date, userId: c.user.id };
  }
  assert.ok(hit);
  const at = (heat) => heat.find((d) => d.date === hit.date).slots;
  const withIt = at(weekHeat({ areaId: 'osaka', dates, reservations: [rez(hit.userId, hit.date, '10:00', '11:30')], now: NOW }));
  const b = at(base);
  const idx = (m) => (m - 540) / 30;
  for (const m of [600, 630, 660]) assert.equal(withIt[idx(m)].busy, b[idx(m)].busy + 1, String(m));
  assert.equal(withIt[idx(570)].busy, b[idx(570)].busy); // 9:30は重ならない
  assert.equal(withIt[idx(690)].busy, b[idx(690)].busy); // 11:30は終了の時刻
  const cancelled = at(weekHeat({ areaId: 'osaka', dates, reservations: [rez(hit.userId, hit.date, '10:00', '11:30', { status: 'cancelled' })], now: NOW }));
  assert.equal(cancelled[idx(600)].busy, b[idx(600)].busy);
});

test('日別の列は営業ごと。その営業の訪問（予約）が入る', () => {
  const cols = dayColumns({ areaId: 'osaka', date: dates[0], reservations: [], now: NOW });
  const u = cols.find((c) => !c.absent).user;
  const cols2 = dayColumns({ areaId: 'osaka', date: dates[0], reservations: [rez(u.id, dates[0], '13:00', '14:00')], now: NOW });
  assert.ok(cols2.find((c) => c.user.id === u.id).blocks.some((b) => b.rid === `T-${u.id}-${dates[0]}-13:00`));
});

test('濃さの色: 空きは薄く、埋まるほど濃くなる。濃いときは白い文字', () => {
  const a = [0, 0.25, 0.5, 0.75, 1].map((r) => heatStyle(r).alpha);
  assert.ok(a.every((x, i) => i === 0 || x > a[i - 1]));
  assert.ok(a[0] < 0.15 && a[4] > 0.8);
  assert.equal(heatStyle(0.2).fg, 'text-slate-700');
  assert.equal(heatStyle(1).fg, 'text-white');
});

test('枠の訪問は、1件ずつ（お客様の名前・住所）。その時間に重なる訪問がすべて入る', () => {
  const cols = dayColumns({ areaId: 'osaka', date: dates[0], reservations: [], now: NOW });
  const c = cols.find((x) => !x.absent && x.att.kind === 'present' && !x.blocks.some((b) => b.start < 750 && b.end > 690));
  assert.ok(c);
  const heat = weekHeat({ areaId: 'osaka', dates, reservations: [rez(c.user.id, dates[0], '11:30', '12:30', { customer: { name: '山田 花子', address: '大阪府大阪市阿倍野区1-2-3' } })], now: NOW });
  const slot = (m) => heat[0].slots[(m - 540) / 30];
  const v = slot(690).visits.find((x) => x.userId === c.user.id);
  assert.deepEqual([v.name, v.place, v.rid], ['山田 花子', '大阪府大阪市阿倍野区1-2-3', `T-${c.user.id}-${dates[0]}-11:30`]);
  assert.ok(slot(720).visits.some((x) => x.userId === c.user.id)); // 12:00の枠にも（12:30まで）
  assert.ok(!slot(750).visits.some((x) => x.rid === v.rid));
  assert.equal(slot(690).busy, new Set(slot(690).visits.map((x) => x.userId)).size);
});

test('営業で絞り込む: 選んだ営業だけの列・人数・訪問になる（空なら全員）', () => {
  const all = dayColumns({ areaId: 'osaka', date: dates[0], reservations: [], now: NOW });
  const pick = all.slice(0, 2).map((c) => c.user.id);
  const some = dayColumns({ areaId: 'osaka', date: dates[0], reservations: [], now: NOW, userIds: pick });
  assert.deepEqual(some.map((c) => c.user.id), pick);
  const heat = weekHeat({ areaId: 'osaka', dates, reservations: [], now: NOW, userIds: pick });
  for (const d of heat) { assert.ok(d.total <= 2); for (const s of d.slots) assert.ok(s.visits.every((v) => pick.includes(v.userId))); }
  assert.equal(areaStaffOver('osaka', dates, [], NOW).length >= all.length, true);
});
