import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCall, addCall, callsOfPhones, lastCallOf, daysSince, tooSoon, CALL_RESULTS } from '../src/callLog.js';
import { callHistory } from '../src/callHistory.js';
import { customerRows, filterRows, sortRows, maskOtherSales } from '../src/myCustomers.js';

const NOW = new Date(2026, 10, 17, 12, 0);
const base = { phone: '090-1111-2222', customerName: '山田 花子', by: '鑑定士 鈴木 一郎', userId: 'u01', result: 'talked', at: NOW.getTime() - 3 * 86400000 };

test('電話の記録: 結果は必須。再訪のアポが取れたときは、希望日時も必須', () => {
  assert.equal(makeCall({ ...base, result: '' }).ok, false);
  assert.equal(makeCall({ ...base, result: 'appo' }).ok, false);
  assert.equal(makeCall({ ...base, phone: '090' }).ok, false);
  assert.equal(makeCall({ ...base, by: '' }).ok, false);
  const ok = makeCall({ ...base, result: 'appo', wish: '12/5（金）午後', memo: ' 腕時計を見たい ' });
  assert.ok(ok.ok && ok.call.memo === '腕時計を見たい' && ok.call.id);
  assert.deepEqual(Object.keys(CALL_RESULTS), ['appo', 'talked', 'noanswer', 'ng']);
});

test('電話の記録: 電話番号（ハイフンの有無・2つの番号）で探し、新しい順。直近の電話と、かけすぎの目安', () => {
  const a = makeCall({ ...base }).call;
  const b = makeCall({ ...base, at: NOW.getTime() - 10 * 86400000, result: 'noanswer', phone: '09011112222' }).call;
  const c = makeCall({ ...base, phone: '080-0000-0000' }).call;
  const list = [c, b, a].reduce(addCall, []);
  assert.deepEqual(callsOfPhones(list, ['', '090-1111-2222']).map((x) => x.result), ['talked', 'noanswer']);
  assert.equal(lastCallOf(list, ['090-1111-2222']).id, a.id);
  assert.equal(lastCallOf(list, ['070-9999-9999']), null);
  assert.equal(daysSince(a.at, NOW), 3);
  assert.equal(tooSoon(a, NOW), true); // 7日以内
  assert.equal(tooSoon(b, NOW), false);
});

test('受電履歴（オペレーターの画面）に、鑑定士の電話と前日確認の電話も出る', () => {
  const call = makeCall({ ...base, result: 'appo', wish: '12/5午後' }).call;
  const res = { id: 'r1', operator: '佐藤', receivedAt: '2026/11/01 10:00', date: '2026-11-10', start: '13:00', hearing: { wants: 'バッグ' }, customer: { name: '山田', phone: '090-1111-2222' },
    confirmCalls: [{ result: 'noanswer', by: '渡辺', at: new Date(2026, 10, 9, 15).getTime(), memo: '' }] };
  const list = callHistory(['090-1111-2222'], [res], [call]);
  assert.deepEqual(list.map((x) => x.kind), ['鑑定士が架電', '前日確認の電話', '新規受付']);
  assert.match(list[0].note, /再訪のアポが取れた/);
  assert.match(list[0].note, /12\/5午後/);
  assert.equal(list[0].by, '鑑定士 鈴木 一郎');
});

test('顧客リスト: 自分が担当した顧客だけ。前回訪問からの日数・住所の位置・訪問回数がある', () => {
  const mine = customerRows('u01', { now: NOW });
  assert.ok(mine.length >= 6);
  assert.equal(new Set(mine.map((r) => r.phone)).size, mine.length);
  assert.ok(mine.every((r) => r.name && r.phone && r.address && r.lat && r.lng && r.days >= 0 && r.visitCount >= 1));
  assert.ok(mine.some((r) => r.name === '山田 花子')); // 評価を残した訪問（鈴木 一郎）
  assert.ok(mine.some((r) => r.name === '佐野 健')); // 前日の予定で、買取した訪問
  assert.ok(!mine.some((r) => r.name === '中川 美和')); // 不在で、訪問できていない
  assert.ok(!mine.some((r) => r.name === '前川 玲子')); // 他の鑑定士の顧客
  const other = customerRows('u02', { now: NOW });
  assert.ok(!other.some((r) => r.name === '山田 花子' && r.visitCount > 1)); // 山田さんの、鈴木さんの訪問は、田中さんには入らない
});

