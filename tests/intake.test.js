import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingFields, companionText, wantsText, hasWants, mainSummary, hearingChecklist, profileText, fullName } from '../callcenter/intake.js';
import { flyerOf } from '../callcenter/master.js';

const TODAY = '2026-10-24';
// オペレーターが手で入力した状態（音声入力を使わない）
const typed = {
  phone: '090-1234-5678', phone2: '', lastName: '山田', firstName: '花子', lastKana: '', firstKana: '', gender: 'f', genderEst: false, age: '62', ageEst: '', zip: '', address: '大阪府大阪市阿倍野区1-2-3', areaId: 'osaka', areaAddr: '大阪府大阪市阿倍野区1-2-3',
  chirashi: flyerOf('N1019').chirashi, flyerId: 'N1019', cats: ['腕時計'], mainItems: { 背広: 0, 婦人服: 0, 婦人靴: 0, 紳士靴: 0 }, wants: '', attendee: 'ご本人', large: '', notes: '', companion: '', companionNote: '',
  parking: '', nameplate: '', contactFrom: '', contactTo: '', date: '2026-10-25', start: 600, dur: 90,
};
const ready = { areaConfirmed: true, selected: { user: { id: 'u01' } }, today: TODAY };

test('手入力だけで、必須項目がそろえば確定できる（備考・補足は任意）', () => {
  assert.deepEqual(missingFields(typed, ready), []);
});

test('足りない項目を、それぞれ指摘する', () => {
  const blank = { ...typed, phone: '', lastName: ' ', firstName: '', gender: '', address: '', chirashi: null, flyerId: '', cats: [], wants: '', date: '' };
  assert.deepEqual(missingFields(blank, { ...ready, areaConfirmed: false, selected: null }), ['電話番号', 'お名前（姓・名）', '性別', '訪問先の住所', '来電のきっかけ（チラシのID）', '売りたいもの', '希望日（今日以降）', '担当の営業']);
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

test('聞き取りの確認: 何も聞いていなければ全て未、「なし」と聞いた場合も聞いた扱い', () => {
  const blank = { phone: '', lastName: '', firstName: '', lastKana: '', firstKana: '', gender: '', genderEst: false, age: '', ageEst: '', zip: '', address: '', chirashi: null, flyerId: '', cats: [], mainItems: { 背広: 0 }, wants: '', attendee: '', whenAsked: false, large: '', notes: '', companion: '', parking: '', nameplate: '', contactFrom: '', contactTo: '' };
  const st = (f) => Object.fromEntries(hearingChecklist(f).map((x) => [x.key, x.asked]));
  assert.ok(Object.values(st(blank)).every((v) => v === false));
  const asked = st({ ...blank, large: 'なし', notes: '特になし', parking: 'なし', companion: 'なし', contactFrom: 'none', contactTo: 'none', attendee: 'ご本人', whenAsked: true });
  assert.deepEqual([asked.large, asked.notes, asked.parking, asked.companion, asked.contact, asked.attendee, asked.when, asked.nameplate], [true, true, true, true, true, true, true, false]);
  assert.equal(st({ ...blank, chirashi: 2 }).flyer, true);
  assert.equal(st({ ...blank, mainItems: { 背広: 6 } }).wants, true);
  assert.equal(hearingChecklist(blank).filter((x) => x.required).length, 6); // 必須は、電話・名前・性別・住所・きっかけ・売りたいもの
});

test('前日確認の連絡時間の記録', async () => {
  const { contactText } = await import('../callcenter/master.js');
  assert.deepEqual([contactText('', ''), contactText('none', 'none'), contactText('10:00', '12:00'), contactText('10:00', '')], ['未確認', '指定なし', '10:00〜12:00', '10:00〜']);
});

test('性別・年齢: 聞けずに声から推測した場合は「推測」として区別し、入力済みとして数える', () => {
  const base = { ...typed, gender: '', age: '', ageEst: '', genderEst: false };
  const st = (f) => Object.fromEntries(hearingChecklist(f).map((x) => [x.key, x]));
  assert.deepEqual([st(base).gender.asked, st(base).age.asked], [false, false]);
  const guess = st({ ...base, gender: 'f', genderEst: true, ageEst: '60代' });
  assert.deepEqual([guess.gender.asked, guess.gender.estimated, guess.age.asked, guess.age.estimated], [true, true, true, true]);
  const told = st({ ...base, gender: 'f', age: '62', ageEst: '60代' }); // 年齢を聞けたら、推測ではない
  assert.deepEqual([told.gender.estimated, told.age.estimated], [false, false]);
});

test('営業のタブレットに出す、性別・年齢と氏名', () => {
  const g = (k) => ({ f: '女性', m: '男性' })[k];
  assert.equal(profileText({ gender: 'f', genderEst: true, age: '', ageEst: '60代' }, g), '女性（推測）／60代（推測）');
  assert.equal(profileText({ gender: 'm', genderEst: false, age: '45', ageEst: '' }, g), '男性／45歳');
  assert.equal(profileText({ gender: '', genderEst: false, age: '', ageEst: '' }, g), '性別未確認／年齢未確認');
  assert.equal(fullName({ lastName: ' 山田 ', firstName: '花子' }), '山田 花子');
});
