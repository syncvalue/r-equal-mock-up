import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const V = await import('../src/storeVisits.js');

const NOW = new Date(2026, 9, 25, 11, 0).getTime(); // 2026-10-25 11:00
const opts = { storeIds: ['S-NAMBA', 'S-SHINJUKU'], now: NOW };
const rsv = (o = {}) => ({ storeId: 'S-NAMBA', date: '2026-10-26', time: '14:00', name: '山田 花子', kana: 'ヤマダ ハナコ', phone: '090-1234-5678', wants: '腕時計 2本', by: '佐藤', ...o });

test('来店予約: 店舗・日付・時刻・お名前・電話番号が必要。今日以降の日付だけ。状態は「予約」で、受けたオペレーターが残る', () => {
  const r = V.reserveVisit([], rsv(), opts);
  assert.equal(r.ok, true);
  const v = r.list[0];
  assert.deepEqual([v.status, v.source, v.storeId, v.date, v.time, v.createdBy], ['reserved', 'reserved', 'S-NAMBA', '2026-10-26', '14:00', '佐藤']);
  assert.deepEqual(v.customer, { name: '山田 花子', kana: 'ヤマダ ハナコ', phone: '090-1234-5678' });
  assert.ok(v.id && v.createdAt === NOW);
  assert.equal(V.reserveVisit([], rsv({ storeId: 'S-NOPE' }), opts).reason, 'noStore');
  assert.equal(V.reserveVisit([], rsv({ name: ' ' }), opts).reason, 'noName');
  assert.equal(V.reserveVisit([], rsv({ phone: '' }), opts).reason, 'noPhone');
  assert.equal(V.reserveVisit([], rsv({ date: '2026-10-24' }), opts).reason, 'badDate');
  assert.equal(V.reserveVisit([], rsv({ date: '' }), opts).reason, 'badDate');
  assert.equal(V.reserveVisit([], rsv({ time: '25:00' }), opts).reason, 'badTime');
  assert.equal(V.reserveVisit([], rsv({ date: '2026-10-25', time: '12:00' }), opts).ok, true); // 今日もよい
});

test('飛び込み: 予約なしで来店。お名前だけで受付でき、そのまま「待ち」になる（電話番号は、聞ければ）', () => {
  const r = V.walkIn([], { storeId: 'S-NAMBA', name: '鈴木 一', phone: '', wants: 'ブランドバッグ', by: '田中 美咲' }, opts);
  assert.equal(r.ok, true);
  const v = r.list[0];
  assert.deepEqual([v.status, v.source, v.date, v.time, v.arrivedAt, v.createdBy], ['waiting', 'walkin', '2026-10-25', '', NOW, '田中 美咲']);
  assert.equal(V.walkIn([], { storeId: 'S-NAMBA', name: '' }, opts).reason, 'noName');
  assert.equal(V.walkIn([], { storeId: 'S-NOPE', name: 'x' }, opts).reason, 'noStore');
});

test('状態の流れ: 予約 → 来店済み（待ち）→ 対応中（担当の店舗スタッフ）→ 完了。順番を飛ばせるのは、予約から直接の対応開始だけ', () => {
  const staff = { id: 'st01', name: '田中 美咲' };
  let list = V.reserveVisit([], rsv({ date: '2026-10-25' }), opts).list;
  const id = list[0].id;
  assert.equal(V.startServing(list, id, staff, opts).ok, true); // 予約のまま対応を始めてもよい（来店済みの操作を省く）
  list = V.arrive(list, id, opts).list;
  assert.deepEqual([list[0].status, list[0].arrivedAt], ['waiting', NOW]);
  assert.equal(V.arrive(list, id, opts).reason, 'badStatus'); // 二重に来店済みにはしない
  list = V.startServing(list, id, staff, opts).list;
  assert.deepEqual([list[0].status, list[0].staffId, list[0].staffName, list[0].startedAt], ['serving', 'st01', '田中 美咲', NOW]);
  assert.equal(V.startServing(list, id, staff, opts).reason, 'badStatus');
  list = V.completeVisit(list, id, { type: 'purchased', contractId: 'GS1', total: 120000, count: 2 }, opts).list;
  assert.deepEqual([list[0].status, list[0].endedAt, list[0].result.total], ['done', NOW, 120000]);
  assert.equal(V.completeVisit(list, id, { type: 'declined' }, opts).reason, 'badStatus');
  assert.equal(V.arrive(list, 'nope', opts).reason, 'notFound');
});

test('買取に至らなかった来店: 「見送り」で完了にできる（成約率の分母になる）', () => {
  let list = V.walkIn([], { storeId: 'S-NAMBA', name: 'x' }, opts).list;
  const id = list[0].id;
  list = V.startServing(list, id, { id: 'st01', name: '田中' }, opts).list;
  list = V.completeVisit(list, id, { type: 'declined' }, opts).list;
  assert.deepEqual([list[0].status, list[0].result.type], ['done', 'declined']);
});

