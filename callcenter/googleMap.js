// Googleマップ（Maps JavaScript API）の地図。APIキーは、環境変数 VITE_GOOGLE_MAPS_API_KEY で渡す（ソースには書かない）
import { roundPin, validPin, addressQueries } from './pin.js';

export const googleKey = () => String(import.meta.env?.VITE_GOOGLE_MAPS_API_KEY ?? '').trim();

let loading = null;
function loadGoogle(key) {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    window.__rqGoogleReady = () => resolve(window.google.maps);
    window.gm_authFailure = () => reject(new Error('Googleマップのキーが使えません（キー・請求先・許可するサイトの設定を確認してください）'));
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=ja&region=JP&callback=__rqGoogleReady`;
    s.async = true;
    s.onerror = () => { loading = null; reject(new Error('Googleマップを読み込めませんでした')); };
    document.head.appendChild(s);
  });
  loading.catch(() => { loading = null; });
  return loading;
}

export async function mountGoogleMap(el, { pin, center, onPin }) {
  const maps = await loadGoogle(googleKey());
  const start = validPin(pin) ? pin : center;
  const map = new maps.Map(el, { center: start, zoom: validPin(pin) ? 19 : 14, mapTypeControl: true, mapTypeControlOptions: { mapTypeIds: ['roadmap', 'satellite'] }, streetViewControl: false, fullscreenControl: false, clickableIcons: false, gestureHandling: 'greedy' });
  let marker = null;
  const put = (p, notify = true) => {
    const q = roundPin(p);
    if (marker) marker.setPosition(q);
    else {
      marker = new maps.Marker({ position: q, map, draggable: true });
      marker.addListener('dragend', () => { const ll = marker.getPosition(); onPin(roundPin({ lat: ll.lat(), lng: ll.lng() })); });
    }
    if (notify) onPin(q);
  };
  if (validPin(pin)) put(pin, false);
  map.addListener('click', (e) => put({ lat: e.latLng.lat(), lng: e.latLng.lng() }));
  return {
    moveTo: (p, zoom = 18) => { map.setCenter({ lat: p.lat, lng: p.lng }); map.setZoom(zoom); },
    destroy: () => { if (marker) marker.setMap(null); el.replaceChildren(); },
  };
}

// 住所から、場所を探す（Googleのジオコーディング）。番地で見つからなければ、番地を削って順に広げる
export async function googleSearch(address) {
  const maps = await loadGoogle(googleKey());
  const geocoder = new maps.Geocoder();
  for (const q of addressQueries(address)) {
    const hit = await geocoder.geocode({ address: q, region: 'JP' }).then((r) => r.results?.[0] ?? null).catch((e) => { if (e?.code === 'ZERO_RESULTS') return null; throw e; });
    if (hit) return { lat: hit.geometry.location.lat(), lng: hit.geometry.location.lng() };
  }
  return null;
}
