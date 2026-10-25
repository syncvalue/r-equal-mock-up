// 顧客ランク・厄介度・クーリングオフ歴の表示（コールセンターの配車係の画面と、営業のタブレットで共通）。
// 顧客ランク＝資産・売却の見込み（S〜C）。厄介度＝ランクとは別の軸（金があっても売らない・文句が多い など）。
import { esc, yen } from './format.js';

// 顧客ランクは、営業のランクと見分けがつくよう、紫で「顧客S」のように出す。厄介度は、ランクとは別の軸（注意＝橙、要注意＝赤）
export const CRANK_CLS = { S: 'bg-fuchsia-700 text-white', A: 'bg-fuchsia-500 text-white', B: 'bg-fuchsia-200 text-fuchsia-900', C: 'bg-slate-200 text-slate-700' };
export const dateYmd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };

export const custRankBadge = (p) => (p?.rank ? `<span class="inline-block rounded px-1.5 text-[11px] font-bold leading-4 ${CRANK_CLS[p.rank]}" title="顧客ランク（資産・売却の見込み）${p.rankAuto ? '。総買取額から自動で決めています' : ''}">顧客${esc(p.rank)}</span>` : (p?.known === false ? '<span class="inline-block rounded bg-sky-100 px-1.5 text-[11px] font-bold leading-4 text-sky-800" title="買取の実績がありません">新規</span>' : ''));
export const troubleBadge = (p) => (p && p.trouble.level !== 'none' ? `<span class="inline-block rounded px-1.5 text-[11px] font-bold leading-4 ${p.trouble.level === 'alert' ? 'bg-rose-600 text-white' : 'bg-amber-200 text-amber-900'}" title="${esc(`${p.trouble.tags.join('、')}${p.trouble.memo ? `　${p.trouble.memo}` : ''}`)}">${p.trouble.level === 'alert' ? '🚨 要注意' : '⚠ 注意'}</span>` : '');
export const cooloffBadge = (p) => (p?.cooloff.length ? `<span class="inline-block rounded border border-rose-500 bg-white px-1.5 text-[11px] font-bold leading-4 text-rose-700" title="${esc(p.cooloff.map((c) => `${dateYmd(c.at)} ${c.items}${c.memo ? `（${c.memo}）` : ''}`).join(' ／ '))}">クーリングオフ ${p.cooloff.length}回</span>` : '');

// 帯の中に出す、小さな印（ランク・厄介度・クーリングオフ）
export const customerMarks = (p) => (!p?.known ? '' : `<span class="ml-0.5 inline-flex gap-0.5 align-middle">${p.rank ? `<i class="rounded bg-white/90 px-1 text-[9px] font-bold not-italic text-fuchsia-700" title="顧客ランク">顧${esc(p.rank)}</i>` : ''}${p.trouble.level !== 'none' ? `<i class="rounded px-1 text-[9px] font-bold not-italic ${p.trouble.level === 'alert' ? 'bg-rose-600 text-white' : 'bg-amber-200 text-amber-900'}" title="${esc(p.trouble.tags.join('、'))}">${p.trouble.level === 'alert' ? '要注意' : '注意'}</i>` : ''}${p.cooloff.length ? `<i class="rounded bg-white/90 px-1 text-[9px] font-bold not-italic text-rose-700" title="クーリングオフ歴">CO${p.cooloff.length}</i>` : ''}${p.declined ? `<i class="rounded bg-violet-200 px-1 text-[9px] font-bold not-italic text-violet-900" title="査定したが売らなかったものがあります">見送${p.declined}</i>` : ''}</span>`);

// お客様の評価のまとめ（詳細）
// 誰を当てるかの目安の文（要注意・クーリングオフが多い・資産が多いお客様）
export function assignAdvice(p) {
  if (!p) return '';
  const hot = p.trouble.level === 'alert' || p.cooloff.length >= 2;
  if (!hot && p.rank !== 'S') return '';
  return `<div class="font-bold text-fuchsia-800">${hot ? '要注意のお客様です。リーダーなど、経験のある上位ランクの営業の担当をおすすめします' : '資産の多いお客様です。上位ランクの営業の担当をおすすめします'}</div>`;
}

