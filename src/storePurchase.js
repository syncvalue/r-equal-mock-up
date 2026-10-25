// 店頭買取（お客様が店舗に持ち込む買取）の、説明・終了前の確認と、買取を完了するときに作る記録（契約・入庫待ちの実物・見送り品）。
// 営業タブレットの現地買取と同じ形の記録にして、GMOサイン・倉庫・お客様の履歴をそのまま使う。画面から独立した純関数（記録の保存は呼び出し側）。
import { unitsFromVisit } from './stock.js';

// 査定前の説明事項。訪問買取の5項目のうち、クーリング・オフは、店頭買取は対象外であることの説明に変える（お客様への説明の文言なので、法令の表記）
export const EXPLAIN_ITEMS = [
  { key: 'flow', text: '買取の流れ（査定・金額のご提示・お支払い）をご説明した' },
  { key: 'refuse', text: '査定の結果、金額にご納得いただけなければ、お断りいただけることをご説明した' },
  { key: 'photo', text: '査定のために商品を撮影し、写真を本社へ送ることをご説明し、ご了承いただいた' },
  { key: 'kyc', text: '古物営業法に基づき、本人確認書類が必要であることをご説明した' },
  { key: 'nocooling', text: '店頭での買取は、契約後のお申し出による返品（クーリング・オフ）の対象外であることをご説明した' },
];

// 買取を終える前の確認。訪問買取の項目から、梱包・持ち帰り・クーリング・オフの説明を除いたもの
export const LEAVE_CHECKS = [
  { key: 'kyc', text: '本人確認書類を確認し、GMOサインで登録した' },
  { key: 'paper', text: '契約書を印刷し、お客様がチェック項目・署名を記入した' },
  { key: 'copy', text: '契約書の店舗控えを回収し、お客様控えをお渡しした' },
  { key: 'pay', text: '買取代金をお支払いし、お客様の受領を確認した' },
  { key: 'count', text: '商品の数が、シール・契約書と一致している' },
  { key: 'lost', text: '忘れ物がない（書類・お客様のお預かり品）' },
];

export const sellItems = (items) => items.filter((i) => i.sell);
// 実物1点ごとのシール枠（売る商品を、数量分に展開）
export const slotsOf = (items) => sellItems(items).flatMap((i) => Array.from({ length: i.qty }, (_, k) => ({ key: `${i.id}-${k + 1}`, item: i, n: k + 1 })));
export const totalOf = (items) => sellItems(items).reduce((sum, i) => sum + i.price * i.qty, 0);

const stampOf = (at) => { const d = new Date(at); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

// 契約の作成（GMOサインへ送る時点）。reason: noItems（売る商品がない）／noPrice（金額が未入力）／noSeal（シール・色が未紐づけ）。
// isRepeat: 過去に買取のあるお客様か（契約書の「新・再」）
export function buildContract({ visit, store, staff, customer, items, labels, colors, now = Date.now(), contractId, isRepeat = false }) {
  const sell = sellItems(items);
  if (!sell.length) return { ok: false, reason: 'noItems' };
  if (sell.some((i) => !(i.price > 0))) return { ok: false, reason: 'noPrice' };
  const slots = slotsOf(items);
  if (slots.some((x) => !labels[x.key] || !colors[x.key])) return { ok: false, reason: 'noSeal' };
  const codesOf = (item) => slots.filter((x) => x.item.id === item.id).map((x) => labels[x.key]);
  const contract = {
    id: contractId, sentAt: now, status: '本人確認待ち', channel: 'store', storeId: store.id, visitId: visit.id,
    customer, callInfo: { receptionNo: visit.id, receivedAt: stampOf(now), operator: visit.createdBy || '飛び込み', apType: isRepeat ? '再' : '新', appraiser: staff.name },
    items: sell.map((i) => ({ name: i.name, category: i.category, rank: i.rank, qty: i.qty, price: i.price, codes: codesOf(i) })),
    total: totalOf(items), kyc: null, signature: null, signedAt: null,
  };
  return { ok: true, contract, slots };
}

// 買取の完了（終了前の確認がすべて済んだとき）。契約・入庫待ちの実物（1点ごと）・見送り品を作る。reason: buildContract のものに加えて checks（確認が済んでいない）。
// photos: 商品ID → 査定の写真。見送り品（declined）は、呼び出し側で recordDeclined に渡す
export function buildPurchase({ checks = {}, photos = {}, ...args }) {
  const c = buildContract(args);
  if (!c.ok) return c;
  if (LEAVE_CHECKS.some((x) => !checks[x.key])) return { ok: false, reason: 'checks' };
  const { visit, store, staff, customer, items, labels, colors, now = Date.now(), contractId } = args;
  const units = unitsFromVisit({ visitId: visit.id, userId: staff.id, customerName: customer.name, slots: c.slots, labels, colors, photos, phones: [customer.phone, customer.phone2], at: now, channel: 'store', storeId: store.id });
  return {
    ok: true, contract: c.contract, units, declined: items.filter((i) => !i.sell),
    result: { type: 'purchased', contractId, total: c.contract.total, count: c.slots.length },
  };
}

// 売る商品がなく、買取に至らなかった来店（見送り）
export const buildDeclined = ({ items }) => ({ result: { type: 'declined' }, declined: items.filter((i) => !i.sell) });
