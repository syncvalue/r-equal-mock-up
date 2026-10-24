import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingFields, companionText, wantsText, hasWants, mainSummary } from '../callcenter/intake.js';
import { flyerOf } from '../callcenter/master.js';

const TODAY = '2026-10-24';
// オペレーターが手で入力した状態（音声入力を使わない）
const typed = {
  phone: '090-1234-5678', name: '山田 花子', kana: '', gender: 'f', zip: '', address: '大阪府大阪市阿倍野区1-2-3', areaId: 'osaka', areaAddr: '大阪府大阪市阿倍野区1-2-3',
  chirashi: flyerOf('N1019').chirashi, flyerId: 'N1019', cats: ['腕時計'], mainItems: { 背広: 0, 婦人服: 0, 婦人靴: 0, 紳士靴: 0 }, wants: '', attendee: 'ご本人', large: '', notes: '', companion: '', companionNote: '',
  parking: '', nameplate: '', contactFrom: '', contactTo: '', date: '2026-10-25', start: 600, dur: 90,
};
const ready = { areaConfirmed: true, selected: { user: { id: 'u01' } }, today: TODAY };

test('手入力だけで、必須項目がそろえば確定できる（備考・補足は任意）', () => {
  assert.deepEqual(missingFields(typed, ready), []);
});

test('足りない項目を、それぞれ指摘する', () => {
  const blank = { ...typed, phone: '', name: ' ', gender: '', address: '', chirashi: null, flyerId: '', cats: [], wants: '', date: '' };
  assert.deepEqual(missingFields(blank, { ...ready, areaConfirmed: false, selected: null }), ['電話番号', 'お名前', '性別', '訪問先の住所', '来電のきっかけ（チラシのID）', '売りたいもの', '希望日（今日以降）', '担当の営業']);
});

test('エリア未確認・存在しないチラシID・過去の日付', () => {
  assert.ok(missingFields(typed, { ...ready, areaConfirmed: false }).includes('営業エリアの確認（Googleマップ）'));
  assert.ok(missingFields({ ...typed, chirashi: null, flyerId: 'X1' }, ready).includes('チラシのID（該当なし）'));
  assert.ok(missingFields({ ...typed, date: '2026-10-23' }, ready).includes('希望日（今日以降）'));
  assert.ok(!missingFields({ ...typed, wants: 'ロレックス', cats: [] }, ready).includes('売りたいもの')); // 種類を選ばなくても、内容を書けばよい
  assert.ok(!missingFields({ ...typed, cats: [], mainItems: { ...typed.mainItems, 背広: 6 } }, ready).includes('売りたいもの')); // メイン商材の数量だけでもよい
});

test('ご同席者: あり の場合は、フリーテキストの内容も記録する', () => {
  assert.equal(companionText({ companion: 'あり', companionNote: ' ご主人、娘様 ' }), 'あり（ご主人、娘様）');
  assert.equal(companionText({ companion: 'あり', companionNote: '' }), 'あり');
  assert.equal(companionText({ companion: 'なし', companionNote: '前の入力' }), 'なし'); // なし のときは、メモを付けない
  assert.equal(companionText({ companion: '', companionNote: '' }), '未確認');
});

test('売りたいもの: メイン商材の数量・その他の商材・詳細をまとめる', () => {
  const f = { ...typed, mainItems: { 背広: 1, 婦人服: 11, 婦人靴: 0, 紳士靴: 101 }, cats: ['腕時計', 'ブランドバッグ'], wants: 'ロレックス 2本' };
  assert.deepEqual(mainSummary(f), ['背広 1〜5点', '婦人服 11〜15点', '紳士靴 100点以上']);
  assert.equal(wantsText(f), '背広 1〜5点、婦人服 11〜15点、紳士靴 100点以上 ／ 腕時計・ブランドバッグ ／ ロレックス 2本');
  assert.equal(wantsText({ ...typed, cats: [], wants: '' }), '');
  assert.equal(hasWants({ ...typed, cats: [], wants: '' }), false);
});
