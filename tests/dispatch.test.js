import { test } from 'node:test';
import assert from 'node:assert/strict';
import { USERS } from '../src/dashboard.js';
import { dayTravel, travelLegs, attendanceOf, canPlace, conflictText, hiddenBlocks, isAbsent, salesDetail, RANKS, rankOfUser, haversineKm, locateAddress, travelAround, areaById, fairerAlternative, areaOfAddress, areaOfUser, busyBlocks, conflictOf, rankCandidates, findSlots, findWeekSlots, fairnessStats } from '../src/dispatch.js';
import { nextReceptionNo, dayOffset, reservationToEvent, ymdOf } from '../src/reservations.js';

const NOW = new Date(2026, 9, 21, 9, 0); // 2026-10-21
const res = (o) => ({
  id: 'r', receptionNo: 'CC-1', receivedAt: '', operator: '佐藤', apType: '新', lat: 0, lng: 0,
  hearing: { wants: 'バッグ', notes: '' }, customer: { name: 'A', kana: '', phone: '', zip: '', address: '' }, gender: 'f', ...o,
});

test('住所から都道府県を判定してエリアを返す', () => {
  assert.equal(areaOfAddress('大阪府大阪市北区1-1').id, 'osaka');
  assert.equal(areaOfAddress('兵庫県神戸市中央区').id, 'hyogo');
  assert.equal(areaOfAddress('東京都千代田区').id, 'kanto');
  assert.deepEqual(areaOfAddress('北海道札幌市'), { id: null, outside: true, pref: '北海道' }); // 対応エリア外
  assert.equal(areaOfAddress('住所未入力のテキスト'), null);
  assert.equal(areaOfAddress(''), null);
});

test('営業のエリア', () => {
  assert.equal(areaOfUser('u01'), 'osaka');
  assert.equal(areaOfUser('u06'), 'hyogo');
});

test('既存の予定・予約がある時間帯は埋まっている', () => {
  assert.ok(busyBlocks('u01', '2026-10-21', [], NOW).some((b) => b.start === 600 && b.end === 690)); // 10:00-11:30
  const withRes = busyBlocks('u04', '2026-10-25', [res({ userId: 'u04', date: '2026-10-25', start: '10:00', end: '11:00' })], NOW);
  assert.ok(withRes.some((b) => b.source === 'reservation' && b.start === 600 && b.end === 660));
});

test('他の営業・他の日の予約は混ざらない', () => {
  const r = res({ userId: 'u02', date: '2026-10-25', start: '10:00', end: '11:00' });
  assert.ok(!busyBlocks('u04', '2026-10-25', [r], NOW).some((b) => b.source === 'reservation'));
  assert.ok(!busyBlocks('u02', '2026-10-26', [r], NOW).some((b) => b.source === 'reservation'));
});

test('ダミーの埋まり具合は、同じ日付なら毎回同じ', () => {
  assert.deepEqual(busyBlocks('u05', '2026-11-03', [], NOW), busyBlocks('u05', '2026-11-03', [], NOW));
});

test('重なり・移動時間（前後30分）を判定する', () => {
  const blocks = [{ start: 600, end: 660, label: '予定', source: 'event' }];
  assert.equal(conflictOf(blocks, 630, 700).kind, 'overlap');
  assert.equal(conflictOf(blocks, 670, 730).kind, 'buffer'); // 終了から10分後の開始は移動できない
  const later = [{ start: 720, end: 780, label: '予定', source: 'event' }];
  assert.equal(conflictOf(later, 630, 700).kind, 'buffer'); // 次の予定の30分前までに終わらない
  assert.equal(conflictOf(later, 600, 690), null);
  assert.equal(conflictOf(blocks, 690, 750), null);
});

