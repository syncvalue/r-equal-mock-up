// 商品マスタの検索。ひらがな／カタカナ・全角／半角・大文字／小文字・区切り記号の違いを吸収する。
import { PRODUCTS } from './data.js';

const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const toHalf = (s) => s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
// 長さを変えない正規化（ハイライト用）
const fold = (s) => toHira(toHalf(s)).toLowerCase();
// 区切り記号を除いた正規化（照合用）
const norm = (s) => fold(s.normalize('NFKC')).replace(/[\s・･\-ー_.,/＆&()（）]/g, '');

const INDEX = PRODUCTS.map((p) => ({
  p,
  name: norm(p.name),
  hay: norm([p.name, p.brand, p.model, p.variant, ...p.aliases].join(' ')),
}));

export const tokensOf = (q) => q.trim().split(/\s+/).map(norm).filter(Boolean);

// 絞り込み条件: { q, cat, brand }
export function searchProducts({ q = '', cat = '', brand = '' } = {}) {
  const tokens = tokensOf(q);
  const hits = INDEX.filter(
    ({ p, hay }) => (!cat || p.category === cat) && (!brand || p.brand === brand) && tokens.every((t) => hay.includes(t)),
  );
  // 名称の先頭一致・名称内一致を優先し、同点は買取実績の多い順
  const score = ({ name }) => tokens.reduce((n, t) => n + (name.startsWith(t) ? 3 : name.includes(t) ? 1 : 0), 0);
  return hits
    .map((h) => ({ p: h.p, s: score(h) }))
    .sort((a, b) => b.s - a.s || b.p.history.count - a.p.history.count)
    .map((h) => h.p);
}

export function countBy(list, key) {
  const m = new Map();
  list.forEach((p) => m.set(p[key], (m.get(p[key]) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export const popularProducts = (n = 40) => [...PRODUCTS].sort((a, b) => b.history.count - a.history.count).slice(0, n);

// 一致箇所をハイライト（<mark>）したHTMLを返す
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escChar = (c) => ESC[c] ?? c;
export function highlight(text, q) {
  const tokens = q.trim().split(/\s+/).map(fold).filter(Boolean);
  const f = fold(text);
  const mask = new Array(text.length).fill(false);
  tokens.forEach((t) => {
    let i = f.indexOf(t);
    while (i !== -1) {
      for (let k = i; k < i + t.length; k += 1) mask[k] = true;
      i = f.indexOf(t, i + t.length);
    }
  });
  let out = '';
  let open = false;
  [...text].forEach((c, i) => {
    if (mask[i] && !open) out += '<mark class="bg-yellow-200 rounded px-0.5">';
    if (!mask[i] && open) out += '</mark>';
    open = mask[i];
    out += escChar(c);
  });
  return open ? `${out}</mark>` : out;
}

const KEY = 'rq-mock-recent-products';
export const loadRecent = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
};
export const pushRecent = (id) => {
  const next = [id, ...loadRecent().filter((x) => x !== id)].slice(0, 12);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 無視（モック）
  }
  return next;
};
