// コールセンターの受付で使う選択肢（ダミー）
export const OPERATORS = ['佐藤', '渡辺'];

// 来電のきっかけ（どの広告を見て電話してきたか）。チラシは号・配布方法まで記録して、反響の集計に使う
export const CHIRASHI = [
  '新聞折込チラシ（10/12号）', '新聞折込チラシ（10/19号）', 'ポスティングチラシ', 'DM・はがき',
  'ネット検索（買取比較サイト）', 'テレビCM', '知人の紹介', '前回ご利用（リピート）', 'その他',
];

// チラシに印刷されている固有のID（ダミー）。オペレーターがお客様にIDを聞き、どの広告を見て電話してきたかを特定する。chirashi は CHIRASHI の番号
export const FLYERS = [
  { id: 'N1012', chirashi: 0 }, { id: 'N1019', chirashi: 1 }, { id: 'P1015', chirashi: 2 }, { id: 'D1001', chirashi: 3 },
];
// 入力されたIDを正規化（全角・小文字・ハイフン・空白を吸収）して、チラシを探す
export const normalizeFlyerId = (s) => String(s ?? '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[\s\-ー−－]/g, '').toUpperCase();
export const flyerOf = (input) => FLYERS.find((f) => f.id === normalizeFlyerId(input)) ?? null;
export const isFlyerIndex = (i) => FLYERS.some((f) => f.chirashi === i);
// 来電のきっかけの記録用の文字（チラシはIDも残す）
export const triggerText = (chirashi, flyerId) => (chirashi === null ? '' : flyerId ? `${CHIRASHI[chirashi]}（ID: ${flyerId}）` : CHIRASHI[chirashi]);

export const CATEGORIES = ['ブランドバッグ', '腕時計', '貴金属・ジュエリー', 'カメラ・家電', 'ゲーム・ホビー', '着物・骨董', 'その他'];

export const ATTENDEES = ['ご本人', 'ご夫婦で同席', 'ご家族が同席', 'ご本人（ご家族は不在がち）', 'その他（備考に記入）'];
