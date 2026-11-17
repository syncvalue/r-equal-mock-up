// 訪問先を中心にした周辺地図（OpenStreetMapのタイルを並べる）と、自分の位置。画面から独立した純関数。
// 訪問先が常に中心。現在地が近ければ、入る縮尺で一緒に出し、離れていれば、地図には出さず、距離と方角だけ示す。
import { distanceKm } from './route.js';

const TILE = 256;
const HALF_W = 240; // 描くタイルの範囲（実際の表示枠より少し広め）
const HALF_H = 150;
const SAFE_W = 200; // 現在地をこの範囲に収める（印が枠からはみ出さない）
const SAFE_H = 100;
const ZOOMS = [16, 15, 14, 13];
const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];

export const directionLabel = (deg) => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

const worldPx = (lat, lng, z) => {
  const n = TILE * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
};

export const tileUrl = (t) => `https://tile.openstreetmap.org/${t.z}/${t.tx}/${t.ty}.png`;

const bearingOf = (from, to) => (Math.atan2((to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180), to.lat - from.lat) * 180) / Math.PI;

// dest: 訪問先 {lat,lng}、me: 現在地（不明なら null）。座標は、訪問先の中心を (0,0) とした画面上のpx
export function mapView({ dest, me }) {
  const offset = (z, p) => { const a = worldPx(dest.lat, dest.lng, z); const b = worldPx(p.lat, p.lng, z); return { x: b.x - a.x, y: b.y - a.y }; };
  const zoom = me ? (ZOOMS.find((z) => { const o = offset(z, me); return Math.abs(o.x) <= SAFE_W && Math.abs(o.y) <= SAFE_H; }) ?? ZOOMS[0]) : ZOOMS[0];
  const c = worldPx(dest.lat, dest.lng, zoom);
  const n = 2 ** zoom;
  const tiles = [];
  for (let tx = Math.floor((c.x - HALF_W) / TILE); tx <= Math.floor((c.x + HALF_W) / TILE); tx++) {
    for (let ty = Math.floor((c.y - HALF_H) / TILE); ty <= Math.floor((c.y + HALF_H) / TILE); ty++) {
      if (ty >= 0 && ty < n) tiles.push({ z: zoom, tx: ((tx % n) + n) % n, ty, left: Math.round(tx * TILE - c.x), top: Math.round(ty * TILE - c.y) });
    }
  }
  const o = me ? offset(zoom, me) : null;
  const inside = o && Math.abs(o.x) <= SAFE_W && Math.abs(o.y) <= SAFE_H;
  return {
    zoom, tiles,
    me: inside ? { x: Math.round(o.x), y: Math.round(o.y) } : null,
    far: me && !inside ? { km: distanceKm(me, dest), dir: directionLabel(bearingOf(dest, me)) } : null, // 現在地は、訪問先から見て、この方角
  };
}
