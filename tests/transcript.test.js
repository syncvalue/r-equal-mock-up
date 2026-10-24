import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFromUtterance as ex, changedFields, DEMO_SCRIPT, dateOf, startOf, contactRangeOf } from '../callcenter/transcript.js';

const NOW = new Date(2026, 9, 24, 9, 0); // 2026-10-24（土）
const blank = { lastName: '', firstName: '', cats: [], wants: '', mainItems: { 背広: 0, 婦人服: 0, 婦人靴: 0, 紳士靴: 0 } };

test('チラシはIDで特定する。号の日付を訪問日と取り違えず、IDなしの発言ではチラシを決めない', () => {
  const p = ex('10月19日のチラシを見て電話しました。', blank, NOW);
  assert.equal(p.chirashi, undefined);
  assert.equal(p.flyerId, undefined);
  assert.equal(p.date, undefined);
  assert.equal(ex('えっと、N1019です。', blank, NOW).flyerId, 'N1019');
  assert.equal(ex('ｎ１０１２ です', blank, NOW).flyerId, 'N1012'); // 全角・小文字
  assert.equal(ex('P-1015です', blank, NOW).flyerId, 'P1015');
  assert.equal(ex('N9999です', blank, NOW).flyerId, undefined); // 一覧にないID
});

test('IDのない広告は、言葉から判定する', () => {
  assert.deepEqual([ex('ネットで検索して見つけました', blank, NOW).chirashi, ex('知人の紹介です', blank, NOW).chirashi], [4, 6]);
});

test('名前・フリガナ・電話番号', () => {
  const p = ex('姓は山田、名は花子です。フリガナはヤマダ、ハナコです。', blank, NOW);
  assert.deepEqual([p.lastName, p.firstName, p.lastKana, p.firstKana], ['山田', '花子', 'ヤマダ', 'ハナコ']);
  assert.equal(ex('電話番号は090-1234-5678です。', blank, NOW).phone, '090-1234-5678');
  const w = ex('山田花子と申します。フリガナはヤマダハナコです。', blank, NOW); // 分けずに名乗った場合は、姓を2文字として分ける
  assert.deepEqual([w.lastName, w.firstName, w.lastKana, w.firstKana], ['山田', '花子', 'ヤマダ', 'ハナコ']);
  assert.deepEqual([ex('山田 太郎と申します', blank, NOW).lastName, ex('山田 太郎と申します', blank, NOW).firstName], ['山田', '太郎']);
  assert.equal(ex('私は田中と申します', blank, NOW).lastName, '田中');
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
  assert.equal(p.attendee, 'ご本人'); // 立ち会うのはお客様ご本人で、ご主人も一緒（同席者あり）
  assert.equal(p.companion, 'あり');
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
  assert.deepEqual([form.lastName, form.firstName, form.age, form.phone, form.phone2], ['山田', '花子', '62', '090-2468-1357', '06-1234-5678']);
  assert.equal(form.gender, 'f');
  assert.equal(form.date, '2026-10-31');
  assert.equal(form.start, 780); // 午前中 → 午後1時に変更
  assert.ok(form.address.startsWith('大阪府') && form.cats.length === 3 && form.flyerId === 'N1019');
});

test('変わった項目だけ返す', () => {
  assert.deepEqual(changedFields({ lastName: 'A', lastKana: 'B' }, { lastName: 'A', lastKana: '' }), ['lastKana']);
});

test('チラシのIDの正規化と、チラシの特定', async () => {
  const { flyerOf, triggerText, isFlyerIndex } = await import('../callcenter/master.js');
  assert.equal(flyerOf(' ｎ-1019 ').chirashi, 1);
  assert.equal(flyerOf('X0000'), null);
  assert.equal(flyerOf(''), null);
  assert.equal(triggerText(1, 'N1019'), '新聞折込チラシ（10/19号）（ID: N1019）');
  assert.equal(triggerText(null, ''), '');
  assert.ok(isFlyerIndex(0) && !isFlyerIndex(4));
});

