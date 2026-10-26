// 倉庫・物流のデータとロジック。買い取った商品（stock.js の入庫データ）を、フリマ・業者に販売し、売上を管理する。
// お客様からのクーリングオフによる返品の対応も扱う（買取から10日間は、販売せずに保管する）。依頼はコールセンターの受電で作り、倉庫が回答・返送・完了する。
// 外部の市場（業者オークション）への販売は「委託」。委託中の商品は倉庫になく、売れたら代金が戻り、売れ残ったら倉庫に戻る。
// 倉庫間の移動（transfers）は warehouseTransfer.js。移動中の商品は「輸送中」になり、どちらの倉庫の在庫にも数えない。
// 状態（state）は { units: 入庫データ, records: 出品・売却の記録（商品No.→記録）, returns: 返品の記録, transfers: 移動の記録 }。操作はすべて新しい state を返す。
import { WAREHOUSE_KEY, RETURN_KEY, TRANSFER_KEY } from './store.js';
import { loadUnits, SEAL_COLORS, sealColorOf } from './stock.js';
import { carrierOf } from './shipping.js';
import { dateKey } from './workday.js';
import { warehouseIdOf, honshaOf, isHighValue } from './warehouseMaster.js';

// 法律上のクーリングオフは、書面を受け取った日から8日間。お客様の通知は郵送で届くため、余裕を見て10日間は販売せず保管する（返品もこの間は受け付ける）
export const COOLING_OFF_DAYS = 10;
export const dateOf = (ms) => dateKey(new Date(ms));

// 手数料率はダミー。フリマは売れた金額から、業者オークションは落札手数料
export const CHANNELS = [
  { key: 'mercari', label: 'メルカリ', type: 'flea', rate: 0.1 },
  { key: 'yahoo', label: 'ヤフオク', type: 'flea', rate: 0.1 },
  { key: 'rakuma', label: 'ラクマ', type: 'flea', rate: 0.066 },
  { key: 'auction', label: '業者オークション', type: 'trade', rate: 0.03, consign: true }, // 委託手数料
  { key: 'direct', label: '業者へ直接販売', type: 'trade', rate: 0 },
];
export const channelOf = (key) => CHANNELS.find((c) => c.key === key);
// 出品価格の目安: 原価の1.3倍を、千円単位に切り上げ
export const suggestPrice = (unit) => Math.ceil((unit.price * 1.3) / 1000) * 1000;
export const feeFor = (key, price) => Math.round(price * (channelOf(key)?.rate ?? 0));

export const RETURN_REASONS = [
  { key: 'family', label: '家族に反対された' },
  { key: 'price', label: '金額に納得できない' },
  { key: 'regret', label: '手放したくなくなった' },
  { key: 'other', label: 'その他' },
];
export const reasonOf = (key) => RETURN_REASONS.find((r) => r.key === key) ?? { key, label: key };

export const STAGES = {
  incoming: '入庫待ち', missing: '所在不明', stock: '在庫', listed: '出品中', packing: '梱包中', transit: '輸送中', consigned: '委託中', sold: '売却済み', returning: '返品対応中', returned: '返品済み',
};

// ---- 保存 -------------------------------------------------------------------
const read = (key, fallback, valid) => {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return valid(v) ? v : fallback;
  } catch {
    return fallback;
  }
};
const write = (key, v) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
};
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export const loadRecords = () => read(WAREHOUSE_KEY, {}, isObj);
export const saveRecords = (records) => write(WAREHOUSE_KEY, records);
export const loadReturns = () => read(RETURN_KEY, [], Array.isArray);
export const saveReturns = (returns) => write(RETURN_KEY, returns);
export const loadTransfers = () => read(TRANSFER_KEY, [], Array.isArray);
export const saveTransfers = (transfers) => write(TRANSFER_KEY, transfers);
export const loadState = () => ({ units: loadUnits(), records: loadRecords(), returns: loadReturns(), transfers: loadTransfers() });
// 入庫データ（units）は、入庫・移動の受取のときに、stock.js の saveUnits で別に保存する
export const saveState = (s) => saveRecords(s.records) && saveReturns(s.returns) && saveTransfers(s.transfers ?? []);

// ---- クーリングオフ -----------------------------------------------------------
// 買取日（書面を受け取った日）を1日目として10日目まで
export function coolingOffEnd(date) {
  const [y, m, d] = date.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + COOLING_OFF_DAYS - 1));
}
// 店頭買取（お客様が店舗に持ち込んだ商品）は、クーリングオフの対象外なので、保管期間がない
export const isStorePurchase = (unit) => unit.channel === 'store';
export const inCoolingOff = (unit, now = Date.now()) => !isStorePurchase(unit) && dateOf(now) <= coolingOffEnd(unit.date);

