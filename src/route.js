// ルート計算とGoogleマップのURL生成。距離は直線距離からの概算（実際の道のりはGoogleマップが計算する）。
import { OFFICE } from './schedule.js';

export { OFFICE };

const rad = (d) => (d * Math.PI) / 180;
export function distanceKm(a, b) {
  const R = 6371;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// 道のりは直線の約1.35倍、市街地の平均時速28kmで概算
export const roadKm = (a, b) => distanceKm(a, b) * 1.35;
export const minutesFor = (km) => Math.max(1, Math.round((km / 28) * 60));

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}
const pathKm = (origin, stops) => stops.reduce((sum, s, i) => sum + distanceKm(i === 0 ? origin : stops[i - 1], s), 0);

// 現在地から全訪問先を回る、総距離が最短の順番（訪問先は少数のため全探索）
export function shortestOrder(origin, stops) {
  if (stops.length <= 1) return stops;
  return permutations(stops).reduce((best, p) => (pathKm(origin, p) < pathKm(origin, best) ? p : best));
}

export const legsOf = (origin, stops) =>
  stops.map((s, i) => {
    const from = i === 0 ? origin : stops[i - 1];
    const km = roadKm(from, s);
    return { from, to: s, km, min: minutesFor(km) };
  });

const pt = (o) => (o.lat != null ? `${o.lat},${o.lng}` : o.address);

// 埋め込み用: 現在地 → 訪問先1 → 訪問先2 → … の順に結ぶ
export function mapEmbedUrl(origin, stops) {
  if (!stops.length) return '';
  const dest = stops.map((s) => encodeURIComponent(s.customer.address)).join('+to:');
  return `https://www.google.com/maps?output=embed&hl=ja&saddr=${encodeURIComponent(pt(origin))}&daddr=${dest}`;
}

// Googleマップ（ナビ）を開くためのURL
export function mapOpenUrl(origin, stops) {
  if (!stops.length) return '';
  const last = stops[stops.length - 1];
  const via = stops.slice(0, -1).map((s) => s.customer.address).join('|');
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${encodeURIComponent(pt(origin))}&destination=${encodeURIComponent(last.customer.address)}${via ? `&waypoints=${encodeURIComponent(via)}` : ''}`;
}