test('取消と来ず: 取消は理由つきで記録を残す（予約・待ちのみ）。来ずは、予約の日になった予約だけ', () => {
  let list = V.reserveVisit([], rsv(), opts).list;
  const id = list[0].id;
  assert.equal(V.cancelVisit(list, id, '', '佐藤', opts).reason, 'noReason');
  assert.equal(V.markNoShow(list, id, opts).reason, 'tooEarly'); // 明日の予約は、まだ「来ず」にできない
  const c = V.cancelVisit(list, id, 'お客様のご都合', '佐藤', opts);
  assert.deepEqual([c.list[0].status, c.list[0].cancelReason, c.list[0].cancelledBy, c.list[0].cancelledAt], ['cancelled', 'お客様のご都合', '佐藤', NOW]);
  assert.equal(V.cancelVisit(c.list, id, 'x', '佐藤', opts).reason, 'badStatus');
  const today = V.reserveVisit([], rsv({ date: '2026-10-25', time: '10:00' }), opts).list;
  assert.equal(V.markNoShow(today, today[0].id, opts).list[0].status, 'noshow');
  const serving = V.startServing(today, today[0].id, { id: 's', name: 's' }, opts).list;
  assert.equal(V.cancelVisit(serving, today[0].id, 'x', 'y', opts).reason, 'badStatus'); // 対応中は取り消せない
});

test('今日の来店: 店舗ごと・日ごとに、状態別に並べる。予約は時刻順、待ちは来店順。取消・来ずは別に数える', () => {
  let list = [];
  list = V.reserveVisit(list, rsv({ date: '2026-10-25', time: '15:00', name: 'B' }), opts).list;
  list = V.reserveVisit(list, rsv({ date: '2026-10-25', time: '12:00', name: 'A' }), opts).list;
  list = V.reserveVisit(list, rsv({ date: '2026-10-25', storeId: 'S-SHINJUKU', name: '他店' }), opts).list;
  list = V.reserveVisit(list, rsv({ date: '2026-10-26', name: '明日' }), opts).list;
  list = V.walkIn(list, { storeId: 'S-NAMBA', name: 'W1' }, { ...opts, now: NOW + 1000 }).list;
  list = V.walkIn(list, { storeId: 'S-NAMBA', name: 'W2' }, { ...opts, now: NOW + 2000 }).list;
  const b = V.boardOf(list, 'S-NAMBA', '2026-10-25');
  assert.deepEqual(b.reserved.map((v) => v.customer.name), ['A', 'B']);
  assert.deepEqual(b.waiting.map((v) => v.customer.name), ['W1', 'W2']);
  assert.deepEqual([b.serving.length, b.done.length, b.cancelled.length], [0, 0, 0]);
  assert.equal(V.boardOf(list, 'S-NAMBA', '2026-10-26').reserved.length, 1);
  assert.equal(V.boardOf(list, 'S-SHINJUKU', '2026-10-25').reserved.length, 1);
});

test('予約の一覧: 今日以降の予約を、日付・時刻順に出す（コールセンターの画面用）。店舗で絞れる', () => {
  let list = [];
  list = V.reserveVisit(list, rsv({ date: '2026-10-27', time: '10:00', name: 'C' }), opts).list;
  list = V.reserveVisit(list, rsv({ date: '2026-10-26', time: '16:00', name: 'B' }), opts).list;
  list = V.reserveVisit(list, rsv({ date: '2026-10-26', time: '09:30', name: 'A', storeId: 'S-SHINJUKU' }), opts).list;
  assert.deepEqual(V.upcomingReservations(list, '2026-10-25').map((v) => v.customer.name), ['A', 'B', 'C']);
  assert.deepEqual(V.upcomingReservations(list, '2026-10-25', 'S-NAMBA').map((v) => v.customer.name), ['B', 'C']);
  assert.deepEqual(V.upcomingReservations(list, '2026-10-27').map((v) => v.customer.name), ['C']);
});

test('集計: 来店数・買取（成約）数・成約率・買取額。取消・来ずは来店に数えない', () => {
  const staff = { id: 'st01', name: '田中' };
  let list = [];
  const add = (name, type, total = 0) => {
    list = V.walkIn(list, { storeId: 'S-NAMBA', name }, opts).list;
    const id = list.find((v) => v.customer.name === name).id;
    list = V.startServing(list, id, staff, opts).list;
    list = V.completeVisit(list, id, type === 'purchased' ? { type, total, count: 1 } : { type }, opts).list;
  };
  add('a', 'purchased', 100000);
  add('b', 'purchased', 50000);
  add('c', 'declined');
  list = V.walkIn(list, { storeId: 'S-NAMBA', name: 'd' }, opts).list; // 待ち（まだ完了していない）
  const cancelled = V.reserveVisit(list, rsv({ date: '2026-10-25' }), opts).list;
  const id = cancelled.find((v) => v.status === 'reserved').id;
  list = V.cancelVisit(cancelled, id, 'x', 'y', opts).list;
  const s = V.summaryOf(list, 'S-NAMBA', '2026-10-25');
  assert.deepEqual(s, { visits: 4, done: 3, purchased: 2, rate: 2 / 3, total: 150000 });
  assert.equal(V.summaryOf([], 'S-NAMBA', '2026-10-25').rate, 0);
});

test('保存と読み込み: 保存した来店を読み戻せる。保存がない・壊れていれば空', () => {
  assert.deepEqual(V.loadStoreVisits(), []);
  const r = V.reserveVisit([], rsv(), opts);
  assert.equal(V.saveStoreVisits(r.list), true);
  assert.equal(V.loadStoreVisits().length, 1);
  mem.set(V.STORE_VISITS_KEY, '{broken');
  assert.deepEqual(V.loadStoreVisits(), []);
  mem.clear();
});

test('状態の表示名: 用語集のとおり（予約・待ち・対応中・完了・取消・来ず）', () => {
  assert.deepEqual(Object.values(V.STATUS_LABEL), ['予約', '待ち', '対応中', '完了', '取消', '来ず']);
});
