import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFromUtterance as ex, changedFields, DEMO_SCRIPT, dateOf, startOf } from '../callcenter/transcript.js';

const NOW = new Date(2026, 9, 24, 9, 0); // 2026-10-24（土）
const blank = { cats: [], wants: '' };

test('チラシの号と、広告の日付を訪問日と取り違えない', () => {
  const p = ex('10月19日のチラシを見て電話しました。', blank, NOW);
  assert.equal(p.chirashi, 1);
  assert.equal(p.date, undefined);
});

test('名前・フリガナ・電話番号', () => {
  const p = ex('山田花子と申します。フリガナはヤマダハナコです。電話番号は090-1234-5678です。', blank, NOW);
  assert.deepEqual([p.name, p.kana, p.phone], ['山田花子', 'ヤマダハナコ', '090-1234-5678']);
  assert.equal(ex('私は田中と申します', blank, NOW).name, '田中');
  assert.equal(ex('電話番号は０９０－１１１１－２２２２です', blank, NOW).phone, '090-1111-2222');
});

test('住所・郵便番号・性別', () => {
  const p = ex('大阪府大阪市阿倍野区阿倍野筋1-2-3です。郵便番号は545-0052です。主婦をしております。', blank, NOW);
  assert.equal(p.address, '大阪府大阪市阿倍野区阿倍野筋1-2-3');
  assert.equal(p.zip, '545-0052');
  assert.equal(p.gender, 'f');
  assert.equal(p.date, undefined); // 住所の数字を日付にしない
});

test('売りたいもの・点数', () => {
  const p = ex('ルイ・ヴィトンのバッグが3点と、ロレックスの時計が2本あります。あと金のネックレスも少し。', blank, NOW);
  assert.deepEqual(p.cats, ['ブランドバッグ', '腕時計', '貴金属・ジュエリー']);
  assert.equal(p.wants, 'ルイ・ヴィトン 3点、ロレックス 2本、金のネックレス');
  assert.equal(ex('ロレックスも2本ある', { cats: ['腕時計'], wants: 'ロレックス 2本' }, NOW).wants, 'ロレックス 2本'); // 重複して追記しない
});

test('立会い・大型品・訪問時の注意', () => {
  const p = ex('ゴルフクラブも売れるでしょうか。当日は主人も一緒に立ち会います。', blank, NOW);
  assert.equal(p.large, 'ゴルフクラブも売れるか質問あり');
  assert.equal(p.attendee, 'ご夫婦で同席');
  assert.equal(ex('1階のエントランスで待ち合わせたいです。', blank, NOW).notes, '1階のエントランスで待ち合わせたいです');
});

test('日付と時刻', () => {
  assert.equal(dateOf('来週の土曜日', NOW), '2026-10-31');
  assert.equal(dateOf('来週の月曜', NOW), '2026-10-26');
  assert.equal(dateOf('明日', NOW), '2026-10-25');
  assert.equal(dateOf('11月3日', NOW), '2026-11-03');
  assert.equal(dateOf('28日', NOW), '2026-10-28');
  assert.equal(dateOf('土曜日', NOW), '2026-10-31'); // 今日が土曜なら次の土曜
  assert.equal(startOf('午後1時'), 780);
  assert.equal(startOf('3時半'), 930);
  assert.equal(startOf('午前中'), 600);
  assert.equal(startOf('2時間くらい'), null);
  assert.equal(ex('午後6時でお願いします', blank, NOW, 90).start, 17 * 60 + 30); // 終了が19:00までに収まるように
});

test('デモ台本を流すと、必須項目がそろう', () => {
  let form = { ...blank };
  for (const l of DEMO_SCRIPT.filter((x) => x.who === 'cu')) form = { ...form, ...ex(l.text, form, NOW) };
  assert.equal(form.name, '山田花子');
  assert.equal(form.gender, 'f');
  assert.equal(form.date, '2026-10-31');
  assert.equal(form.start, 780); // 午前中 → 午後1時に変更
  assert.ok(form.address.startsWith('大阪府') && form.cats.length === 3 && form.chirashi === 1);
});

test('変わった項目だけ返す', () => {
  assert.deepEqual(changedFields({ name: 'A', kana: 'B' }, { name: 'A', kana: '' }), ['kana']);
});