// ---- 一覧用の行 ---------------------------------------------------------------
// 返品の依頼がある商品の状態。問い合わせ中（inquiring）は、倉庫が回答するまで商品の状態を変えない（在庫だけ、出品できないよう止める）。対応不可（unavailable）は、状態に影響しない
const returnStages = (returns) => {
  const map = new Map();
  returns.filter((r) => r.status !== 'unavailable').forEach((r) => r.codes.forEach((c) => map.set(c, r.status === 'done' ? 'returned' : r.status === 'inquiring' ? 'inquiring' : 'returning')));
  return map;
};

export function buildRows({ units, records, returns, transfers = [] }, now = Date.now()) {
  const rs = returnStages(returns);
  const inTransit = new Set(transfers.filter((t) => t.status === 'transit').flatMap((t) => t.codes));
  const inPacking = new Set(transfers.filter((t) => t.status === 'draft' && (t.kind ?? 'transfer') !== 'sale').flatMap((t) => t.codes)); // 倉庫間移動・委託の、梱包中のパック（売れた商品の発送は、売却済みのまま）
  return units.map((unit) => {
    const rec = records[unit.code] ?? null;
    const base = inTransit.has(unit.code) ? 'transit' : inPacking.has(unit.code) ? 'packing' : rec ? rec.stage : unit.status === 'pending' ? 'incoming' : unit.status === 'missing' ? 'missing' : 'stock';
    const ret = rs.get(unit.code);
    const stage = ret === 'inquiring' ? (base === 'stock' ? 'returning' : base) : ret ?? base;
    const cooling = inCoolingOff(unit, now);
    return { unit, rec, stage, cooling, coolEnd: coolingOffEnd(unit.date), canList: stage === 'stock' && !cooling };
  });
}

// ---- シールの貼り替え -------------------------------------------------------------
// シールの色が変わる（間違えていた）と、シールそのものが別になるため、商品のシールNo.（ID）も新しくなる。古いNo.・色は unit.relabels に残す。
// 貼り替えられるのは、入庫前・所在不明・在庫の商品だけ。reason: unknown／badCode／sameCode／dupCode／badColor／notRelabelable
export function relabelUnit(state, code, { newCode, color, by = '', at = Date.now() }) {
  const unit = state.units.find((u) => u.code === code);
  if (!unit) return fail(state, 'unknown');
  const next = String(newCode ?? '').trim().toUpperCase();
  if (!next) return fail(state, 'badCode');
  if (next === code) return fail(state, 'sameCode');
  if (state.units.some((u) => u.code === next || (u.relabels ?? []).some((r) => r.from === next))) return fail(state, 'dupCode');
  if (!sealColorOf(color)) return fail(state, 'badColor');
  if (!['incoming', 'missing', 'stock'].includes(rowOf(state, code, at).stage)) return fail(state, 'notRelabelable');
  const swap = (c) => (c === code ? next : c);
  const entry = { from: code, to: next, fromColor: unit.sealColor ?? null, toColor: color, by, at };
  return {
    ok: true,
    state: {
      ...state,
      units: state.units.map((u) => (u.code === code ? { ...u, code: next, sealColor: color, relabels: [...(u.relabels ?? []), entry] } : u)),
      records: Object.fromEntries(Object.entries(state.records).map(([k, v]) => [swap(k), v])),
      returns: state.returns.map((r) => ({ ...r, codes: r.codes.map(swap) })),
      transfers: (state.transfers ?? []).map((t) => ({ ...t, codes: t.codes.map(swap) })),
    },
  };
}

// 貼り替え済みの古いシールNo.なら、{ from, to: いまのNo. }。そうでなければ null（読み取ったとき、新しいNo.を知らせる）
export function replacedCode(units, raw) {
  const from = String(raw ?? '').trim().toUpperCase();
  const unit = from ? units.find((u) => (u.relabels ?? []).some((r) => r.from === from)) : null;
  return unit ? { from, to: unit.code } : null;
}

// 倉庫で絞り込む（scope は 'all' か倉庫ID）。倉庫の在庫は、その倉庫に入庫した商品。入庫前の商品は、どの倉庫にも属さない
export function scopeState(state, scope, master) {
  if (scope === 'all') return state;
  const units = state.units.filter((u) => u.status === 'stored' && warehouseIdOf(u, master) === scope);
  const codes = new Set(units.map((u) => u.code));
  return { ...state, units, returns: state.returns.filter((r) => (r.warehouseId ? r.warehouseId === scope : r.codes.some((c) => codes.has(c)))) };
}

