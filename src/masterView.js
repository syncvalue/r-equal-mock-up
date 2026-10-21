// 商品マスター選択パネル（探す／人気／最近）。膨大なマスターから、最短で目的の商品にたどり着くためのUI。
import { PRODUCTS, CATEGORIES } from './data.js';
import { esc } from './format.js';
import { countBy, highlight, popularProducts, searchProducts, tokensOf } from './search.js';

const PAGE = 40;

const tab = (s, key, label) =>
  `<button class="flex-1 py-2 rounded-lg font-bold ${s.mtab === key ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}" data-action="mtab" data-value="${key}">${label}</button>`;

const chip = (active, label, count, action, value) =>
  `<button class="chip !min-h-[40px] !py-1 !px-3 text-sm whitespace-nowrap ${active ? 'active' : ''}" data-action="${action}" data-value="${esc(value)}">${esc(label)}${count != null ? `<span class="opacity-70 ml-1">${count}</span>` : ''}</button>`;

function row(s, p, q, sub) {
  const n = s.items.find((i) => i.id === p.id)?.qty;
  return `
  <button class="w-full text-left flex justify-between items-center gap-2 px-3 py-2 rounded-xl border-2 ${n ? 'border-teal-300 bg-teal-50' : 'border-slate-200'} active:bg-teal-50 min-h-[56px]" data-action="add-item" data-id="${p.id}">
    <span class="min-w-0"><span class="block font-bold leading-tight">${highlight(p.name, q)}</span>
      <span class="text-xs text-slate-500">${sub ?? `${esc(p.brand)} ・ ${esc(p.category)}`}</span></span>
    ${n ? `<span class="text-xs font-bold text-teal-700 whitespace-nowrap">追加済 ×${n}</span>` : ''}
    <span class="text-teal-700 font-bold text-2xl">＋</span>
  </button>`;
}

const tile = (label, count, action, value, cls = '') =>
  `<button class="rounded-xl border-2 border-slate-200 bg-white active:bg-teal-50 p-3 text-left min-h-[64px] ${cls}" data-action="${action}" data-value="${esc(value)}">
    <span class="block font-bold leading-tight">${esc(label)}</span><span class="text-xs text-slate-500">${count}件</span></button>`;

function listBody(s) {
  const q = s.search;
  const hasQ = tokensOf(q).length > 0;
  const brand = s.mbrand === '*' ? '' : s.mbrand;
  const results = searchProducts({ q, cat: s.mcat, brand });
  let facets = '';
  if (hasQ) {
    const cats = countBy(searchProducts({ q }), 'category');
    const brands = countBy(searchProducts({ q, cat: s.mcat }), 'brand').slice(0, 10);
    facets = `<div class="flex gap-1.5 overflow-x-auto pb-1 shrink-0">${cats.map(([c, n]) => chip(s.mcat === c, c, n, 'mcat', c)).join('')}</div>
      ${brands.length > 1 ? `<div class="flex gap-1.5 overflow-x-auto pb-1 shrink-0">${brands.map(([b, n]) => chip(s.mbrand === b, b, n, 'mbrand', b)).join('')}</div>` : ''}`;
  }
  const shown = results.slice(0, s.mlimit);
  const more = results.length - shown.length;
  return `${facets}
    <div class="text-xs text-slate-500 shrink-0">該当 ${results.length}件${results.length > PAGE ? '（人気順）' : ''}</div>
    <div class="space-y-1.5 overflow-y-auto min-h-0 flex-1" data-scroll="products">
      ${shown.map((p) => row(s, p, q)).join('') || '<p class="text-slate-500 p-4">該当する商品がありません。表記を変えるか、絞り込みを解除してください。</p>'}
      ${more > 0 ? `<button class="btn btn-secondary w-full !min-h-[48px]" data-action="more">さらに表示（残り${more}件）</button>` : ''}
    </div>`;
}

function browseBody(s) {
  const hasQ = tokensOf(s.search).length > 0;
  // パンくず（絞り込み中の条件）
  const crumbs = [
    (s.mcat || hasQ) && `<button class="text-teal-700 font-bold underline" data-action="mclear">すべて</button>`,
    s.mcat && `<span>›</span><button class="font-bold ${s.mbrand ? 'text-teal-700 underline' : ''}" data-action="mbrand" data-value="">${esc(s.mcat)}</button>`,
    s.mbrand && `<span>›</span><span class="font-bold">${s.mbrand === '*' ? 'すべて' : esc(s.mbrand)}</span>`,
  ].filter(Boolean);
  const bar = crumbs.length ? `<div class="flex items-center gap-2 text-sm shrink-0 flex-wrap">${crumbs.join('')}</div>` : '';

  if (hasQ || (s.mcat && s.mbrand)) return bar + listBody(s);

  if (!s.mcat) {
    const counts = Object.fromEntries(countBy(PRODUCTS, 'category'));
    return `${bar}<div class="grid grid-cols-2 gap-2 overflow-y-auto min-h-0 flex-1 content-start" data-scroll="products">
      ${CATEGORIES.map((c) => tile(c, counts[c] ?? 0, 'mcat', c, 'min-h-[84px] text-lg')).join('')}</div>`;
  }
  const inCat = PRODUCTS.filter((p) => p.category === s.mcat);
  return `${bar}<div class="grid grid-cols-2 gap-2 overflow-y-auto min-h-0 flex-1 content-start" data-scroll="products">
    ${tile(`${s.mcat}すべて`, inCat.length, 'mbrand', '*', 'col-span-2 bg-teal-50 border-teal-300')}
    ${countBy(inCat, 'brand').map(([b, n]) => tile(b, n, 'mbrand', b)).join('')}</div>`;
}

function simpleList(s, list, sub, empty) {
  return `<div class="space-y-1.5 overflow-y-auto min-h-0 flex-1" data-scroll="products">
    ${list.map((p) => row(s, p, '', sub(p))).join('') || `<p class="text-slate-400 text-center py-8">${empty}</p>`}</div>`;
}

export function masterBodyView(s) {
  const tabs = `<div class="flex gap-2 shrink-0">${tab(s, 'browse', '🔍 探す')}${tab(s, 'popular', '🔥 人気')}${tab(s, 'recent', '🕘 最近')}</div>`;
  let body;
  if (s.mtab === 'popular') {
    body = simpleList(s, popularProducts(40), (p) => `${esc(p.brand)} ・ 買取実績 ${p.history.count}件`, '');
  } else if (s.mtab === 'recent') {
    const list = s.recent.map((id) => PRODUCTS.find((p) => p.id === id)).filter(Boolean);
    body = simpleList(s, list, (p) => `${esc(p.brand)} ・ ${esc(p.category)}`, 'まだ選んだ商品がありません');
  } else {
    body = browseBody(s);
  }
  return tabs + body;
}