test('顧客リスト: 検索・絞り込み・並べ替え（日数・近さ・電話）', () => {
  const calls = [makeCall({ ...base, phone: customerRows('u01', { now: NOW })[0].phone }).call];
  const here = { lat: 34.6623, lng: 135.5174 };
  const rows = customerRows('u01', { now: NOW, from: here, calls });
  assert.ok(rows.every((r) => typeof r.distanceKm === 'number'));
  assert.ok(rows.some((r) => r.lastCall));
  assert.deepEqual(filterRows(rows, { q: '山田' }).map((r) => r.name), ['山田 花子']);
  assert.equal(filterRows(rows, { q: 'ヤマダ' }).length, 1); // フリガナ
  assert.ok(filterRows(rows, { minDays: 90 }).every((r) => r.days >= 90));
  assert.ok(filterRows(rows, { nearKm: 5 }).every((r) => r.distanceKm <= 5));
  const byDays = sortRows(rows, 'days');
  assert.ok(byDays.every((r, i) => i === 0 || byDays[i - 1].days >= r.days)); // 前回訪問から長い順
  const byNear = sortRows(rows, 'near');
  assert.ok(byNear.every((r, i) => i === 0 || byNear[i - 1].distanceKm <= r.distanceKm));
  assert.equal(customerRows('u01', { now: NOW }).every((r) => r.distanceKm === null), true); // 現在地が分からなければ、距離なし
});

test('並べ替え: 過去の買取金額順・買取できなかった商品数順（自分の訪問だけを数える）', () => {
  const rows = customerRows('u01', { now: NOW });
  const byTotal = sortRows(rows, 'total');
  assert.ok(byTotal.every((r, i) => i === 0 || byTotal[i - 1].total >= r.total));
  const byDeclined = sortRows(rows, 'declined');
  assert.ok(byDeclined.every((r, i) => i === 0 || byDeclined[i - 1].declinedCount >= r.declinedCount));
  assert.ok(byDeclined[0].declinedCount > 0 && rows.some((r) => r.declinedCount === 0));
  assert.equal(rows.find((r) => r.name === '田村 恵').declinedCount, 1); // 前日の訪問で、見送りにした1点
  assert.equal(rows.find((r) => r.name === '山田 花子').declinedCount, 0); // 山田さんの見送り品は、田中さんの訪問のもの（鈴木さんの訪問ではない）
});

test('電話履歴の見え方: 他の鑑定士の名前は伏せる。オペレーターと自分は、そのまま', () => {
  const list = [{ by: '鑑定士 田中 健', kind: '鑑定士が架電', userId: 'u02' }, { by: '鑑定士 鈴木 一郎', kind: '鑑定士が架電', userId: 'u01' }, { by: '佐藤', kind: '前日確認の電話' }];
  const v = maskOtherSales(list, 'u01');
  assert.deepEqual(v.map((x) => x.by), ['鑑定士（ほかの担当）', '鑑定士 鈴木 一郎', '佐藤']);
});

test('画面: 顧客検索の一覧と、お客様の詳細（電話の記録・履歴）が描画できる。メニューにある', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
  globalThis.document = { documentElement: { classList: { toggle() {}, contains: () => false }, style: {} }, querySelector: () => ({}), querySelectorAll: () => [], addEventListener() {}, activeElement: null, head: { appendChild() {} }, createElement: () => ({}) };
  const V = await import('../src/views.js');
  assert.ok(V.MENU.some((m) => m.key === 'customers' && m.label === '顧客検索'));
  const s = { user: 'u01', geo: { ok: true, lat: 34.6623, lng: 135.5174 }, cust: { q: '', sort: 'near', minDays: 0, near: false, form: { result: '', wish: '', memo: '' } }, modal: null };
  const html = V.customersView(s);
  for (const w of ['顧客検索', '山田 花子', '現在地から', '前回の訪問から', '電話していない順']) assert.ok(html.includes(w), w);
  assert.ok(!html.includes('前川 玲子')); // 他の鑑定士の顧客
  // 電話を記録 → 詳細の履歴に出る。ほかの鑑定士の電話は、名前が伏せられる
  const save = (userId, by, result) => { const c = makeCall({ phone: '090-2468-1357', customerName: '山田 花子', by, userId, result, at: Date.now() - 86400000 * (userId === 'u01' ? 1 : 20) }).call; mem.set('rq-mock-call-log', JSON.stringify(addCall(JSON.parse(mem.get('rq-mock-call-log') ?? '[]'), c))); };
  save('u02', '鑑定士 田中 健', 'noanswer');
  save('u01', '鑑定士 鈴木 一郎', 'talked');
  const m = V.modalView({ ...s, modal: { type: 'custcall', phone: '090-2468-1357', name: '山田 花子' } });
  for (const w of ['山田 花子 様', 'tel:09024681357', '電話の結果を記録', '電話の履歴', '1日前に電話しています', '鑑定士（ほかの担当）', '鑑定士 鈴木 一郎']) assert.ok(m.includes(w), w);
  assert.ok(!m.includes('田中 健'));
  save('u01', '鑑定士 鈴木 一郎', 'ng');
  assert.match(V.modalView({ ...s, modal: { type: 'custcall', phone: '090-2468-1357', name: '山田 花子' } }), /今後の連絡は不要/);
});
