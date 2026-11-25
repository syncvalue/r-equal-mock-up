// 査定部: 過去の販売実績のモーダル。想定販売価格を決めるときの参考（似た商品が、いくらで売れたか）。
// 「この額を入れる」で、入力欄に売価（数量分）が入る。画面の部品だけ（状態は honsha.js が持つ）。
import { esc, yen } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { modalBadgeHtml } from '../src/screenIds.js';
import { channelOf } from '../src/warehouse.js';
import { salesSummary } from '../src/salesReference.js';

const day = (ms) => { const d = new Date(ms); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };

// ref: { name, category, rank, qty, rows（似た商品の実績） }
export function salesRefModalHtml(ref) {
  if (!ref) return '';
  const sum = salesSummary(ref.rows);
  const qty = Math.max(1, ref.qty || 1);
  const body = ref.rows.length
    ? `<table class="w-full text-sm"><thead><tr class="text-left text-slate-500 border-b"><th class="py-1">売れた日</th><th>商品名</th><th>ランク</th><th class="text-right">買取金額</th><th class="text-right">売価</th><th>販売先</th><th></th></tr></thead><tbody>
      ${ref.rows.map((s) => `<tr class="border-b">
        <td class="py-1.5 whitespace-nowrap">${day(s.soldAt)}</td>
        <td class="font-bold">${esc(s.name)}${s.demo ? ' <span class="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-xs font-bold">ダミー</span>' : ''}</td>
        <td>${esc(s.rank)}${s.rank === ref.rank ? '<span class="ml-1 text-xs text-teal-700 font-bold">同じ</span>' : ''}</td>
        <td class="text-right">${yen(s.cost)}</td><td class="text-right font-bold">${yen(s.soldPrice)}</td>
        <td class="text-xs">${esc(channelOf(s.channel)?.label ?? s.channel ?? '')}</td>
        <td class="text-right"><button class="rounded border border-teal-600 text-teal-700 font-bold text-xs px-2 py-1 hover:bg-teal-50 whitespace-nowrap" data-ref-use="${s.soldPrice * qty}">この額を入れる</button></td></tr>`).join('')}
      </tbody></table>`
    : '<p class="p-6 text-center text-slate-500">似た商品の販売実績は、まだありません。ご自身の判断で入力してください。</p>';
  return `
  <div class="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" data-ref-backdrop>
    <div class="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 space-y-3">
      <div>${modalBadgeHtml('HQ-M04')}</div>
      <div class="flex justify-between items-start gap-3">
        <div><h2 class="text-xl font-bold">過去の販売実績${helpIcon('同じカテゴリで、商品名が似ている順に、売れた商品を出しています（ランクが同じものを先に）。想定販売価格を決める参考です。売価は1点あたり。「この額を入れる」は、この商品の点数をかけた額が入ります。')}</h2>
          <div class="text-sm text-slate-600">${esc(ref.name)}（${esc(ref.category)}・ランク${esc(ref.rank)}・${qty}点）</div></div>
        <button class="px-3 py-1 rounded border font-bold shrink-0" data-ref-close>閉じる</button></div>
      ${sum ? `<div class="rounded-lg bg-slate-50 border p-3 text-sm flex flex-wrap gap-x-6 gap-y-1">
        <span>実績 <b>${sum.count}件</b></span><span>売価（1点）の 最小 <b>${yen(sum.min)}</b></span><span>中央値 <b>${yen(sum.median)}</b></span><span>最大 <b>${yen(sum.max)}</b></span>
        <button class="ml-auto rounded bg-teal-700 text-white font-bold text-xs px-3 py-1" data-ref-use="${sum.median * qty}">中央値（${yen(sum.median * qty)}）を入れる</button></div>` : ''}
      ${body}
    </div>
  </div>`;
}