// 倉庫ごとの、いま保管している商品（在庫・出品中・委託中・返品対応中）の点数と原価
export function holdingByWarehouse(state, master, now = Date.now()) {
  const by = {};
  buildRows(state, now).filter((r) => ['stock', 'listed', 'consigned', 'returning'].includes(r.stage)).forEach((r) => {
    const id = warehouseIdOf(r.unit, master);
    const cur = by[id] ?? { count: 0, cost: 0 };
    by[id] = { count: cur.count + 1, cost: cur.cost + r.unit.price };
  });
  return by;
}

// 買取日・お客様（契約）ごとのまとまり。最初は買取日単位・お客様単位に保管するため、新しい買取日から並べる
export function lotsOf(rows) {
  const lots = [];
  [...rows].sort((a, b) => b.unit.date.localeCompare(a.unit.date) || a.unit.at - b.unit.at).forEach((r) => {
    const lot = lots.find((l) => l.visitId === r.unit.visitId && l.date === r.unit.date);
    if (lot) lot.rows.push(r);
    else lots.push({ date: r.unit.date, visitId: r.unit.visitId, customerName: r.unit.customerName, userId: r.unit.userId, channel: r.unit.channel, storeId: r.unit.storeId, rows: [r] });
  });
  return lots.map((l) => ({ ...l, total: sumBy(l.rows, (r) => r.unit.price) }));
}

// 同じ契約（同じ訪問）で、一緒に買い取った他の商品
export const siblingsOf = (rows, code) => {
  const me = rows.find((r) => r.unit.code === code);
  return me ? rows.filter((r) => r.unit.visitId === me.unit.visitId && r.unit.code !== code) : [];
};

// シールNo.（QR読取・手入力）で、1点を探す。前後の空白・大文字小文字は無視
export function findByCode(rows, raw) {
  const code = String(raw ?? '').trim().toUpperCase();
  return code ? rows.find((r) => r.unit.code.toUpperCase() === code) ?? null : null;
}

// 1点の履歴（買取から、入庫・出品・売却・返品まで）を時系列に並べる。detail は画面に出す説明文
export function historyOf({ units, records, returns, transfers = [] }, code) {
  const unit = units.find((u) => u.code === code);
  if (!unit) return [];
  const yen = (n) => `${Number(n).toLocaleString('ja-JP')}円`;
  const rec = records[code];
  const events = [{ at: unit.at, label: '買取', detail: `${unit.customerName} 様／${yen(unit.price)}` }];
  const moved = transfers.some((t) => t.status === 'received' && t.codes.includes(code));
  if (unit.storedAt) {
    events.push({ at: unit.storedAt, label: '入庫', detail: `${moved ? '' : `${unit.location}／`}入庫 ${unit.by}${unit.check ? `（照合 ${unit.check.by}）` : '（倉庫での照合なし）'}` });
  }
  if (rec) {
    const ch = channelOf(rec.channel);
    const target = rec.vendor ? `${ch?.label}（委託先 ${rec.vendor}）` : ch?.label;
    const pack = rec.packId ? transfers.find((t) => t.id === rec.packId) : null; // 委託のパック（配送の情報）
    const ship = pack ? `／配送: ${carrierOf(pack.carrier)?.label ?? ''}${pack.tracking ? ` 追跡番号 ${pack.tracking}` : ''}` : '';
    events.push({ at: rec.listedAt, label: ch?.consign ? '委託' : '出品', detail: `${target}／${yen(rec.listPrice)}${rec.listedBy ? `／${rec.listedBy}` : ''}${ship}` });
    if (rec.stage === 'sold') events.push({ at: rec.soldAt, label: '売却', detail: `${yen(rec.soldPrice)}／手数料 ${yen(rec.fee)}・送料 ${yen(rec.shipping)}${rec.soldBy ? `／${rec.soldBy}` : ''}` });
    if (rec.shippedAt) { // 購入者への発送
      const sp = transfers.find((t) => t.id === rec.shipPackId);
      events.push({ at: rec.shippedAt, label: '購入者へ発送', detail: `${sp?.buyer?.name ?? rec.buyer ?? ''} 様／${carrierOf(sp?.carrier)?.label ?? ''}${rec.tracking ? ` 追跡番号 ${rec.tracking}` : ''}${rec.shippedBy ? `／${rec.shippedBy}` : ''}` });
    }
  }
  (unit.relabels ?? []).forEach((r) => events.push({ at: r.at, label: 'シール貼り替え', detail: `${r.from}（${sealColorOf(r.fromColor)?.label ?? '未選択'}）→ ${r.to}（${sealColorOf(r.toColor)?.label ?? '未選択'}）${r.by ? `／${r.by}` : ''}` }));
  transfers.filter((t) => t.codes.includes(code) && ['transit', 'received'].includes(t.status)).forEach((t) => { // 梱包中（まだ発送していない）は、履歴に出さない
    events.push({ at: t.sentAt, label: '移動（送付）', detail: `${t.fromName} → ${t.toName}／${t.sentBy}` });
    if (t.status === 'received') events.push({ at: t.receivedAt, label: '移動（受取）', detail: `${t.toName}／${t.location}／${t.receivedBy}` });
  });
  returns.filter((r) => r.codes.includes(code)).forEach((r) => {
    events.push({ at: r.requestedAt, label: '返品受付', detail: `${reasonOf(r.reason).label}${r.requestedBy ? `／${r.requestedBy}` : ''}` });
    if (r.inquiry?.answeredAt) events.push({ at: r.inquiry.answeredAt, label: '倉庫が回答', detail: `${r.inquiry.ok ? '返送できる' : '対応できない'}${r.inquiry.note ? `（${r.inquiry.note}）` : ''}${r.inquiry.answeredBy ? `／${r.inquiry.answeredBy}` : ''}` });
    if (r.shippedAt) events.push({ at: r.shippedAt, label: '返送', detail: `追跡番号 ${r.tracking}${r.shippedBy ? `／${r.shippedBy}` : ''}` });
    if (r.doneAt) events.push({ at: r.doneAt, label: '返品完了', detail: `買取代金 ${yen(r.refund)} の返還を確認${r.doneBy ? `／${r.doneBy}` : ''}` });
  });
  return events.sort((a, b) => a.at - b.at);
}

