// 送るパックの画面部品（倉庫間移動・業者への委託・売れた商品の発送で共通）。mode は 'transfer'（倉庫間移動）・'consign'（業者への委託）・'sale'（購入者への発送）。
// 流れ: パックを作る → ① 商品を探す → ② パッキング → ③ 明細を出力 → ④ 発送伝票・CSVを出力して、発送。
import { buildRows, scopeState, channelOf, dateOf } from '../src/warehouse.js';
import { drafts } from '../src/warehouseTransfer.js';
import { awaitingShipment, shipments } from '../src/warehouseSale.js';
import { activeWarehouses, activeVendors, warehouseById, destinationProblem } from '../src/warehouseMaster.js';
import { CARRIERS, PACK_SIZES, carrierOf, packSummary, addressProblems } from '../src/shipping.js';
import { moneyInputHtml } from '../src/moneyInput.js';
import { yen, esc } from '../src/format.js';
import { helpIcon } from '../src/help.js';
import { badge, md, mdTime, sealBadge } from './ui.js';

export const shipInfo = (t) => `${carrierOf(t.carrier)?.label ?? '配送業者未設定'}${t.size ? `・${esc(t.size)}サイズ` : ''}${(t.boxes ?? 1) > 1 ? `・${t.boxes}個口` : ''}${t.tracking ? `・追跡番号 <b class="font-mono">${esc(t.tracking)}</b>` : ''}`;
export const tick = (at, label) => (at ? `<span class="text-emerald-700 text-xs font-bold">✓ ${label}（${mdTime(at)}）</span>` : `<span class="text-slate-400 text-xs">${label}: 未出力</span>`);

const TEXT = {
  transfer: {
    title: '📤 他の倉庫へ送る（パックを作る）', dest: '送り先の倉庫', list: '明細', listBtn: '明細を出力（印刷）', ship: (n) => `🚚 発送する（${n}へ）`, to: (n) => `${n} へ`,
    note: (wh) => `送れるのは、あなたの倉庫（${wh}）の在庫です。`, listHint: '商品と一緒に入れる、送付明細です。受け取る倉庫が、実物と照合します。',
  },
  consign: {
    title: '📤 業者に委託する（パックを作る）', dest: '委託先（業者）', list: '委託明細', listBtn: '委託明細を出力（印刷）', ship: (n) => `📤 委託する（${n}へ）`, to: (n) => `${n} へ委託`,
    note: (wh) => `委託できるのは、あなたの倉庫（${wh}）の在庫です。委託すると、商品は「委託中」になります（売れたら入金、売れ残ったら倉庫に戻ります）。`, listHint: '商品と一緒に入れる、委託明細です。委託先に渡すので、希望価格だけを載せます（原価・お客様の情報は載せません）。',
  },
  sale: {
    title: '📦 売れた商品を発送する（パックを作る）', dest: '購入者', list: '納品書', listBtn: '納品書を出力（印刷）', ship: (n) => `🚚 発送する（${n} 様へ）`, to: (n) => `${n} 様へ`,
    note: (wh) => `発送できるのは、あなたの倉庫（${wh}）で売れた商品です（フリマ・業者への直接販売）。`, listHint: '購入者に同梱する納品書です。商品名と金額（売価）だけを載せます（原価・買い取ったお客様の情報は載せません）。',
  },
};
const destName = (p) => (p.kind === 'consign' ? p.vendorName : p.kind === 'sale' ? p.buyer?.name : p.toName);
const BUYER_FIELDS = [['bName', '購入者名', '例: 佐藤 一郎'], ['bZip', '郵便番号', '例: 150-0001'], ['bAddress', '住所', '例: 東京都渋谷区神宮前1-1-1'], ['bPhone', '電話番号', '例: 03-0000-0000']];

// 開いているパック（mode に合うものだけ）
export const openPackOf = (full, pk, mode) => (full.transfers ?? []).find((t) => t.id === pk.id && t.status === 'draft' && (t.kind ?? 'transfer') === mode) ?? null;

