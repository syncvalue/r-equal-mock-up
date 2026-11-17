// 顧客ID。お客様を、電話番号ではなく、IDで1人に決める（電話番号は変わる・2つある・ご家族と共有することがある）。
// 形は C＋6桁（例: C000101）。電話番号から引ける。知らないお客様には、受付のときに、次の番号を発行する（画面から独立した純関数）。
const digits = (s) => String(s ?? '').replace(/\D/g, '');

// 入力のゆれ（全角・小文字・ハイフン・空白）をそろえる。形が合わなければ空
export function normalizeCustomerId(input) {
  const s = String(input ?? '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[\s\-ー−－]/g, '').toUpperCase();
  return /^C\d{6}$/.test(s) ? s : '';
}

// seeds: 過去のお客様（customerHistory の seedCustomerIds）／reservations: 受付の記録（customer.customerId を持つもの）
// 返す: [{ id, name, phones: [表記のままの電話番号…] }]。同じIDの記録は1人にまとめる
export function buildIdIndex({ seeds = [], reservations = [] }) {
  const byId = new Map();
  const add = (id, name, phones) => {
    if (!id) return;
    const cur = byId.get(id) ?? { id, name, phones: [] };
    phones.filter((p) => digits(p).length >= 10).forEach((p) => { if (!cur.phones.some((q) => digits(q) === digits(p))) cur.phones.push(p); });
    byId.set(id, cur);
  };
  seeds.forEach((s) => add(s.id, s.name, s.phones));
  reservations.forEach((r) => add(r.customer?.customerId, r.customer?.name, [r.customer?.phone, r.customer?.phone2]));
  return [...byId.values()];
}

export const customerOfId = (index, input) => index.find((c) => c.id === normalizeCustomerId(input)) ?? null;

export function idOfPhones(index, phones) {
  const mine = phones.map(digits).filter((d) => d.length >= 10);
  if (!mine.length) return null;
  return index.find((c) => c.phones.some((p) => mine.includes(digits(p))))?.id ?? null;
}

export function issueCustomerId(index) {
  const max = index.reduce((n, c) => Math.max(n, Number(c.id.slice(1)) || 0), 0);
  return `C${String(max + 1).padStart(6, '0')}`;
}
