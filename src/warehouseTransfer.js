// 倉庫間の商品の移動。移動元の倉庫が送る → 輸送中（どちらの倉庫の在庫にも数えない）→ 移動先の倉庫が棚を決めて受け取る。
// 輸送中の間は、送った倉庫だけが取り消せる。操作はすべて新しい state を返す（state は warehouse.js の { units, records, returns, transfers }）。
import { buildRows, replacedCode } from './warehouse.js';
import { warehouseById, activeWarehouses, destinationProblem } from './warehouseMaster.js';
import { CARRIERS, PACK_SIZES } from './shipping.js';

const fail = (state, reason) => ({ ok: false, state, reason });
const newId = (at) => `TR-${at.toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const patch = (state, id, p) => ({ ...state, transfers: (state.transfers ?? []).map((t) => (t.id === id ? { ...t, ...p } : t)) });

// 読み取った（入力した）シールNo.の商品を、送れるかを確かめる。toId が決まっていれば、納入先の規則も確かめる。
// 不可の理由: unknown／replaced（貼り替え済みの古いシール。newCode に新しいNo.）／packing（梱包中。別のパックに入っている）／notStock／otherWarehouse／wrongDestination
export function sendableCheck(state, master, { fromId, toId = '', code, at = Date.now() }) {
  const c = String(code ?? '').trim().toUpperCase();
  const row = buildRows(state, at).find((r) => r.unit.code === c);
  if (!row) {
    const old = replacedCode(state.units, c);
    return old ? { ok: false, code: c, reason: 'replaced', newCode: old.to } : { ok: false, code: c, reason: 'unknown' };
  }
  if (row.stage === 'packing') return { ok: false, code: c, reason: 'packing' };
  if (row.stage !== 'stock') return { ok: false, code: c, reason: 'notStock' };
  if ((row.unit.warehouseId ?? master.warehouses.find((w) => !w.highValue)?.id) !== fromId) return { ok: false, code: c, reason: 'otherWarehouse' };
  if (toId && destinationProblem(master, row.unit, toId)) return { ok: false, code: c, reason: 'wrongDestination' };
  return { ok: true, code: c, unit: row.unit };
}

// 送れるのは、移動元の倉庫にある「在庫」だけ（出品中・委託中・返品対応中・売却済み・輸送中は送れない）。
// 納入先の規則は移動でも守る（高額品は本社へ、高額品以外は本社以外の倉庫へだけ）。
// 送れなかった商品は rejected に理由つきで返す（unknown／notStock／otherWarehouse／wrongDestination）。
export function sendTransfer(state, master, { fromId, toId, codes, by, at = Date.now() }) {
  if (toId === fromId) return fail(state, 'sameWarehouse');
  const to = activeWarehouses(master).find((w) => w.id === toId);
  const from = warehouseById(master, fromId);
  if (!to || !from) return fail(state, 'badDestination');
  const accepted = [];
  const rejected = [];
  codes.forEach((code) => {
    const r = sendableCheck(state, master, { fromId, toId, code, at });
    if (r.ok) accepted.push(r.code);
    else rejected.push({ code, reason: r.reason === 'replaced' ? 'unknown' : r.reason });
  });
  if (!accepted.length) return { ...fail(state, 'noItems'), rejected };
  const transfer = {
    id: newId(at), codes: accepted, fromId, toId, fromName: from.name, toName: to.name,
    status: 'transit', sentAt: at, sentBy: by, receivedAt: null, receivedBy: '', location: null,
  };
  return { ok: true, state: { ...state, transfers: [transfer, ...(state.transfers ?? [])] }, transfer, rejected };
}

// 受け取る。移動先の倉庫担当（receiverWarehouseId）だけが、その倉庫の棚（location）を決めて受け取れる。商品は移動先の倉庫の在庫になる
export function receiveTransfer(state, master, id, { receiverWarehouseId, location, by, at = Date.now() }) {
  const t = (state.transfers ?? []).find((x) => x.id === id);
  if (t?.status !== 'transit') return fail(state, 'notInTransit');
  if (receiverWarehouseId !== t.toId) return fail(state, 'notDestination');
  if (!warehouseById(master, t.toId)?.locations.includes(location)) return fail(state, 'badLocation');
  const units = state.units.map((u) => (t.codes.includes(u.code) ? { ...u, warehouseId: t.toId, location } : u));
  return { ok: true, state: patch({ ...state, units }, id, { status: 'received', receivedAt: at, receivedBy: by, location }) };
}

// 取り消す。送った倉庫（byWarehouseId）だけが、輸送中の間にできる。商品は元の倉庫の在庫に戻る
export function cancelTransfer(state, id, { byWarehouseId, at = Date.now() }) {
  const t = (state.transfers ?? []).find((x) => x.id === id);
  if (t?.status !== 'transit') return fail(state, 'notInTransit');
  if (byWarehouseId !== t.fromId) return fail(state, 'notSender');
  return { ok: true, state: patch(state, id, { status: 'cancelled', cancelledAt: at }) };
}

// ---- 送るパック（梱包 → 明細・発送伝票の出力 → 発送）---------------------------------------
// パック（transfers の status: 'draft'）に、商品を探して入れ、配送業者・サイズを決め、明細・発送伝票を出力して発送する（発送すると 'transit'）。
// 梱包中の商品は「梱包中」になり、出品・返品・別のパックには使えない。パックは、荷物（1つの発送）で、個口数（箱の数）を持つ。
export function createPack(state, master, { fromId, toId, by, at = Date.now() }) {
  if (toId === fromId) return fail(state, 'sameWarehouse');
  const to = activeWarehouses(master).find((w) => w.id === toId);
  const from = warehouseById(master, fromId);
  if (!to || !from) return fail(state, 'badDestination');
  const pack = {
    id: newId(at), kind: 'transfer', codes: [], fromId, toId, fromName: from.name, toName: to.name, status: 'draft', createdAt: at, createdBy: by,
    carrier: '', size: '', boxes: 1, note: '', tracking: '', listPrintedAt: null, labelPrintedAt: null,
    sentAt: null, sentBy: '', receivedAt: null, receivedBy: '', location: null,
  };
  return { ok: true, state: { ...state, transfers: [pack, ...(state.transfers ?? [])] }, pack };
}

const draftOf = (state, id) => (state.transfers ?? []).find((t) => t.id === id && t.status === 'draft');

// 商品をパックに入れる（QR読取・検索）。理由: notDraft／unknown／replaced／inOtherPack／notStock／otherWarehouse／wrongDestination。すでに入っていれば already: true
export function addToPack(state, master, packId, code, { at = Date.now() } = {}) {
  const pack = draftOf(state, packId);
  if (!pack) return fail(state, 'notDraft');
  const c = String(code ?? '').trim().toUpperCase();
  if (pack.codes.includes(c)) return { ok: true, state, already: true, code: c };
  const r = sendableCheck(state, master, { fromId: pack.fromId, toId: pack.toId, code: c, at });
  if (!r.ok) return { ...fail(state, r.reason === 'packing' ? 'inOtherPack' : r.reason), code: c, newCode: r.newCode };
  return { ok: true, state: patch(state, packId, { codes: [...pack.codes, r.code] }), code: r.code, unit: r.unit };
}

export function removeFromPack(state, packId, code) {
  const pack = draftOf(state, packId);
  const c = String(code ?? '').trim().toUpperCase();
  if (!pack?.codes.includes(c)) return state;
  const { [c]: _price, ...prices } = pack.prices ?? {}; // 委託のパックなら、希望価格も消す
  return patch(state, packId, { codes: pack.codes.filter((x) => x !== c), ...(pack.prices ? { prices } : {}) });
}

// 配送業者・サイズ・個口数・メモを設定する。正しくない値が1つでもあれば、何も変えない
export function updatePack(state, packId, { carrier, size, boxes, note }) {
  if (!draftOf(state, packId)) return state;
  const p = {};
  if (carrier !== undefined) { if (!CARRIERS.some((c) => c.key === carrier)) return state; p.carrier = carrier; }
  if (size !== undefined) { if (!PACK_SIZES.includes(String(size))) return state; p.size = String(size); }
  if (boxes !== undefined) { const n = Number(boxes); if (!Number.isInteger(n) || n < 1) return state; p.boxes = n; }
  if (note !== undefined) p.note = String(note).trim().slice(0, 200);
  return patch(state, packId, p);
}

// 明細（list）・発送伝票（label）を出力した日時を残す（発送前の確認用）
export function markPrinted(state, packId, kind, at = Date.now()) {
  if (!draftOf(state, packId) || !['list', 'label'].includes(kind)) return state;
  return patch(state, packId, { [`${kind}PrintedAt`]: at });
}

// 発送する。商品が1点以上、配送業者が決まっていること。master を渡すと、梱包中に状態（シールの色など）が変わった商品がないかも、もう一度確かめる
// （問題があれば rejected に理由つきで返し、発送しない）。追跡番号は任意
export function shipPack(state, packId, { tracking = '', by, at = Date.now(), master = null }) {
  const pack = draftOf(state, packId);
  if (!pack) return fail(state, 'notDraft');
  if ((pack.kind ?? 'transfer') !== 'transfer') return fail(state, 'wrongKind'); // 委託・販売のパックは、それぞれの発送（warehouseConsign.js／warehouseSale.js）で行う
  if (!pack.codes.length) return fail(state, 'noItems');
  if (!pack.carrier) return fail(state, 'noCarrier');
  const rejected = pack.codes.flatMap((code) => {
    const u = state.units.find((x) => x.code === code);
    const why = !u ? 'unknown' : master && destinationProblem(master, u, pack.toId) ? 'wrongDestination' : '';
    return why ? [{ code, reason: why }] : [];
  });
  if (rejected.length) return { ...fail(state, rejected[0].reason), rejected };
  return { ok: true, state: patch(state, packId, { status: 'transit', tracking: String(tracking ?? '').trim(), sentAt: at, sentBy: by }) };
}

// 梱包中のパックを破棄する（商品は在庫に戻る）。発送したパックは、取り消し（cancelTransfer）を使う
export function discardPack(state, packId) {
  if (!draftOf(state, packId)) return fail(state, 'notDraft');
  return { ok: true, state: { ...state, transfers: state.transfers.filter((t) => t.id !== packId) } };
}

// 梱包中のパックの一覧。kind は 'transfer'（倉庫間移動。既定）か 'consign'（業者への委託）
export const drafts = (state, warehouseId, kind = 'transfer') => (state.transfers ?? []).filter((t) => t.status === 'draft' && t.fromId === warehouseId && (t.kind ?? 'transfer') === kind);

export const incoming = (state, warehouseId) => (state.transfers ?? []).filter((t) => t.status === 'transit' && t.toId === warehouseId);
export const outgoing = (state, warehouseId) => (state.transfers ?? []).filter((t) => t.status === 'transit' && t.fromId === warehouseId);