export function customerProfileHtml(p, { advice = false } = {}) {
  if (!p) return '';
  return `<div class="space-y-0.5 text-xs"><div class="flex flex-wrap items-center gap-1.5"><span class="text-slate-500">お客様</span>${custRankBadge(p)}${troubleBadge(p) || '<span class="text-slate-400">厄介度：なし</span>'}${cooloffBadge(p) || '<span class="text-slate-400">クーリングオフ歴：なし</span>'}
    ${p.purchase.count ? `<span class="text-slate-500">買取 ${p.purchase.count}回・総額 ${yen(p.purchase.total)}</span>` : ''}</div>
    ${p.trouble.tags.length ? `<div class="text-slate-700">${esc(p.trouble.tags.join('、'))}${p.trouble.memo ? `<span class="text-slate-500">　${esc(p.trouble.memo)}</span>` : ''}</div>` : ''}
    ${p.memo ? `<div class="text-slate-700">メモ：${esc(p.memo)}</div>` : ''}
    ${p.meta ? `<div class="text-[11px] text-slate-400">登録：${esc(p.meta.by)}　${dateYmd(p.meta.at)}${p.meta.source === 'first-visit' ? '（初回の訪問の評価から設定）' : ''}</div>` : ''}
    ${p.cooloff.length ? `<div class="text-rose-700">クーリングオフ：${p.cooloff.map((c) => `${dateYmd(c.at)} ${esc(c.items)}${c.memo ? `（${esc(c.memo)}）` : ''}`).join(' ／ ')}</div>` : ''}
    ${advice ? assignAdvice(p) : ''}</div>`;
}

// 営業のタブレット用: 訪問前に、お客様の評価（お客様情報に紐づくもの）を理解しておくためのカード（お客様には見せない、営業用の画面にだけ出す）
export function salesCustomerCard(p) {
  if (!p) return '';
  if (!p.known) return '<div class="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm"><span class="font-bold text-sky-800">新規のお客様</span><span class="ml-2 text-xs text-slate-500">買取の実績はありません</span></div>';
  const alert = p.trouble.level === 'alert' || p.cooloff.length >= 2;
  return `<div class="space-y-1 rounded-xl border ${alert ? 'border-rose-300 bg-rose-50/60' : 'border-fuchsia-300 bg-fuchsia-50/40'} px-3 py-2"><div class="text-sm font-bold ${alert ? 'text-rose-800' : 'text-fuchsia-900'}">👤 お客様の評価（お客様情報・訪問前にご確認ください）</div>${customerProfileHtml(p)}</div>`;
}

// 査定したが、売らなかったもの（見送り品）。お客様が手元に持っている可能性がある、有力な情報（営業の訪問前の把握・配車係の当てはめの判断用。お客様には見せない）
export function declinedCardHtml(items, { empty = false } = {}) {
  if (!items?.length) return empty ? '<div class="text-xs text-slate-500">査定したが売らなかったものは、ありません</div>' : '';
  const total = items.reduce((n, i) => n + i.price * (i.qty ?? 1), 0);
  const count = items.reduce((n, i) => n + (i.qty ?? 1), 0);
  const cats = [...new Set(items.map((i) => i.category).filter(Boolean))];
  const byDate = [];
  items.forEach((i) => { const last = byDate[byDate.length - 1]; if (last && last.at === i.at && last.visitId === i.visitId) last.items.push(i); else byDate.push({ at: i.at, visitId: i.visitId, items: [i] }); });
  return `<div class="space-y-1 text-xs"><div class="flex flex-wrap items-center gap-x-3 gap-y-0.5"><span><b>${count}点</b>　査定額の合計 <b>${yen(total)}</b></span>
      ${cats.map((c) => `<span class="rounded bg-violet-100 px-1.5 text-[11px] font-bold text-violet-900">${esc(c)}</span>`).join('')}</div>
    <div class="max-h-48 space-y-1 overflow-y-auto rounded border bg-white p-1.5">${byDate.map((g) => `<div><div class="font-bold text-slate-500">${dateYmd(g.at)}の訪問</div>${g.items.map((i) => `<div class="flex items-start gap-2 border-t py-0.5 first:border-t-0"><span class="min-w-0 flex-1">${esc(i.name)}${(i.qty ?? 1) > 1 ? ` ×${i.qty}` : ''}</span><b class="shrink-0">${yen(i.price * (i.qty ?? 1))}</b></div>`).join('')}</div>`).join('')}</div></div>`;
}

// 営業のタブレット用のカード
export function salesDeclinedCard(items) {
  if (!items?.length) return '';
  return `<div class="space-y-1 rounded-xl border border-violet-300 bg-violet-50/50 px-3 py-2"><div class="text-sm font-bold text-violet-900">📦 前に査定したが、売らなかったもの<span class="ml-2 text-xs font-normal text-slate-500">手元に持っている可能性があります</span></div>${declinedCardHtml(items)}</div>`;
}
