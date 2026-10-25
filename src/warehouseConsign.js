// 業者への委託（業者オークションなど、外部の市場に商品を渡して販売してもらう）。倉庫間の移動と同じ、パックの流れで進める:
// 委託先（業者）を決めてパックを作る → 商品を探して入れる → パッキング（配送業者・サイズ・希望価格）→ 明細・発送伝票の出力 → 発送（商品は「委託中」になる）。
// パックの共通の操作（外す・設定・出力の記録・破棄）は warehouseTransfer.js。委託中の商品は、売れたら入金、売れ残ったら倉庫に戻る（warehouse.js の sell／recall）。
import { suggestPrice } from './warehouse.js';
import { warehouseById, activeVendors } from './warehouseMaster.js';
import { addToPack } from './warehouseTransfer.js';

const fail = (state, reason) => ({ ok: false, state, reason });
const newId = (at) => `CS-${at.toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const draftOf = (state, id) => (state.transfers ?? []).find((t) => t.id === id && t.status === 'draft' && t.kind === 'consign');
const patch = (state, id, p) => ({ ...state, transfers: state.transfers.map((t) => (t.id === id ? { ...t, ...p } : t)) });

// 委託のパック（梱包中）を作る。reason: badVendor（無効・登録のない委託先）／badWarehouse
export function createConsignPack(state, master, { fromId, vendorId, by, at = Date.now() }) {
  const vendor = activeVendors(master).find((v) => v.id === vendorId);
  const from = warehouseById(master, fromId);
  if (!vendor) return fail(state, 'badVendor');
  if (!from) return fail(state, 'badWarehouse');
  const pack = {
    id: newId(at), kind: 'consign', codes: [], prices: {}, fromId, fromName: from.name, vendorId, vendorName: vendor.name, status: 'draft', createdAt: at, createdBy: by,
    carrier: '', size: '', boxes: 1, note: '', tracking: '', listPrintedAt: null, labelPrintedAt: null, sentAt: null, sentBy: '',
  };
  return { ok: true, state: { ...state, transfers: [pack, ...(state.transfers ?? [])] }, pack };
}

// 商品をパックに入れる。希望価格は、原価の目安が入る。高額品も委託できる（送り先の規則は、倉庫間の移動だけ）。理由は addToPack と同じ
export function addToConsignPack(state, master, packId, code, opts = {}) {
  if (!draftOf(state, packId)) return fail(state, 'notDraft');
  const r = addToPack(state, master, packId, code, opts);
  if (!r.ok || r.already) return r;
  return { ...r, state: patch(r.state, packId, { prices: { ...draftOf(r.state, packId).prices, [r.code]: suggestPrice(r.unit) } }) };
}

// 希望価格（1円以上の整数。「28,000」のような書式も可）。パックにない商品・正しくない値は、何も変えない
export function setPackPrice(state, packId, code, price) {
  const pack = draftOf(state, packId);
  const c = String(code ?? '').trim().toUpperCase();
  const raw = String(price ?? '').replace(/[,\s]/g, '');
  if (!pack?.codes.includes(c) || !/^\d+$/.test(raw) || Number(raw) < 1) return state;
  return patch(state, packId, { prices: { ...pack.prices, [c]: Number(raw) } });
}

// 委託する（発送）。商品が1点以上、配送業者が決まり、すべての希望価格が設定されていること。商品は「委託中」になる（記録に、委託先・希望価格・パックを残す）。
// reason: notDraft／badVendor／noItems／noCarrier／noPrice（rejected に、価格のない商品）
export function shipConsignPack(state, master, packId, { tracking = '', by, at = Date.now() }) {
  const pack = draftOf(state, packId);
  if (!pack) return fail(state, 'notDraft');
  if (!activeVendors(master).some((v) => v.id === pack.vendorId)) return fail(state, 'badVendor');
  if (!pack.codes.length) return fail(state, 'noItems');
  if (!pack.carrier) return fail(state, 'noCarrier');
  const rejected = pack.codes.filter((c) => !(pack.prices[c] > 0)).map((code) => ({ code, reason: 'noPrice' }));
  if (rejected.length) return { ...fail(state, 'noPrice'), rejected };
  const records = { ...state.records };
  pack.codes.forEach((code) => {
    records[code] = { stage: 'consigned', channel: 'auction', listPrice: pack.prices[code], listedAt: at, vendor: pack.vendorName, vendorId: pack.vendorId, packId, listedBy: by };
  });
  return { ok: true, state: patch({ ...state, records }, packId, { status: 'consigned', tracking: String(tracking ?? '').trim(), sentAt: at, sentBy: by }) };
}