export function stockSummary(rows) {
  const count = (stage) => rows.filter((r) => r.stage === stage).length;
  const held = rows.filter((r) => r.stage === 'stock' || r.stage === 'listed');
  return {
    incoming: count('incoming'), missing: count('missing'), transit: count('transit'), packing: count('packing'), stock: count('stock'), listed: count('listed'), consigned: count('consigned'), sold: count('sold'), returning: count('returning'), returned: count('returned'),
    cooling: rows.filter((r) => r.stage === 'stock' && r.cooling).length,
    inventoryCost: held.reduce((n, r) => n + r.unit.price, 0), // 倉庫にある在庫の原価
    consignedCost: rows.filter((r) => r.stage === 'consigned').reduce((n, r) => n + r.unit.price, 0),
  };
}

// ---- 出品・売却 -----------------------------------------------------------------
// 操作した倉庫担当の名前（指定されたときだけ記録する）
const who = (key, by) => (by ? { [key]: by } : {});
const fail = (state, reason) => ({ ok: false, state, reason });
const withRecord = (state, code, rec) => ({ ...state, records: { ...state.records, [code]: rec } });
const OPEN = ['listed', 'consigned']; // 販売中（売れる）状態
const rowOf = (state, code, now) => buildRows(state, now).find((r) => r.unit.code === code);

export function listItem(state, code, { channel, price, vendor = '', at = Date.now(), by = '' }) {
  const row = rowOf(state, code, at);
  if (!row || !row.canList) return fail(state, 'notListable');
  if (!channelOf(channel) || !(price > 0)) return fail(state, 'badInput');
  const rec = { stage: 'listed', channel, listPrice: price, listedAt: at, ...who('listedBy', by) };
  return { ok: true, state: withRecord(state, code, channelOf(channel).consign ? { ...rec, stage: 'consigned', vendor: vendor.trim() } : rec) };
}

export function reprice(state, code, price) {
  const rec = state.records[code];
  return OPEN.includes(rec?.stage) && price > 0 ? withRecord(state, code, { ...rec, listPrice: price }) : state;
}

// 出品の取り下げ（在庫に戻る）。売却済みは戻せない
export function delist(state, code) {
  if (state.records[code]?.stage !== 'listed') return state;
  const { [code]: _removed, ...records } = state.records;
  return { ...state, records };
}

