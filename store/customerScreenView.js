// 店舗の「お客様画面」の表示。お客様に向けた2枚目の画面（デュアルモニタ）。見るだけの画面で、ボタン・入力欄はない。
// 内容は、店舗スタッフが「お客様画面へ反映」を押したものだけ（src/storeCustomerView.js）。文字は大きく、色は少なく。
import { esc, yen } from '../src/format.js';
import { storeLabel } from '../src/stores.js';

const wrap = (store, inner, { name = '' } = {}) => `<div class="min-h-screen flex flex-col">
  <header class="px-10 py-5 flex items-baseline justify-between border-b border-slate-200 bg-white">
    <span class="text-2xl font-bold text-slate-700">${esc(storeLabel(store))}</span>
    ${name ? `<span class="text-3xl font-bold">${esc(name)} 様</span>` : ''}
  </header>
  <main class="flex-1 px-10 py-8 max-w-5xl w-full mx-auto">${inner}</main></div>`;

const center = (store, title, sub = '') => `<div class="min-h-screen flex flex-col items-center justify-center text-center px-10">
  <div class="text-2xl font-bold text-slate-500 mb-6">${esc(storeLabel(store))}</div>
  <h1 class="text-6xl font-bold text-slate-900">${title}</h1>
  ${sub ? `<p class="mt-8 text-3xl text-slate-600">${sub}</p>` : ''}</div>`;

const heading = (t, sub = '') => `<h1 class="text-4xl font-bold">${t}</h1>${sub ? `<p class="mt-2 text-xl text-slate-600">${sub}</p>` : ''}`;

function confirmView(v, store) {
  return wrap(store, `${heading('ご本人情報のご確認', '内容に間違いがないか、ご確認ください。')}
    <dl class="mt-8 rounded-2xl bg-white border border-slate-200 divide-y divide-slate-200">${v.fields.map((f) => `<div class="flex gap-6 px-8 py-5"><dt class="w-56 shrink-0 text-xl text-slate-500">${esc(f.label)}</dt><dd class="text-3xl font-bold break-all">${esc(f.value)}</dd></div>`).join('')}</dl>`, v);
}

function explainView(v, store) {
  return wrap(store, `${heading('お買取の前に、ご説明いたします')}
    <ul class="mt-8 space-y-4">${v.items.map((i, n) => `<li class="flex items-start gap-5 rounded-2xl bg-white border border-slate-200 px-8 py-6"><span class="mt-1 w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-xl font-bold ${i.done ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-600'}">${i.done ? '✔' : n + 1}</span><span class="text-3xl leading-snug">${esc(i.text)}</span></li>`).join('')}</ul>`, v);
}

function itemsTable(v) {
  return `<div class="rounded-2xl bg-white border border-slate-200 overflow-hidden">${v.items.map((i) => `<div class="flex items-center gap-6 px-8 py-5 border-b border-slate-200 last:border-b-0 ${i.sell ? '' : 'opacity-60'}">
      <div class="min-w-0 flex-1"><div class="text-3xl font-bold ${i.sell ? '' : 'line-through'}">${esc(i.name)}</div>${i.rank ? `<div class="mt-1 text-lg text-slate-500">状態 ${esc(i.rank)}</div>` : ''}</div>
      ${i.sell ? '' : '<span class="rounded-full bg-slate-200 text-slate-700 text-lg font-bold px-4 py-1">お売りにならない</span>'}
      <div class="w-20 text-right text-2xl text-slate-600">${i.qty > 1 ? `× ${i.qty}` : ''}</div>
      <div class="w-48 text-right text-3xl font-bold">${i.unit > 0 ? yen(i.subtotal) : '<span class="text-xl text-slate-500">査定中</span>'}</div></div>`).join('') || '<div class="px-8 py-10 text-2xl text-slate-500">ただいま、査定しております。</div>'}</div>`;
}

const totalBox = (label, total) => `<div class="mt-6 flex items-baseline justify-between rounded-2xl bg-slate-900 text-white px-8 py-6"><span class="text-2xl font-bold">${label}</span><b class="text-6xl">${yen(total)}</b></div>`;

const itemsView = (v, store) => wrap(store, `${heading('お買取の内容', '査定の結果です。')}<div class="mt-8">${itemsTable(v)}</div>${totalBox('合計', v.total)}`, v);

const paymentView = (v, store) => wrap(store, `${heading('お支払い', v.contractSent ? '契約書をご用意しました。内容をご確認のうえ、ご記入ください。' : 'お買取の内容と、お支払い金額です。')}<div class="mt-8">${itemsTable(v)}</div>${totalBox('お支払い金額', v.total)}`, v);

const preparingView = (v, store) => wrap(store, `<div class="min-h-[60vh] flex flex-col items-center justify-center text-center">${heading('商品のお預かりの準備をしております', '少々お待ちください。')}</div>`, v);

// view: お客様に見せる内容（src/storeCustomerView.js）。知らない内容は、待機の画面にする
export function customerScreenHtml(view, { store }) {
  switch (view?.kind) {
    case 'confirm': return confirmView(view, store);
    case 'explain': return explainView(view, store);
    case 'items': return itemsView(view, store);
    case 'preparing': return preparingView(view, store);
    case 'payment': return paymentView(view, store);
    case 'thanks': return center(store, 'ありがとうございました', 'またのお越しをお待ちしております。');
    default: return center(store, 'いらっしゃいませ', 'ただいま、準備をしております。少々お待ちください。');
  }
}
