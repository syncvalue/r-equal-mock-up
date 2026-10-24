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

// メイン商材（数量を選んで入力）。数量は範囲で選ぶ。値は範囲の下限（1, 6, 11 …）で持つ。0 は未選択
export const MAIN_ITEMS = ['背広', '婦人服', '婦人靴', '紳士靴'];
export const MAIN_BANDS = [
  { min: 1, max: 5, label: '1〜5' }, { min: 6, max: 10, label: '6〜10' }, { min: 11, max: 15, label: '11〜15' }, { min: 16, max: 20, label: '16〜20' },
  { min: 21, max: 30, label: '21〜' }, { min: 31, max: 40, label: '31〜' }, { min: 41, max: 50, label: '41〜' }, { min: 51, max: 70, label: '51〜70' },
  { min: 71, max: 100, label: '71〜100' }, { min: 101, max: Infinity, label: '100〜' },
];
// 記録用の文字（例: 6〜10点、21点以上）
export const qtyLabel = (min) => { const b = MAIN_BANDS.find((x) => x.min === min); return !b ? '' : b.label.endsWith('〜') && b.min !== 1 ? `${b.label.slice(0, -1)}点以上` : `${b.label}点`; };
// 言われた数量が入る範囲を返す（範囲の下限）
export const snapQty = (n) => MAIN_BANDS.find((b) => n >= b.min && n <= b.max)?.min ?? 0;
export const blankMain = () => Object.fromEntries(MAIN_ITEMS.map((k) => [k, 0]));

// その他の商材（複数選択）
export const CATEGORIES = ['ブランドバッグ', '腕時計', '貴金属・ジュエリー', 'カメラ・家電', 'ゲーム・ホビー', '着物・骨董', 'その他'];

// 当日、誰が立ち会うか（同席者がいるかどうかは、別項目の「ご同席者」で聞く）
export const ATTENDEES = ['ご本人', 'ご主人', '奥様', 'ご家族', 'その他（備考に記入）'];

// 備考・補足（ご同席者・駐車スペース・表札は、あり／なし。前日確認の連絡時間は、30分刻みで範囲を選ぶ）
export const YESNO = ['あり', 'なし'];
export const CONTACT_TIMES = Array.from({ length: 23 }, (_, i) => `${String(9 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
// 前日確認の連絡時間: '' は未確認、'none' は「指定なし」と聞いた状態（どちらかが none なら、指定なし）
export const NO_PREFERENCE = 'none';
export const contactText = (from, to) => (from === NO_PREFERENCE || to === NO_PREFERENCE ? '指定なし' : !from && !to ? '未確認' : `${from || ''}〜${to || ''}`);