test('フリガナの長音は壊さない', () => {
  const k = ex('フリガナはサトウユーコです', blank, NOW); // 長音「ー」を壊さず、姓の読み（サトウ）で分ける
  assert.deepEqual([k.lastKana, k.firstKana], ['サトウ', 'ユーコ']);
});

test('デモ台本: マップでのエリア確認が住所のあとにあり、電話を切る発話で終わる', () => {
  const iAddr = DEMO_SCRIPT.findIndex((l) => l.who === 'cu' && /阿倍野/.test(l.text));
  const iArea = DEMO_SCRIPT.findIndex((l) => l.action === 'confirmArea');
  assert.ok(iAddr >= 0 && iArea > iAddr);
  assert.equal(DEMO_SCRIPT.at(-1).action, 'hangup');
  assert.ok(DEMO_SCRIPT.some((l) => l.who === 'op' && l.text.includes('{when}'))); // 電話を切る前に、日時を読み上げて確認する
  assert.ok(DEMO_SCRIPT.every((l) => !l.text.includes('{sales}'))); // 担当は仮決定なので、お客様には営業の名前を伝えない
  assert.ok(DEMO_SCRIPT.filter((l) => l.who === 'cu').every((l) => !/[{}]/.test(l.text)));
});

test('備考・補足: ご同席者・駐車スペース・表札・前日確認の連絡時間', () => {
  const p = ex('駐車スペースはありません。表札は出ています。前日の確認のお電話は、午後5時から7時の間でお願いします。', blank, NOW);
  assert.deepEqual([p.parking, p.nameplate, p.contactFrom, p.contactTo], ['なし', 'あり', '17:00', '19:00']);
  assert.equal(p.start, undefined); // 連絡時間を訪問の開始時刻と取り違えない
  assert.equal(p.date, undefined);
  assert.equal(ex('当日は主人も一緒に立ち会います。', blank, NOW).companion, 'あり');
  const solo = ex('当日は主人が立ち会います。', blank, NOW); // 立ち会うのはご主人のみ（同席者の言及なし）
  assert.deepEqual([solo.attendee, solo.companion], ['ご主人', undefined]);
  assert.equal(ex('私が立ち会います。', blank, NOW).attendee, 'ご本人');
  assert.equal(ex('同席者は娘が来る予定です。', blank, NOW).companion, 'あり');
  assert.equal(ex('同席する人はいません。', blank, NOW).companion, 'なし');
  assert.equal(ex('駐車場は敷地内に停められます。', blank, NOW).parking, 'あり');
  assert.equal(ex('近くのコインパーキングを使ってください。', blank, NOW).parking, 'なし');
  assert.deepEqual(contactRangeOf('午前10時半から12時'), ['10:30', '12:00']);
  assert.deepEqual(contactRangeOf('7時〜9時'), ['19:00', '20:00']); // 午後とみなし、21:00は20:00に収める
  assert.equal(ex('前日はいつでも大丈夫です。', { ...blank }, NOW).contactFrom, 'none'); // 聞いて、指定なし
});

test('同席者が誰かも拾う', () => {
  assert.equal(ex('当日は主人も一緒に立ち会います。', blank, NOW).companionNote, 'ご主人');
  assert.equal(ex('同席者は娘が来る予定です。', blank, NOW).companionNote, '娘様');
});

test('メイン商材と数量を拾う（選べる数量に丸める）', () => {
  const p = ex('背広が5着と、婦人服が12点、婦人靴が3足あります。紳士靴は40足くらい。', blank, NOW);
  assert.deepEqual(p.mainItems, { 背広: 1, 婦人服: 11, 婦人靴: 1, 紳士靴: 31 }); // 5着→1〜5、12点→11〜15、40足→31〜（範囲の下限で持つ）
  assert.equal(p.cats, undefined); // 背広や靴は、その他の商材には入れない
  const more = ex('革靴も2足あります。', { ...blank, mainItems: { ...blank.mainItems, 背広: 6 } }, NOW);
  assert.deepEqual(more.mainItems, { 背広: 6, 婦人服: 0, 婦人靴: 0, 紳士靴: 1 }); // 既に入力した数量は残す
});

