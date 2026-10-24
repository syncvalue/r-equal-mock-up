import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fairerAlternative, areaOfAddress, areaOfUser, busyBlocks, conflictOf, rankCandidates, findSlots, fairnessStats } from '../src/dispatch.js';
import { nextReceptionNo, dayOffset, reservationToEvent } from '../src/reservations.js';

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
  assert.ok(c.inArea.every((x) => !x.free && x.conflict.kind === 'hours'));
});

test('候補はエリア内の営業のみ。空いている人が先で、一人はおすすめになる', () => {
  const r = rankCandidates({ gender: 'f', areaId: 'osaka', date: '2026-10-25', start: 13 * 60, dur: 60, reservations: [], now: NOW });
  assert.deepEqual(r.inArea.map((x) => x.user.id).sort(), ['u01', 'u02', 'u03']);
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