// ---- パックの一覧・新しいパック
export function packList(full, master, me, pk, mode = 'transfer') {
  const tx = TEXT[mode];
  const mine = drafts(full, me.warehouseId, mode);
  const dests = mode === 'consign' ? activeVendors(master) : mode === 'sale' ? [] : activeWarehouses(master).filter((w) => w.id !== me.warehouseId);
  const waiting = mode === 'sale' ? awaitingShipment(full, master, me.warehouseId) : [];
  const sentList = mode === 'sale' ? shipments(full, me.warehouseId).slice(0, 5) : [];
  const carriersUsed = [...new Set(mine.map((p) => p.carrier).filter(Boolean))];
  return `<section class="rounded-xl border bg-white p-4 space-y-3">
    <h2 class="font-bold text-lg">${tx.title}${helpIcon(`流れ: ① 商品を探す（検索・QR読取）→ ② パッキング → ③ ${tx.list}の出力 → ④ 発送伝票・CSVの出力 → ${mode === 'consign' ? '委託' : '発送'}。\n${tx.note(warehouseById(master, me.warehouseId).name)}`)}</h2>
    ${mode === 'sale' ? `<div class="rounded-lg border bg-slate-50 p-3 space-y-2"><div class="text-sm font-bold">購入者（お届け先）${helpIcon('フリマの取引画面・業者の注文から、転記します。')}</div>
      <div class="grid sm:grid-cols-2 gap-2">${BUYER_FIELDS.map(([k, label, ph]) => `<label class="text-xs font-bold">${label}<input class="inp mt-1 font-normal ${k === 'bZip' ? 'font-mono' : ''}" data-f="pk.${k}" value="${esc(pk[k] ?? '')}" placeholder="${ph}" /></label>`).join('')}</div>
      <button class="b b-pri" data-pk-new="sale" ${String(pk.bName ?? '').trim() ? '' : 'disabled'}>この購入者あての、新しいパックを作る</button></div>
    <h3 class="font-bold pt-1">発送待ちの商品（${waiting.length}点）</h3>
    ${waiting.length ? `<table class="w-full text-sm"><tbody>${waiting.map((r) => `<tr class="border-b"><td class="font-bold">${esc(r.unit.name)}<div class="text-xs font-normal text-slate-500"><span class="font-mono">${esc(r.unit.code)}</span>／${esc(carrierSource(r))}</div></td><td class="text-xs">${md(dateOfMs(r.rec.soldAt))} 売却<br>${esc(r.rec.buyer || '購入者名なし')}</td><td class="text-right">${yen(r.rec.soldPrice)}</td>
      <td><button class="b b-pri !min-h-0 !py-1 !px-3 text-sm" data-pk-new-sale="${esc(r.unit.code)}">この商品を発送する</button></td></tr>`).join('')}</tbody></table>` : '<p class="text-sm text-slate-500">発送待ちの商品はありません。</p>'}`
      : `<div class="flex flex-wrap items-end gap-2">
      <label class="text-sm font-bold">${tx.dest}<select class="inp mt-1 font-normal" data-f="pk.toId"><option value="">選んでください</option>
        ${dests.map((d) => `<option value="${esc(d.id)}" ${pk.toId === d.id ? 'selected' : ''}>${esc(d.name)}${d.highValue ? '（高額品の保管先）' : ''}</option>`).join('')}</select></label>
      <button class="b b-pri" data-pk-new="${mode}" ${pk.toId && dests.some((d) => d.id === pk.toId) ? '' : 'disabled'}>新しいパックを作る</button></div>`}
    <h3 class="font-bold pt-1">梱包中のパック（${mine.length}件）</h3>
    ${mine.length ? mine.map((p) => {
      const s = packSummary(p, full.units);
      return `<div class="rounded-lg border p-3 text-sm space-y-1"><div class="flex flex-wrap items-center gap-2"><b>${esc(tx.to(destName(p)))}</b>${badge('bg-amber-100 text-amber-800', '梱包中')}<span class="font-mono text-xs text-slate-500">${esc(p.id)}</span>
        <span class="ml-auto"><button class="b b-pri !min-h-0 !py-1 !px-3 text-sm" data-pk-open="${esc(p.id)}">開く</button> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-pk-discard="${esc(p.id)}">破棄</button></span></div>
        <div>${s.count}点・${mode === 'consign' ? `希望価格の合計 ${yen(s.ask)}` : mode === 'sale' ? `売価の合計 ${yen(s.ask)}` : `買取額 ${yen(s.total)}`}　${shipInfo(p)}</div><div class="flex gap-3">${tick(p.listPrintedAt, tx.list)}${tick(p.labelPrintedAt, '発送伝票')}</div></div>`;
    }).join('') : '<p class="text-sm text-slate-500">梱包中のパックはありません。</p>'}
    ${sentList.length ? `<h3 class="font-bold pt-1">発送済み（最近 ${sentList.length}件）</h3><table class="w-full text-sm"><tbody>${sentList.map((p) => `<tr class="border-b"><td>${mdTime(p.sentAt)}</td><td class="font-bold">${esc(p.buyer?.name)} 様</td><td class="text-xs">${shipInfo(p)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${carriersUsed.length ? `<div class="rounded bg-slate-50 p-2 text-xs space-y-1"><div class="font-bold">梱包中のパックを、配送業者ごとにまとめてCSV出力</div><div class="flex flex-wrap gap-2">${carriersUsed.map((k) => `<button class="b b-sec !min-h-0 !py-1 !px-3 text-sm" data-pk-csv-all="${mode}:${k}">⬇ ${esc(carrierOf(k).label)}（${mine.filter((p) => p.carrier === k).length}件）</button>`).join('')}</div></div>` : ''}
  </section>`;
}

// ---- パックの作業（① 商品を探す ② パッキング ③ 明細 ④ 発送伝票・CSV・発送）
const dateOfMs = (ms) => dateOf(ms);
const carrierSource = (r) => `${r.rec.channel ? channelOf(r.rec.channel)?.label ?? '' : ''}で売却`;
const step = (n, title, help = '') => `<h3 class="font-bold flex items-center gap-2"><span class="inline-flex w-6 h-6 rounded-full bg-sky-700 text-white text-sm items-center justify-center">${n}</span>${title}${help ? helpIcon(help) : ''}</h3>`;

function candidates(full, master, me, pack, q, now) {
  const needle = q.trim().toLowerCase();
  if (pack.kind === 'sale') { // 売れた商品の発送は、発送待ちの商品から選ぶ
    const all = awaitingShipment(full, master, me.warehouseId, now).filter((r) => !pack.codes.includes(r.unit.code));
    const hit = needle ? all.filter((r) => [r.unit.name, r.unit.code, r.rec.buyer].some((v) => String(v ?? '').toLowerCase().includes(needle))) : all;
    return { total: hit.length, rows: hit.slice(0, 30) };
  }
  const mine = scopeState(full, me.warehouseId, master);
  // 倉庫間の移動は、送り先の規則（高額品は本社へ、それ以外は本社以外へ）で絞る。委託は、規則なし
  const all = buildRows(mine, now).filter((r) => r.stage === 'stock' && !pack.codes.includes(r.unit.code) && !(pack.toId && destinationProblem(master, r.unit, pack.toId)));
  const hit = needle ? all.filter((r) => [r.unit.name, r.unit.code, r.unit.customerName, r.unit.category].some((v) => String(v).toLowerCase().includes(needle))) : all;
  return { total: hit.length, rows: hit.sort((a, b) => b.unit.at - a.unit.at).slice(0, 30) };
}

export function packWork(full, master, me, pk, now, mode = 'transfer') {
  const pack = openPackOf(full, pk, mode);
  if (!pack) return '';
  const tx = TEXT[mode];
  const consign = mode === 'consign';
  const sale = mode === 'sale';
  const byCode = new Map(full.units.map((u) => [u.code, u]));
  const cand = candidates(full, master, me, pack, pk.q, now);
  const s = packSummary(pack, full.units);
  const problems = addressProblems(pack, master);
  const c = carrierOf(pack.carrier);
  const noPrice = consign && pack.codes.some((code) => !(pack.prices?.[code] > 0));
  const ready = pack.codes.length > 0 && Boolean(pack.carrier) && !noPrice;
  return `<section class="rounded-xl border-2 border-sky-400 bg-white p-4 space-y-4">
    <div class="flex flex-wrap items-center gap-2"><h2 class="font-bold text-lg">📦 パック（${esc(pack.fromName)} → ${esc(destName(pack))}）</h2><span class="font-mono text-xs text-slate-500">${esc(pack.id)}</span>
      <button class="ml-auto b b-sec !min-h-0 !py-1 !px-3 text-sm" data-pk-close>← パックの一覧へ</button></div>

    ${sale ? `<div class="rounded-lg border bg-slate-50 p-3 space-y-2"><div class="text-sm font-bold">お届け先（購入者）</div><div class="grid sm:grid-cols-2 gap-2">${[['name', '購入者名'], ['zip', '郵便番号'], ['address', '住所'], ['phone', '電話番号']].map(([k, label]) => `<label class="text-xs font-bold">${label}<input class="inp mt-1 font-normal ${k === 'zip' ? 'font-mono' : ''}" data-pack-buyer="${k}" value="${esc(pack.buyer?.[k] ?? '')}" /></label>`).join('')}</div></div>` : ''}
    <div class="space-y-2">${step(1, sale ? '発送する商品を探す（発送待ちの商品）' : '商品を探す')}
      <div class="flex flex-wrap items-center gap-2">
        <input class="inp !w-64" data-pk-q placeholder="商品名・シールNo.・お客様名で絞り込み" value="${esc(pk.q)}" autocomplete="off" />
        <input class="inp !w-52 font-mono" data-pk-scan-input placeholder="QR読取／シールNo.＋Enter" autocomplete="off" />
        <button class="b b-pri" data-pk-scan>追加</button><button class="b b-pri !bg-teal-700" data-cam-pack>📷 カメラで読み取って追加</button></div>
      ${pk.last ? `<div class="rounded-lg border-2 p-2 text-sm font-bold ${pk.last.ok ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-rose-50 border-rose-400 text-rose-700'}">${pk.last.ok ? '✓' : '⚠'} ${esc(pk.last.text)}</div>` : ''}
      <div class="max-h-64 overflow-y-auto border rounded"><table class="w-full text-sm"><tbody>
        ${cand.rows.length && sale ? cand.rows.map((r) => `<tr class="border-b"><td class="font-bold">${esc(r.unit.name)}<div class="text-xs font-normal text-slate-500"><span class="font-mono">${esc(r.unit.code)}</span></div></td><td class="text-xs">${esc(r.rec.buyer || '購入者名なし')}</td><td class="text-right">${yen(r.rec.soldPrice)}</td><td><button class="b b-pri !min-h-0 !py-1 !px-3 text-sm" data-pk-add="${esc(r.unit.code)}">パックに入れる</button></td></tr>`).join('') : cand.rows.length ? cand.rows.map((r) => `<tr class="border-b"><td class="font-bold">${esc(r.unit.name)}<div class="text-xs font-normal text-slate-500"><span class="font-mono">${esc(r.unit.code)}</span> ${sealBadge(r.unit)}</div></td>
          <td class="text-xs">${md(r.unit.date)}<br>${esc(r.unit.customerName)} 様</td><td class="text-xs">${esc(r.unit.location)}</td><td class="text-right">${yen(r.unit.price)}</td>
          <td><button class="b b-pri !min-h-0 !py-1 !px-3 text-sm" data-pk-add="${esc(r.unit.code)}">パックに入れる</button> <button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-pk-add-lot="${esc(r.unit.visitId)}">同じ契約をすべて</button></td></tr>`).join('')
          : '<tr><td class="text-slate-400 p-2">入れられる商品がありません（検索条件を変えてください）。</td></tr>'}
      </tbody></table></div>
      ${cand.total > cand.rows.length ? `<div class="text-xs text-slate-500">他に ${cand.total - cand.rows.length} 点あります。絞り込んでください。</div>` : ''}
    </div>

    <div class="space-y-2">${step(2, 'パッキング', consign ? '希望価格は、原価の1.3倍の目安が入ります。変えるときは、金額を直してください（入力欄から出ると保存されます）。' : '')}
      <table class="w-full text-sm"><thead>${consign ? '<tr class="text-left text-slate-500 border-b"><th>商品</th><th class="text-right">原価（参考）</th><th>希望価格</th><th></th></tr>' : sale ? '<tr class="text-left text-slate-500 border-b"><th>商品</th><th class="text-right">売価</th><th></th></tr>' : ''}</thead><tbody>
        ${pack.codes.length ? pack.codes.map((code) => {
          const u = byCode.get(code);
          return `<tr class="border-b"><td class="font-bold">${esc(u?.name ?? code)}<div class="text-xs font-normal text-slate-500 font-mono">${esc(code)}</div></td><td class="text-right">${sale ? yen(pack.prices?.[code] ?? 0) : yen(u?.price ?? 0)}</td>
            ${consign ? `<td class="w-44">${moneyInputHtml({ attrs: `data-pk-price-input="${esc(code)}"`, value: pack.prices?.[code] ?? 0, cls: 'inp !py-1' })}</td>` : ''}
            <td class="text-right"><button class="b b-sec !min-h-0 !py-1 !px-2 text-xs" data-pk-remove="${esc(code)}">外す</button></td></tr>`;
        }).join('') : '<tr><td class="text-slate-400">商品が入っていません。</td></tr>'}
      </tbody></table>
      <div class="text-sm">入っている商品 <b>${s.count}点</b>${sale ? `・売価の合計 <b>${yen(s.ask)}</b>` : `・買取額（原価）の合計 <b>${yen(s.total)}</b>`}${consign ? `・希望価格の合計 <b>${yen(s.ask)}</b>` : ''}</div>
      <div class="flex flex-wrap items-end gap-3">
        <div><div class="text-xs font-bold mb-1">配送業者</div><div class="flex gap-1">${CARRIERS.map((x) => `<button class="b b-sec !min-h-[40px] !py-1 !px-3 text-sm ${pack.carrier === x.key ? 'on' : ''}" data-pk-carrier="${x.key}">${esc(x.label)}</button>`).join('')}</div></div>
        <label class="text-xs font-bold">サイズ<select class="inp mt-1 font-normal !w-28" data-pack-field="size"><option value="">選択</option>${PACK_SIZES.map((z) => `<option ${pack.size === z ? 'selected' : ''}>${z}</option>`).join('')}</select></label>
        <label class="text-xs font-bold">個口数（箱の数）<input class="inp mt-1 font-normal !w-24 text-right" type="number" min="1" data-pack-field="boxes" value="${pack.boxes ?? 1}" /></label>
        <label class="text-xs font-bold flex-1 min-w-[10rem]">メモ（伝票の記事）<input class="inp mt-1 font-normal" data-pack-field="note" value="${esc(pack.note)}" placeholder="例: 割れ物注意" /></label></div>
    </div>

    <div class="space-y-2">${step(3, `${tx.list}を出力`, tx.listHint)}
      <div class="flex flex-wrap items-center gap-3"><button class="b b-pri" data-pk-print-list ${pack.codes.length ? '' : 'disabled'}>🖨 ${tx.listBtn}</button>${tick(pack.listPrintedAt, tx.list)}</div></div>

    <div class="space-y-2">${step(4, `発送伝票・CSVを出力して、${consign ? '委託' : '発送'}`, `配送業者のシステム（${CARRIERS.filter((x) => x.csvLabel).map((x) => x.label).join('・')}）には、CSVを取り込んで送り状を出力します。CSVの列は、仮の並びです（実際の取込形式に合わせて調整します）。`)}
      ${problems.length ? `<div class="rounded bg-amber-50 border border-amber-300 p-2 text-xs text-amber-800">伝票・CSVに必要な情報が足りません: ${problems.map(esc).join('、')}。「マスタ管理」の倉庫で登録してください。</div>` : ''}
      <div class="flex flex-wrap items-center gap-3"><button class="b b-pri" data-pk-print-label ${ready ? '' : 'disabled'}>🖨 発送伝票を出力（印刷）</button>${tick(pack.labelPrintedAt, '発送伝票')}
        ${c?.csvLabel ? `<button class="b b-sec" data-pk-csv="${c.key}" ${ready ? '' : 'disabled'}>⬇ CSV出力（${esc(c.csvLabel)}）</button>` : ''}</div>
      <div class="flex flex-wrap items-end gap-3 pt-1"><label class="text-xs font-bold">追跡番号（わかれば）<input class="inp mt-1 font-normal font-mono !w-64" data-pk-tracking value="${esc(pk.tracking)}" placeholder="配送業者から発行された番号" /></label>
        <button class="b b-pri" data-pk-ship ${ready ? '' : 'disabled'}>${tx.ship(esc(destName(pack)))}</button>
        ${ready ? '' : `<span class="text-xs text-rose-600 font-bold">${noPrice ? '希望価格が未設定の商品があります' : '商品を入れて、配送業者を選んでください'}</span>`}</div>
    </div>
  </section>`;
}
