// 査定部: 予定（まだ訪問していないアポ）の事前確認モーダル。査定員が、訪問前に、どういったお客様かを確認する（見るだけ）。
import { esc, yen } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { modalBadgeHtml } from '../src/screenIds.js';
import { USERS } from '../src/dashboard.js';
import { customerDossier, visitLines } from '../src/customerHistory.js';
import { custRankBadge, customerKindBadge, troubleBadge, cooloffBadge, customerProfileHtml, declinedCardHtml, dateYmd } from '../src/customerProfileView.js';
import { hearingRows, hearingMeta, confirmCallsHtml } from '../src/hearingView.js';

const box = (title, body) => `<section class="space-y-1 rounded-lg border bg-slate-50 p-3"><h3 class="text-xs font-bold text-slate-500">${title}</h3>${body}</section>`;
const row = (k, v) => `<div class="flex gap-2 text-sm"><span class="w-16 shrink-0 text-slate-500">${k}</span><span class="min-w-0 font-bold">${v}</span></div>`;
const stars = (n) => `<span class="text-amber-800">${'★'.repeat(n)}</span><span class="text-slate-300">${'★'.repeat(Math.max(0, 5 - n))}</span>`;

// 過去の買取（新しい順に、直近5回）。日付・品目・点数・金額と、鑑定士の評価・メモ
function visitsHtml(d) {
  if (!d.visits.length) return '<div class="text-sm text-slate-500">買取の実績はありません（新規のお客様）</div>';
  const summary = `<div class="text-xs text-slate-700">${d.count}回 ／ 総額 <b>${yen(d.total)}</b> ／ 1回の平均 ${yen(d.average)}</div>`;
  const rows = d.visits.slice(0, 5).map((v) => {
    const lines = visitLines(v);
    const e = v.eval;
    return `<div class="rounded border bg-white p-2 text-sm space-y-0.5">
      <div class="flex items-center gap-2"><span class="w-24 shrink-0 text-slate-500">${dateYmd(v.at)}</span>
        <span class="min-w-0 flex-1">${lines.map((l) => `${esc(l.name)}${(l.qty ?? 1) > 1 ? `×${l.qty}` : ''}`).join('、')}</span><b class="shrink-0">${yen(v.total)}</b></div>
      ${e ? `<div class="text-xs text-slate-700">${stars(e.overall)}　${esc(String(e.by).replace(/^(営業|鑑定士)\s*/, ''))}${e.memo ? `：${esc(e.memo)}` : ''}</div>` : ''}</div>`;
  }).join('');
  return `${summary}<div class="space-y-1">${rows}</div>${d.visits.length > 5 ? `<div class="text-xs text-slate-500">ほか、以前の${d.visits.length - 5}回分</div>` : ''}`;
}

export function previewModalHtml(e) {
  if (!e) return '';
  const phones = [e.customer.phone, e.customer.phone2].filter(Boolean);
  const d = customerDossier(phones);
  const p = d.profile;
  const staff = USERS.find((u) => u.id === e.userId)?.name ?? '';
  return `<div class="fixed inset-0 z-[60] flex items-center justify-center p-4"><div class="absolute inset-0 bg-black/40" data-preview-close></div>
    <div class="relative z-10 max-h-[92vh] w-[44rem] max-w-full space-y-3 overflow-y-auto rounded-lg bg-white p-5 shadow-2xl">${modalBadgeHtml('HQ-M03')}
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-1"><div class="text-sm text-slate-500">訪問予定 ${esc(e.start)}–${esc(e.end)} ／ 鑑定士 ${esc(staff)}</div>
          <div class="text-xl font-bold">${esc(e.customer.name)} 様 <span class="text-sm font-normal text-slate-500">${esc(e.customer.kana ?? '')}</span></div>
          <div class="flex flex-wrap items-center gap-1.5">${custRankBadge(p)}${customerKindBadge(p)}${troubleBadge(p)}${cooloffBadge(p)}</div></div>
        <button class="rounded border px-3 py-1 font-bold" data-preview-close title="閉じる（Esc）">✕ 閉じる</button></div>
      ${box('今回の予定', `${row('住所', esc(e.customer.address))}${row('電話', esc(phones.join(' ／ ')))}${row('商材', esc(e.items))}${row('受付', `${esc(e.receptionNo)}（${esc(e.receivedAt)}・受電 ${esc(e.operator)}）`)}${e.memo ? row('メモ', esc(e.memo)) : ''}`)}
      ${box(`お客様の評価${helpIcon('お客様情報に紐づく評価です（顧客ランク・厄介度・クーリングオフ歴）。')}`, customerProfileHtml(p))}
      ${box('査定したが売らなかったもの', declinedCardHtml(d.declined, { empty: true }))}
      ${box(`過去の買取履歴${helpIcon('訪問ごとの品目・金額と、鑑定士の評価・メモです。')}`, visitsHtml(d))}
      ${box('受電時のヒアリング', `<div class="text-[11px] text-slate-400">${hearingMeta(e)}</div><dl class="text-sm divide-y">${hearingRows(e)}</dl>`)}
      ${confirmCallsHtml(e)}
    </div></div>`;
}
