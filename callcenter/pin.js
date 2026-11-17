// 訪問先の建物に刺すピン（緯度・経度）。画面から独立した純関数
export const validPin = (p) => Boolean(p) && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
export const roundPin = (p) => ({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 }); // 小数6桁＝約10cm
export const pinLabel = (p) => (validPin(p) ? `緯度 ${p.lat.toFixed(6)} ／ 経度 ${p.lng.toFixed(6)}` : '位置：未設定');

// 住所から場所を探すときの、検索の文字。細かい番地で見つからないことが多いので、番地・丁目を末尾から削って、順に広げる（全体 → 番地なし → 町域まで）
export function addressQueries(address) {
  const full = String(address ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
  if (!full) return [];
  const out = [full];
  let cur = full;
  for (let i = 0; i < 3; i++) {
    const next = cur.replace(/(?:[0-9]+(?:丁目|番地?|号)?[-ー−の]?)+$/u, '').replace(/[-ー−の]+$/u, '');
    if (!next || next === cur) break;
    out.push(next);
    cur = next;
  }
  return [...new Set(out)];
}