export function sell(state, code, { price, shipping = 0, buyer = '', fee, at = Date.now(), by = '' }) {
  const rec = state.records[code];
  if (!OPEN.includes(rec?.stage)) return fail(state, rec ? 'alreadySold' : 'notListed');
  if (!(price > 0) || shipping < 0) return fail(state, 'badInput');
  return { ok: true, state: withRecord(state, code, { ...rec, stage: 'sold', soldAt: at, soldPrice: price, fee: fee ?? feeFor(rec.channel, price), shipping, buyer, ...who('soldBy', by) }) };
}

// 委託の売れ残りが倉庫に戻った（在庫に戻る）。委託中のものだけ
export function recall(state, code) {
  if (state.records[code]?.stage !== 'consigned') return state;
  const { [code]: _removed, ...records } = state.records;
  return { ...state, records };
}

// ---- 売上 -----------------------------------------------------------------------
export function salesRows({ units, records }) {
  return units.filter((u) => records[u.code]?.stage === 'sold').map((unit) => {
    const rec = records[unit.code];
    return {
      unit, rec, date: dateOf(rec.soldAt), revenue: rec.soldPrice, cost: unit.price, fee: rec.fee, shipping: rec.shipping,
      profit: rec.soldPrice - unit.price - rec.fee - rec.shipping,
    };
  }).sort((a, b) => b.rec.soldAt - a.rec.soldAt);
}

const sumBy = (rows, f) => rows.reduce((n, r) => n + f(r), 0);
const group = (rows, keyOf, labelOf) => {
  const keys = [...new Set(rows.map(keyOf))];
  return keys.map((key) => {
    const g = rows.filter((r) => keyOf(r) === key);
    return { key, label: labelOf(key), count: g.length, revenue: sumBy(g, (r) => r.revenue), profit: sumBy(g, (r) => r.profit) };
  }).sort((a, b) => b.revenue - a.revenue);
};

// period は 'YYYY-MM-DD'（その日）か 'YYYY-MM'（その月）。空なら全期間
export function salesStats(rows, period = '') {
  const list = rows.filter((r) => r.date.startsWith(period));
  const revenue = sumBy(list, (r) => r.revenue);
  const profit = sumBy(list, (r) => r.profit);
  return {
    rows: list, count: list.length, revenue, cost: sumBy(list, (r) => r.cost), fee: sumBy(list, (r) => r.fee), shipping: sumBy(list, (r) => r.shipping),
    profit, margin: revenue ? profit / revenue : 0,
    byChannel: group(list, (r) => r.rec.channel, (k) => channelOf(k)?.label ?? k),
    byCategory: group(list, (r) => r.unit.category, (k) => k),
  };
}

// 会社全体の売上を、倉庫別に分ける（売上の多い順）。売れた商品の倉庫は、入庫（移動した場合は受取）した倉庫
export const salesByWarehouse = (rows, master) => group(rows, (r) => warehouseIdOf(r.unit, master), (id) => master.warehouses.find((w) => w.id === id)?.name ?? id);

// ---- クーリングオフ依頼（コールセンターが受電して作り、倉庫が回答・返送・完了する）-------------------------
// 流れ: inquiring（倉庫に問い合わせ中）→ requested（返送の準備中）→ shipped（返送済み・代金の返還待ち）→ done（完了）。
// 倉庫が対応できないと答えた依頼と、売却済みの商品の依頼は unavailable（対応不可）で終わる。
export const isOpenReturn = (r) => ['inquiring', 'requested', 'shipped'].includes(r.status);

// 商品を、受け付けられるかの目安に分ける。ok: 在庫・期間内／expired: 期間超過（倉庫が個別に判断）／ask: 出品中・入庫前などで、倉庫に確認／
// sold: 売却済み（対応不可）／busy: すでに依頼中／returned: 返品済み／wait: 輸送中・梱包中（届く・発送が済むまで依頼できない）
export function cooloffCheck(row, busy = false) {
  if (isStorePurchase(row.unit)) return { kind: 'store', label: '店頭買取（クーリング・オフの対象外）' };
  if (busy) return { kind: 'busy', label: 'すでに依頼中' };
  if (row.stage === 'returned') return { kind: 'returned', label: '返品済み' };
  if (row.stage === 'sold') return { kind: 'sold', label: '売却済み（対応不可）' };
  if (row.stage === 'transit') return { kind: 'wait', label: '輸送中（届いてから依頼）' };
  if (row.stage === 'packing') return { kind: 'wait', label: '梱包中（発送が済んでから依頼）' };
  if (row.stage === 'stock') return row.cooling ? { kind: 'ok', label: '在庫・期間内' } : { kind: 'expired', label: '期間超過（倉庫が個別に判断）' };
  return { kind: 'ask', label: `${STAGES[row.stage] ?? row.stage}（倉庫に確認）` };
}

