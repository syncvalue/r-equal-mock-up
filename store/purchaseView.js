// 店舗の「買取」画面。お客様確認 → 説明事項 → 買取明細 → シール → 確認・支払い の5手順。
import { esc, yen } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { moneyInputHtml } from '../src/moneyInput.js';
import { RANKS } from '../src/data.js';
import { SEAL_COLORS } from '../src/stock.js';
import { STEPS, canProceed, explainRemaining, leaveRemaining } from '../src/storeDraft.js';
import { EXPLAIN_ITEMS, LEAVE_CHECKS, slotsOf, sellItems, totalOf } from '../src/storePurchase.js';
import { repeatBadge } from '../src/customerHistoryView.js';
import { salesCustomerCard, salesDeclinedCard } from '../src/customerProfileView.js';

const check = (attr, checked, text) => `<label class="flex items-start gap-3 rounded-lg border bg-white px-3 py-2 min-h-[48px] cursor-pointer"><input type="checkbox" class="w-6 h-6 mt-0.5 shrink-0" ${attr} ${checked ? 'checked' : ''} /><span>${esc(text)}</span></label>`;

const field = (key, label, d, { required = false, ph = '', type = 'text' } = {}) =>
  `<label class="text-sm font-bold">${label}${required ? '<span class="text-rose-600">＊</span>' : ''}<input class="inp mt-1 font-normal" type="${type}" data-c="${key}" value="${esc(d.customer[key])}" placeholder="${esc(ph)}" /></label>`;

function customerStep(d, ctx) {
  return `<div class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">${repeatBadge(ctx.history)}</div>
    ${salesCustomerCard(ctx.profile)}${salesDeclinedCard(ctx.declined)}
    <section class="rounded-xl border bg-white p-3 space-y-3">
      <h3 class="font-bold">お客様の情報${helpIcon('古物営業法に基づく買取の記録（古物台帳）に必要な項目です。本人確認書類と照らして入力します。')}</h3>
      <div class="grid sm:grid-cols-4 gap-3">
        ${field('name', 'お名前', d, { required: true })}${field('kana', 'フリガナ', d)}${field('phone', '電話番号', d, { required: true, ph: '090-0000-0000' })}${field('phone2', '電話番号（予備）', d)}
        ${field('zip', '郵便番号', d, { ph: '545-0052' })}<div class="sm:col-span-3">${field('address', '住所', d, { required: true })}</div>
        ${field('occupation', '職業', d)}${field('birth', '生年月日', d, { required: true, type: 'date' })}
      </div>
      ${check('data-cok', d.customerOk, '本人確認書類と照らして、お客様の情報を確認した')}
    </section></div>`;
}

function explainStep(d) {
  const left = explainRemaining(d);
  return `<div class="space-y-3 max-w-3xl">
    <h3 class="font-bold">査定の前に、お客様へご説明します ${left ? `<span class="text-sm text-rose-600">あと${left}項目</span>` : '<span class="text-sm text-emerald-700">✔ 完了</span>'}</h3>
    <div class="space-y-2">${EXPLAIN_ITEMS.map((x) => check(`data-ex="${x.key}"`, d.explain[x.key], x.text)).join('')}</div>
    <section class="rounded-xl border bg-white p-3 space-y-2"><div class="font-bold">他の商品も、ご提案してよいか、お客様に確認した${helpIcon('お客様が売る意思のない商品を、無理に勧めないための確認です。回答を選んでください。')}</div>
      <div class="flex gap-2">${[['yes', 'ご提案してよい'], ['no', 'ご提案しない']].map(([v, l]) => `<button class="b ${d.propose === v ? 'on' : 'b-sec'}" data-propose="${v}">${l}</button>`).join('')}</div></section></div>`;
}

