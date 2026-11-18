// 配車確定: 鑑定士のその日の訪問を、訪問する順に番号（①②③…）を付けたピンで地図に出し、順につなぐ（ルート）。
// Googleマップのキー（VITE_GOOGLE_MAPS_API_KEY）があれば Googleマップ（道路に沿った運転ルート。Directions API が使えないときは、ピンどうしの直線）。
// キーがなければ Leaflet + OpenStreetMap（ピンどうしの直線）。座標はモックの代用のため、概算。
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { googleKey, loadGoogleMaps } from './googleMap.js';

const numIcon = (s) => L.divIcon({ className: 'route-icon', html: `<div class="route-num${s.tentative ? ' tentative' : ''}">${s.n}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });

function mountLeaflet(el, stops) {
  const map = L.map(el, { zoomControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const pts = stops.map((s) => [s.lat, s.lng]);
  if (pts.length > 1) L.polyline(pts, { color: '#0f766e', weight: 4, opacity: 0.85, dashArray: '8 6' }).addTo(map);
  stops.forEach((s) => L.marker([s.lat, s.lng], { icon: numIcon(s), title: `${s.n}. ${s.label}` }).addTo(map).bindTooltip(`${s.n}. ${s.label}`, { direction: 'top', offset: [0, -14] }));
  if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
  else if (pts.length === 1) map.setView(pts[0], 15);
  setTimeout(() => map.invalidateSize(), 0);
  return { kind: 'leaflet', destroy: () => map.remove() };
}

async function mountGoogle(el, stops) {
  const maps = await loadGoogleMaps();
  const map = new maps.Map(el, { center: { lat: stops[0].lat, lng: stops[0].lng }, zoom: 15, mapTypeControl: true, streetViewControl: false, fullscreenControl: false, clickableIcons: false });
  const markers = stops.map((s) => new maps.Marker({
    position: { lat: s.lat, lng: s.lng }, map, title: `${s.n}. ${s.label}`, zIndex: 100 + s.n,
    label: { text: String(s.n), color: s.tentative ? '#0f766e' : '#ffffff', fontWeight: '700', fontSize: '14px' },
    icon: { path: maps.SymbolPath.CIRCLE, scale: 15, fillColor: s.tentative ? '#ffffff' : '#0f766e', fillOpacity: 1, strokeColor: s.tentative ? '#0f766e' : '#ffffff', strokeWeight: 3 },
  }));
  const bounds = new maps.LatLngBounds();
  stops.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
  let line = null;
  let renderer = null;
  let kind = 'google';
  if (stops.length > 1) {
    const path = stops.map((s) => ({ lat: s.lat, lng: s.lng }));
    try { // 道路に沿った運転ルート（Directions API）
      const res = await new maps.DirectionsService().route({
        origin: path[0], destination: path[path.length - 1], waypoints: path.slice(1, -1).map((location) => ({ location, stopover: true })),
        travelMode: maps.TravelMode.DRIVING, optimizeWaypoints: false, region: 'JP',
      });
      renderer = new maps.DirectionsRenderer({ map, directions: res, suppressMarkers: true, preserveViewport: true, polylineOptions: { strokeColor: '#0f766e', strokeWeight: 5, strokeOpacity: 0.85 } });
      kind = 'google-road';
    } catch (err) { // Directions API が使えない（未許可など）ときは、直線
      console.warn('Directions API を使えませんでした。直線で表示します', err);
      line = new maps.Polyline({ map, path, strokeColor: '#0f766e', strokeOpacity: 0.85, strokeWeight: 4 });
    }
    map.fitBounds(bounds, 48);
  }
  return { kind, destroy: () => { markers.forEach((m) => m.setMap(null)); line?.setMap(null); renderer?.setMap(null); el.replaceChildren(); } };
}

// 地図を作る（Googleマップは読み込みを待つので Promise）。Googleマップが読み込めなければ、OpenStreetMap にする
export async function mountRouteMap(el, stops) {
  if (googleKey() && stops.length) {
    try { return await mountGoogle(el, stops); } catch (err) { console.warn('Googleマップを使えませんでした。OpenStreetMapで表示します', err); el.replaceChildren(); }
  }
  return mountLeaflet(el, stops);
}

// 地図の種類ごとの、注意書き
export const routeNote = (kind) => (kind === 'google-road'
  ? '※ 線は、道路に沿った運転ルートです（Googleマップ）。モックのため、ピンの位置は、住所からの概算です。'
  : kind === 'google'
    ? '※ 線は、ピンどうしを順に結んだ直線です（Googleマップのルート検索（Directions API）が使えませんでした）。モックのため、ピンの位置は、住所からの概算です。'
    : '※ 線は、ピンどうしを順に結んだ直線です（道路に沿ったルートではありません。Googleマップのキーがあれば、Googleマップで出ます）。モックのため、ピンの位置は、住所からの概算です。');
