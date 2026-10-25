// localStorage の容量対策で、画像を長辺 800px の JPEG に縮小して dataURL にする
export function shrinkImage(file, max = 800) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めません')); };
    img.src = url;
  });
}

export const dummyPhoto = (label) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#e2e8f0"/><rect x="90" y="70" width="140" height="100" rx="12" fill="#94a3b8"/><text x="16" y="222" font-size="20" fill="#475569">DUMMY ${label}</text></svg>`,
  );

// 商品の写真（ダミー）。商品名・カテゴリから絵を作る（同じ商品は同じ絵、別の商品は色が変わる）。実際には、買取のときに撮影した写真を使う
const ICONS = [['時計', '⌚'], ['バッグ', '👜'], ['財布', '👛'], ['小物', '👛'], ['ジュエリー', '💍'], ['貴金属', '💍'], ['カメラ', '📷'], ['家電', '📷']];
const xml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function productPhoto(name, category) {
  const hue = [...String(name ?? '')].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 17);
  const icon = ICONS.find(([k]) => String(category ?? '').includes(k))?.[1] ?? '📦';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="hsl(${hue},35%,86%)"/><circle cx="160" cy="100" r="62" fill="hsl(${hue},35%,74%)"/><text x="160" y="124" font-size="72" text-anchor="middle">${icon}</text><text x="160" y="216" font-size="20" text-anchor="middle" fill="hsl(${hue},30%,25%)">${xml(name)}</text></svg>`,
  );
}
// 登録された写真があればそれを、なければダミーを使う
export const photoOf = (unit) => unit.photo ?? productPhoto(unit.name, unit.category);