test('営業時間外は受けられない', () => {
  const c = rankCandidates({ gender: 'f', areaId: 'kanto', date: '2026-11-10', start: 18 * 60, dur: 90, reservations: [], now: NOW });
  assert.ok(c.inArea.every((x) => !x.free && ['hours', 'absent'].includes(x.conflict.kind))); // 営業時間外（欠勤の営業は、欠勤として扱う）
});

test('候補はエリア内の営業のみ。空いている人が先で、一人はおすすめになる', () => {
  const r = rankCandidates({ gender: 'f', areaId: 'osaka', date: '2026-10-25', start: 13 * 60, dur: 60, reservations: [], now: NOW });
  assert.deepEqual(r.inArea.map((x) => x.user.id).sort(), ['u01', 'u02', 'u03', 'u09', 'u11', 'u12', 'u13', 'u14', 'u15', 'u16']); // 大阪エリアは10名
  assert.ok(r.others.every((x) => areaOfUser(x.user.id) !== 'osaka'));
  const frees = r.inArea.filter((x) => x.free);
  assert.equal(r.inArea.findIndex((x) => !x.free) === -1 ? frees.length : r.inArea.findIndex((x) => !x.free), frees.length);
  assert.equal(r.inArea.filter((x) => x.recommended).length, frees.length ? 1 : 0);
});

test('女性のお客様は、今月の女性の担当が少ない営業を優先する', () => {
  // 予約が増えるほど順位が下がる: u03(女性4件)が最少 → おすすめ。u03に女性を入れ続けると、他の人に順番が回る
  const base = { gender: 'f', areaId: 'osaka', date: '2026-10-28', start: 15 * 60, dur: 60, now: NOW };
  const first = rankCandidates({ ...base, reservations: [] });
  const many = Array.from({ length: 6 }, (_, i) => res({ id: `x${i}`, userId: first.inArea.find((x) => x.recommended).user.id, date: '2026-10-29', start: '10:00', end: '11:00' }));
  const next = rankCandidates({ ...base, reservations: many });
  assert.notEqual(next.inArea.find((x) => x.recommended).user.id, first.inArea.find((x) => x.recommended).user.id);
});

test('その日時に空いていない営業は、おすすめにならず理由を持つ', () => {
  // u01 は今日 10:00-11:30 に予定あり
  const r = rankCandidates({ gender: 'f', areaId: 'osaka', date: '2026-10-21', start: 10 * 60 + 30, dur: 60, reservations: [], now: NOW });
  const u01 = r.inArea.find((x) => x.user.id === 'u01');
  assert.equal(u01.free, false);
  assert.equal(u01.conflict.kind, 'overlap');
  assert.equal(u01.recommended, false);
});

test('空いている営業がいなければ、おすすめなし', () => {
  const r = rankCandidates({ gender: 'm', areaId: 'tokai', date: '2026-10-25', start: 5 * 60, dur: 60, reservations: [], now: NOW });
  assert.equal(r.inArea.some((x) => x.recommended), false);
});

test('公平性の集計: 初期値＋今月の予約。月が違う予約は数えない', () => {
  const base = fairnessStats([], NOW).u04;
  const s = fairnessStats([
    res({ userId: 'u04', date: '2026-10-25', start: '10:00', end: '11:00', gender: 'f' }),
    res({ userId: 'u04', date: '2026-10-26', start: '10:00', end: '11:00', gender: 'm' }),
    res({ userId: 'u04', date: '2026-11-02', start: '10:00', end: '11:00', gender: 'f' }),
  ], NOW).u04;
  assert.equal(s.total, base.total + 2);
  assert.equal(s.female, base.female + 1);
  assert.equal(s.male, base.male + 1);
});

test('空き枠の検索: 空いている営業の人数を30分刻みで返す', () => {
  const slots = findSlots({ userIds: ['u01', 'u02', 'u03'], date: '2026-10-25', dur: 90, reservations: [], now: NOW });
  assert.ok(slots.length > 0);
  assert.ok(slots.every((s) => s.start >= 540 && s.start + 90 <= 1140 && s.start % 30 === 0));
  assert.ok(slots.every((s) => s.freeCount >= 0 && s.freeCount <= 3));
});