test('数量の範囲', async () => {
  const { snapQty, qtyLabel } = await import('../callcenter/master.js');
  assert.deepEqual([0, 1, 5, 6, 20, 21, 30, 31, 70, 71, 100, 101, 500].map(snapQty), [0, 1, 1, 6, 16, 21, 21, 31, 51, 71, 71, 101, 101]);
  assert.deepEqual([1, 6, 21, 51, 101, 99].map(qtyLabel), ['1〜5点', '6〜10点', '21点以上', '51〜70点', '100点以上', '']);
});

test('電話番号を2つ言われたら、2つ目は電話番号2に入れる。年齢は歳・年代で拾う', () => {
  const p = ex('電話番号は携帯が090-1234-5678、自宅が06-1234-5678です。', blank, NOW);
  assert.deepEqual([p.phone, p.phone2], ['090-1234-5678', '06-1234-5678']);
  const later = ex('自宅の電話番号は06-1111-2222です。', { ...blank, phone: '090-1234-5678' }, NOW); // すでに1つ目があれば、2つ目へ
  assert.deepEqual([later.phone, later.phone2], [undefined, '06-1111-2222']);
  assert.equal(p.date, undefined);
  assert.deepEqual([ex('年齢は62歳です', blank, NOW).age, ex('60代です', blank, NOW).age], ['62', '60代']);
});

test('フルネーム・フルのフリガナを言われたら、姓と名・セイとメイに分ける（姓の辞書。辞書にない姓は2文字）', async () => {
  const { splitFullName, splitFullKana } = await import('../callcenter/surnames.js');
  assert.deepEqual(['山田花子', '佐々木美咲', '長谷川淳', '小野寺 拓', '山田 太郎', '林太郎', '藤堂健'].map(splitFullName),
    [['山田', '花子'], ['佐々木', '美咲'], ['長谷川', '淳'], ['小野寺', '拓'], ['山田', '太郎'], ['林', '太郎'], ['藤堂', '健']]);
  assert.deepEqual([splitFullKana('ヤマダハナコ'), splitFullKana('ササキミサキ'), splitFullKana('ハセガワアツシ'), splitFullKana('ヤマダ ハナコ')],
    [['ヤマダ', 'ハナコ'], ['ササキ', 'ミサキ'], ['ハセガワ', 'アツシ'], ['ヤマダ', 'ハナコ']]);
  assert.deepEqual(splitFullKana('トウドウケン', '藤堂', '健'), ['トウドウ', 'ケン']); // 辞書にない姓は、姓名の文字数の比で
});

test('反映ボタンで入れた発話: フルネームが姓の欄に入らず、姓と名に分かれる', () => {
  const p = ex('佐々木美咲と申します。フリガナはササキミサキです。', blank, NOW);
  assert.deepEqual([p.lastName, p.firstName, p.lastKana, p.firstKana], ['佐々木', '美咲', 'ササキ', 'ミサキ']);
  const q = ex('お名前は山田花子です。', blank, NOW);
  assert.deepEqual([q.lastName, q.firstName], ['山田', '花子']);
  const kanaOnly = ex('フリガナはヤマダハナコです', blank, NOW); // 名前を言わず、フリガナだけの発話でも分ける
  assert.deepEqual([kanaOnly.lastKana, kanaOnly.firstKana], ['ヤマダ', 'ハナコ']);
  assert.equal(ex('私は主婦です。', blank, NOW).lastName, undefined); // 「私は〜です」を、名前と取り違えない
});
