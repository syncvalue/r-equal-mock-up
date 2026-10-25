// 倉庫・物流画面の見本データ。今日を基準に、買取（入庫）・出品・売却・クーリングオフの返品を作る。
// 出品・売却・返品は、実際の操作（warehouse.js）で作るため、画面と同じ規則（期間中は出品できない等）を満たす。
import { STOCK_KEY } from './store.js';
import { loadUnits, addUnits } from './stock.js';
import * as W from './warehouse.js';
import * as T from './warehouseTransfer.js';
import * as C from './warehouseConsign.js';
import * as Sale from './warehouseSale.js';
import { DEFAULT_MASTER as MASTER, isHighValue } from './warehouseMaster.js';

export const WH_SAMPLE_KEY = 'rq-mock-warehouse-sample'; // 初期化で消えない目印（初期化後に、自動で復活させない）
const PREFIX = 'RQ-WH';

// 保管場所は、入庫した倉庫の棚から選ぶ
// お客様ごとの入庫先の倉庫（大阪・関東・福岡に分かれる）
const WH_OF = { '中村 正': 'W-KANTO', '井上 和夫': 'W-KANTO', '吉田 浩': 'W-KANTO', '斎藤 清': 'W-KANTO', '山口 拓海': 'W-KANTO', '西田 久美': 'W-FUKUOKA', '石川 陽平': 'W-KANTO', '松井 恵': 'W-FUKUOKA', '三浦 香織': 'W-KANTO', '宮本 諒': 'W-FUKUOKA', '平田 美咲': 'W-FUKUOKA', '岡本 優': 'W-FUKUOKA', '森田 誠': 'W-FUKUOKA', '加藤 彩': 'W-FUKUOKA' };
// 高額品（貴金属など）は納入のときから本社、それ以外はお客様ごとの倉庫
const whOf = (customerName, item) => (item && isHighValue(item, MASTER) ? 'W-HONSHA' : WH_OF[customerName] ?? 'W-OSAKA');
const staffOfWh = (warehouseId) => MASTER.staff.find((s) => s.warehouseId === warehouseId)?.name;
// シールの色（見本）。貴金属・高額な商品が、紫・赤（本社管理）、それ以外は黄・緑・青
const colorOf = (category, price) => (price >= 400000 ? 'purple' : category === 'ジュエリー・貴金属' || price >= 300000 ? 'red' : 'other');
const SHELF_LETTER = { 'ブランドバッグ': 'A', '財布・小物': 'A', '腕時計': 'B', 'ジュエリー・貴金属': 'B', 'カメラ・家電': 'C' };
// 保管場所は、入庫した倉庫の棚から選ぶ（高額品は金庫室、それ以外はカテゴリの棚。なければ先頭の棚）
const placeOf = (category, price, warehouseId) => {
  const locs = MASTER.warehouses.find((w) => w.id === warehouseId).locations;
  return (price >= 300000 ? locs.find((l) => l.includes('金庫')) : locs.find((l) => l.startsWith(SHELF_LETTER[category]))) ?? locs[0];
};

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
    const sealColor = colorOf(category, price);
    const wid = whOf(customerName, { sealColor });
    return {
      code: `${PREFIX}${String(seq).padStart(4, '0')}`, visitId: `V-WH-${daysAgo}-${userId}`, userId, customerName, at: at(daysAgo), date: W.dateOf(at(daysAgo)),
      itemId: `wh-${seq}`, name, category, rank, n: 1, qty: 1, price, sealColor, status,
      storedAt: stored ? at(daysAgo, 17) : null, location: stored ? placeOf(category, price, wid) : null,
      // 偶数日前の買取は倉庫の担当者が明細と照合して入庫、奇数日前は営業がタブレットから入庫
      by: !stored ? null : daysAgo % 2 === 0 ? staffOfWh(wid) : userId,
      check: stored && daysAgo % 2 === 0 ? { by: staffOfWh(wid), at: at(daysAgo, 17), method: 'manual' } : null,
      ...(stored ? { warehouseId: wid } : {}),
    };
  });

  const units = [
    ...purchase(50, 'u05', '岡田 裕子', [['プラダ ナイロンバッグ', 'ブランドバッグ', 'B', 18000], ['コーチ 長財布', '財布・小物', 'A', 9000]]), // 0・1
    ...purchase(25, 'u01', '山田 花子', [['ルイ・ヴィトン ネヴァーフル MM', 'ブランドバッグ', 'A', 98000], ['エルメス スカーフ', '財布・小物', 'S', 36000]]), // 2・3
    ...purchase(22, 'u03', '佐藤 一雄', [['ロレックス デイトジャスト', '腕時計', 'B', 420000], ['オメガ シーマスター', '腕時計', 'B', 180000]]), // 4・5
    ...purchase(20, 'u06', '田村 恵子', [['K18 ネックレス', 'ジュエリー・貴金属', 'A', 52000], ['プラチナ リング', 'ジュエリー・貴金属', 'A', 64000]]), // 6・7
    ...purchase(18, 'u07', '中村 正', [['キヤノン EOS R6 ボディ', 'カメラ・家電', 'B', 180000], ['ソニー α7 IV ボディ', 'カメラ・家電', 'A', 210000]]), // 8・9
    ...purchase(15, 'u03', '井上 和夫', [['シャネル マトラッセ', 'ブランドバッグ', 'A', 240000]]), // 10
    ...purchase(12, 'u02', '小林 由美', [['カルティエ タンク', '腕時計', 'B', 310000], ['グッチ 長財布', '財布・小物', 'C', 12000]]), // 11・12
    ...purchase(10, 'u05', '林 美穂', [['K24 インゴット 50g', 'ジュエリー・貴金属', 'S', 480000], ['ティファニー ペンダント', 'ジュエリー・貴金属', 'A', 28000]]), // 13・14
    ...purchase(9, 'u10', '岡本 優', [['セリーヌ ラゲージ', 'ブランドバッグ', 'B', 70000]]), // 15（返品済み）
    ...purchase(6, 'u09', '斎藤 清', [['ニコン Z6 II ボディ', 'カメラ・家電', 'B', 120000]]), // 16（返送済み）
    ...purchase(5, 'u04', '森田 誠', [['ブライトリング ナビタイマー', '腕時計', 'B', 260000]]), // 17（期間中）
    ...purchase(4, 'u08', '松本 千春', [['ボッテガ イントレチャート', 'ブランドバッグ', 'A', 85000], ['フェンディ バゲット', 'ブランドバッグ', 'B', 45000]]), // 18・19（返品受付）
    ...purchase(3, 'u02', '加藤 彩', [['シャネル 長財布', '財布・小物', 'A', 56000]]), // 20（期間中）
    ...purchase(1, 'u05', '吉田 浩', [['K18 ブレスレット', 'ジュエリー・貴金属', 'A', 38000], ['ダイヤ リング 0.5ct', 'ジュエリー・貴金属', 'A', 150000]], 'stored'), // 21・22（期間中）
    ...purchase(0, 'u11', '福田 美香', [['ルイ・ヴィトン ポシェット', 'ブランドバッグ', 'B', 32000], ['ハミルトン カーキ', '腕時計', 'C', 40000]], 'pending'), // 23・24（入庫待ち）
    ...purchase(11, 'u12', '松田 理恵', [['エルメス ケリー', 'ブランドバッグ', 'A', 280000], ['コーチ ショルダー', 'ブランドバッグ', 'B', 15000]]), // 25・26（倉庫間の移動の見本）
    // 倉庫間の移動の見本（受け取り待ち・輸送中・履歴が、どの倉庫・本社でも見えるように）
    ...purchase(15, 'u13', '西田 久美', [['グッチ マーモント', 'ブランドバッグ', 'A', 98000], ['ルイ・ヴィトン 長財布', '財布・小物', 'A', 45000], ['エルメス ツイリー', '財布・小物', 'S', 38000]]), // 27・28・29（福岡倉庫）
    ...purchase(14, 'u14', '山口 拓海', [['キヤノン EOS R5 ボディ', 'カメラ・家電', 'A', 250000], ['オメガ スピードマスター', '腕時計', 'B', 280000], ['ニコン Z6III ボディ', 'カメラ・家電', 'A', 240000]]), // 30・31・32（関東倉庫）
    ...purchase(13, 'u15', '村上 健', [['K18 ダイヤ ネックレス', 'ジュエリー・貴金属', 'A', 120000], ['ロレックス サブマリーナ', '腕時計', 'A', 650000], ['K18 ブレスレット', 'ジュエリー・貴金属', 'A', 90000]]), // 33・34・35（本社）
    ...purchase(12, 'u16', '岩崎 真理', [['セリーヌ トリオンフ', 'ブランドバッグ', 'A', 88000], ['バーバリー マフラー', '財布・小物', 'B', 18000]]), // 36・37（大阪倉庫）
    // 梱包中のパックの見本（これから送る商品）
    ...purchase(16, 'u01', '前田 愛', [['プラダ ガレリア', 'ブランドバッグ', 'A', 180000], ['ブルガリ 長財布', '財布・小物', 'A', 62000], ['セイコー プレサージュ', '腕時計', 'B', 58000]]), // 38・39・40（大阪倉庫）
    ...purchase(16, 'u02', '石川 陽平', [['ソニー α7C ボディ', 'カメラ・家電', 'A', 190000]]), // 41（関東倉庫）
    ...purchase(16, 'u03', '松井 恵', [['ニコン Z fc ボディ', 'カメラ・家電', 'B', 98000], ['ミュウミュウ 長財布', '財布・小物', 'A', 55000]]), // 42・43（福岡倉庫）
    ...purchase(16, 'u04', '森 達也', [['プラチナ ペンダント', 'ジュエリー・貴金属', 'A', 70000]]), // 44（本社）
    // 業者への委託の見本（委託のパック）
    ...purchase(17, 'u05', '野口 隆', [['ブルガリ ブルガリ バッグ', 'ブランドバッグ', 'A', 150000], ['グッチ ベルト', '財布・小物', 'B', 28000], ['IWC ポルトギーゼ', '腕時計', 'A', 240000], ['タグ・ホイヤー カレラ', '腕時計', 'B', 170000]]), // 45〜48（大阪倉庫）
    ...purchase(17, 'u06', '三浦 香織', [['ロエベ ハンモック', 'ブランドバッグ', 'A', 160000], ['アニエスb 長財布', '財布・小物', 'B', 22000]]), // 49・50（関東倉庫）
    ...purchase(17, 'u07', '宮本 諒', [['キヤノン RF50mm F1.8', 'カメラ・家電', 'A', 68000]]), // 51（福岡倉庫）
    ...purchase(17, 'u08', '清水 玲子', [['K18 リング', 'ジュエリー・貴金属', 'A', 80000], ['プラチナ ネックレス', 'ジュエリー・貴金属', 'A', 110000], ['カルティエ ラブブレス', 'ジュエリー・貴金属', 'S', 580000]]), // 52〜54（本社）
    // 売れた商品の購入者への発送の見本（発送待ち・梱包中のパック）
    ...purchase(18, 'u09', '大野 光', [['フェンディ ピーカブー', 'ブランドバッグ', 'A', 120000], ['マルジェラ 長財布', '財布・小物', 'A', 32000], ['ラルフローレン バッグ', 'ブランドバッグ', 'B', 26000]]), // 55〜57（大阪倉庫）
    ...purchase(18, 'u10', '平田 美咲', [['ニコン NIKKOR Z 24-70mm', 'カメラ・家電', 'A', 90000], ['ソニー ヘッドホン WH-1000XM5', 'カメラ・家電', 'B', 25000]]), // 58・59（福岡倉庫）
    ...purchase(18, 'u11', '高田 誠', [['K18 ピアス', 'ジュエリー・貴金属', 'A', 60000], ['ダイヤ ブレスレット', 'ジュエリー・貴金属', 'A', 200000]]), // 60・61（本社）
  ];
  units[22] = { ...units[22], status: 'missing', storedAt: null, location: null, by: null, check: null, warehouseId: undefined }; // 所在不明

  const code = (i) => units[i].code;
  const R = (n) => `${PREFIX}R${String(n).padStart(3, '0')}`; // 色を貼り替えたあとの、新しいシールNo.
  // 売れた商品を、購入者へ発送する一連の操作（パックを作る → 入れる → 配送業者・サイズ → 納品書・伝票を出力 → 発送）
  const saleShip = ({ code: c, fromId, buyer, carrier, size, tracking, sentAt }) => [
    (s) => Sale.createSalePack(s, MASTER, { fromId, buyer, by: staffOfWh(fromId), at: sentAt }),
    (s) => Sale.addToSalePack(s, MASTER, s.transfers[0].id, c, { at: sentAt }),
    (s) => T.updatePack(s, s.transfers[0].id, { carrier, size }),
    (s) => T.markPrinted(T.markPrinted(s, s.transfers[0].id, 'list', sentAt), s.transfers[0].id, 'label', sentAt),
    (s) => Sale.shipSalePack(s, s.transfers[0].id, { tracking, by: staffOfWh(fromId), at: sentAt }),
  ];
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
    (s) => W.requestReturn(s, { master: MASTER, customerName: '岡本 優', codes: [code(15)], reason: 'regret', at: at(8, 11) }),
    (s) => W.shipReturn(s, s.returns[0].id, { tracking: '5012-3344-9871', at: at(7, 14) }),
    (s) => W.completeReturn(s, s.returns[0].id, at(6, 10)),
    (s) => W.requestReturn(s, { master: MASTER, customerName: '斎藤 清', codes: [code(16)], reason: 'price', memo: '他社の見積もりのほうが高かったとのこと', at: at(5, 10) }),
    (s) => W.shipReturn(s, s.returns[0].id, { tracking: '5012-3344-2210', at: at(4, 15) }),
    // 倉庫間の移動: エルメス ケリーは関東倉庫に移動して受取済み、コーチ ショルダーは輸送中
    (s) => T.sendTransfer(s, MASTER, { fromId: 'W-OSAKA', toId: 'W-KANTO', codes: [code(25)], by: staffOfWh('W-OSAKA'), at: at(7) }),
    (s) => T.receiveTransfer(s, MASTER, s.transfers[0].id, { receiverWarehouseId: 'W-KANTO', location: 'A棚（バッグ・小物）', by: staffOfWh('W-KANTO'), at: at(5) }),
    (s) => T.sendTransfer(s, MASTER, { fromId: 'W-OSAKA', toId: 'W-KANTO', codes: [code(26)], by: staffOfWh('W-OSAKA'), at: at(1) }),
    (s) => W.relabelUnit(s, code(12), { newCode: R(1), color: 'red', by: staffOfWh('W-OSAKA'), at: at(8) }), // 赤のシールに貼り替え → 高額品なので本社へ
    (s) => T.sendTransfer(s, MASTER, { fromId: 'W-OSAKA', toId: 'W-HONSHA', codes: [R(1)], by: staffOfWh('W-OSAKA'), at: at(7) }),
    (s) => T.receiveTransfer(s, MASTER, s.transfers[0].id, { receiverWarehouseId: 'W-HONSHA', location: '貴金属保管庫', by: staffOfWh('W-HONSHA'), at: at(6) }),
    (s) => T.sendTransfer(s, MASTER, { fromId: 'W-FUKUOKA', toId: 'W-OSAKA', codes: [code(29)], by: staffOfWh('W-FUKUOKA'), at: at(9) }),
    (s) => T.receiveTransfer(s, MASTER, s.transfers[0].id, { receiverWarehouseId: 'W-OSAKA', location: 'A棚（バッグ・小物）', by: staffOfWh('W-OSAKA'), at: at(8) }),
    (s) => T.sendTransfer(s, MASTER, { fromId: 'W-KANTO', toId: 'W-FUKUOKA', codes: [code(31)], by: staffOfWh('W-KANTO'), at: at(6) }),
    (s) => T.receiveTransfer(s, MASTER, s.transfers[0].id, { receiverWarehouseId: 'W-FUKUOKA', location: 'B棚', by: staffOfWh('W-FUKUOKA'), at: at(5) }),
    (s) => W.relabelUnit(s, code(33), { newCode: R(2), color: 'other', by: staffOfWh('W-HONSHA'), at: at(6) }), // 赤を貼り間違えていた → 高額品ではないので倉庫へ
    (s) => T.sendTransfer(s, MASTER, { fromId: 'W-HONSHA', toId: 'W-KANTO', codes: [R(2)], by: staffOfWh('W-HONSHA'), at: at(5) }),
    (s) => T.receiveTransfer(s, MASTER, s.transfers[0].id, { receiverWarehouseId: 'W-KANTO', location: 'A棚（バッグ・小物）', by: staffOfWh('W-KANTO'), at: at(4) }),
    // 輸送中（送った倉庫の「送った商品・輸送中」と、送り先の「受け取り待ち」に出る）
    (s) => T.sendTransfer(s, MASTER, { fromId: 'W-FUKUOKA', toId: 'W-OSAKA', codes: [code(27)], by: staffOfWh('W-FUKUOKA'), at: at(2) }),
    (s) => T.sendTransfer(s, MASTER, { fromId: 'W-KANTO', toId: 'W-OSAKA', codes: [code(30)], by: staffOfWh('W-KANTO'), at: at(1) }),
    (s) => T.sendTransfer(s, MASTER, { fromId: 'W-FUKUOKA', toId: 'W-KANTO', codes: [code(28)], by: staffOfWh('W-FUKUOKA'), at: at(2) }),
    (s) => T.sendTransfer(s, MASTER, { fromId: 'W-KANTO', toId: 'W-FUKUOKA', codes: [code(32)], by: staffOfWh('W-KANTO'), at: at(3) }),
    (s) => W.relabelUnit(s, code(36), { newCode: R(3), color: 'red', by: staffOfWh('W-OSAKA'), at: at(2) }),
    (s) => T.sendTransfer(s, MASTER, { fromId: 'W-OSAKA', toId: 'W-HONSHA', codes: [R(3)], by: staffOfWh('W-OSAKA'), at: at(1) }),
    (s) => W.relabelUnit(s, code(35), { newCode: R(4), color: 'other', by: staffOfWh('W-HONSHA'), at: at(2) }),
    (s) => T.sendTransfer(s, MASTER, { fromId: 'W-HONSHA', toId: 'W-FUKUOKA', codes: [R(4)], by: staffOfWh('W-HONSHA'), at: at(1) }),
    // 梱包中のパック（どの倉庫・本社でも、パックの作業の途中が見えるように）
    (s) => T.createPack(s, MASTER, { fromId: 'W-OSAKA', toId: 'W-FUKUOKA', by: staffOfWh('W-OSAKA'), at: at(0, 9) }),
    (s) => T.addToPack(s, MASTER, s.transfers[0].id, code(38), { at: at(0, 9) }),
    (s) => T.addToPack(s, MASTER, s.transfers[0].id, code(39), { at: at(0, 9) }),
    (s) => T.updatePack(s, s.transfers[0].id, { carrier: 'yamato', size: '80', note: '割れ物注意' }),
    (s) => T.markPrinted(T.markPrinted(s, s.transfers[0].id, 'list', at(0, 10)), s.transfers[0].id, 'label', at(0, 10)), // 明細・発送伝票を出力済み（あとは発送するだけ）
    (s) => T.createPack(s, MASTER, { fromId: 'W-OSAKA', toId: 'W-KANTO', by: staffOfWh('W-OSAKA'), at: at(0, 11) }), // これから設定するパック
    (s) => T.addToPack(s, MASTER, s.transfers[0].id, code(40), { at: at(0, 11) }),
    (s) => T.createPack(s, MASTER, { fromId: 'W-KANTO', toId: 'W-OSAKA', by: staffOfWh('W-KANTO'), at: at(0, 9) }),
    (s) => T.addToPack(s, MASTER, s.transfers[0].id, code(41), { at: at(0, 9) }),
    (s) => T.updatePack(s, s.transfers[0].id, { carrier: 'sagawa', size: '60' }),
    (s) => T.markPrinted(s, s.transfers[0].id, 'list', at(0, 10)), // 明細だけ出力済み
    (s) => T.createPack(s, MASTER, { fromId: 'W-FUKUOKA', toId: 'W-KANTO', by: staffOfWh('W-FUKUOKA'), at: at(0, 9) }),
    (s) => T.addToPack(s, MASTER, s.transfers[0].id, code(42), { at: at(0, 9) }),
    (s) => T.addToPack(s, MASTER, s.transfers[0].id, code(43), { at: at(0, 9) }),
    (s) => T.updatePack(s, s.transfers[0].id, { carrier: 'jp', size: '80', boxes: 2 }),
    (s) => W.relabelUnit(s, code(44), { newCode: R(5), color: 'other', by: staffOfWh('W-HONSHA'), at: at(3) }), // 赤の貼り間違いを直した商品を、本社から倉庫へ
    (s) => T.createPack(s, MASTER, { fromId: 'W-HONSHA', toId: 'W-OSAKA', by: staffOfWh('W-HONSHA'), at: at(0, 9) }),
    (s) => T.addToPack(s, MASTER, s.transfers[0].id, R(5), { at: at(0, 9) }),
    (s) => T.updatePack(s, s.transfers[0].id, { carrier: 'jp', size: '60' }),
    // 業者への委託（発送済み＝委託中のパックと、梱包中のパック）
    (s) => C.createConsignPack(s, MASTER, { fromId: 'W-OSAKA', vendorId: 'V-OSAKA-WATCH', by: staffOfWh('W-OSAKA'), at: at(4) }),
    (s) => C.addToConsignPack(s, MASTER, s.transfers[0].id, code(47), { at: at(4) }),
    (s) => C.addToConsignPack(s, MASTER, s.transfers[0].id, code(48), { at: at(4) }),
    (s) => T.updatePack(s, s.transfers[0].id, { carrier: 'yamato', size: '80' }),
    (s) => T.markPrinted(T.markPrinted(s, s.transfers[0].id, 'list', at(4)), s.transfers[0].id, 'label', at(4)),
    (s) => C.shipConsignPack(s, MASTER, s.transfers[0].id, { tracking: '4321-7771-0001', by: staffOfWh('W-OSAKA'), at: at(3) }),
    (s) => C.createConsignPack(s, MASTER, { fromId: 'W-HONSHA', vendorId: 'V-KANSAI-JEWEL', by: staffOfWh('W-HONSHA'), at: at(4) }),
    (s) => C.addToConsignPack(s, MASTER, s.transfers[0].id, code(52), { at: at(4) }),
    (s) => C.addToConsignPack(s, MASTER, s.transfers[0].id, code(53), { at: at(4) }),
    (s) => T.updatePack(s, s.transfers[0].id, { carrier: 'jp', size: '60' }),
    (s) => T.markPrinted(T.markPrinted(s, s.transfers[0].id, 'list', at(4)), s.transfers[0].id, 'label', at(4)),
    (s) => C.shipConsignPack(s, MASTER, s.transfers[0].id, { tracking: '8100-5550-0002', by: staffOfWh('W-HONSHA'), at: at(3) }),
    (s) => C.createConsignPack(s, MASTER, { fromId: 'W-OSAKA', vendorId: 'V-TOKYO-BRAND', by: staffOfWh('W-OSAKA'), at: at(0, 12) }),
    (s) => C.addToConsignPack(s, MASTER, s.transfers[0].id, code(45), { at: at(0, 12) }),
    (s) => C.addToConsignPack(s, MASTER, s.transfers[0].id, code(46), { at: at(0, 12) }),
    (s) => C.setPackPrice(s, s.transfers[0].id, code(45), 168000),
    (s) => T.updatePack(s, s.transfers[0].id, { carrier: 'sagawa', size: '100' }),
    (s) => T.markPrinted(T.markPrinted(s, s.transfers[0].id, 'list', at(0, 13)), s.transfers[0].id, 'label', at(0, 13)), // 明細・発送伝票を出力済み（あとは委託するだけ）
    (s) => C.createConsignPack(s, MASTER, { fromId: 'W-KANTO', vendorId: 'V-TOKYO-BRAND', by: staffOfWh('W-KANTO'), at: at(0, 12) }), // これから設定するパック
    (s) => C.addToConsignPack(s, MASTER, s.transfers[0].id, code(49), { at: at(0, 12) }),
    (s) => C.addToConsignPack(s, MASTER, s.transfers[0].id, code(50), { at: at(0, 12) }),
    (s) => C.createConsignPack(s, MASTER, { fromId: 'W-FUKUOKA', vendorId: 'V-OSAKA-WATCH', by: staffOfWh('W-FUKUOKA'), at: at(0, 12) }),
    (s) => C.addToConsignPack(s, MASTER, s.transfers[0].id, code(51), { at: at(0, 12) }),
    (s) => T.updatePack(s, s.transfers[0].id, { carrier: 'jp', size: '60' }),
    (s) => T.markPrinted(s, s.transfers[0].id, 'list', at(0, 13)), // 明細だけ出力済み
    (s) => C.createConsignPack(s, MASTER, { fromId: 'W-HONSHA', vendorId: 'V-KANSAI-JEWEL', by: staffOfWh('W-HONSHA'), at: at(0, 12) }),
    (s) => C.addToConsignPack(s, MASTER, s.transfers[0].id, code(54), { at: at(0, 12) }),
    (s) => T.updatePack(s, s.transfers[0].id, { carrier: 'yamato', size: '80' }),
    // 売れた商品の購入者への発送（発送済み。古い売却は、発送済み）
    ...saleShip({ code: code(0), fromId: 'W-OSAKA', buyer: { name: '森下 茂', zip: '6500001', address: '兵庫県神戸市中央区加納町1-1', phone: '078-000-0001' }, carrier: 'yamato', size: '80', tracking: '4321-0101-0001', sentAt: at(34) }),
    ...saleShip({ code: code(1), fromId: 'W-OSAKA', buyer: { name: '上田 美里', zip: '5300001', address: '大阪府大阪市北区梅田1-1', phone: '06-0000-0101' }, carrier: 'jp', size: '60', tracking: '8100-0101-0002', sentAt: at(32) }),
    ...saleShip({ code: code(2), fromId: 'W-OSAKA', buyer: { name: '大林 真', zip: '4600002', address: '愛知県名古屋市中区丸の内1-1', phone: '052-000-0102' }, carrier: 'sagawa', size: '100', tracking: '5012-0101-0003', sentAt: at(9) }),
    ...saleShip({ code: code(3), fromId: 'W-OSAKA', buyer: { name: '三木 優子', zip: '6000001', address: '京都府京都市下京区四条通1-1', phone: '075-000-0103' }, carrier: 'yamato', size: '60', tracking: '', sentAt: at(7) }),
    ...saleShip({ code: code(6), fromId: 'W-HONSHA', buyer: { name: '△△貴金属 買取係', zip: '1100016', address: '東京都台東区台東4-1-1', phone: '03-0000-0104' }, carrier: 'jp', size: '60', tracking: '8100-0202-0004', sentAt: at(7) }),
    ...saleShip({ code: code(8), fromId: 'W-KANTO', buyer: { name: '中山 隆', zip: '2310001', address: '神奈川県横浜市中区港町1-1', phone: '045-000-0105' }, carrier: 'sagawa', size: '80', tracking: '5012-0303-0005', sentAt: at(3) }),
    // 今日売れた商品（発送待ち・梱包中）
    (s) => W.listItem(s, code(55), { channel: 'yahoo', price: 150000, at: at(2) }),
    (s) => W.sell(s, code(55), { price: 142000, buyer: '田中 拓（ヤフオク）', at: at(0, 9) }),
    (s) => W.listItem(s, code(56), { channel: 'mercari', price: 40000, at: at(2) }),
    (s) => W.sell(s, code(56), { price: 36000, shipping: 800, buyer: '佐々木 恵（メルカリ）', at: at(0, 10) }),
    (s) => W.listItem(s, code(57), { channel: 'mercari', price: 30000, at: at(2) }),
    (s) => W.sell(s, code(57), { price: 28000, shipping: 700, buyer: '高橋 翼（メルカリ）', at: at(0, 11) }),
    (s) => W.listItem(s, code(58), { channel: 'yahoo', price: 110000, at: at(2) }),
    (s) => W.sell(s, code(58), { price: 104000, buyer: '山田 優（ヤフオク）', at: at(0, 10) }),
    (s) => W.listItem(s, code(59), { channel: 'rakuma', price: 32000, at: at(2) }),
    (s) => W.sell(s, code(59), { price: 30000, shipping: 600, buyer: '小林 舞（ラクマ）', at: at(0, 11) }),
    (s) => W.listItem(s, code(60), { channel: 'direct', price: 80000, at: at(2) }),
    (s) => W.sell(s, code(60), { price: 76000, buyer: '△△貴金属', at: at(0, 10) }),
    (s) => W.listItem(s, code(61), { channel: 'direct', price: 260000, at: at(2) }),
    (s) => W.sell(s, code(61), { price: 250000, buyer: '○○ジュエリー', at: at(0, 11) }),
    // 梱包中の発送のパック（購入者あて）
    (s) => Sale.createSalePack(s, MASTER, { fromId: 'W-OSAKA', buyer: { name: '田中 拓', zip: '1000001', address: '東京都千代田区千代田1-1', phone: '03-1234-0001' }, by: staffOfWh('W-OSAKA'), at: at(0, 12) }),
    (s) => Sale.addToSalePack(s, MASTER, s.transfers[0].id, code(55), { at: at(0, 12) }),
    (s) => T.updatePack(s, s.transfers[0].id, { carrier: 'yamato', size: '80' }),
    (s) => T.markPrinted(s, s.transfers[0].id, 'list', at(0, 13)), // 納品書だけ出力済み
    (s) => Sale.createSalePack(s, MASTER, { fromId: 'W-FUKUOKA', buyer: { name: '小林 舞', zip: '8100001', address: '福岡県福岡市中央区天神1-1', phone: '092-000-0005' }, by: staffOfWh('W-FUKUOKA'), at: at(0, 12) }),
    (s) => Sale.addToSalePack(s, MASTER, s.transfers[0].id, code(59), { at: at(0, 12) }),
    (s) => T.updatePack(s, s.transfers[0].id, { carrier: 'jp', size: '60' }),
    (s) => T.markPrinted(T.markPrinted(s, s.transfers[0].id, 'list', at(0, 13)), s.transfers[0].id, 'label', at(0, 13)), // 納品書・伝票を出力済み（あとは発送するだけ）
    (s) => Sale.createSalePack(s, MASTER, { fromId: 'W-HONSHA', buyer: { name: '○○ジュエリー（担当 山下）', zip: '5410044', address: '大阪府大阪市中央区伏見町1-1', phone: '06-0000-0106' }, by: staffOfWh('W-HONSHA'), at: at(0, 12) }),
    (s) => Sale.addToSalePack(s, MASTER, s.transfers[0].id, code(61), { at: at(0, 12) }),
    (s) => T.updatePack(s, s.transfers[0].id, { carrier: 'yamato', size: '80' }),
    (s) => W.requestReturn(s, { master: MASTER, customerName: '松本 千春', codes: [code(18), code(19)], reason: 'family', memo: '夫に反対された。2点とも返品希望', at: at(0, 10) }),
  ];
  const state = steps.reduce((s, step) => {
    const r = step(s);
    if (r?.ok === false) throw new Error(`サンプルの作成に失敗: ${r.reason ?? ""} ${step}`);
    return r?.state ?? r;
  }, { units, records: {}, returns: [], transfers: [] });
  // 発送済みの移動に、配送業者（ヤマト・佐川・日本郵便）・サイズ・追跡番号を付ける（受け取り待ちの1件は、追跡番号なし）
  const CARRIERS = ['yamato', 'sagawa', 'jp'];
  const SIZES = ['80', '100', '60', '120'];
  let n = 0;
  const transfers = state.transfers.map((t) => {
    if (!['transit', 'received'].includes(t.status)) return t; // 倉庫間の移動（発送済み）だけに付ける。梱包中・委託のパックは、設定済み
    n += 1;
    const carrier = CARRIERS[n % 3];
    return { ...t, carrier, size: SIZES[n % 4], boxes: 1, note: '', tracking: n % 5 === 0 ? '' : `${carrier === 'yamato' ? '4321' : carrier === 'sagawa' ? '5012' : '8100'}-${String(2000 + n * 37).padStart(4, '0')}-${String(9000 + n * 11).padStart(4, '0')}` };
  });
  return { ...state, transfers };
}

// 見本を保存する。force でないときは、まだ入れたことがなく、記録が空のときだけ入れる。入れたら true。
// 営業が登録した入庫データ（見本以外）は消さずに残す
export function seedSample(now = Date.now(), force = false) {
  try {
    if (!force && (localStorage.getItem(WH_SAMPLE_KEY) || Object.keys(W.loadRecords()).length || W.loadReturns().length || W.loadTransfers().length)) return false;
    const { units, records, returns, transfers } = buildSample(now);
    const mine = loadUnits().filter((u) => !u.code.startsWith(PREFIX));
    localStorage.setItem(STOCK_KEY, JSON.stringify(addUnits(mine, units)));
    if (!W.saveState({ records, returns, transfers })) return false;
    localStorage.setItem(WH_SAMPLE_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
