// 🚚 倉庫間移動: 自分の倉庫の在庫を、別の倉庫へ送る（パックを作る → 商品を探して入れる → パッキング → 明細出力 → 発送伝票・CSV出力 → 発送）／自分の倉庫あての商品を受け取る。
// 送った商品は「輸送中」になり、受け取るまで、どちらの倉庫の在庫にも数えない。
import { buildRows, scopeState } from '../src/warehouse.js';
import { incoming, outgoing, drafts } from '../src/warehouseTransfer.js';
import { activeWarehouses, warehouseById, destinationProblem } from '../src/warehouseMaster.js';
import { CARRIERS, PACK_SIZES, carrierOf, packSummary, addressProblems } from '../src/shipping.js';
import { yen, esc } from '../src/format.js';
import { badge, md, mdTime, sealBadge } from './ui.js';

const itemNames = (t, byCode) => t.codes.map((c) => esc(byCode.get(c)?.name ?? c)).join('、');
const shipInfo = (t) => `${carrierOf(t.carrier)?.label ?? '配送業者未設定'}${t.size ? `・${esc(t.size)}サイズ` : ''}${(t.boxes ?? 1) > 1 ? `・${t.boxes}個口` : ''}${t.tracking ? `・追跡番号 <b class="font-mono">${esc(t.tracking)}</b>` : ''}`;
const tick = (at, label) => (at ? `<span class="text-emerald-700 text-xs font-bold">✓ ${label}（${mdTime(at)}）</span>` : `<span class="text-slate-400 text-xs">${label}: 未出力</span>`);

// ---- 送る: パック一覧・新しいパック
function packList(full, master, me, pk) {
  const mine = drafts(full, me.warehouseId);
  const others = activeWarehouses(master).filter((w) => w.id !== me.warehouseId);
  const carriersUsed = [...new Set(mine.map((p) => p.carrier).filter(Boolean))];
  return `<section class="rounded-xl border bg-white p-4 space-y-3">
    <h2 class="font-bold text-lg">📤 他の倉庫へ送る（パックを作る）</h2>
    <p class="text-xs text-slate-500">流れ: ① 商品を探す（検索・QR読取）→ ② パッキング → ③ 明細出力 → ④ 発送伝票・CSV出力 → 発送。送れるのは、あなたの倉庫（${esc(warehouseById(master, me.warehouseId).name)}）の在庫です。</p>
    <div class="flex flex-wrap items-end gap-2">
      <label class="text-sm font-bold">送り先の倉庫<select class="inp mt-1 font-normal" data-f="pk.toId"><option value="">選んでください</option>
        ${others.map((w) => `<option value="${esc(w.id)}" ${pk.toId === w.id ? 'selected' : ''}>${esc(w.name)}${w.highValue ? '（高額品の保管先）' : ''}</option>`).join('')}</select></label>
      <button class="b b-pri" data-pk-new ${pk.toId ? '' : 'disabled'}>新しいパックを作る</button></div>
    <h3 class="font-bold pt-1">梱包中のパック（${mine.length}件）</h3>
    ${mine.length ? mine.map((p) => {
      const s = packSummary(p, full.units);
      return `<div class="rounded-lg border p-3 text-sm space-y-1"><div class="flex flex-wrap items-center gap-2"><b>${esc(p.toName)} へ</b>${badge('bg-amber-100 text-amber-800', '梱包中')}<span class="font-mono text-xs text-slate-500">${esc(p.id)}</span>
        <span class="ml-auto"><button class="b b-pri !min-h-0 !py-1 !px-3 text-sm" data-pk-open="${esc(p.id)}">開く</button> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-pk-discard="${esc(p.id)}">破棄</button></span></div>
        <div>${s.count}点・${yen(s.total)}　${shipInfo(p)}</div><div class="flex gap-3">${tick(p.listPrintedAt, '明細')}${tick(p.labelPrintedAt, '発送伝票')}</div></div>`;
    }).join('') : '<p class="text-sm text-slate-500">梱包中のパックはありません。</p>'}
    ${carriersUsed.length ? `<div class="rounded bg-slate-50 p-2 text-xs space-y-1"><div class="font-bold">梱包中のパックを、配送業者ごとにまとめてCSV出力</div><div class="flex flex-wrap gap-2">${carriersUsed.map((k) => `<button class="b b-sec !min-h-0 !py-1 !px-3 text-sm" data-pk-csv-all="${k}">⬇ ${esc(carrierOf(k).label)}（${mine.filter((p) => p.carrier === k).length}件）</button>`).join('')}</div></div>` : ''}
  </section>`;
}

// ---- 送る: パックの作業（① 商品を探す ② パッキング ③ 明細 ④ 発送伝票・CSV・発送）
const step = (n, title) => `<h3 class="font-bold flex items-center gap-2"><span class="inline-flex w-6 h-6 rounded-full bg-sky-700 text-white text-sm items-center justify-center">${n}</span>${title}</h3>`;

