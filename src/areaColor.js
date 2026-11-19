// 配布カレンダーの、エリアごとの色分けと絞り込み。エリア＝チラシの配布エリアの都道府県。画面から独立した純関数
import { prefOf } from './flyers.js';

export const OTHER_AREA = 'その他';
export const areaOf = (flyer) => prefOf(flyer.area) || OTHER_AREA;

// よく使う都道府県は、色相を決めておく（隣のエリアと、見分けやすいように）。それ以外は、名前から決める
const HUES = { 大阪府: 12, 兵庫県: 205, 京都府: 275, 奈良県: 120, 滋賀県: 175, 和歌山県: 335, 愛知県: 40, 東京都: 230, 神奈川県: 160, 埼玉県: 85, 千葉県: 305, 福岡県: 355 };
const hashHue = (s) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 17);

export function areaColor(area) {
  if (area === OTHER_AREA) return { solid: 'hsl(0 0% 40%)', tint: 'hsl(0 0% 93%)' };
  const h = HUES[area] ?? hashHue(area);
  return { solid: `hsl(${h} 55% 36%)`, tint: `hsl(${h} 60% 92%)` }; // solid=濃い（白い文字が読める）／tint=薄い（帯の中）
}

// 有効なチラシのあるエリア（チラシの多い順。「その他」は最後）
export function areaOptions(flyers) {
  const count = {};
  flyers.filter((f) => f.active).forEach((f) => { const a = areaOf(f); count[a] = (count[a] ?? 0) + 1; });
  return Object.entries(count).map(([area, n]) => ({ area, count: n })).sort((a, b) => (a.area === OTHER_AREA) - (b.area === OTHER_AREA) || b.count - a.count || a.area.localeCompare(b.area));
}
