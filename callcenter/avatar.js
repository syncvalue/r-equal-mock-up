// 営業の顔写真。写真データがあれば（user.photo）それを、なければ、ダミーの似顔絵（営業ごとに決まる）を出す。本番は、営業マスタの顔写真を使う想定
const SKIN = ['#f5d5b8', '#efc6a0', '#e8b98f', '#f8dcc4', '#dba67a'];
const HAIR = ['#2b2118', '#3d2b1f', '#1f1a17', '#5a3c28', '#3a3a3a'];
const BG = ['#cfe8e5', '#d9e4f5', '#f3e3c9', '#e6dcf0', '#f6d9d9', '#d8ecd2'];
const SHIRT = ['#2f4858', '#3d5a80', '#5b6c7a', '#7a3e48', '#3f6f5a', '#4a4a6a'];

const pick = (list, n) => list[Math.abs(n) % list.length];
const hashOf = (id) => [...String(id)].reduce((h, c) => (Math.imul(h, 31) + c.codePointAt(0)) | 0, 7);

export function avatarSvg(userId) {
  const h = hashOf(userId);
  const skin = pick(SKIN, h);
  const hair = pick(HAIR, h >> 3);
  const long = ((h >> 5) & 3) === 0; // 長めの髪の人もいる
  const hairBack = long ? `<path d="M22 40 Q22 14 50 14 Q78 14 78 40 L78 66 L22 66 Z" fill="${hair}"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${pick(BG, h >> 7)}"/>${hairBack}
    <path d="M14 100 Q16 70 50 68 Q84 70 86 100 Z" fill="${pick(SHIRT, h >> 9)}"/><rect x="43" y="56" width="14" height="14" rx="5" fill="${skin}"/>
    <ellipse cx="50" cy="42" rx="19" ry="22" fill="${skin}"/>
    <path d="M30 38 Q30 20 50 20 Q70 20 70 38 Q62 28 50 28 Q38 28 30 38 Z" fill="${hair}"/>
    <circle cx="43" cy="44" r="2" fill="#2b2118"/><circle cx="57" cy="44" r="2" fill="#2b2118"/><path d="M44 54 Q50 58 56 54" stroke="#9a5a4a" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, ' '))}`;
}

export const avatarHtml = (user, size = 24) => `<img src="${user.photo ?? avatarSvg(user.id)}" alt="${String(user.name).replace(/"/g, '')}" width="${size}" height="${size}" class="inline-block shrink-0 rounded-full object-cover align-middle ring-1 ring-slate-300" style="width:${size}px;height:${size}px" />`;
