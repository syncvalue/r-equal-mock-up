import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { tripsPanelHtml, blankTrip, formFromTrip } = await import('../master/tripsPanel.js');
const { sampleTrips } = await import('../src/trips.js');

const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const users = [{ id: 'u01', name: '鈴木 一郎' }, { id: 'u02', name: '佐藤 次郎' }, { id: 'u03', name: '高橋 三郎' }, { id: 'u04', name: '田中 四郎' }, { id: 'u05', name: '伊藤 五郎' }, { id: 'u06', name: '渡辺 六郎' }];
const today = '2026-10-25';
const trips = sampleTrips(new Date(2026, 9, 25), users.map((u) => u.id));

test('出張の一覧: 名前・期間・担当の都道府県・出張メンバー・状態（出張中／これから／終了）が出る', () => {
  const t = text(tripsPanelHtml({ trips, users, today, ui: { mt: blankTrip() } }));
  assert.ok(t.includes('福岡出張') && t.includes('福岡県・佐賀県') && t.includes('鈴木 一郎') && t.includes('佐藤 次郎'));
  assert.ok(t.includes('出張中') && t.includes('これから') && t.includes('終了'));
  assert.ok(t.includes('出張を新規登録'));
});

test('出張の一覧: 出張メンバーの本来の営業所は変わらず、期間中だけ出張エリアの候補になることを説明する', () => {
  const t = text(tripsPanelHtml({ trips, users, today, ui: { mt: blankTrip() } }));
  assert.ok(t.includes('本来の営業所') && t.includes('候補'));
});

test('出張のフォーム: 営業を、出張メンバーとして選べる。編集では、いまの値が入る', () => {
  const html = tripsPanelHtml({ trips, users, today, ui: { mt: formFromTrip(trips[0]) } });
  assert.equal((html.match(/data-trip-member=/g) || []).length, 6);
  assert.match(html, /data-trip-member="u01"[^>]*checked/);
  assert.doesNotMatch(html, /data-trip-member="u03"[^>]*checked/);
  assert.ok(html.includes('出張の編集') && html.includes('福岡県、佐賀県') && html.includes(trips[0].start));
  assert.ok(html.includes('data-mt-save') && html.includes('data-mt-cancel'));
});

test('出張の一覧: 無効な出張は「無効」と出て、有効にするボタンになる', () => {
  const off = trips.map((x, i) => (i === 0 ? { ...x, active: false } : x));
  const html = tripsPanelHtml({ trips: off, users, today, ui: { mt: blankTrip() } });
  assert.ok(text(html).includes('無効') && text(html).includes('有効にする'));
});

test('コールセンターの表示: 出張メンバーには「出張中」の印と出張の名前・期間が付く。出張でなければ何も出さない', async () => {
  const { tripTag, areaNameOf } = await import('../callcenter/view.js');
  const html = tripTag([{ id: 'trip:T1', name: '福岡出張', start: '2026-10-23', end: '2026-10-29' }]);
  assert.ok(html.includes('出張中') && html.includes('福岡出張') && html.includes('2026-10-23〜2026-10-29'));
  assert.equal(tripTag([]), '');
  assert.equal(areaNameOf('osaka'), '大阪エリア');
  assert.equal(areaNameOf('trip:T-SAMPLE1'), '福岡出張'); // 出張エリアの名前（保存がなければ見本）
  assert.equal(areaNameOf(null), '例外対応');
});
