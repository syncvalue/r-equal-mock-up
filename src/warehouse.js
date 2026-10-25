// 倉庫・物流のデータとロジック。買い取った商品（stock.js の入庫データ）を、フリマ・業者に販売し、売上を管理する。
// お客様からのクーリングオフによる返品の対応も扱う（買取から10日間は、販売せずに保管する）。
// 外部の市場（業者オークション）への販売は「委託」。委託中の商品は倉庫になく、売れたら代金が戻り、売れ残ったら倉庫に戻る。
// 状態（state）は { units: 入庫データ, records: 出品・売却の記録（商品No.→記録）, returns: 返品の記録 }。操作はすべて新しい state を返す。
import { WAREHOUSE_KEY, RETURN_KEY } from './store.js';
import { loadUnits } from './stock.js';
import { dateKey } from './workday.js';

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
  incoming: '入庫待ち', missing: '所在不明', stock: '在庫', listed: '出品中', consigned: '委託中', sold: '売却済み', returning: '返品対応中', returned: '返品済み',
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
export const loadState = () => ({ units: loadUnits(), records: loadRecords(), returns: loadReturns() });
export const saveState = (s) => saveRecords(s.records) && saveReturns(s.returns);

// ---- クーリングオフ -----------------------------------------------------------
// 買取日（書面を受け取った日）を1日目として10日目まで
export function coolingOffEnd(date) {
  const [y, m, d] = date.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + COOLING_OFF_DAYS - 1));
}
export const inCoolingOff = (unit, now = Date.now()) => dateOf(now) <= coolingOffEnd(unit.date);

// ---- 一覧用の行 ---------------------------------------------------------------
const returnStages = (returns) => {
  const map = new Map();
  returns.forEach((r) => r.codes.forEach((c) => map.set(c, r.status === 'done' ? 'returned' : 'returning')));
  return map;
};

export function buildRows({ units, records, returns }, now = Date.now()) {
  const rs = returnStages(returns);
  return units.map((unit) => {
    const rec = records[unit.code] ?? null;
    const stage = rs.get(unit.code)
      ?? (rec ? rec.stage : unit.status === 'pending' ? 'incoming' : unit.status === 'missing' ? 'missing' : 'stock');
    const cooling = inCoolingOff(unit, now);
    return { unit, rec, stage, cooling, coolEnd: coolingOffEnd(unit.date), canList: stage === 'stock' && !cooling };
  });
}

export function stockSummary(rows) {
  const count = (stage) => rows.filter((r) => r.stage === stage).length;
  const held = rows.filter((r) => r.stage === 'stock' || r.stage === 'listed');
  return {
    incoming: count('incoming'), missing: count('missing'), stock: count('stock'), listed: count('listed'), consigned: count('consigned'), sold: count('sold'), returning: count('returning'), returned: count('returned'),
    cooling: rows.filter((r) => r.stage === 'stock' && r.cooling).length,
    inventoryCost: held.reduce((n, r) => n + r.unit.price, 0), // 倉庫にある在庫の原価
    consignedCost: rows.filter((r) => r.stage === 'consigned').reduce((n, r) => n + r.unit.price, 0),
  };
}

// ---- 出品・売却 -----------------------------------------------------------------
const fail = (state, reason) => ({ ok: false, state, reason });
const withRecord = (state, code, rec) => ({ ...state, records: { ...state.records, [code]: rec } });
const OPEN = ['listed', 'consigned']; // 販売中（売れる）状態
const rowOf = (state, code, now) => buildRows(state, now).find((r) => r.unit.code === code);

export function listItem(state, code, { channel, price, vendor = '', at = Date.now() }) {
  const row = rowOf(state, code, at);
  if (!row || !row.canList) return fail(state, 'notListable');
  if (!channelOf(channel) || !(price > 0)) return fail(state, 'badInput');
  const rec = { stage: 'listed', channel, listPrice: price, listedAt: at };
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

export function sell(state, code, { price, shipping = 0, buyer = '', fee, at = Date.now() }) {
  const rec = state.records[code];
  if (!OPEN.includes(rec?.stage)) return fail(state, rec ? 'alreadySold' : 'notListed');
  if (!(price > 0) || shipping < 0) return fail(state, 'badInput');
  return { ok: true, state: withRecord(state, code, { ...rec, stage: 'sold', soldAt: at, soldPrice: price, fee: fee ?? feeFor(rec.channel, price), shipping, buyer }) };
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

// ---- クーリングオフによる返品 --------------------------------------------------------
// 契約（訪問）ごとの、返品を受け付けられる商品（入庫済み・期間内・対応中でない）
export function returnableContracts(state, now = Date.now()) {
  const rows = buildRows(state, now).filter((r) => r.stage === 'stock' && r.cooling);
  const visits = [...new Set(rows.map((r) => r.unit.visitId))];
  return visits.map((visitId) => {
    const units = rows.filter((r) => r.unit.visitId === visitId).map((r) => r.unit);
    return { visitId, customerName: units[0].customerName, date: units[0].date, coolEnd: coolingOffEnd(units[0].date), units, total: sumBy(units, (u) => u.price) };
  }).sort((a, b) => a.coolEnd.localeCompare(b.coolEnd));
}

const newReturnId = (at) => `RT-${at.toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

// 受け付けられない商品は rejected に理由つきで返す（unknown／notStored／expired／inProgress／notReturnable）
export function requestReturn(state, { customerName, codes, reason, memo = '', at = Date.now() }) {
  const rows = buildRows(state, at);
  const accepted = [];
  const rejected = [];
  codes.forEach((code) => {
    const row = rows.find((r) => r.unit.code === code);
    const why = !row ? 'unknown'
      : row.unit.status !== 'stored' ? 'notStored'
        : row.stage === 'returning' ? 'inProgress'
          : !row.cooling ? 'expired'
            : row.stage !== 'stock' ? 'notReturnable' : '';
    if (why) rejected.push({ code, reason: why });
    else accepted.push(row.unit);
  });
  if (!accepted.length) return { ok: false, state, rejected };
  const ret = {
    id: newReturnId(at), customerName, codes: accepted.map((u) => u.code), reason, memo, refund: sumBy(accepted, (u) => u.price),
    status: 'requested', requestedAt: at, shippedAt: null, tracking: '', doneAt: null,
  };
  return { ok: true, state: { ...state, returns: [ret, ...state.returns] }, ret, rejected };
}

const patchReturn = (state, id, patch) => ({ ...state, returns: state.returns.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

// 返送した（追跡番号を記録）
export function shipReturn(state, id, { tracking, at = Date.now() }) {
  const t = String(tracking ?? '').trim();
  const ret = state.returns.find((r) => r.id === id);
  return t && ret?.status === 'requested' ? patchReturn(state, id, { status: 'shipped', tracking: t, shippedAt: at }) : state;
}

// お客様から買取代金の返還を確認して完了。返送前には完了できない
export function completeReturn(state, id, at = Date.now()) {
  const ret = state.returns.find((r) => r.id === id);
  if (ret?.status !== 'shipped') return fail(state, 'notShipped');
  return { ok: true, state: patchReturn(state, id, { status: 'done', doneAt: at }) };
}
