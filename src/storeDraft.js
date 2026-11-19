// 店頭買取の作業中の内容（お客様確認 → 説明事項 → 買取明細 → シール → 確認・支払い）。来店1件につき1つ。
// すべて新しい作業を返す純関数。来店ごとに localStorage へ保存するので、途中で画面を閉じても続けられる。
import { STORE_DRAFT_KEY } from './store.js';
import { sealColorOfCode, newSealNo } from './stock.js';
import { EXPLAIN_ITEMS, LEAVE_CHECKS, slotsOf, sellItems } from './storePurchase.js';

// 本人確認（住所・生年月日などの詳しい情報）は、買取が決まった（買取明細の）あと、契約の前。お客様が、書類の読み取り（OCR）で入った内容を確かめて入力する
export const STEPS = ['お客様確認', '説明事項', '買取明細', '本人確認', 'シール', '確認・支払い'];
export const IDENTITY_STEP = 3;
const DRAFT_VERSION = 2; // 2: 本人確認の手順を追加（手順が6つになった）

export const blankDraft = (visit) => ({
  v: DRAFT_VERSION, visitId: visit.id, step: 0,
  customer: { name: visit.customer?.name ?? '', kana: visit.customer?.kana ?? '', phone: visit.customer?.phone ?? '', phone2: '', zip: '', address: '', occupation: '', birth: '' },
  customerOk: false, entered: false, explain: {}, propose: '', items: [], labels: {}, colors: {}, contractId: null, checks: {},
});

export const explainRemaining = (d) => EXPLAIN_ITEMS.filter((x) => !d.explain[x.key]).length;
export const leaveRemaining = (d) => LEAVE_CHECKS.filter((x) => !d.checks[x.key]).length;

const filled = (v) => String(v ?? '').trim() !== '';

// いまの手順で、次へ進める（または完了できる）か
export function canProceed(d) {
  switch (d.step) {
    case 0: return ['name', 'phone'].every((k) => filled(d.customer[k])); // 来店時に聞くのは、お名前と電話番号だけ
    case 1: return explainRemaining(d) === 0 && ['yes', 'no'].includes(d.propose);
    case 2: return sellItems(d.items).length > 0 && d.items.every((i) => i.price > 0);
    case IDENTITY_STEP: return d.customerOk && ['name', 'phone', 'address', 'birth'].every((k) => filled(d.customer[k]));
    case 4: return slotsOf(d.items).every((x) => d.labels[x.key] && d.colors[x.key]);
    default: return Boolean(d.contractId) && leaveRemaining(d) === 0;
  }
}

// 手順を移る。契約をGMOサインへ送ったあとは、内容が変わると契約書と食い違うので、確認・支払いより前には戻れない
export const goStep = (d, step) => ({ ...d, step: Math.max(d.contractId ? STEPS.length - 1 : 0, Math.min(STEPS.length - 1, step)) });

// ---- 買取明細 -----------------------------------------------------------------
// 商品を足す。金額は未入力（0）で入れ、同じ商品は数量を増やす
export const addProduct = (d, p) => (d.items.some((i) => i.id === p.id)
  ? { ...d, items: d.items.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i)) }
  : { ...d, items: [...d.items, { id: p.id, name: p.name, category: p.category, qty: 1, rank: 'A', price: 0, sell: true }] });

export const updateItem = (d, id, patch) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

// 指定した商品の、シールの枠のうち keep(n) を満たさないものを外す
const dropSeals = (d, id, keep) => {
  const kept = (m) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith(`${id}-`) || keep(Number(k.slice(id.length + 1)))));
  return { ...d, labels: kept(d.labels), colors: kept(d.colors) };
};

// 数量を変える（1未満にはならない）。減った分のシールの紐づけも外す
export function setQty(d, id, qty) {
  const q = Math.max(1, qty);
  return dropSeals(updateItem(d, id, { qty: q }), id, (n) => n <= q);
}

export const removeItem = (d, id) => dropSeals({ ...d, items: d.items.filter((i) => i.id !== id) }, id, () => false);

// ---- シール ---------------------------------------------------------------------
// シールNo.を紐づける（大文字にそろえる）。taken: すでに使われているシールNo.（入庫待ち済みなど）。重複は error: 'dup'
export function assignLabel(d, key, raw, { taken = [] } = {}) {
  const code = String(raw ?? '').trim().toUpperCase();
  if (!code) return { draft: d };
  if (Object.values(d.labels).includes(code) || taken.includes(code)) return { draft: d, error: 'dup', code };
  const color = sealColorOfCode(code); // QRから色が分かれば、自動で選ぶ
  return { draft: { ...d, labels: { ...d.labels, [key]: code }, colors: color ? { ...d.colors, [key]: color } : d.colors } };
}
export const setColor = (d, key, color) => ({ ...d, colors: { ...d.colors, [key]: color } });
export const clearLabel = (d, key) => {
  const { [key]: _l, ...labels } = d.labels;
  const { [key]: _c, ...colors } = d.colors;
  return { ...d, labels, colors };
};

// 読み取り（モック）で出す、新しいシールNo.
export function newSealCode(taken = []) {
  let code;
  do code = newSealNo();
  while (taken.includes(code));
  return code;
}

// ---- 保存と復元 -------------------------------------------------------------------
const readAll = () => {
  try {
    const all = JSON.parse(localStorage.getItem(STORE_DRAFT_KEY));
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch {
    return {};
  }
};
// 古い作業（手順が5つのころ）は、本人確認の手順を挟んで、手順の番号を1つ後ろへ。住所・生年月日が入っていれば、お客様確認は済んだものとして扱う
const migrate = (d) => (d.v === DRAFT_VERSION ? d : { ...d, v: DRAFT_VERSION, step: d.step >= IDENTITY_STEP ? d.step + 1 : d.step, entered: Boolean(d.customerOk) });
export const loadDraft = (visitId) => { const d = readAll()[visitId]; return d ? migrate(d) : null; };
export function saveDraft(d) {
  try {
    localStorage.setItem(STORE_DRAFT_KEY, JSON.stringify({ ...readAll(), [d.visitId]: d }));
    return true;
  } catch {
    return false;
  }
}
export function clearDraft(visitId) {
  const { [visitId]: _gone, ...rest } = readAll();
  try {
    localStorage.setItem(STORE_DRAFT_KEY, JSON.stringify(rest));
  } catch { /* 消せなくても動作は継続（モック） */ }
}