function itemRow(i) {
  return `<div class="rounded-lg border bg-white p-3 grid sm:grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center ${i.sell ? '' : 'opacity-70'}">
    <div class="min-w-0"><div class="font-bold truncate">${esc(i.name)}</div><div class="text-xs text-slate-500">${esc(i.category)}</div></div>
    <select class="inp !w-44 text-sm" data-i-rank="${esc(i.id)}">${RANKS.map((r) => `<option value="${r.value}" ${r.value === i.rank ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select>
    <div class="flex items-center gap-1"><button class="b b-sec !px-3" data-qty="${esc(i.id)}" data-delta="-1" aria-label="減らす">−</button><b class="w-8 text-center">${i.qty}</b><button class="b b-sec !px-3" data-qty="${esc(i.id)}" data-delta="1" aria-label="増やす">＋</button></div>
    <div class="w-44">${moneyInputHtml({ attrs: `data-i-price="${esc(i.id)}"`, value: i.price, placeholder: '単価', cls: 'inp' })}</div>
    <div class="flex gap-2"><button class="b ${i.sell ? 'b-sec' : 'on'} !px-3 text-sm" data-sell="${esc(i.id)}">${i.sell ? '売る' : '見送る'}</button><button class="b b-sec !px-3 text-rose-600" data-remove="${esc(i.id)}" aria-label="外す">✕</button></div></div>`;
}

function itemsStep(d, ctx) {
  return `<div class="space-y-3">
    <section class="rounded-xl border bg-white p-3 space-y-2">
      <h3 class="font-bold">商品を探して追加${helpIcon('商品マスタから選びます。金額は、1点あたりの買取金額（単価）を入力します。「見送る」にした商品は、契約に入りません（見送り品として記録します）。')}</h3>
      <input class="inp" data-psearch value="${esc(ctx.search)}" placeholder="商品名・ブランド・型番（例: ネヴァーフル）" />
      <div class="grid sm:grid-cols-2 gap-2">${ctx.results.map((p) => `<button class="text-left rounded-lg border bg-slate-50 hover:bg-indigo-50 px-3 py-2" data-add-p="${esc(p.id)}"><span class="block font-bold text-sm truncate">${esc(p.name)}</span><span class="text-xs text-slate-500">${esc(p.category)}</span></button>`).join('') || '<div class="text-sm text-slate-400">該当する商品がありません</div>'}</div></section>
    <section class="space-y-2"><h3 class="font-bold">買取明細 <span class="text-sm font-normal text-slate-500">${sellItems(d.items).length}品目・合計 <b class="text-slate-800">${yen(totalOf(d.items))}</b></span></h3>
      ${d.items.length ? d.items.map(itemRow).join('') : '<div class="text-sm text-slate-400">商品を追加してください</div>'}</section></div>`;
}

function sealStep(d, ctx) {
  const slots = slotsOf(d.items);
  return `<div class="space-y-2 max-w-4xl"><h3 class="font-bold">商品1点ごとに、シールを貼って、読み取ります${helpIcon('シールのQRを読み取る（モックのため、ボタンで新しいシールNo.を出します）か、シールNo.を入力します。色は、紫・赤が高額品で、本社に納入します。')}</h3>
    ${slots.map((x) => `<div class="rounded-lg border bg-white p-3 flex flex-wrap items-center gap-3 ${d.labels[x.key] && d.colors[x.key] ? 'border-emerald-300' : ''}">
      <div class="min-w-0 flex-1"><b class="truncate block">${esc(x.item.name)}${x.item.qty > 1 ? `（${x.n}/${x.item.qty}）` : ''}</b><span class="text-xs text-slate-500">${yen(x.item.price)}</span></div>
      <input class="inp !w-44 font-mono" data-seal="${esc(x.key)}" value="${esc(d.labels[x.key] ?? '')}" placeholder="シールNo." />
      <button class="b b-sec !px-3 text-sm" data-scan="${esc(x.key)}">📷 読み取り（モック）</button>
      <div class="flex gap-1">${SEAL_COLORS.map((c) => `<button class="b ${d.colors[x.key] === c.key ? 'on' : 'b-sec'} !px-3 text-sm" data-color="${esc(x.key)}" data-value="${c.key}" title="${esc(c.note)}">${c.dot} ${esc(c.label)}</button>`).join('')}</div>
      ${d.labels[x.key] ? `<button class="text-xs text-slate-500 underline" data-unseal="${esc(x.key)}">解除</button>` : ''}
      ${ctx.labelError?.key === x.key ? `<div class="w-full text-sm font-bold text-rose-700" role="alert">このシール（${esc(ctx.labelError.code)}）は、すでに使われています</div>` : ''}</div>`).join('')}</div>`;
}

function payStep(d) {
  const sell = sellItems(d.items);
  const left = leaveRemaining(d);
  return `<div class="grid lg:grid-cols-2 gap-4">
    <section class="rounded-xl border-2 border-indigo-300 bg-white p-4 space-y-2">
      <h3 class="font-bold text-lg">買取内容（お客様にお見せください）</h3>
      <table class="w-full">${sell.map((i) => `<tr class="border-t"><td class="py-1.5">${esc(i.name)}</td><td class="w-12 text-right text-slate-500">${i.qty > 1 ? `×${i.qty}` : ''}</td><td class="w-28 text-right font-bold">${yen(i.price * i.qty)}</td></tr>`).join('')}</table>
      <div class="flex justify-between items-baseline border-t-2 pt-2"><span class="font-bold">お支払い金額</span><b class="text-3xl">${yen(totalOf(d.items))}</b></div></section>
    <section class="space-y-3">
      <div class="rounded-xl border bg-white p-3 space-y-2"><h3 class="font-bold">契約書・本人確認${helpIcon('GMOサインで、本人確認書類の登録と、契約書の印刷をします。チェック項目・署名は、印刷した紙にお客様が記入します。契約書を送ったあとは、買取の内容を変えられません。')}</h3>
        ${d.contractId ? `<div class="text-sm text-emerald-700 font-bold">✔ 契約を送りました（${esc(d.contractId)}）</div><button class="b b-sec" data-open-gmo>GMOサインを開く</button>` : '<button class="b b-pri" data-send-gmo>契約をGMOサインへ送る</button>'}</div>
      <div class="rounded-xl border bg-white p-3 space-y-2"><h3 class="font-bold">終了前の確認 ${left ? `<span class="text-sm text-rose-600">あと${left}項目</span>` : '<span class="text-sm text-emerald-700">✔ 完了</span>'}</h3>
        ${LEAVE_CHECKS.map((x) => check(`data-lv="${x.key}"`, d.checks[x.key], x.text)).join('')}</div></section></div>`;
}

const HINT = ['氏名・電話番号・住所・生年月日を入力し、確認済みにしてください', '説明事項をすべて済ませ、提案の回答を選んでください', '売る商品を1点以上追加し、全商品の金額を入力してください', '全商品に、シールNo.と色が必要です', '契約を送り、終了前の確認をすべて済ませてください'];

// ctx: { draft, history, profile, declined, search, results, labelError }
export function purchaseHtml(ctx) {
  const { draft: d } = ctx;
  const body = [customerStep, explainStep, itemsStep, sealStep, payStep][d.step](d, ctx);
  const last = d.step === STEPS.length - 1;
  const ok = canProceed(d);
  return `<div class="flex flex-col h-[calc(100vh-52px)]">
    <div class="px-4 py-2 bg-white border-b flex flex-wrap items-center gap-2">
      <button class="b b-sec !min-h-0 !py-1 text-sm" data-back-board>← 来店の一覧へ（作業は保存されます）</button>
      <b class="ml-2">${esc(d.customer.name)} 様</b>
      <ol class="flex gap-1 ml-4 text-xs">${STEPS.map((s, i) => `<li class="rounded-full px-3 py-1 font-bold ${i === d.step ? 'bg-indigo-700 text-white' : i < d.step ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-500'}">${i + 1}. ${esc(s)}</li>`).join('')}</ol>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto p-4" data-scroll="body">${body}</div>
    <footer class="px-4 py-2 bg-white border-t flex items-center gap-3">
      <button class="b b-sec text-rose-700" data-decline ${d.contractId ? 'disabled' : ''}>買取に至らず終了（見送り）</button>
      <span class="flex-1 text-sm text-slate-500 text-right">${ok ? '' : esc(HINT[d.step])}</span>
      <button class="b b-sec" data-prev ${d.step === 0 || d.contractId ? 'disabled' : ''}>← 戻る</button>
      ${last ? `<button class="b b-pri w-48" data-finish ${ok ? '' : 'disabled'}>買取を完了する</button>` : `<button class="b b-pri w-40" data-next ${ok ? '' : 'disabled'}>次へ →</button>`}
    </footer></div>`;
}