test('受電番号の採番・日数・予約→営業アプリの予定', () => {
  assert.equal(nextReceptionNo([], NOW), 'CC-20261021-5001');
  assert.equal(nextReceptionNo([{ receptionNo: 'CC-20261021-5001' }], NOW), 'CC-20261021-5002');
  assert.equal(dayOffset('2026-10-23', NOW), 2);
  assert.equal(dayOffset('2026-10-20', NOW), -1);
  const ev = reservationToEvent(res({ id: 'RS1', userId: 'u01', date: '2026-10-22', start: '10:00', end: '11:00', hearing: { wants: '時計', notes: 'n' } }), NOW);
  assert.equal(ev.day, 1);
  assert.equal(ev.userId, 'u01');
  assert.equal(ev.items, '時計');
});

test('公平性の注意: 女性のお客様で、より担当の少ない空き営業がいれば知らせる', () => {
  const r = rankCandidates({ gender: 'f', areaId: 'osaka', date: '2026-10-25', start: 13 * 60, dur: 60, reservations: [], now: NOW });
  const free = r.inArea.filter((c) => c.free).sort((a, b) => b.stats.female - a.stats.female);
  assert.ok(free.length >= 2);
  const alt = fairerAlternative('f', free[0], r.inArea);
  assert.ok(alt.stats.female < free[0].stats.female);
  assert.equal(fairerAlternative('f', alt, r.inArea), null); // 最少の人を選んでいれば注意なし
  assert.equal(fairerAlternative('m', free[0], r.inArea), null); // 男性のお客様は対象外
  assert.equal(fairerAlternative('f', null, r.inArea), null);
});