// 電話で聞いた手がかりで探して、契約（訪問）ごとにまとめる。criteria: { q: お客様名・電話番号（4桁以上の数字）・シールNo.・商品名・カテゴリ（空白は無視）, dates: 買取日（複数可）, category }。
// 文字列なら q として扱う。条件が何もなければ空。カテゴリを指定すると、その商品だけを出す
export function cooloffContracts(state, criteria, now = Date.now()) {
  const c = typeof criteria === 'string' ? { q: criteria } : criteria ?? {};
  const squash = (v) => String(v ?? '').replace(/\s+/g, '').toLowerCase();
  const q = squash(c.q);
  const qDigits = q.replace(/\D/g, '');
  const byPhone = /^[\d\-()+]+$/.test(q) && qDigits.length >= 4; // 数字（ハイフン可）の4桁以上は、電話番号として探す
  const dates = c.dates ?? [];
  const category = c.category ?? '';
  if (!q && !dates.length && !category) return [];
  const busy = new Set(state.returns.filter(isOpenReturn).flatMap((r) => r.codes));
  const rows = buildRows(state, now).filter((r) => (!dates.length || dates.includes(r.unit.date)) && (!category || r.unit.category === category))
    .map((r) => ({ ...r, check: cooloffCheck(r, busy.has(r.unit.code)) }));
  const matches = (r) => (byPhone ? (r.unit.phones ?? []).some((p) => p.replace(/\D/g, '').includes(qDigits)) : [r.unit.customerName, r.unit.code, r.unit.name, r.unit.category].some((t) => squash(t).includes(q)));
  const hit = new Set(rows.filter((r) => !q || matches(r)).map((r) => r.unit.visitId));
  return [...hit].map((visitId) => {
    const list = rows.filter((r) => r.unit.visitId === visitId);
    const { customerName, date } = list[0].unit;
    return { visitId, customerName, date, phones: [...new Set(list.flatMap((r) => r.unit.phones ?? []))], coolEnd: coolingOffEnd(date), store: list.every((r) => isStorePurchase(r.unit)), rows: list, total: sumBy(list, (r) => r.unit.price) };
  }).sort((a, b) => b.date.localeCompare(a.date) || a.customerName.localeCompare(b.customerName));
}

// 直近 n 日の、買取日ごとの契約（訪問）の数。「先週の金曜日に」のような手がかりで、日を選べるようにする
export function purchaseDays(state, now = Date.now(), n = 14) {
  const WEEK = '日月火水木金土';
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
    const date = dateKey(day);
    return { date, label: `${day.getMonth() + 1}/${day.getDate()}(${WEEK[day.getDay()]})`, count: new Set(state.units.filter((u) => u.date === date).map((u) => u.visitId)).size };
  });
}

