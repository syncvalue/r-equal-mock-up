import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const T = await import('../src/trips.js');
const { areaOfAddress, areaById, rankCandidates } = await import('../src/dispatch.js');

const NOW = new Date(2026, 9, 25, 9, 0); // 2026-10-25
const userIds = ['u01', 'u02', 'u03'];
const input = { name: '福岡出張', prefs: '福岡県、佐賀県', start: '2026-11-02', end: '2026-11-08', memberIds: ['u01', 'u02'] };
const make = (o = {}) => T.saveTrip([], { ...input, ...o }, { userIds });

test('登録: 名前・担当の都道府県・期間・出張メンバーが必要。reason で理由を返す', () => {
  const r = make();
  assert.equal(r.ok, true);
  assert.deepEqual([r.trips.length, r.trips[0].name, r.trips[0].prefs, r.trips[0].memberIds, r.trips[0].active], [1, '福岡出張', ['福岡県', '佐賀県'], ['u01', 'u02'], true]);
  assert.equal(make({ name: ' ' }).reason, 'noName');
  assert.equal(make({ prefs: '' }).reason, 'noPref');
  assert.equal(make({ prefs: '福岡' }).reason, 'badPref');
  assert.equal(make({ start: '' }).reason, 'badPeriod');
  assert.equal(make({ start: '2026-11-09' }).reason, 'badPeriod'); // 終了が開始より前
  assert.equal(make({ end: '2026-11-02' }).ok, true); // 1日だけでもよい
  assert.equal(make({ memberIds: [] }).reason, 'noMember');
  assert.equal(make({ memberIds: ['u01', 'zzz'] }).reason, 'badMember');
});

test('登録: 営業所のあるエリアの都道府県は不可（出張は、営業所のないエリアに行くもの）。同じ名前は不可', () => {
  assert.equal(make({ prefs: '福岡県、大阪府' }).reason, 'inOffice');
  const first = make();
  assert.equal(T.saveTrip(first.trips, input, { userIds }).reason, 'dupName');
});

test('更新: id があれば更新。有効・無効は保たれる', () => {
  const a = make();
  const off = T.setTripActive(a.trips, a.trips[0].id, false);
  assert.equal(off.trips[0].active, false);
  const up = T.saveTrip(off.trips, { ...input, id: a.trips[0].id, name: '九州出張' }, { userIds });
  assert.deepEqual([up.trips.length, up.trips[0].name, up.trips[0].active], [1, '九州出張', false]);
  assert.equal(T.saveTrip(a.trips, { ...input, id: 'nope' }, { userIds }).reason, 'notFound');
  assert.equal(T.setTripActive(a.trips, 'nope', true).reason, 'notFound');
});

test('出張の日: 期間の両端を含む。無効な出張は含まない', () => {
  const a = make().trips;
  assert.equal(T.tripsOn(a, '2026-11-01').length, 0);
  assert.equal(T.tripsOn(a, '2026-11-02').length, 1);
  assert.equal(T.tripsOn(a, '2026-11-08').length, 1);
  assert.equal(T.tripsOn(a, '2026-11-09').length, 0);
  assert.equal(T.tripsOn(T.setTripActive(a, a[0].id, false).trips, '2026-11-03').length, 0);
});

test('出張中の営業: その日に出張メンバーである出張を返す', () => {
  const a = make().trips;
  assert.deepEqual(T.tripsOfUser(a, 'u01', '2026-11-03').map((t) => t.name), ['福岡出張']);
  assert.deepEqual(T.tripsOfUser(a, 'u03', '2026-11-03'), []);
  assert.deepEqual(T.tripsOfUser(a, 'u01', '2026-11-20'), []);
});

test('出張エリア: 日付があればその日の出張だけ、なければすべて。担当の都道府県・メンバー・代用座標を持つ', () => {
  const a = make().trips;
  const [area] = T.tripAreas(a, '2026-11-03');
  assert.equal(area.id, `trip:${a[0].id}`);
  assert.deepEqual([area.name, area.prefs, area.memberIds, area.trip], ['福岡出張', ['福岡県', '佐賀県'], ['u01', 'u02'], true]);
  assert.equal(typeof area.lat, 'number');
  assert.equal(typeof area.lng, 'number');
  assert.equal(T.tripAreas(a, '2026-12-01').length, 0);
  assert.equal(T.tripAreas(a).length, 1);
  assert.equal(T.tripAreas(T.setTripActive(a, a[0].id, false).trips).length, 1); // 日付なしは、無効な出張も（過去の受付の表示用）
});