test('1週間分の空き枠: 7日分を日付順に返し、空いている営業の id を持つ', () => {
  const ids = ['u01', 'u02', 'u03'];
  const week = findWeekSlots({ userIds: ids, startDate: '2026-10-29', dur: 90, reservations: [], now: NOW });
  assert.deepEqual(week.map((d) => d.date), ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']); // 月またぎ
  assert.equal(week[0].slots[0].start, 540);
  assert.ok(week.every((d) => d.slots.every((s) => s.freeIds.every((id) => ids.includes(id)))));
});

test('1週間分の空き枠: 1日ごとの結果は findSlots と一致し、予約済みの営業は外れる', () => {
  const ids = ['u04', 'u05'];
  const args = { userIds: ids, date: '2026-10-25', dur: 60, reservations: [], now: NOW };
  const day = findWeekSlots({ userIds: ids, startDate: '2026-10-25', days: 1, dur: 60, reservations: [], now: NOW })[0];
  assert.deepEqual(day.slots.map((s) => s.freeIds.length), findSlots(args).map((s) => s.freeCount));
  const r = res({ userId: 'u04', date: '2026-10-25', start: '10:00', end: '11:00' });
  const booked = findWeekSlots({ userIds: ids, startDate: '2026-10-25', days: 1, dur: 60, reservations: [r], now: NOW })[0];
  assert.ok(!booked.slots.find((s) => s.start === 600).freeIds.includes('u04'));
});

test('営業のランクは、全員に付いている', () => {
  assert.ok(USERS.every((u) => RANKS.includes(rankOfUser(u.id))));
  assert.equal(rankOfUser('xxx'), null);
});

test('2点間の距離（大阪〜東京は約400km）', () => {
  const km = haversineKm({ lat: 34.6937, lng: 135.5023 }, { lat: 35.6812, lng: 139.7671 });
  assert.ok(km > 390 && km < 410);
  assert.equal(haversineKm({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0);
});

test('住所の位置は、同じ住所なら毎回同じで、エリアの中心から約10km圏内', () => {
  const area = areaById('osaka');
  const a = locateAddress('大阪府大阪市阿倍野区1-2-3', area);
  assert.deepEqual(a, locateAddress('大阪府大阪市阿倍野区1-2-3', area));
  assert.notDeepEqual(a, locateAddress('大阪府堺市1-1', area));
  assert.ok(haversineKm(a, area) < 15);
  assert.equal(locateAddress('', area), null);
  assert.equal(locateAddress('大阪府…', null), null);
});

test('前後の訪問からの距離: 直前の予定がなければ、その側は出さない（営業所からの距離は見ない）', () => {
  const here = { lat: 34.7, lng: 135.5 };
  const blocks = [
    { start: 600, end: 690, label: 'A 様', source: 'event', lat: 34.65, lng: 135.5, place: '大阪府堺市堺区南瓦町1-1' },
    { start: 900, end: 960, label: 'B 様', source: 'event', lat: 34.75, lng: 135.5 },
  ];
  const t = travelAround(blocks, 750, 840, here);
  assert.deepEqual([t.prev.place, t.prev.gap, t.next.place, t.next.gap], ['大阪府堺市堺区南瓦町1-1', 60, '', 60]); // 余白（分）= 前の終了から開始まで／終了から次の開始まで
  assert.deepEqual([t.prev.label, t.prev.at, t.next.label, t.next.at], ['A 様', 690, 'B 様', 900]);
  assert.ok(t.prev.km > 5 && t.prev.km < 6 && t.prev.min > 0); // 約5.6km
  const first = travelAround(blocks, 540, 600, here); // 一番最初の枠: 直前なし、直後はA様
  assert.equal(first.prev, null);
  assert.equal(first.next.label, 'A 様');
  assert.equal(travelAround(blocks, 750, 840, null), null);
  assert.equal(travelAround([], 750, 840, here).next, null);
});

test('候補に、ランクと移動距離が付く', () => {
  const here = locateAddress('大阪府大阪市阿倍野区1-2-3', areaById('osaka'));
  const { inArea } = rankCandidates({ gender: 'f', areaId: 'osaka', date: '2026-10-21', start: 780, dur: 90, reservations: [], here, now: NOW });
  assert.ok(inArea.every((c) => RANKS.includes(c.rank) && (c.travel.prev === null || c.travel.prev.km >= 0)));
});

test('営業は16名（大阪10・兵庫京都2・関東2・東海2）で、全員にエリア・ランク・今月の実績がある', () => {
  assert.equal(USERS.length, 16);
  assert.equal(USERS.filter((u) => areaOfUser(u.id) === 'osaka').length, 10);
  assert.ok(USERS.every((u) => areaOfUser(u.id) && rankOfUser(u.id) && fairnessStats([], NOW)[u.id].total > 0));
});

test('予定のない営業は、直前の訪問がなく、距離は出ない', () => {
  const here = locateAddress('大阪府大阪市阿倍野区1-2-3', areaById('osaka'));
  const date = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'].find((d) => !isAbsent('u09', d, NOW)); // 欠勤でない日
  const { inArea } = rankCandidates({ gender: 'f', areaId: 'osaka', date, start: 780, dur: 90, reservations: [], here, now: NOW });
  const light = inArea.find((c) => c.user.id === 'u09');
  assert.equal(light.free, true);
  assert.equal(light.travel.prev, null);
});

test('欠勤の営業は、担当に選べない（空きにも数えない）。予定の入っている日は出勤', () => {
  const dates = Array.from({ length: 30 }, (_, i) => ymdOf(new Date(2026, 9, 25 + i)));
  const absences = USERS.flatMap((u) => dates.filter((d) => isAbsent(u.id, d, NOW)).map((d) => [u.id, d]));
  assert.ok(absences.length > 10 && absences.length < 160); // 一定の割合で、欠勤がある
  const [uid, date] = absences[0];
  assert.equal(isAbsent(uid, date, NOW), isAbsent(uid, date, NOW)); // 同じ日は毎回同じ
  const r = rankCandidates({ gender: 'f', areaId: areaOfUser(uid), date, start: 600, dur: 60, reservations: [], now: NOW });
  const c = [...r.inArea, ...r.others].find((x) => x.user.id === uid);
  assert.deepEqual([c.absent, c.free, c.conflict.kind, conflictText(c.conflict)], [true, false, 'absent', '欠勤']);
  assert.ok(!r.inArea.find((x) => x.recommended)?.absent); // おすすめに、欠勤の営業は入らない
  const week = findWeekSlots({ userIds: [uid], startDate: date, days: 1, dur: 60, reservations: [], now: NOW });
  assert.ok(week[0].slots.every((s) => s.freeIds.length === 0)); // 空き人数に数えない
  assert.equal(salesDetail({ userId: uid, date, start: 600, dur: 60, reservations: [], now: NOW }).windows.length, 0);
  assert.equal(isAbsent('u01', '2026-10-21', NOW), false); // u01は、この日に予定が入っている
});


test('営業の詳細: 今月の実績・担当件数・その日の予定と、開始できる時刻の範囲', () => {
  const here = locateAddress('大阪府大阪市阿倍野区1-2-3', areaById('osaka'));
  const d = salesDetail({ userId: 'u01', date: '2026-10-21', start: 13 * 60, dur: 60, reservations: [], here, now: NOW }); // u01は10:00-11:30の予定あり
  assert.equal(d.user.id, 'u01');
  assert.ok(d.month.visits > 0 && d.month.target > 0 && d.month.rate >= 0 && d.month.achieve >= 0);
  assert.equal(d.fairness.total >= d.fairness.female, true);
  assert.ok(d.blocks.some((b) => b.start === 600 && b.end === 690));
  assert.ok(d.windows.length > 0 && d.windows.every((w) => w.from <= w.to));
  assert.ok(d.windows.every((w) => w.from >= 540)); // 営業時間内
  assert.ok(!d.windows.some((w) => w.from <= 600 && w.to >= 600)); // 10:00開始は、予定と重なるので含まない
  assert.equal(salesDetail({ userId: 'zzz', date: '2026-10-21', start: 600, dur: 60, reservations: [], now: NOW }), null);
});

test('仮確定の予約も、営業の空きを埋める（二重に取らない）', () => {
  const t = res({ userId: 'u04', date: '2026-10-25', start: '10:00', end: '11:00', status: 'tentative' });
  const blocks = busyBlocks('u04', '2026-10-25', [t], NOW);
  assert.equal(blocks.find((x) => x.source === 'reservation').status, 'tentative');
  assert.equal(busyBlocks('u04', '2026-10-25', [{ ...t, status: undefined }], NOW).find((x) => x.source === 'reservation').status, 'confirmed'); // 古い記録は確定扱い
});

test('取り消した予約は、営業の空きを埋めず、担当件数にも数えない', () => {
  const r = res({ userId: 'u04', date: '2026-10-25', start: '10:00', end: '11:00', gender: 'f' });
  const before = fairnessStats([], NOW).u04;
  assert.equal(busyBlocks('u04', '2026-10-25', [r], NOW).some((b) => b.source === 'reservation'), true);
  assert.equal(busyBlocks('u04', '2026-10-25', [{ ...r, status: 'cancelled' }], NOW).some((b) => b.source === 'reservation'), false);
  assert.equal(fairnessStats([r], NOW).u04.total, before.total + 1);
  assert.deepEqual(fairnessStats([{ ...r, status: 'cancelled' }], NOW).u04, before);
});

test('配車係の移動: 空いている営業・時間には置ける。欠勤・営業時間外・予定の重なりには置けない', () => {
  const a = res({ id: 'a', userId: 'u09', date: '2026-10-28', start: '13:00', end: '14:30', areaId: 'osaka', status: 'tentative' });
  const b = res({ id: 'b', userId: 'u11', date: '2026-10-28', start: '10:00', end: '11:30', areaId: 'osaka', status: 'tentative' });
  const all = [a, b];
  const okAt = (uid, start) => canPlace(a, uid, start, all, NOW);
  assert.equal(okAt('u09', 15 * 60).ok, true); // 同じ営業で、時間だけずらす（自分自身とは重ならない）
  assert.deepEqual(okAt('u09', 15 * 60), { ok: true, reason: '', start: 900, end: 990 });
  assert.equal(okAt('u09', 8 * 60).reason, '営業時間外');
  assert.equal(okAt('u09', 18 * 60).reason, '営業時間外'); // 90分で19:30まで
  assert.equal(okAt('u11', 10 * 60 + 30).ok, false); // b と重なる
  assert.match(okAt('u11', 10 * 60 + 30).reason, /予定と重なる|移動時間/);
  const absent = USERS.map((u) => u.id).find((id) => isAbsent(id, '2026-10-28', NOW));
  if (absent) assert.deepEqual([canPlace(a, absent, 13 * 60, all, NOW).ok, canPlace(a, absent, 13 * 60, all, NOW).reason], [false, '欠勤']);
  assert.equal(busyBlocks('u11', '2026-10-28', [b], NOW).find((x) => x.source === 'reservation').rid, 'b'); // 帯から、どの予約か分かる
});

test('勤怠: 午後出社（午前休）・午後半休は、働く時間の中だけ選べる', () => {
  const at = (uid, date) => attendanceOf(uid, date, NOW); // NOWは2026-10-21。見本の勤怠は、今日からの日数で指定
  assert.deepEqual([at('u12', '2026-10-23').kind, at('u12', '2026-10-23').from, at('u12', '2026-10-23').to], ['pm', 780, 1140]);
  assert.deepEqual([at('u03', '2026-10-23').kind, at('u03', '2026-10-23').from, at('u03', '2026-10-23').to], ['am', 540, 780]);
  assert.equal(at('u14', '2026-10-23').kind, 'absent');
  assert.equal(at('u01', '2026-10-21').kind, 'present'); // 予定の入っている日は、通常の出勤
  const rank = (start, dur = 60) => rankCandidates({ gender: 'f', areaId: 'osaka', date: '2026-10-23', start, dur, reservations: [], now: NOW }).inArea;
  const pm = rank(10 * 60).find((c) => c.user.id === 'u12'); // 午前は休み
  assert.deepEqual([pm.free, pm.conflict.kind, conflictText(pm.conflict)], [false, 'shift', '午後出社（13:00から）']);
  const am = rank(14 * 60).find((c) => c.user.id === 'u03'); // 午後は休み
  assert.deepEqual([am.free, conflictText(am.conflict)], [false, '午後半休（13:00まで）']);
  assert.notEqual(rank(14 * 60).find((c) => c.user.id === 'u12').conflict?.kind, 'shift'); // 午後出社の人は、午後なら（予定が空いていれば）選べる
  assert.notEqual(rank(10 * 60).find((c) => c.user.id === 'u03').conflict?.kind, 'shift');
  assert.notEqual(rank(12 * 60).find((c) => c.user.id === 'u03').conflict?.kind, 'shift'); // 12:00〜13:00は、ちょうど13:00に終わるので、半休の前に収まる
  assert.equal(rank(12 * 60 + 30).find((c) => c.user.id === 'u03').conflict?.kind, 'shift'); // 12:30〜13:30は、13:00をまたぐので選べない
});

test('勤怠: 空き人数・空き時刻の範囲・移動先の判定にも、働く時間が反映される', () => {
  const week = findWeekSlots({ userIds: ['u12'], startDate: '2026-10-23', days: 1, dur: 60, reservations: [], now: NOW })[0];
  assert.equal(week.slots.find((s) => s.start === 600).freeIds.length, 0); // 午前休の間は、空きに数えない
  const d = salesDetail({ userId: 'u12', date: '2026-10-23', start: 14 * 60, dur: 60, reservations: [], now: NOW });
  assert.ok(d.windows.length && d.windows.every((w) => w.from >= 780));
  const d2 = salesDetail({ userId: 'u03', date: '2026-10-23', start: 10 * 60, dur: 60, reservations: [], now: NOW });
  assert.ok(d2.windows.every((w) => w.to <= 720)); // 午後半休は、13:00までに終わる開始のみ
  const rec = res({ id: 'x', userId: 'u09', date: '2026-10-23', start: '14:00', end: '15:00', areaId: 'osaka' });
  assert.equal(canPlace(rec, 'u12', 14 * 60, [rec], NOW).ok, true);
  assert.deepEqual([canPlace(rec, 'u12', 10 * 60, [rec], NOW).ok, canPlace(rec, 'u12', 10 * 60, [rec], NOW).reason], [false, '午後出社（13:00から）']);
  assert.equal(canPlace(rec, 'u03', 14 * 60, [rec], NOW).reason, '午後半休（13:00まで）');
});

test('元の予定を動かして取り込んでも、元の位置に、別のダミー予定が現れない（重ならない）', () => {
  const dates = Array.from({ length: 40 }, (_, i) => ymdOf(new Date(2026, 9, 21 + i)));
  let withTwo = 0;
  for (const u of USERS) for (const date of dates) {
    const all = busyBlocks(u.id, date, [], NOW).filter((b) => b.source === 'dummy');
    if (all.length >= 2) withTwo += 1;
    for (const hide of all) {
      hiddenBlocks.add(hide.gid);
      const rest = busyBlocks(u.id, date, [], NOW).filter((b) => b.source === 'dummy');
      hiddenBlocks.delete(hide.gid);
      assert.deepEqual(rest.map((b) => b.gid), all.filter((b) => b.gid !== hide.gid).map((b) => b.gid), `${u.name} ${date}`); // 残りは変わらず、新しい予定は増えない
    }
    for (const a of all) for (const b of all) if (a !== b) assert.ok(a.end + 30 <= b.start || b.end + 30 <= a.start, `${u.name} ${date} が重なる`);
  }
  assert.ok(withTwo > 5); // 1日に2件以上ある日も、見本として、ある
});

test('1日の移動距離: 訪問から訪問への距離と、1日の合計（概算）', () => {
  const blocks = [
    { start: 600, end: 660, label: 'A', lat: 34.65, lng: 135.5 },
    { start: 720, end: 780, label: 'B', lat: 34.70, lng: 135.5 },
    { start: 900, end: 960, label: 'C', lat: 34.70, lng: 135.56 },
  ];
  const t = dayTravel(blocks);
  assert.equal(t.legs.length, 2);
  assert.deepEqual([t.legs[0].from.label, t.legs[0].to.label, t.legs[0].gap], ['A', 'B', 60]);
  assert.ok(t.legs[0].km > 5 && t.legs[0].km < 6 && t.legs[0].min > 0 && t.legs[0].tight === false); // 約5.6km
  assert.equal(t.km, Math.round((t.legs[0].km + t.legs[1].km) * 10) / 10);
  assert.deepEqual(dayTravel([blocks[0]]), { legs: [], km: 0, min: 0, count: 1 }); // 1件なら移動なし
  const near = travelLegs([{ start: 600, end: 660, lat: 34.6, lng: 135.4 }, { start: 670, end: 720, lat: 34.9, lng: 135.9 }]); // 間隔10分で、遠い
  assert.equal(near[0].tight, true);
  assert.equal(travelLegs([{ start: 600, end: 660 }, { start: 700, end: 760, lat: 1, lng: 1 }]).length, 0); // 座標のない予定は飛ばす
});