const newReturnId = (at) => `RT-${at.toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

// 問い合わせを受ける倉庫。入庫前の商品は、納入先になる倉庫（高額品は本社）
export const inquiryWarehouseId = (unit, master) => (unit.status === 'stored' || !isHighValue(unit, master) ? warehouseIdOf(unit, master) : honshaOf(master)?.id ?? warehouseIdOf(unit, master));

// 受電した依頼を作る。受け付けられない商品は rejected に理由つきで返す（unknown／inProgress／returned／inTransit／inPacking）。売却済みの商品は、対応不可の依頼として記録する。
// master を渡すと、商品が複数の倉庫（本社を含む）に分かれている契約は、倉庫ごとの依頼に分け、groupId で同じ契約として結びつける
export function requestReturn(state, { customerName, phone = '', codes, reason, memo = '', at = Date.now(), by = '', master = null }) {
  const rows = buildRows(state, at);
  const busy = new Set(state.returns.filter(isOpenReturn).flatMap((r) => r.codes));
  const accepted = [];
  const sold = [];
  const rejected = [];
  codes.forEach((code) => {
    const row = rows.find((r) => r.unit.code === code);
    const kind = row ? cooloffCheck(row, busy.has(code)).kind : 'unknown';
    if (kind === 'sold') sold.push(row.unit);
    else if (kind === 'wait') rejected.push({ code, reason: row.stage === 'transit' ? 'inTransit' : 'inPacking' });
    else if (['unknown', 'busy', 'returned'].includes(kind)) rejected.push({ code, reason: kind === 'busy' ? 'inProgress' : kind });
    else accepted.push(row.unit);
  });
  if (!accepted.length && !sold.length) return { ok: false, state, rejected };
  const groups = master ? [...new Set(accepted.map((u) => inquiryWarehouseId(u, master)))].map((id) => [id, accepted.filter((u) => inquiryWarehouseId(u, master) === id)]) : accepted.length ? [[undefined, accepted]] : [];
  const groupId = newReturnId(at);
  const groupRefund = sumBy(accepted, (u) => u.price);
  const base = { customerName, phone, reason, memo, requestedAt: at, shippedAt: null, tracking: '', doneAt: null, ...who('requestedBy', by) };
  const rets = groups.map(([warehouseId, list]) => ({
    ...base, id: groups.length === 1 ? groupId : newReturnId(at), codes: list.map((u) => u.code), refund: sumBy(list, (u) => u.price), status: 'inquiring',
    inquiry: { askedAt: at, ...who('askedBy', by) }, expiredCodes: list.filter((u) => !inCoolingOff(u, at)).map((u) => u.code),
    ...(master ? { warehouseId, groupId, groupRefund } : {}),
  }));
  if (sold.length) rets.push({ ...base, id: newReturnId(at), codes: sold.map((u) => u.code), refund: sumBy(sold, (u) => u.price), status: 'unavailable', unavailable: { reason: 'sold', note: '売却済み', at, ...who('by', by) } });
  return { ok: true, state: { ...state, returns: [...rets, ...state.returns] }, ret: rets[0], rets, rejected };
}

const patchReturn = (state, id, patch) => ({ ...state, returns: state.returns.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

// ---- 依頼のやり取り（チャット）と、一覧 ------------------------------------------------
// コールセンターと倉庫が、依頼ごとに自由にメッセージを送り合える。side: callcenter／warehouse。完了・対応不可の後も送れる
export function addReturnMessage(state, id, { side, text, by = '', at = Date.now() }) {
  const body = String(text ?? '').trim();
  if (!body || !['callcenter', 'warehouse'].includes(side) || !state.returns.some((r) => r.id === id)) return state;
  return patchReturn(state, id, { messages: [...(state.returns.find((r) => r.id === id).messages ?? []), { side, text: body, ...who('by', by), at }] });
}

// 時系列のやり取り。出来事（受電・回答・返送・完了）と、自由なメッセージを合わせる。side: callcenter／warehouse／system
export function returnTimeline(ret) {
  const n = ret.codes.length;
  const yen = (v) => `${Number(v).toLocaleString('ja-JP')}円`;
  const ev = [{ at: ret.requestedAt, side: 'callcenter', by: ret.requestedBy ?? '', kind: 'request',
    text: `クーリングオフの依頼です（${n}点）。理由: ${reasonOf(ret.reason).label}${ret.phone ? `／電話 ${ret.phone}` : ''}${ret.memo ? `\n受電メモ: ${ret.memo}` : ''}${ret.expiredCodes?.length ? '\n期間（10日間）を過ぎた商品を含みます。' : ''}` }];
  const inq = ret.inquiry;
  if (inq?.answeredAt) ev.push({ at: inq.answeredAt, side: 'warehouse', by: inq.answeredBy ?? '', kind: 'answer', text: `${inq.ok ? '返送できます。' : '対応できません。'}${inq.note ?? ''}` });
  if (ret.unavailable?.reason === 'sold') ev.push({ at: ret.unavailable.at, side: 'system', by: '', kind: 'sold', text: '売却済みのため、対応できません。' });
  if (ret.shippedAt) ev.push({ at: ret.shippedAt, side: 'warehouse', by: ret.shippedBy ?? '', kind: 'ship', text: `返送しました。追跡番号 ${ret.tracking}` });
  if (ret.doneAt) ev.push({ at: ret.doneAt, side: 'warehouse', by: ret.doneBy ?? '', kind: 'done', text: `お客様から買取代金（${yen(ret.refund)}）の返還を確認しました。完了です。` });
  (ret.messages ?? []).forEach((m) => ev.push({ at: m.at, side: m.side, by: m.by ?? '', kind: 'message', text: m.text }));
  return ev.map((e, i) => ({ ...e, i })).sort((a, b) => a.at - b.at || a.i - b.i).map(({ i, ...e }) => e);
}

// 倉庫の未対応の目印: 回答待ち／返送待ち／コールセンターからの未返信のメッセージ（倉庫の最後の対応より新しいもの）
export function returnAlerts(ret) {
  const alerts = ret.status === 'inquiring' ? ['回答待ち'] : ret.status === 'requested' ? ['返送待ち'] : [];
  const msgs = ret.messages ?? [];
  const lastCall = Math.max(0, ...msgs.filter((m) => m.side === 'callcenter').map((m) => m.at));
  const lastWh = Math.max(0, ret.inquiry?.answeredAt ?? 0, ret.shippedAt ?? 0, ret.doneAt ?? 0, ...msgs.filter((m) => m.side === 'warehouse').map((m) => m.at));
  return lastCall > lastWh ? [...alerts, '未返信のメッセージ'] : alerts;
}

// 依頼の一覧。q: お客様名・電話番号・商品名・シールNo.・理由・メモ・依頼番号（空白は無視）／filter: all・todo（未対応）・open（対応中）・closed（完了・対応不可）。未対応を先に、新しい順
export function searchReturns(returns, units, { q = '', filter = 'all' } = {}) {
  const squash = (v) => String(v ?? '').replace(/\s+/g, '').toLowerCase();
  const key = squash(q);
  const digits = key.replace(/\D/g, '');
  const byCode = new Map(units.map((u) => [u.code, u]));
  const text = (r) => [r.customerName, r.id, r.memo, reasonOf(r.reason).label, ...r.codes, ...r.codes.map((c) => byCode.get(c)?.name)].map(squash);
  const ok = (r) => ({ all: true, todo: returnAlerts(r).length > 0, open: isOpenReturn(r), closed: !isOpenReturn(r) })[filter] ?? true;
  const hit = (r) => !key || text(r).some((t) => t.includes(key)) || (digits.length >= 4 && String(r.phone ?? '').replace(/\D/g, '').includes(digits));
  return returns.filter((r) => ok(r) && hit(r))
    .sort((a, b) => Number(returnAlerts(b).length > 0) - Number(returnAlerts(a).length > 0) || b.requestedAt - a.requestedAt);
}

export const returnCounts = (returns) => ({ all: returns.length, todo: returns.filter((r) => returnAlerts(r).length).length, open: returns.filter(isOpenReturn).length, closed: returns.filter((r) => !isOpenReturn(r)).length });

// 倉庫が問い合わせに回答する。返送できれば返送の準備へ。対応できない場合は理由が必要（対応不可で終わり、商品は元の状態に戻る）。回答済みは変えない
export function answerInquiry(state, id, { ok, note = '', at = Date.now(), by = '' }) {
  const ret = state.returns.find((r) => r.id === id);
  const text = String(note ?? '').trim();
  if (ret?.status !== 'inquiring' || (!ok && !text)) return state;
  const inquiry = { ...ret.inquiry, ok, note: text, answeredAt: at, ...who('answeredBy', by) };
  return ok ? patchReturn(state, id, { status: 'requested', inquiry }) : patchReturn(state, id, { status: 'unavailable', inquiry, unavailable: { reason: 'warehouse', note: text, at, ...who('by', by) } });
}

// 進捗の段階（受電 → 倉庫の回答 → 返送 → 代金の返還）。state: done／current／todo／ng（倉庫が対応できないと答えた）
export function returnSteps(ret) {
  const asked = ret.status === 'inquiring';
  const ng = ret.status === 'unavailable';
  const rank = { inquiring: 1, requested: 2, shipped: 3, done: 4, unavailable: 1 }[ret.status] ?? 1;
  const mark = (i) => (i < rank ? 'done' : i === rank && !ng ? 'current' : 'todo');
  return [
    { label: '受電・依頼', state: 'done' },
    { label: '倉庫の回答', state: ng ? 'ng' : asked ? 'current' : 'done' },
    { label: '返送', state: ng ? 'todo' : mark(2) },
    { label: '代金の返還', state: ng ? 'todo' : mark(3) },
  ];
}

// 返送した（追跡番号を記録）
export function shipReturn(state, id, { tracking, at = Date.now(), by = '' }) {
  const t = String(tracking ?? '').trim();
  const ret = state.returns.find((r) => r.id === id);
  return t && ret?.status === 'requested' ? patchReturn(state, id, { status: 'shipped', tracking: t, shippedAt: at, ...who('shippedBy', by) }) : state;
}

// お客様から買取代金の返還を確認して完了。返送前には完了できない
export function completeReturn(state, id, at = Date.now(), by = '') {
  const ret = state.returns.find((r) => r.id === id);
  if (ret?.status !== 'shipped') return fail(state, 'notShipped');
  return { ok: true, state: patchReturn(state, id, { status: 'done', doneAt: at, ...who('doneBy', by) }) };
}
