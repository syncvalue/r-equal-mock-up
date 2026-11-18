import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecordFields, formFromRecord, diffRecords } from '../callcenter/record.js';
import { blankMain, INQUIRY_TYPES, AD_TYPES } from '../callcenter/master.js';

const blank = () => ({
  phone: '', phone2: '', phone2None: false, name: ' ', kana: ' ', gender: '', genderEst: false, age: '', ageEst: '', zip: '', address: '', areaId: null, areaAddr: '',
  customerId: '', inquiryType: '電話', adType: '', chirashi: null, flyerId: '', cats: [], mainItems: blankMain(), wants: '', attendee: '', whenAsked: false, large: '', notes: '', companion: '', companionNote: '', parking: '', nameplate: '',
  contactFrom: '', contactTo: '', date: '2026-10-26', start: 600, dur: 90, userId: null,
});
const area = { id: 'osaka', lat: 34.69, lng: 135.5 };
const filled = {
  ...blank(), phone: '090-1234-5678', phone2: '06-1111-2222', name: '山田 花子', kana: 'ヤマダ ハナコ', gender: 'f', genderEst: true, age: '', ageEst: '60代',
  zip: '545-0052', address: '大阪府大阪市阿倍野区1-2-3', areaId: 'osaka', areaAddr: '大阪府大阪市阿倍野区1-2-3', chirashi: 1, flyerId: 'N1019', cats: ['腕時計'],
  mainItems: { ...blankMain(), 背広: 6 }, wants: 'ロレックス 2本', attendee: 'ご本人', large: 'なし', notes: '1階で待ち合わせ', companion: 'あり', companionNote: 'ご主人', parking: 'なし', nameplate: 'あり',
  contactFrom: '17:00', contactTo: '19:00', date: '2026-10-27', start: 780, dur: 90, userId: 'u09', whenAsked: true,
};
const rec = (form, extra = {}) => ({ id: 'r1', userId: form.userId, ...buildRecordFields(form, { area }), ...extra });

test('記録に、受付時の入力をそのまま残し、そこから全項目を戻せる', () => {
  const r = rec(filled);
  assert.deepEqual(r.customer.name, '山田 花子');
  assert.equal(r.hearing.profile, '女性（推測）／60代（推測）');
  assert.deepEqual(formFromRecord(r, blank()), { ...filled }); // 入力欄が、そっくり戻る
});

test('戻した入力を直して作り直すと、変更した項目だけが、記録に反映される', () => {
  const before = rec(filled);
  const form = { ...formFromRecord(before, blank()), phone: '080-9999-0000', wants: 'ロレックス 3本', date: '2026-10-29', start: 600, userId: 'u11' };
  const after = rec(form);
  assert.equal(after.customer.phone, '080-9999-0000');
  assert.equal(after.hearing.wants, '背広 6〜10点 ／ 腕時計 ／ ロレックス 3本');
  assert.deepEqual([after.date, after.start, after.end], ['2026-10-29', '10:00', '11:30']);
});

test('formData のない古い記録も、残っている内容から入力を戻せる', () => {
  const old = { id: 'o', userId: 'u02', date: '2026-10-26', start: '10:00', end: '11:30', gender: 'm', areaId: 'osaka', flyerId: 'N1012',
    hearing: { wants: '背広 6〜10点', attendee: 'ご本人', large: '未確認', notes: '特になし', companion: 'あり（ご主人）', parking: 'なし', nameplate: '未確認' },
    customer: { name: '田中 太郎', kana: 'タナカ タロウ', phone: '090-0000-1111', address: '大阪府堺市1-1', zip: '' } };
  const f = formFromRecord(old, blank());
  assert.deepEqual([f.name, f.kana, f.flyerId, f.chirashi], ['田中 太郎', 'タナカ タロウ', 'N1012', 0]);
  assert.deepEqual([f.wants, f.attendee, f.large, f.notes, f.companion, f.parking, f.nameplate], ['背広 6〜10点', 'ご本人', '', '', 'あり', 'なし', '']);
  assert.deepEqual([f.date, f.start, f.dur, f.userId, f.gender], ['2026-10-26', 600, 90, 'u02', 'm']);
});

