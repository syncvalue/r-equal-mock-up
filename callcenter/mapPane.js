// 訪問先の地図（Leaflet + OpenStreetMap）。地図を押すとピンを置け、ドラッグで動かせる。画面側には、ピンが変わるたびに知らせる
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { roundPin, validPin, addressQueries } from './pin.js';

const PIN_ICON = L.divIcon({ className: 'pin-icon', html: '<div class="pin-dot"></div>', iconSize: [24, 24], iconAnchor: [12, 24] });

// el: 地図を入れる枠。pin: 今のピン（なければ null）。center: ピンがないときの中心（概算）。onPin: ピンが変わったとき
export function mountPinMap(el, { pin, center, onPin }) {
  const start = validPin(pin) ? pin : center;
  const map = L.map(el, { zoomControl: true }).setView([start.lat, start.lng], validPin(pin) ? 18 : 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  let marker = null;
  const put = (p, notify = true) => {
    const q = roundPin(p);
    if (marker) marker.setLatLng([q.lat, q.lng]);
    else {
      marker = L.marker([q.lat, q.lng], { icon: PIN_ICON, draggable: true }).addTo(map);
      marker.on('dragend', () => { const ll = marker.getLatLng(); onPin(roundPin({ lat: ll.lat, lng: ll.lng })); });
    }
    if (notify) onPin(q);
  };
  if (validPin(pin)) put(pin, false);
  map.on('click', (e) => put({ lat: e.latlng.lat, lng: e.latlng.lng }));
  setTimeout(() => map.invalidateSize(), 0);
  return {
    moveTo: (p, zoom = 18) => map.setView([p.lat, p.lng], zoom),
    destroy: () => map.remove(),
  };
}

// 住所から、場所を探す（OpenStreetMapのNominatim）。細かい番地で見つからなければ、番地を削って、順に広げて探す。見つからなければ null
export async function searchAddress(address) {
  for (const q of addressQueries(address)) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&accept-language=ja&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`検索に失敗しました（${res.status}）`);
    const hit = (await res.json())[0];
    if (hit) return { lat: Number(hit.lat), lng: Number(hit.lon) };
  }
  return null;
}
