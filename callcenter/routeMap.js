// 配車確定: 鑑定士のその日の訪問を、訪問する順に番号（①②③…）を付けたピンで地図に出し、順に線でつなぐ（ルート）。
// 線は、ピンどうしを結ぶ直線（道路に沿ったルートではない。座標もモックの代用のため、概算）。地図は Leaflet + OpenStreetMap。
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const numIcon = (s) => L.divIcon({ className: 'route-icon', html: `<div class="route-num${s.tentative ? ' tentative' : ''}">${s.n}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });

export function mountRouteMap(el, stops) {
  const map = L.map(el, { zoomControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const pts = stops.map((s) => [s.lat, s.lng]);
  if (pts.length > 1) L.polyline(pts, { color: '#0f766e', weight: 4, opacity: 0.85, dashArray: '8 6' }).addTo(map);
  stops.forEach((s) => L.marker([s.lat, s.lng], { icon: numIcon(s), title: `${s.n}. ${s.label}` }).addTo(map).bindTooltip(`${s.n}. ${s.label}`, { direction: 'top', offset: [0, -14] }));
  if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
  else if (pts.length === 1) map.setView(pts[0], 15);
  setTimeout(() => map.invalidateSize(), 0);
  return { destroy: () => map.remove() };
}