function candidates(full, master, me, pack, q, now) {
  const mine = scopeState(full, me.warehouseId, master);
  const needle = q.trim().toLowerCase();
  const all = buildRows(mine, now).filter((r) => r.stage === 'stock' && !pack.codes.includes(r.unit.code) && !destinationProblem(master, r.unit, pack.toId));
  const hit = needle ? all.filter((r) => [r.unit.name, r.unit.code, r.unit.customerName, r.unit.category].some((v) => String(v).toLowerCase().includes(needle))) : all;
  return { total: hit.length, rows: hit.sort((a, b) => b.unit.at - a.unit.at).slice(0, 30) };
}

function packWork(full, master, me, pk, now) {
  const pack = (full.transfers ?? []).find((t) => t.id === pk.id && t.status === 'draft');
  if (!pack) return '';
  const byCode = new Map(full.units.map((u) => [u.code, u]));
  const cand = candidates(full, master, me, pack, pk.q, now);
  const s = packSummary(pack, full.units);
  const problems = addressProblems(pack, master);
  const c = carrierOf(pack.carrier);
  const ready = pack.codes.length > 0 && Boolean(pack.carrier);
  return `<section class="rounded-xl border-2 border-sky-400 bg-white p-4 space-y-4">
    <div class="flex flex-wrap items-center gap-2"><h2 class="font-bold text-lg">📦 パック（${esc(pack.fromName)} → ${esc(pack.toName)}）</h2><span class="font-mono text-xs text-slate-500">${esc(pack.id)}</span>
      <button class="ml-auto b b-sec !min-h-0 !py-1 !px-3 text-sm" data-pk-close>← パックの一覧へ</button></div>

    <div class="space-y-2">${step(1, '商品を探す')}
      <div class="flex flex-wrap items-center gap-2">
        <input class="inp !w-64" data-pk-q placeholder="商品名・シールNo.・お客様名で絞り込み" value="${esc(pk.q)}" autocomplete="off" />
        <input class="inp !w-52 font-mono" data-pk-scan-input placeholder="QR読取／シールNo.＋Enter" autocomplete="off" />
        <button class="b b-pri" data-pk-scan>追加</button><button class="b b-pri !bg-teal-700" data-cam-pack>📷 カメラで読み取って追加</button></div>
      ${pk.last ? `<div class="rounded-lg border-2 p-2 text-sm font-bold ${pk.last.ok ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-rose-50 border-rose-400 text-rose-700'}">${pk.last.ok ? '✓' : '⚠'} ${esc(pk.last.text)}</div>` : ''}
      <div class="max-h-64 overflow-y-auto border rounded"><table class="w-full text-sm"><tbody>
        ${cand.rows.length ? cand.rows.map((r) => `<tr class="border-b"><td class="font-bold">${esc(r.unit.name)}<div class="text-xs font-normal text-slate-500"><span class="font-mono">${esc(r.unit.code)}</span> ${sealBadge(r.unit)}</div></td>
          <td class="text-xs">${md(r.unit.date)}<br>${esc(r.unit.customerName)} 様</td><td class="text-xs">${esc(r.unit.location)}</td><td class="text-right">${yen(r.unit.price)}</td>
          <td><button class="b b-pri !min-h-0 !py-1 !px-3 text-sm" data-pk-add="${esc(r.unit.code)}">パックに入れる</button> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-pk-add-lot="${esc(r.unit.visitId)}">同じ契約をすべて</button></td></tr>`).join('')
          : '<tr><td class="text-slate-400 p-2">送れる商品がありません（検索条件を変えてください）。</td></tr>'}
      </tbody></table></div>
      ${cand.total > cand.rows.length ? `<div class="text-xs text-slate-500">他に ${cand.total - cand.rows.length} 点あります。絞り込んでください。</div>` : ''}
    </div>

    <div class="space-y-2">${step(2, 'パッキング')}
      <table class="w-full text-sm"><tbody>
        ${pack.codes.length ? pack.codes.map((code) => { const u = byCode.get(code); return `<tr class="border-b"><td class="font-bold">${esc(u?.name ?? code)}<div class="text-xs font-normal text-slate-500 font-mono">${esc(code)}</div></td><td class="text-right">${yen(u?.price ?? 0)}</td><td class="text-right"><button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-pk-remove="${esc(code)}">外す</button></td></tr>`; }).join('')
          : '<tr><td class="text-slate-400">商品が入っていません。</td></tr>'}
      </tbody></table>
      <div class="text-sm">入っている商品 <b>${s.count}点</b>・買取額の合計 <b>${yen(s.total)}</b></div>
      <div class="flex flex-wrap items-end gap-3">
        <div><div class="text-xs font-bold mb-1">配送業者</div><div class="flex gap-1">${CARRIERS.map((x) => `<button class="b b-sec !min-h-[40px] !py-1 !px-3 text-sm ${pack.carrier === x.key ? 'on' : ''}" data-pk-carrier="${x.key}">${esc(x.label)}</button>`).join('')}</div></div>
        <label class="text-xs font-bold">サイズ<select class="inp mt-1 font-normal !w-28" data-pack-field="size"><option value="">選択</option>${PACK_SIZES.map((z) => `<option ${pack.size === z ? 'selected' : ''}>${z}</option>`).join('')}</select></label>
        <label class="text-xs font-bold">個口数（箱の数）<input class="inp mt-1 font-normal !w-24 text-right" type="number" min="1" data-pack-field="boxes" value="${pack.boxes ?? 1}" /></label>
        <label class="text-xs font-bold flex-1 min-w-[10rem]">メモ（伝票の記事）<input class="inp mt-1 font-normal" data-pack-field="note" value="${esc(pack.note)}" placeholder="例: 割れ物注意" /></label></div>
    </div>

    <div class="space-y-2">${step(3, '明細を出力')}
      <div class="flex flex-wrap items-center gap-3"><button class="b b-pri" data-pk-print-list ${pack.codes.length ? '' : 'disabled'}>🖨 明細を出力（印刷）</button>${tick(pack.listPrintedAt, '明細')}
        <span class="text-xs text-slate-500">商品と一緒に入れる、送付明細です。受け取る倉庫が、実物と照合します。</span></div></div>

    <div class="space-y-2">${step(4, '発送伝票・CSVを出力して、発送')}
      ${problems.length ? `<div class="rounded bg-amber-50 border border-amber-300 p-2 text-xs text-amber-800">伝票・CSVに必要な情報が足りません: ${problems.map(esc).join('、')}。「🏭 倉庫マスタ」で登録してください。</div>` : ''}
      <div class="flex flex-wrap items-center gap-3"><button class="b b-pri" data-pk-print-label ${ready ? '' : 'disabled'}>🖨 発送伝票を出力（印刷）</button>${tick(pack.labelPrintedAt, '発送伝票')}
        ${c?.csvLabel ? `<button class="b b-sec" data-pk-csv="${c.key}" ${ready ? '' : 'disabled'}>⬇ CSV出力（${esc(c.csvLabel)}）</button>` : ''}</div>
      <p class="text-xs text-slate-500">配送業者のシステム（${CARRIERS.filter((x) => x.csvLabel).map((x) => esc(x.label)).join('・')}）には、CSVを取り込んで送り状を出力します。CSVの列は、仮の並びです（実際の取込形式に合わせて調整します）。</p>
      <div class="flex flex-wrap items-end gap-3 pt-1"><label class="text-xs font-bold">追跡番号（わかれば）<input class="inp mt-1 font-normal font-mono !w-64" data-pk-tracking value="${esc(pk.tracking)}" placeholder="配送業者から発行された番号" /></label>
        <button class="b b-pri" data-pk-ship ${ready ? '' : 'disabled'}>🚚 発送する（${esc(pack.toName)}へ）</button>
        ${ready ? '' : '<span class="text-xs text-rose-600 font-bold">商品を入れて、配送業者を選んでください</span>'}</div>
    </div>
  </section>`;
}

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
  const work = pk.id ? packWork(full, master, me, pk, now) : '';
  return `<div class="grid xl:grid-cols-[minmax(32rem,40rem)_1fr] gap-4 items-start">${work || packList(full, master, me, pk)}
    <div class="space-y-4">
      <section class="rounded-xl border bg-white p-4 space-y-3"><h2 class="font-bold text-lg">📥 受け取り待ち（${inc.length}件）</h2>
        ${inc.length ? inc.map((t) => incomingCard(t, full, master, tr, me)).join('') : '<p class="text-sm text-slate-500">あなたの倉庫あての輸送中の商品はありません。</p>'}</section>
      <section class="rounded-xl border bg-white p-4 space-y-3"><h2 class="font-bold text-lg">🚚 送った商品・輸送中（${out.length}件）</h2>
        ${out.length ? out.map((t) => outgoingCard(t, full)).join('') : '<p class="text-sm text-slate-500">輸送中の商品はありません。</p>'}</section>
      <section class="rounded-xl border bg-white p-4 space-y-2"><h2 class="font-bold text-lg">移動の履歴</h2>
        <table class="w-full text-sm"><tbody>${history.length ? history.map((t) => `<tr class="border-b"><td>${mdTime(t.receivedAt)}</td><td>${esc(t.fromName)} → ${esc(t.toName)}${t.carrier ? `<div class="text-xs text-slate-500">${shipInfo(t)}</div>` : ''}</td><td class="!whitespace-normal">${itemNames(t, byCode)}</td><td class="text-xs text-slate-500">${esc(t.sentBy)} → ${esc(t.receivedBy)}</td></tr>`).join('') : '<tr><td class="text-slate-400">履歴はありません。</td></tr>'}</tbody></table></section>
    </div></div>`;
}
