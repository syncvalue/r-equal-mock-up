// 店舗の「お客様画面」に出す内容。店舗スタッフの画面（ノートPC）と、お客様に向けた2枚目の画面（デュアルモニタ）を分けるための、画面から独立した純関数。
// 店舗スタッフが「お客様画面へ反映」を押したときだけ、いまの作業の内容から「お客様に見せてよい内容」を作って保存する。お客様画面は、それを読んで表示する。
// お客様に見せないもの（顧客ランク・厄介度・クーリングオフ歴・見送り品・シール・スタッフ向けの確認欄）は、ここで除く。
import { RANKS } from './data.js';
import { STORE_CUSTOMER_VIEW_KEY } from './store.js';
import { EXPLAIN_ITEMS, sellItems, totalOf } from './storePurchase.js';
import { IDENTITY_STEP } from './storeDraft.js';

export const CUSTOMER_VIEW_KEY = STORE_CUSTOMER_VIEW_KEY;

// お客様向けの説明の文言（店舗スタッフの確認欄「〜をご説明した」とは別。キーは EXPLAIN_ITEMS と同じ）
const CUSTOMER_EXPLAIN = {
  flow: '買取の流れ：査定 → 金額のご提示 → お支払い',
  refuse: '査定の結果、金額にご納得いただけない場合は、お断りいただけます',
  photo: '査定のため、商品を撮影し、写真を本社へ送ります',
  kyc: '古物営業法に基づき、本人確認書類を確認します',
  nocooling: '店頭でのお買取は、契約後のお申し出による返品（クーリング・オフ）の対象外です',
};

// 来店時に確かめる項目。住所・生年月日などは、買取が決まったあとの本人確認で、お客様が入力する（identity）
const FIELDS = [['name', 'お名前'], ['kana', 'フリガナ'], ['phone', '電話番号']];
// 本人確認の入力欄（お客様画面に出す順）。required: 古物台帳に必須
export const IDENTITY_FIELDS = [
  { key: 'kana', label: 'フリガナ' }, { key: 'zip', label: '郵便番号', ph: '545-0052' }, { key: 'address', label: '住所', required: true, wide: true },
  { key: 'birth', label: '生年月日', required: true, type: 'date' }, { key: 'occupation', label: '職業' }, { key: 'phone2', label: '電話番号（予備）' },
];
const rankLabel = (v) => RANKS.find((r) => r.value === v)?.label ?? '';

export const welcomeView = () => ({ kind: 'welcome' });
export const thanksView = () => ({ kind: 'thanks' });
// お客様画面の中だけで切り替わる画面（店舗スタッフの「反映」を介さない）: 来店の受付の入力（checkin）、入力を受け付けた（received）
export const checkinView = () => ({ kind: 'checkin' });
export const receivedView = (message) => ({ kind: 'received', message });

const itemLine = (i) => ({ name: i.name, qty: i.qty, rank: rankLabel(i.rank), unit: i.price, subtotal: i.price * i.qty, sell: i.sell });

// 作業の内容（draft）から、お客様に見せる内容を作る。作業がなければ、待機の画面
export function customerViewOf(d) {
  if (!d) return welcomeView();
  const name = d.customer?.name ?? '';
  switch (d.step) {
    case 0: return { kind: 'confirm', name, fields: FIELDS.map(([k, label]) => ({ label, value: String(d.customer[k] ?? '').trim() })).filter((f) => f.value) };
    case 1: return { kind: 'explain', name, items: EXPLAIN_ITEMS.map((x) => ({ text: CUSTOMER_EXPLAIN[x.key] ?? x.text, done: Boolean(d.explain?.[x.key]) })) };
    case 2: return { kind: 'items', name, items: d.items.map(itemLine), total: totalOf(d.items) };
    case IDENTITY_STEP: return { kind: 'identity', name, visitId: d.visitId }; // 入力欄の値は、見せる内容に入れない（お客様の入力で変わっても、未反映にならない）
    case 4: return { kind: 'preparing', name };
    default: return { kind: 'payment', name, items: sellItems(d.items).map(itemLine), total: totalOf(d.items), contractSent: Boolean(d.contractId) };
  }
}

// お客様画面の画面ID（src/screenIds.js の表）
const SCREEN_IDS = { welcome: 'STR-08', confirm: 'STR-08-1', explain: 'STR-08-2', items: 'STR-08-3', preparing: 'STR-08-4', payment: 'STR-08-5', thanks: 'STR-08-6', checkin: 'STR-08-7', identity: 'STR-08-8', received: 'STR-08-9' };
export const customerScreenId = (view) => SCREEN_IDS[view?.kind] ?? SCREEN_IDS.welcome;

// ---- 保存（店舗ごとに、いま、お客様画面に出している内容）。別のウィンドウ（お客様画面）へは storage イベントで届く ----
const readAll = () => {
  try {
    const all = JSON.parse(localStorage.getItem(CUSTOMER_VIEW_KEY));
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch {
    return {};
  }
};

export function loadCustomerView(storeId) {
  const e = readAll()[storeId];
  return e && typeof e.view?.kind === 'string' ? { view: e.view, at: Number(e.at) || 0 } : null;
}

// 保存できなければ false（容量超過など）
export function saveCustomerView(storeId, view, at = Date.now()) {
  try {
    localStorage.setItem(CUSTOMER_VIEW_KEY, JSON.stringify({ ...readAll(), [storeId]: { view, at } }));
    return true;
  } catch {
    return false;
  }
}

// いまの内容が、お客様画面に出ている内容と同じか（同じなら「反映済み」）。何も出していないときは、待機の画面と同じ扱い
export const isSynced = (current, shown) => JSON.stringify(current) === JSON.stringify(shown?.view ?? welcomeView());