test('変更前後の差分: 変わった項目だけ、項目名つきで出る', () => {
  const before = rec(filled);
  const after = rec({ ...filled, date: '2026-10-29', userId: 'u11', address: '大阪府堺市1-1', parking: 'あり' });
  const names = { u09: '松田 亮', u11: '西田 翼' };
  const d = diffRecords(before, after, (id) => names[id]);
  assert.deepEqual(d.map((x) => x.label), ['訪問日時', '担当鑑定士', '訪問先', '駐車スペース']);
  assert.deepEqual([d[1].from, d[1].to], ['松田 亮', '西田 翼']);
  assert.deepEqual(diffRecords(before, rec(filled), (id) => names[id]), []); // 変更なしなら、差分なし
});

test('問合せ種別と広告種別を記録する。きっかけの文には、広告種別と、電話以外の問合せ種別を入れる', () => {
  const r = rec({ ...filled, inquiryType: 'LINE', adType: '婦人ふく' });
  assert.deepEqual([r.hearing.inquiryType, r.hearing.adType], ['LINE', '婦人ふく']);
  assert.equal(r.hearing.trigger, 'LINE ／ 婦人ふく ／ 新聞折込チラシ（10/19号）（ID: N1019）');
  assert.equal(rec({ ...filled, adType: '' }).hearing.trigger, '新聞折込チラシ（10/19号）（ID: N1019）'); // 電話で広告種別なしなら、これまでどおり
  assert.deepEqual([formFromRecord(r, blank()).inquiryType, formFromRecord(r, blank()).adType], ['LINE', '婦人ふく']);
});

test('選択肢: 問合せ種別・広告種別', () => {
  assert.deepEqual(INQUIRY_TYPES, ['電話', '店舗来店', '催事', '営業からの紹介依頼', 'HP（メール）', 'LINE', '持ち込み']);
  assert.equal(AD_TYPES.length, 12);
  assert.ok(AD_TYPES.includes('婦人ふく') && AD_TYPES.includes('げんえきやHP'));
});

test('顧客ID: 記録に残り、変更用の入力に戻る。IDのない古い記録は空', () => {
  const r = rec({ ...filled, customerId: 'C000101' });
  assert.equal(r.customer.customerId, 'C000101');
  assert.equal(formFromRecord(r, blank()).customerId, 'C000101');
  assert.equal(rec({ ...filled, customerId: '' }).customer.customerId, '');
  const old = { id: 'o', userId: 'u02', date: '2026-10-26', start: '10:00', end: '11:30', gender: 'm', areaId: 'osaka', hearing: {}, customer: { name: '田中 太郎', kana: 'タナカ タロウ', phone: '090-0000-1111', address: '大阪府堺市1-1', zip: '' } };
  assert.equal(formFromRecord(old, blank()).customerId, '');
});

test('受付で付けた顧客ランク（推測）: SS・S・A・Bだけを記録に残す。入れなければ null。ランクの変更は、日時の変更として数えない', () => {
  assert.equal(rec({ ...filled, customerRank: 'SS' }).customerRank, 'SS');
  assert.equal(rec({ ...filled, customerRank: 'B' }).customerRank, 'B');
  assert.equal(rec(filled).customerRank, null); // 入れていない
  assert.equal(rec({ ...filled, customerRank: '' }).customerRank, null);
  assert.equal(rec({ ...filled, customerRank: 'C' }).customerRank, null); // 古いランクの値は、受け付けない
  const before = rec({ ...filled, customerRank: 'A' });
  const after = rec({ ...filled, customerRank: 'SS' });
  assert.deepEqual(diffRecords(before, { ...before, ...after }), []); // ランクを直しても、確定の訪問を、仮確定に戻さない
  assert.equal(formFromRecord(before, blank()).customerRank, 'A'); // 変更のとき、入力欄に戻る
});
