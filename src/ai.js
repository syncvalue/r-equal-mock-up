// AI査定（モック）。撮影画像から買取額・状態ランク・信頼度を推定したように見せる。
// 実運用では画像認識APIへの呼び出しに差し替える。
import { PRODUCTS } from './data.js';

const RANK_FACTOR = { S: 1.1, A: 1, B: 0.88, C: 0.72, D: 0.55 };
const RANK_TEXT = {
  S: '傷・汚れがほぼ見られず新品同様',
  A: '目立つ傷はなく、美品の範囲',
  B: '角スレや擦れなど、使用感が確認できる',
  C: '傷・汚れが目立つ',
  D: '破れ・欠損など難あり',
};

const hashOf = (photos) => [...(photos[0] ?? '').slice(0, 400)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 100003, 7);

export function estimateByPhotos(item, photos) {
  const h = hashOf(photos) + photos.length * 13;
  const master = PRODUCTS.find((p) => p.id === item.id);
  const rank = ['S', 'A', 'A', 'B', 'B', 'C'][h % 6];
  const qty = item.qty || 1;
  // 買取金額は数量分の合計。マスタ実績（1点あたり）を数量分に換算して推定する
  const base = (master ? (master.history.min + master.history.max) / 2 : (item.price || 100000) / qty) * qty;
  const step = base < 50000 ? 100 : 1000;
  const price = Math.max(step, Math.round((base * RANK_FACTOR[rank]) / step) * step);
  const confidence = Math.max(45, 62 + (h % 30) - (photos.length < 2 ? 10 : 0) - (master ? 0 : 15));
  return {
    price,
    min: Math.round((price * 0.9) / step) * step,
    max: Math.round((price * 1.1) / step) * step,
    rank,
    confidence,
    reason: `${master ? `過去の買取実績${master.history.count}件の中央値を基準に、` : 'マスタ未登録のため入力額を基準に、'}画像から「${RANK_TEXT[rank]}」と判定して補正しました${qty > 1 ? `（${qty}点分の合計）` : ''}。${photos.length < 2 ? '写真が1枚のため、角度違い・刻印のアップの追加で精度が上がります。' : ''}`,
    at: Date.now(),
  };
}

// レシートのAI読み取り（モック）。写真から、種別・金額・店名を読み取ったように見せる。
// 実運用では、OCR・画像認識APIの呼び出しに差し替える（読み取り結果は、必ず人が確認・修正できるようにする）。
export const RECEIPT_SAMPLES = [
  { type: 'gas', store: 'ENEOS 天王寺SS', amount: 4820, confidence: 96 },
  { type: 'lunch', store: 'すき家 谷町店', amount: 780, confidence: 93 },
  { type: 'toll', store: 'タイムズ阿倍野', amount: 1200, confidence: 90 },
  { type: 'supply', store: 'ダイソー 梅田店', amount: 1430, confidence: 88 },
  { type: 'toll', store: 'NEXCO西日本 高速料金', amount: 2350, confidence: 91 },
  { type: 'transit', store: 'JR西日本 乗車券', amount: 640, confidence: 62 },
];
export const receiptSampleFor = (seed) => RECEIPT_SAMPLES[Math.abs(Number(seed) || 0) % RECEIPT_SAMPLES.length];