test('エリア判定: 出張の期間中は、出張の都道府県のお客様が出張エリアになる。期間外は対応エリア外', () => {
  const a = make().trips;
  const on = T.tripAreas(a, '2026-11-03');
  assert.equal(areaOfAddress('福岡県福岡市博多区1-1', on).id, `trip:${a[0].id}`);
  assert.equal(areaOfAddress('福岡県福岡市博多区1-1', on).pref, '福岡県');
  assert.equal(areaOfAddress('福岡県福岡市博多区1-1', []).outside, true);
  assert.equal(areaOfAddress('大阪府大阪市北区', on).id, 'osaka'); // 営業所のエリアはそのまま
  assert.equal(areaById(`trip:${a[0].id}`, on).name, '福岡出張');
  assert.equal(areaById(`trip:${a[0].id}`), null);
});

test('候補: 出張エリアでは出張メンバーが候補。本来の営業所のエリアでも候補に残り、出張中の印（trips）が付く', () => {
  const a = make().trips;
  const extraAreas = T.tripAreas(a, '2026-11-03');
  const base = { gender: 'f', date: '2026-11-03', start: 13 * 60, dur: 60, reservations: [], now: NOW, extraAreas };
  const trip = rankCandidates({ ...base, areaId: extraAreas[0].id });
  assert.deepEqual(trip.inArea.map((c) => c.user.id).sort(), ['u01', 'u02']);
  assert.ok(trip.inArea.every((c) => c.trips.map((t) => t.name).includes('福岡出張')));
  const osaka = rankCandidates({ ...base, areaId: 'osaka' });
  const u01 = osaka.inArea.find((c) => c.user.id === 'u01');
  assert.deepEqual(u01.trips.map((t) => t.name), ['福岡出張']);
  assert.deepEqual(osaka.inArea.find((c) => c.user.id === 'u03').trips, []);
  const after = rankCandidates({ ...base, date: '2026-11-20', areaId: 'osaka', extraAreas: T.tripAreas(a, '2026-11-20') });
  assert.deepEqual(after.inArea.find((c) => c.user.id === 'u01').trips, []);
});

test('保存と読み込み: 保存した出張を読み戻せる。保存がない・壊れていれば空', () => {
  assert.deepEqual(T.loadTrips(), []);
  const a = make().trips;
  assert.equal(T.saveTrips(a), true);
  assert.deepEqual(T.loadTrips(), a);
  mem.set(T.TRIPS_KEY, '{broken');
  assert.deepEqual(T.loadTrips(), []);
  mem.clear();
});

test('見本: 今日を基準に、出張中・これから・終了の3つ。すべて検証を通る', () => {
  const s = T.sampleTrips(NOW, ['u01', 'u02', 'u03', 'u04', 'u05', 'u06']);
  assert.equal(s.length, 3);
  assert.ok(T.tripsOn(s, '2026-10-25').length === 1);
  assert.ok(T.tripsOn(s, '2026-11-05').length === 1);
  assert.ok(s.every((t) => T.saveTrip([], { ...t, id: undefined }, { userIds: ['u01', 'u02', 'u03', 'u04', 'u05', 'u06'] }).ok));
  assert.deepEqual(T.loadTrips(NOW, ['u01', 'u02', 'u03', 'u04', 'u05', 'u06']), s); // 保存がなければ見本
  mem.clear();
});

test('出張の状態: 出張中・これから・終了（無効なら停止）', () => {
  const a = make().trips[0];
  assert.equal(T.tripStatus(a, '2026-10-25'), 'upcoming');
  assert.equal(T.tripStatus(a, '2026-11-02'), 'ongoing');
  assert.equal(T.tripStatus(a, '2026-11-08'), 'ongoing');
  assert.equal(T.tripStatus(a, '2026-11-09'), 'ended');
  assert.equal(T.tripStatus({ ...a, active: false }, '2026-11-03'), 'inactive');
});
