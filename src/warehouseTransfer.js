// 倉庫間の商品の移動。移動元の倉庫が送る → 輸送中（どちらの倉庫の在庫にも数えない）→ 移動先の倉庫が棚を決めて受け取る。
// 輸送中の間は、送った倉庫だけが取り消せる。操作はすべて新しい state を返す（state は warehouse.js の { units, records, returns, transfers }）。
import { buildRows, replacedCode } from './warehouse.js';
import { warehouseById, activeWarehouses, destinationProblem } from './warehouseMaster.js';

const fail = (state, reason) => ({ ok: false, state, reason });
const newId = (at) => `TR-${at.toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const patch = (state, id, p) => ({ ...state, transfers: (state.transfers ?? []).map((t) => (t.id === id ? { ...t, ...p } : t)) });

// 読み取った（入力した）シールNo.の商品を、送れるかを確かめる。toId が決まっていれば、納入先の規則も確かめる。
// 不可の理由: unknown／replaced（貼り替え済みの古いシール。newCode に新しいNo.）／notStock／otherWarehouse／wrongDestination
export function sendableCheck(state, master, { fromId, toId = '', code, at = Date.now() }) {
  const c = String(code ?? '').trim().toUpperCase();
  const row = buildRows(state, at).find((r) => r.unit.code === c);
  if (!row) {
    const old = replacedCode(state.units, c);
    return old ? { ok: false, code: c, reason: 'replaced', newCode: old.to } : { ok: false, code: c, reason: 'unknown' };
  }
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

// 受け取る。移動先の倉庫の担当者（receiverWarehouseId）だけが、その倉庫の棚（location）を決めて受け取れる。商品は移動先の倉庫の在庫になる
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

export const incoming = (state, warehouseId) => (state.transfers ?? []).filter((t) => t.status === 'transit' && t.toId === warehouseId);
export const outgoing = (state, warehouseId) => (state.transfers ?? []).filter((t) => t.status === 'transit' && t.fromId === warehouseId);
