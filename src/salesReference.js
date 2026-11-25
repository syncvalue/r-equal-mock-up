// 過去の販売実績（査定部が、想定販売価格を決めるときの参考）。
// 倉庫で売れた商品の記録（realPastSales）と、デモ用のダミー（DEMO_PAST_SALES）を、同じ形で扱う。
// 形: { code, name, category, rank, soldPrice（1点の売価）, cost（1点の買取金額）, soldAt, channel, demo }

const TOKEN_SPLIT = /[\s　（）()・/／,、]+/;
const tokensOf = (name) => String(name ?? '').split(TOKEN_SPLIT).filter((t) => t.length >= 2);

// 倉庫で売れた商品（売却済み）を、実績の形にする。新しい順
export const realPastSales = ({ units, records }) =>
  units
    .filter((u) => records[u.code]?.stage === 'sold')
    .map((u) => ({
      code: u.code, name: u.name, category: u.category, rank: u.rank, soldPrice: records[u.code].soldPrice, cost: u.price,
      soldAt: records[u.code].soldAt, channel: records[u.code].channel, demo: false,
    }))
    .sort((a, b) => b.soldAt - a.soldAt);

// 似た商品の実績。同じカテゴリのうち、商品名の語が一致する数・同じランク・新しい順に並べる。どれも、カテゴリが違うものは出さない
export function similarSales(list, { name, category, rank }, limit = 10) {
  const tokens = tokensOf(name);
  return list
    .filter((s) => s.category === category)
    .map((s) => ({ s, hit: tokens.filter((t) => s.name.includes(t)).length }))
    .sort((a, b) => b.hit - a.hit || Number(b.s.rank === rank) - Number(a.s.rank === rank) || b.s.soldAt - a.s.soldAt)
    .slice(0, limit)
    .map((x) => x.s);
}

// 売価の、件数・最小・中央値・最大。実績がなければ null
export function salesSummary(rows) {
  if (!rows.length) return null;
  const p = rows.map((r) => r.soldPrice).sort((a, b) => a - b);
  const mid = Math.floor(p.length / 2);
  return { count: p.length, min: p[0], median: p.length % 2 ? p[mid] : Math.round((p[mid - 1] + p[mid]) / 2), max: p[p.length - 1] };
}

// ---- デモ用（ダミー）の過去の販売実績。本番では、倉庫の販売の記録だけになる ----
const d = (m, day) => new Date(2026, m - 1, day, 14, 0).getTime();
const demo = (code, name, category, rank, cost, soldPrice, soldAt, channel) => ({ code: `DEMO-${code}`, name, category, rank, soldPrice, cost, soldAt, channel, demo: true });
export const DEMO_PAST_SALES = [
  demo('W01', 'ロレックス デイトジャスト', '腕時計', 'A', 440000, 610000, d(10, 8), 'direct'),
  demo('W02', 'ロレックス デイトジャスト', '腕時計', 'B', 400000, 555000, d(9, 21), 'auction'),
  demo('W03', 'ロレックス デイトジャスト', '腕時計', 'B', 410000, 540000, d(8, 30), 'direct'),
  demo('W04', 'オメガ シーマスター', '腕時計', 'B', 170000, 240000, d(10, 2), 'yahoo'),
  demo('W05', 'オメガ シーマスター', '腕時計', 'A', 190000, 268000, d(9, 12), 'yahoo'),
  demo('W06', 'カルティエ タンク ソロ', '腕時計', 'S', 320000, 430000, d(10, 15), 'direct'),
  demo('W07', 'カルティエ タンク ソロ', '腕時計', 'A', 290000, 395000, d(9, 3), 'auction'),
  demo('J01', 'K18 ネックレス（約20g）', 'ジュエリー・貴金属', 'B', 90000, 128000, d(10, 11), 'direct'),
  demo('J02', 'K18 ネックレス（約18g）', 'ジュエリー・貴金属', 'A', 85000, 124000, d(9, 25), 'direct'),
  demo('J03', 'K18 ブレスレット（約15g）', 'ジュエリー・貴金属', 'A', 70000, 99000, d(10, 5), 'yahoo'),
  demo('J04', 'Pt900 マリッジリング', 'ジュエリー・貴金属', 'B', 60000, 86000, d(9, 18), 'direct'),
  demo('J05', 'プラチナ ダイヤリング 0.5ct', 'ジュエリー・貴金属', 'A', 270000, 372000, d(10, 1), 'auction'),
  demo('J06', 'ミキモト パールネックレス', 'ジュエリー・貴金属', 'A', 140000, 205000, d(9, 9), 'direct'),
  demo('J07', '純金 インゴット 100g', 'ジュエリー・貴金属', 'S', 1250000, 1440000, d(10, 20), 'direct'),
  demo('J08', '真珠（パール） ネックレス アコヤ 7mm', 'ジュエリー・貴金属', 'A', 40000, 58000, d(10, 13), 'mercari'),
  demo('J09', '真珠（パール） ネックレス 南洋 12mm', 'ジュエリー・貴金属', 'A', 160000, 225000, d(9, 29), 'direct'),
];
