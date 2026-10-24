import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {} };
const { staffModalHtml } = await import('../callcenter/dispatcherView.js');

const NOW = new Date(2026, 9, 21, 9, 0);
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('営業の詳細モーダル: 顔写真・名前・ランク・得意分野・今月の実績・担当件数・その日の予定・空き時刻が出る', () => {
  const html = staffModalHtml({ userId: 'u01', date: '2026-10-21', reservations: [], now: NOW }); // u01は、この日に予定がある
  const t = text(html);
  assert.match(html, /<img src="data:image\/svg\+xml/); // 顔写真
  assert.ok(['鈴木 一郎', 'グループA・大阪エリア', '得意分野', '腕時計', '貴金属・ジュエリー', '今月の実績', '今月の担当件数', '10/21（水）の予定', '90分で開始できる時刻', '出勤'].every((k) => t.includes(k)), t);
  assert.ok(t.includes('山田 太郎 様') && t.includes('大阪府大阪市阿倍野区')); // 予定のお客様名と住所
  assert.equal((html.match(/data-staffclose/g) || []).length, 2); // 背景と、閉じるボタン
});

test('営業の詳細モーダル: 午後出社・欠勤の日は、勤怠が出て、空き時刻は午後だけ／なし', () => {
  const pm = text(staffModalHtml({ userId: 'u12', date: '2026-10-23', reservations: [], now: NOW }));
  assert.match(pm, /午後出社 ?（13:00〜19:00）/);
  assert.match(pm, /90分で開始できる時刻 13:00/); // 午前は休みなので、開始できるのは13:00以降
  const off = text(staffModalHtml({ userId: 'u14', date: '2026-10-23', reservations: [], now: NOW }));
  assert.ok(off.includes('欠勤') && off.includes('90分で開始できる時刻 なし'));
  assert.equal(staffModalHtml({ userId: 'zzz', date: '2026-10-21', reservations: [], now: NOW }), '');
});
