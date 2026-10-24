import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callHistory } from '../src/callHistory.js';
import { avatarSvg, avatarHtml } from '../callcenter/avatar.js';
import { specialtiesOf } from '../src/dispatch.js';
import { USERS } from '../src/dashboard.js';
import { wantedCategories, matchedSpecialties } from '../callcenter/intake.js';
import { blankMain } from '../callcenter/master.js';

const r = (o) => ({ id: 'r1', operator: '佐藤', receivedAt: '2026/10/24 14:10', date: '2026-10-31', start: '13:00', hearing: { wants: '背広 6〜10点' }, customer: { name: 'A', phone: '090-1111-2222', phone2: '06-3333-4444' }, ...o });

test('受電履歴: 予約・変更・取消が、新しい順に並ぶ。電話番号1・2のどちらでも探す', () => {
  const list = callHistory(['09011112222'], [
    r({ changes: [{ at: '2026/10/25 9:30', by: '渡辺', wasConfirmed: false, diff: [{ label: '訪問日時', from: 'a', to: 'b' }] }], status: 'cancelled', cancelledAt: '2026/10/26 10:00', cancelledBy: '佐藤', cancelReason: 'お客様のご都合（やめる）' }),
    r({ id: 'r2', customer: { name: 'B', phone: '080-0000-0000' } }), // 別のお客様
  ]);
  assert.deepEqual(list.map((x) => x.kind), ['取消', '変更', '新規受付']);
  assert.ok(list[0].at > list[1].at && list[1].at > list[2].at);
  assert.match(list[1].note, /訪問日時：a → b/);
  assert.equal(callHistory(['', '06-3333-4444'], [r({})]).length, 1);
  assert.deepEqual(callHistory(['090-12'], [r({})]), []);
});

test('予約にならなかった問い合わせも、受電履歴に出る（ダミー）', () => {
  const list = callHistory(['090-2468-1357'], []);
  assert.ok(list.length >= 4 && list.some((x) => x.kind === '問合せ'));
  assert.ok(list.every((x, i) => i === 0 || list[i - 1].at >= x.at));
});

test('営業の得意分野と、顔写真（ダミーの似顔絵は営業ごとに決まる）', () => {
  assert.ok(USERS.every((u) => specialtiesOf(u.id).length >= 1));
  assert.equal(avatarSvg('u01'), avatarSvg('u01'));
  assert.notEqual(avatarSvg('u01'), avatarSvg('u02'));
  assert.match(avatarSvg('u01'), /^data:image\/svg\+xml/);
  assert.match(avatarHtml({ id: 'u01', name: '鈴木 一郎' }), /<img src="data:image\/svg\+xml/);
  assert.match(avatarHtml({ id: 'u01', name: '鈴木 一郎', photo: '/p/u01.jpg' }, 32), /src="\/p\/u01\.jpg"/); // 写真があれば、写真を使う
});

test('お客様の売りたいものと、営業の得意分野が合うか', () => {
  const form = { cats: ['腕時計'], mainItems: { ...blankMain(), 背広: 6 }, wants: 'ヴィトンのバッグ 2点' };
  assert.deepEqual(wantedCategories(form).sort(), ['ブランドバッグ', '背広', '腕時計'].sort());
  assert.deepEqual(matchedSpecialties(['腕時計', '貴金属・ジュエリー'], form), ['腕時計']);
  assert.deepEqual(matchedSpecialties(['着物・骨董'], form), []);
});
