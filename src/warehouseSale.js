// 売れた商品の購入者への発送（フリマ・業者への直接販売）。倉庫間移動・委託と同じ、パックの流れで進める:
// 購入者を決めてパックを作る → 発送待ちの商品を探して入れる → パッキング（配送業者・サイズ）→ 納品書・発送伝票の出力 → 発送。
// 商品は売却済みのまま（売上は変わらない）。発送すると、商品の記録に、発送した日時・追跡番号などを残す。
// パックの共通の操作（外す・設定・出力の記録・破棄）は warehouseTransfer.js。
import { buildRows, replacedCode, channelOf } from './warehouse.js';
import { warehouseById, warehouseIdOf } from './warehouseMaster.js';

const fail = (state, reason) => ({ ok: false, state, reason });
const newId = (at) => `SL-${at.toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const draftOf = (state, id) => (state.transfers ?? []).find((t) => t.id === id && t.status === 'draft' && t.kind === 'sale');
const patch = (state, id, p) => ({ ...state, transfers: state.transfers.map((t) => (t.id === id ? { ...t, ...p } : t)) });
const salePacks = (state) => (state.transfers ?? []).filter((t) => t.kind === 'sale');

// 発送待ち: 売れたのに、まだ購入者へ発送していない、自倉庫の商品（梱包中のパックに入れたもの、委託先の市場で売れたもの（市場が送る）は除く）
export function awaitingShipment(state, master, warehouseId, now = Date.now()) {
  const packed = new Set(salePacks(state).filter((t) => t.status === 'draft').flatMap((t) => t.codes));
  return buildRows(state, now).filter((r) => r.rec?.stage === 'sold' && !r.rec.shippedAt && !channelOf(r.rec.channel)?.consign && warehouseIdOf(r.unit, master) === warehouseId && !packed.has(r.unit.code))
    .sort((a, b) => b.rec.soldAt - a.rec.soldAt);
}

// 発送済みのパック（新しい順）
export const shipments = (state, warehouseId) => salePacks(state).filter((t) => t.status === 'shipped' && t.fromId === warehouseId).sort((a, b) => b.sentAt - a.sentAt);

// 購入者あてのパック（梱包中）を作る。購入者の名前が必要。郵便番号は、形式を確かめて整える。reason: noBuyer／badZip／badWarehouse
export function createSalePack(state, master, { fromId, buyer, by, at = Date.now() }) {
  const from = warehouseById(master, fromId);
  if (!from) return fail(state, 'badWarehouse');
  const name = String(buyer?.name ?? '').trim();
  if (!name) return fail(state, 'noBuyer');
  const zip = String(buyer?.zip ?? '').trim().replace(/^(\d{3})(\d{4})$/, '$1-$2');
  if (zip && !/^\d{3}-\d{4}$/.test(zip)) return fail(state, 'badZip');
  const pack = {
    id: newId(at), kind: 'sale', codes: [], prices: {}, fromId, fromName: from.name, buyer: { name, zip, address: String(buyer?.address ?? '').trim(), phone: String(buyer?.phone ?? '').trim() },
    status: 'draft', createdAt: at, createdBy: by, carrier: '', size: '', boxes: 1, note: '', tracking: '', listPrintedAt: null, labelPrintedAt: null, sentAt: null, sentBy: '',
  };
  return { ok: true, state: { ...state, transfers: [pack, ...(state.transfers ?? [])] }, pack };
}

// 梱包中のパックの購入者の情報を直す（指定した項目だけ）。名前が空・郵便番号の形式が違うときは、何も変えない
export function setBuyer(state, packId, patchBuyer) {
  const pack = draftOf(state, packId);
  if (!pack) return state;
  const b = { ...pack.buyer, ...Object.fromEntries(Object.entries(patchBuyer).map(([k, v]) => [k, String(v ?? '').trim()])) };
  b.zip = b.zip.replace(/^(\d{3})(\d{4})$/, '$1-$2');
  if (!b.name || (b.zip && !/^\d{3}-\d{4}$/.test(b.zip))) return state;
  return patch(state, packId, { buyer: { name: b.name, zip: b.zip, address: b.address, phone: b.phone } });
}

// 商品をパックに入れる。売れた商品だけ（売価を記録する）。reason: notDraft／unknown／notSold／alreadyShipped／otherWarehouse／inOtherPack。すでに入っていれば already: true
export function addToSalePack(state, master, packId, code, { at = Date.now() } = {}) {
  const pack = draftOf(state, packId);
  if (!pack) return fail(state, 'notDraft');
  const c = String(code ?? '').trim().toUpperCase();
  if (pack.codes.includes(c)) return { ok: true, state, already: true, code: c };
  const row = buildRows(state, at).find((r) => r.unit.code === c);
  const bad = (reason, extra = {}) => ({ ...fail(state, reason), code: c, ...extra });
  if (!row) { const old = replacedCode(state.units, c); return old ? bad('replaced', { newCode: old.to }) : bad('unknown'); }
  if (row.rec?.stage !== 'sold') return bad('notSold');
  if (row.rec.shippedAt) return bad('alreadyShipped');
  if (warehouseIdOf(row.unit, master) !== pack.fromId) return bad('otherWarehouse');
  if (salePacks(state).some((t) => t.status === 'draft' && t.id !== packId && t.codes.includes(c))) return bad('inOtherPack');
  return { ok: true, state: patch(state, packId, { codes: [...pack.codes, c], prices: { ...pack.prices, [c]: row.rec.soldPrice } }), code: c, unit: row.unit };
}

// 発送する。商品が1点以上、配送業者が決まっていること（追跡番号は任意）。reason: notDraft／noItems／noCarrier
export function shipSalePack(state, packId, { tracking = '', by, at = Date.now() }) {
  const pack = draftOf(state, packId);
  if (!pack) return fail(state, 'notDraft');
  if (!pack.codes.length) return fail(state, 'noItems');
  if (!pack.carrier) return fail(state, 'noCarrier');
  const trk = String(tracking ?? '').trim();
  const records = { ...state.records };
  pack.codes.forEach((code) => { records[code] = { ...records[code], shipPackId: packId, shippedAt: at, shippedBy: by, tracking: trk }; });
  return { ok: true, state: patch({ ...state, records }, packId, { status: 'shipped', tracking: trk, sentAt: at, sentBy: by }) };
}
