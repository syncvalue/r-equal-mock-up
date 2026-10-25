// 🚚 倉庫間移動: 自分の倉庫の在庫を、別の倉庫へ送る（パックを作る → 商品を探して入れる → パッキング → 明細出力 → 発送伝票・CSV出力 → 発送）／自分の倉庫あての商品を受け取る。
// 送った商品は「輸送中」になり、受け取るまで、どちらの倉庫の在庫にも数えない。
import { incoming, outgoing } from '../src/warehouseTransfer.js';
import { warehouseById } from '../src/warehouseMaster.js';
import { esc } from '../src/format.js';
import { badge, mdTime } from './ui.js';
import { packList, packWork, openPackOf, shipInfo } from './packUi.js';

const itemNames = (t, byCode) => t.codes.map((c) => esc(byCode.get(c)?.name ?? c)).join('、');

// ---- 受け取り・輸送中・履歴
function incomingCard(t, full, master, tr, me) {
  const byCode = new Map(full.units.map((u) => [u.code, u]));
  const locs = warehouseById(master, me.warehouseId).locations;
  const loc = tr.locs[t.id] ?? locs[0];
  const ready = t.codes.every((c) => tr.checks.includes(c));
  return `<div class="rounded-lg border-2 border-sky-300 p-3 space-y-2 text-sm">
    <div class="flex flex-wrap items-center gap-2"><b>${esc(t.fromName)} から</b>${badge('bg-sky-100 text-sky-800', '受け取り待ち')}<span class="text-xs text-slate-500">${mdTime(t.sentAt)} 発送／${esc(t.sentBy)}</span></div>
    <div class="text-xs text-slate-600">${shipInfo(t)}</div>
    <div class="space-y-1">${t.codes.map((c) => `<label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" data-tr-check="${esc(c)}" ${tr.checks.includes(c) ? 'checked' : ''} />${esc(byCode.get(c)?.name ?? c)}<span class="text-xs text-slate-500 font-mono">${esc(c)}</span></label>`).join('')}</div>
    <div class="flex flex-wrap items-end gap-2">
      <label class="text-xs font-bold">保管場所（${esc(warehouseById(master, me.warehouseId).name)}の棚）<select class="inp mt-1 font-normal" data-tr-loc="${esc(t.id)}">${locs.map((l) => `<option ${loc === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <button class="b b-pri" data-tr-receive="${esc(t.id)}" ${ready ? '' : 'disabled'}>☑を確認して受け取る</button>
      <span class="text-xs text-slate-500">届いた商品を、送付明細と見比べて、すべて☑を付けると受け取れます。</span></div>
  </div>`;
}

function outgoingCard(t, full) {
  const byCode = new Map(full.units.map((u) => [u.code, u]));
  return `<div class="rounded-lg border p-3 space-y-1 text-sm">
    <div class="flex flex-wrap items-center gap-2"><b>${esc(t.toName)} へ</b>${badge('bg-amber-100 text-amber-800', '輸送中')}<span class="text-xs text-slate-500">${mdTime(t.sentAt)} 発送／${esc(t.sentBy)}</span>
      <button class="ml-auto b b-sec !min-h-0 !py-1 !px-2 text-xs" data-tr-cancel="${esc(t.id)}">取り消す</button></div>
    <div class="text-xs text-slate-600">${shipInfo(t)}</div>
    <div>${itemNames(t, byCode)}（${t.codes.length}点）</div></div>`;
}

export function transferTab(full, master, { pk, tr }, me, now = Date.now()) {
  const inc = incoming(full, me.warehouseId);
  const out = outgoing(full, me.warehouseId);
  const byCode = new Map(full.units.map((u) => [u.code, u]));
  const history = (full.transfers ?? []).filter((t) => t.status === 'received' && (t.fromId === me.warehouseId || t.toId === me.warehouseId)).slice(0, 10);
  const work = openPackOf(full, pk, 'transfer') ? packWork(full, master, me, pk, now, 'transfer') : '';
  return `<div class="grid xl:grid-cols-[minmax(32rem,40rem)_1fr] gap-4 items-start">${work || packList(full, master, me, pk, 'transfer')}
    <div class="space-y-4">
      <section class="rounded-xl border bg-white p-4 space-y-3"><h2 class="font-bold text-lg">📥 受け取り待ち（${inc.length}件）</h2>
        ${inc.length ? inc.map((t) => incomingCard(t, full, master, tr, me)).join('') : '<p class="text-sm text-slate-500">あなたの倉庫あての輸送中の商品はありません。</p>'}</section>
      <section class="rounded-xl border bg-white p-4 space-y-3"><h2 class="font-bold text-lg">🚚 送った商品・輸送中（${out.length}件）</h2>
        ${out.length ? out.map((t) => outgoingCard(t, full)).join('') : '<p class="text-sm text-slate-500">輸送中の商品はありません。</p>'}</section>
      <section class="rounded-xl border bg-white p-4 space-y-2"><h2 class="font-bold text-lg">移動の履歴</h2>
        <table class="w-full text-sm"><tbody>${history.length ? history.map((t) => `<tr class="border-b"><td>${mdTime(t.receivedAt)}</td><td>${esc(t.fromName)} → ${esc(t.toName)}${t.carrier ? `<div class="text-xs text-slate-500">${shipInfo(t)}</div>` : ''}</td><td class="!whitespace-normal">${itemNames(t, byCode)}</td><td class="text-xs text-slate-500">${esc(t.sentBy)} → ${esc(t.receivedBy)}</td></tr>`).join('') : '<tr><td class="text-slate-400">履歴はありません。</td></tr>'}</tbody></table></section>
    </div></div>`;
}
