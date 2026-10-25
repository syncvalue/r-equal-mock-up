// 倉庫・物流画面の見本データ。今日を基準に、買取（入庫）・出品・売却・クーリングオフの返品を作る。
// 出品・売却・返品は、実際の操作（warehouse.js）で作るため、画面と同じ規則（期間中は出品できない等）を満たす。
import { STOCK_KEY } from './store.js';
import { loadUnits, addUnits } from './stock.js';
import * as W from './warehouse.js';

export const WH_SAMPLE_KEY = 'rq-mock-warehouse-sample'; // 初期化で消えない目印（初期化後に、自動で復活させない）
const PREFIX = 'RQ-WH';

const SHELF = { 'バッグ': 'A棚（バッグ・小物）', 'ファッション小物': 'A棚（バッグ・小物）', '腕時計': 'B棚（時計・ジュエリー）', 'ジュエリー': 'B棚（時計・ジュエリー）', 'カメラ': 'C棚（カメラ・家電）' };
const placeOf = (category, price) => (price >= 300000 ? '金庫室（高額品）' : SHELF[category] ?? '要確認エリア');

export function buildSample(now = Date.now()) {
  const at = (daysAgo, h = 15) => {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysAgo, h).getTime();
  };
  let seq = 0;
  // 1回の買取（契約）。status は入庫済み(stored)が基本
  const purchase = (daysAgo, userId, customerName, items, status = 'stored') => items.map(([name, category, rank, price]) => {
    seq += 1;
    const stored = status === 'stored';
    return {
      code: `${PREFIX}${String(seq).padStart(4, '0')}`, visitId: `V-WH-${daysAgo}-${userId}`, userId, customerName, at: at(daysAgo), date: W.dateOf(at(daysAgo)),
      itemId: `wh-${seq}`, name, category, rank, n: 1, qty: 1, price, status,
      storedAt: stored ? at(daysAgo, 17) : null, location: stored ? placeOf(category, price) : null, by: stored ? userId : null,
    };
  });

  const units = [
    ...purchase(50, 'u05', '岡田 裕子', [['プラダ ナイロンバッグ', 'バッグ', 'B', 18000], ['コーチ 長財布', 'ファッション小物', 'A', 9000]]), // 0・1
    ...purchase(25, 'u01', '山田 花子', [['ルイ・ヴィトン ネヴァーフル MM', 'バッグ', 'A', 98000], ['エルメス スカーフ', 'ファッション小物', 'S', 36000]]), // 2・3
    ...purchase(22, 'u03', '佐藤 一雄', [['ロレックス デイトジャスト', '腕時計', 'B', 420000], ['オメガ シーマスター', '腕時計', 'B', 180000]]), // 4・5
    ...purchase(20, 'u06', '田村 恵子', [['K18 ネックレス', 'ジュエリー', 'A', 52000], ['プラチナ リング', 'ジュエリー', 'A', 64000]]), // 6・7
    ...purchase(18, 'u07', '中村 正', [['キヤノン EOS R6 ボディ', 'カメラ', 'B', 180000], ['ソニー α7 IV ボディ', 'カメラ', 'A', 210000]]), // 8・9
    ...purchase(15, 'u03', '井上 和夫', [['シャネル マトラッセ', 'バッグ', 'A', 240000]]), // 10
    ...purchase(12, 'u02', '小林 由美', [['カルティエ タンク', '腕時計', 'B', 310000], ['グッチ 長財布', 'ファッション小物', 'C', 12000]]), // 11・12
    ...purchase(10, 'u05', '林 美穂', [['K24 インゴット 50g', 'ジュエリー', 'S', 480000], ['ティファニー ペンダント', 'ジュエリー', 'A', 28000]]), // 13・14
    ...purchase(9, 'u10', '岡本 優', [['セリーヌ ラゲージ', 'バッグ', 'B', 70000]]), // 15（返品済み）
    ...purchase(6, 'u09', '斎藤 清', [['ニコン Z6 II ボディ', 'カメラ', 'B', 120000]]), // 16（返送済み）
    ...purchase(5, 'u04', '森田 誠', [['ブライトリング ナビタイマー', '腕時計', 'B', 260000]]), // 17（期間中）
    ...purchase(4, 'u08', '松本 千春', [['ボッテガ イントレチャート', 'バッグ', 'A', 85000], ['フェンディ バゲット', 'バッグ', 'B', 45000]]), // 18・19（返品受付）
    ...purchase(3, 'u02', '加藤 彩', [['シャネル 長財布', 'ファッション小物', 'A', 56000]]), // 20（期間中）
    ...purchase(1, 'u05', '吉田 浩', [['K18 ブレスレット', 'ジュエリー', 'A', 38000], ['ダイヤ リング 0.5ct', 'ジュエリー', 'A', 150000]], 'stored'), // 21・22（期間中）
    ...purchase(0, 'u11', '福田 美香', [['ルイ・ヴィトン ポシェット', 'バッグ', 'B', 32000], ['ハミルトン カーキ', '腕時計', 'C', 40000]], 'pending'), // 23・24（入庫待ち）
  ];
  units[22] = { ...units[22], status: 'missing', storedAt: null, location: null, by: null }; // 所在不明

  const code = (i) => units[i].code;
  const steps = [
    (s) => W.listItem(s, code(0), { channel: 'yahoo', price: 24000, at: at(38) }),
    (s) => W.sell(s, code(0), { price: 21000, shipping: 900, buyer: 'ヤフオク落札者', at: at(35) }), // 先月の売上
    (s) => W.listItem(s, code(1), { channel: 'rakuma', price: 12000, at: at(38) }),
    (s) => W.sell(s, code(1), { price: 11000, shipping: 600, at: at(33) }),
    (s) => W.listItem(s, code(2), { channel: 'mercari', price: 135000, at: at(14) }),
    (s) => W.sell(s, code(2), { price: 128000, shipping: 1500, at: at(10) }),
    (s) => W.listItem(s, code(3), { channel: 'mercari', price: 52000, at: at(14) }),
    (s) => W.sell(s, code(3), { price: 49000, shipping: 700, at: at(8) }),
    (s) => W.listItem(s, code(4), { channel: 'auction', price: 480000, vendor: '大阪時計オークション', at: at(12) }),
    (s) => W.sell(s, code(4), { price: 468000, shipping: 0, at: at(0) }), // 今日の売上（委託先のオークションから入金）
    (s) => W.listItem(s, code(5), { channel: 'rakuma', price: 230000, at: at(3) }),
    (s) => W.listItem(s, code(6), { channel: 'direct', price: 65000, at: at(10) }),
    (s) => W.sell(s, code(6), { price: 61000, shipping: 0, buyer: '△△貴金属', at: at(8) }),
    (s) => W.listItem(s, code(7), { channel: 'yahoo', price: 82000, at: at(10) }),
    (s) => W.listItem(s, code(8), { channel: 'mercari', price: 225000, at: at(8) }),
    (s) => W.sell(s, code(8), { price: 218000, shipping: 1200, at: at(4) }),
    (s) => W.listItem(s, code(9), { channel: 'mercari', price: 268000, at: at(7) }),
    (s) => W.listItem(s, code(10), { channel: 'yahoo', price: 295000, at: at(5) }),
    (s) => W.sell(s, code(10), { price: 285000, shipping: 1500, at: at(0) }), // 今日の売上
    (s) => W.listItem(s, code(11), { channel: 'auction', price: 355000, vendor: '大阪時計オークション', at: at(2) }),
    // 返品（クーリングオフ）: 期間内に受付 → 返送 → 完了
    (s) => W.requestReturn(s, { customerName: '岡本 優', codes: [code(15)], reason: 'regret', at: at(8, 11) }),
    (s) => W.shipReturn(s, s.returns[0].id, { tracking: '5012-3344-9871', at: at(7, 14) }),
    (s) => W.completeReturn(s, s.returns[0].id, at(6, 10)),
    (s) => W.requestReturn(s, { customerName: '斎藤 清', codes: [code(16)], reason: 'price', memo: '他社の見積もりのほうが高かったとのこと', at: at(5, 10) }),
    (s) => W.shipReturn(s, s.returns[0].id, { tracking: '5012-3344-2210', at: at(4, 15) }),
    (s) => W.requestReturn(s, { customerName: '松本 千春', codes: [code(18), code(19)], reason: 'family', memo: '夫に反対された。2点とも返品希望', at: at(0, 10) }),
  ];
  const state = steps.reduce((s, step) => {
    const r = step(s);
    if (r?.ok === false) throw new Error(`サンプルの作成に失敗: ${r.reason ?? ""} ${step}`);
    return r?.state ?? r;
  }, { units, records: {}, returns: [] });
  return state;
}

// 見本を保存する。force でないときは、まだ入れたことがなく、記録が空のときだけ入れる。入れたら true。
// 営業が登録した入庫データ（見本以外）は消さずに残す
export function seedSample(now = Date.now(), force = false) {
  try {
    if (!force && (localStorage.getItem(WH_SAMPLE_KEY) || Object.keys(W.loadRecords()).length || W.loadReturns().length)) return false;
    const { units, records, returns } = buildSample(now);
    const mine = loadUnits().filter((u) => !u.code.startsWith(PREFIX));
    localStorage.setItem(STOCK_KEY, JSON.stringify(addUnits(mine, units)));
    if (!W.saveState({ records, returns })) return false;
    localStorage.setItem(WH_SAMPLE_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
