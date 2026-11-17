// 訪問先の建物に刺すピン（緯度・経度）。画面から独立した純関数
export const validPin = (p) => Boolean(p) && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
export const roundPin = (p) => ({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 }); // 小数6桁＝約10cm
export const pinLabel = (p) => (validPin(p) ? `緯度 ${p.lat.toFixed(6)} ／ 経度 ${p.lng.toFixed(6)}` : '位置：未設定');
