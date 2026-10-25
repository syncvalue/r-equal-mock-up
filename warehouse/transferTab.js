// 🚚 倉庫間移動: 自分の倉庫の在庫を別の倉庫へ送る／自分の倉庫あての商品を受け取る。
// 送った商品は「輸送中」になり、受け取るまで、どちらの倉庫の在庫にも数えない。
import { buildRows, scopeState } from '../src/warehouse.js';
import { incoming, outgoing } from '../src/warehouseTransfer.js';
import { activeWarehouses, warehouseById } from '../src/warehouseMaster.js';
import { yen, esc } from '../src/format.js';
import { badge, md, mdTime } from './ui.js';

const itemNames = (t, byCode) => t.codes.map((c) => esc(byCode.get(c)?.name ?? c)).join('、');

function sendPanel(full, master, tf, me, now) {
  const byCode = new Map(full.units.map((u) => [u.code, u]));
  const mine = scopeState(full, me.warehouseId, master);
  const rows = buildRows(mine, now).filter((r) => r.stage === 'stock');
  const others = activeWarehouses(master).filter((w) => w.id !== me.warehouseId);
  return `<section class="rounded-xl border bg-white p-4 space-y-3">
    <h2 class="font-bold text-lg">📤 他の倉庫へ送る</h2>
    <p class="text-xs text-slate-500">送れるのは、あなたの倉庫（${esc(warehouseById(master, me.warehouseId).name)}）の在庫です（出品中・委託中・返品対応中の商品は、先に取り下げ・戻してください）。</p>
    <div class="rounded-lg border bg-slate-50 p-3 space-y-2">
      <label class="text-sm font-bold block">🔳 QRで商品を選ぶ<span class="font-normal text-xs text-slate-500">（QRリーダーで読み取る、またはシールNo.を入力してEnter）</span>
        <div class="flex flex-wrap gap-2 mt-1"><input class="inp font-mono font-normal !w-60" data-tf-scan-input placeholder="RQ-XXXXXXXX" autocomplete="off" />
          <button class="b b-pri" data-tf-scan>追加</button><button class="b b-pri !bg-teal-700" data-cam-transfer>📷 カメラで読み取って追加</button></div></label>
      ${tf.last ? `<div class="rounded-lg border-2 p-2 text-sm font-bold ${tf.last.ok ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-rose-50 border-rose-400 text-rose-700'}">${tf.last.ok ? '✓' : '⚠'} ${esc(tf.last.text)}</div>` : ''}
    </div>
    <label class="text-sm font-bold block">送り先の倉庫<select class="inp mt-1 font-normal" data-f="tf.toId"><option value="">選んでください</option>
      ${others.map((w) => `<option value="${esc(w.id)}" ${tf.toId === w.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></label>
    <div class="max-h-72 overflow-y-auto border rounded"><table class="w-full text-sm"><tbody>
      ${rows.length ? rows.map((r) => `<tr class="border-b ${tf.codes.includes(r.unit.code) ? 'bg-sky-50' : ''}"><td><input type="checkbox" class="w-5 h-5" data-tf-code="${esc(r.unit.code)}" ${tf.codes.includes(r.unit.code) ? 'checked' : ''} aria-label="${esc(r.unit.name)}を送る" /></td>
        <td class="font-bold">${esc(r.unit.name)}<div class="text-xs font-normal text-slate-500 font-mono">${esc(r.unit.code)}</div></td><td class="text-right">${yen(r.unit.price)}</td><td class="text-xs">${esc(r.unit.location)}${r.cooling ? ` ${badge('bg-amber-100 text-amber-800', `${md(r.coolEnd)}まで保管期間`)}` : ''}</td></tr>`).join('')
        : '<tr><td class="text-slate-400 p-2">送れる在庫がありません。</td></tr>'}
    </tbody></table></div>
    ${tf.codes.length ? `<div class="text-sm">選んだ商品（${tf.codes.length}点）: ${tf.codes.map((c) => esc(byCode.get(c)?.name ?? c)).join('、')} <button class="text-xs underline text-slate-500" data-tf-clear>選択をすべて外す</button></div>` : ''}
    <button class="b b-pri" data-tf-send ${tf.toId && tf.codes.length ? '' : 'disabled'}>選んだ${tf.codes.length}点を送る</button>
  </section>`;
}

function incomingCard(t, full, master, tr, me) {
  const byCode = new Map(full.units.map((u) => [u.code, u]));
  const locs = warehouseById(master, me.warehouseId).locations;
  const loc = tr.locs[t.id] ?? locs[0];
  const ready = t.codes.every((c) => tr.checks.includes(c));
  return `<div class="rounded-lg border-2 border-sky-300 p-3 space-y-2 text-sm">
    <div class="flex flex-wrap items-center gap-2"><b>${esc(t.fromName)} から</b>${badge('bg-sky-100 text-sky-800', '受け取り待ち')}<span class="text-xs text-slate-500">${mdTime(t.sentAt)} 送付／${esc(t.sentBy)}</span></div>
    <div class="space-y-1">${t.codes.map((c) => `<label class="flex items-center gap-2"><input type="checkbox" class="w-5 h-5" data-tr-check="${esc(c)}" ${tr.checks.includes(c) ? 'checked' : ''} />${esc(byCode.get(c)?.name ?? c)}<span class="text-xs text-slate-500 font-mono">${esc(c)}</span></label>`).join('')}</div>
    <div class="flex flex-wrap items-end gap-2">
      <label class="text-xs font-bold">保管場所（${esc(warehouseById(master, me.warehouseId).name)}の棚）<select class="inp mt-1 font-normal" data-tr-loc="${esc(t.id)}">${locs.map((l) => `<option ${loc === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <button class="b b-pri" data-tr-receive="${esc(t.id)}" ${ready ? '' : 'disabled'}>☑を確認して受け取る</button>
      <span class="text-xs text-slate-500">届いた商品に、すべて☑を付けると受け取れます。</span></div>
  </div>`;
}

function outgoingCard(t, full) {
  const byCode = new Map(full.units.map((u) => [u.code, u]));
  return `<div class="rounded-lg border p-3 space-y-1 text-sm">
    <div class="flex flex-wrap items-center gap-2"><b>${esc(t.toName)} へ</b>${badge('bg-amber-100 text-amber-800', '輸送中')}<span class="text-xs text-slate-500">${mdTime(t.sentAt)} 送付／${esc(t.sentBy)}</span>
      <button class="ml-auto b b-sec !min-h-0 !py-1 !px-2 text-xs" data-tr-cancel="${esc(t.id)}">取り消す</button></div>
    <div>${itemNames(t, byCode)}（${t.codes.length}点）</div></div>`;
}

export function transferTab(full, master, { tf, tr }, me, now = Date.now()) {
  const inc = incoming(full, me.warehouseId);
  const out = outgoing(full, me.warehouseId);
  const byCode = new Map(full.units.map((u) => [u.code, u]));
  const history = (full.transfers ?? []).filter((t) => t.status === 'received' && (t.fromId === me.warehouseId || t.toId === me.warehouseId)).slice(0, 10);
  return `<div class="grid xl:grid-cols-[28rem_1fr] gap-4 items-start">${sendPanel(full, master, tf, me, now)}
    <div class="space-y-4">
      <section class="rounded-xl border bg-white p-4 space-y-3"><h2 class="font-bold text-lg">📥 受け取り待ち（${inc.length}件）</h2>
        ${inc.length ? inc.map((t) => incomingCard(t, full, master, tr, me)).join('') : '<p class="text-sm text-slate-500">あなたの倉庫あての輸送中の商品はありません。</p>'}</section>
      <section class="rounded-xl border bg-white p-4 space-y-3"><h2 class="font-bold text-lg">🚚 送った商品・輸送中（${out.length}件）</h2>
        ${out.length ? out.map((t) => outgoingCard(t, full)).join('') : '<p class="text-sm text-slate-500">輸送中の商品はありません。</p>'}</section>
      <section class="rounded-xl border bg-white p-4 space-y-2"><h2 class="font-bold text-lg">移動の履歴</h2>
        <table class="w-full text-sm"><tbody>${history.length ? history.map((t) => `<tr class="border-b"><td>${mdTime(t.receivedAt)}</td><td>${esc(t.fromName)} → ${esc(t.toName)}</td><td class="!whitespace-normal">${itemNames(t, byCode)}</td><td class="text-xs text-slate-500">${esc(t.sentBy)} → ${esc(t.receivedBy)}</td></tr>`).join('') : '<tr><td class="text-slate-400">履歴はありません。</td></tr>'}</tbody></table></section>
    </div></div>`;
}
