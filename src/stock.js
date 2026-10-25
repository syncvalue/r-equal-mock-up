// 買取商品の持ち帰り（事務所での入庫）のデータとロジック。
// 訪問終了時に、シールのQRコードを貼った実物1点ごとの「入庫待ち」を登録し、事務所に戻ってからQRを読み取って倉庫に入庫する。
// 1日分でも、2〜3日分まとめてでも入庫できるよう、日付（訪問日）で絞り込める。すべて純粋関数（新しい配列を返す）。
import { STOCK_KEY } from './store.js';
import { dateKey } from './workday.js';

// シールの色。紫（最も高額）・赤は本社の管理対象（高額品）。黄・緑・青は、システム上は区別しない（青は1点では出品できないが、今は区別しない）
export const SEAL_COLORS = [
  { key: 'purple', label: '紫', note: '最も高額', dot: '🟣' },
  { key: 'red', label: '赤', note: '高額', dot: '🔴' },
  { key: 'other', label: '黄・緑・青', note: 'その他', dot: '🟡' },
];
export const sealColorOf = (key) => SEAL_COLORS.find((c) => c.key === key) ?? null;

export const LOCATIONS = ['A棚（バッグ・小物）', 'B棚（時計・ジュエリー）', 'C棚（カメラ・家電）', '金庫室（高額品）', '要確認エリア'];

// 状態: pending（入庫待ち）／stored（入庫済み）／missing（所在不明として報告）
export const loadUnits = () => {
  try {
    const list = JSON.parse(localStorage.getItem(STOCK_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

// 保存に失敗（容量超過など）したら false
export function saveUnits(list) {
  try {
    localStorage.setItem(STOCK_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// 訪問の買取商品（シール枠ごと）から、入庫待ちの実物リストを作る。シール未紐づけの枠は対象外
export function unitsFromVisit({ visitId, userId, customerName, slots, labels, colors = {}, at = Date.now() }) {
  return slots
    .filter((x) => labels[x.key])
    .map((x) => ({
      code: labels[x.key], visitId, userId, customerName, at, date: dateKey(new Date(at)),
      itemId: x.item.id, name: x.item.name, category: x.item.category, rank: x.item.rank,
      n: x.n, qty: x.item.qty, price: x.item.qty ? Math.round(x.item.price / x.item.qty) : x.item.price,
      sealColor: colors[x.key] ?? null, // シールの色（紫・赤は本社管理の高額品）
      status: 'pending', storedAt: null, location: null, by: null,
    }));
}

// 同じシールNo.は二重に登録しない
export const addUnits = (list, units) => [...list, ...units.filter((u) => !list.some((x) => x.code === u.code))];

export const byUser = (list, userId) => list.filter((u) => u.userId === userId);
export const inScope = (list, scope) => (scope === 'all' ? list : list.filter((u) => u.date === scope));
export const pendingOf = (list) => list.filter((u) => u.status !== 'stored');
export const dateKeys = (list) => [...new Set(list.map((u) => u.date))].sort();

// 読み取った（入力した）シールNo.を入庫する。userId を指定すると、その営業の商品だけ入庫できる（営業のタブレット）。
// userId が null のときは、誰の商品でも入庫できる（倉庫の担当者。契約書とともに商品一式を渡された場合など）。結果: ok／dup（入庫済み）／other（他の営業の商品）／unknown（未登録）
export function receive(list, userId, raw, { location, by, at = Date.now(), method = null, warehouseId = null }) {
  const code = String(raw ?? '').trim().toUpperCase();
  const unit = list.find((u) => u.code === code);
  if (!code) return { list, result: { type: 'empty' } };
  if (!unit) {
    const old = list.find((u) => (u.relabels ?? []).some((r) => r.from === code)); // 貼り替え済みの古いシール
    return { list, result: old ? { type: 'replaced', code, newCode: old.code } : { type: 'unknown', code } };
  }
  if (userId != null && unit.userId !== userId) return { list, result: { type: 'other', code, unit } };
  if (unit.status === 'stored') return { list, result: { type: 'dup', code, unit } };
  // method（scan＝シール読取／manual＝明細と実物を見比べて☑）は、倉庫での照合の記録。営業のタブレットからの入庫は null
  const stored = { ...unit, status: 'stored', storedAt: at, location, by, check: method ? { by, at, method } : null, ...(warehouseId ? { warehouseId } : {}) }; // warehouseId: 入庫した倉庫
  return { list: list.map((u) => (u.code === code ? stored : u)), result: { type: 'ok', code, unit: stored } };
}

// QRの読み取り結果（シールNo.そのもの、またはシールNo.を含む文字列）から、シールNo.を取り出す
export function codeFromQr(text) {
  const t = String(text ?? '').trim();
  return (t.match(/RQ-[A-Za-z0-9]+/i)?.[0] ?? t).toUpperCase();
}

// 指定した商品（シールNo.）を、まとめて入庫する。入庫待ち・所在不明のものだけが対象で、count は入庫した点数。
// 倉庫では、明細と実物を照合（☑）した商品だけを渡す
export function receiveCodes(list, codes, opts) {
  const todo = codes.filter((c) => list.some((u) => u.code === c && u.status !== 'stored'));
  return { list: todo.reduce((acc, code) => receive(acc, null, code, opts).list, list), count: todo.length };
}

// 手元にない商品を「所在不明」として報告する（後でシールが読み取れたら、通常どおり入庫できる）
export const markMissing = (list, code) => list.map((u) => (u.code === code && u.status === 'pending' ? { ...u, status: 'missing' } : u));

// 入庫結果をユーザーに見せる文言
export function resultMessage(r) {
  switch (r.type) {
    case 'ok': return { ok: true, text: `${r.unit.name}（${r.code}）を ${r.unit.location} に入庫しました` };
    case 'dup': return { ok: false, text: `${r.code} は入庫済みです（${r.unit.location}）` };
    case 'other': return { ok: false, text: `${r.code} は、他の営業の買取商品です` };
    case 'replaced': return { ok: false, text: `${r.code} は、貼り替え済みの古いシールです。新しいシール（${r.newCode}）を読み取ってください` };
    case 'unknown': return { ok: false, text: `${r.code} は、買取商品として登録されていません` };
    default: return { ok: false, text: 'シールNo.を入力してください' };
  }
}

// ---- デモ用: 過去2日分の「入庫待ち」のダミー（まとめて入庫する場面の確認用） -------------------
const DEMO_ITEMS = [
  { id: 'demo-1', name: 'ルイ・ヴィトン ネヴァーフル MM', category: 'ブランドバッグ', rank: 'A', price: 98000, qty: 1 },
  { id: 'demo-2', name: 'ロレックス デイトジャスト', category: '腕時計', rank: 'B', price: 420000, qty: 1 },
  { id: 'demo-3', name: 'K18 ネックレス', category: 'ジュエリー・貴金属', rank: 'A', price: 52000, qty: 2 },
  { id: 'demo-4', name: 'キヤノン EOS R6 ボディ', category: 'カメラ・家電', rank: 'B', price: 180000, qty: 1 },
  { id: 'demo-5', name: 'エルメス ブランケット', category: '財布・小物', rank: 'S', price: 36000, qty: 1 },
];

export function demoUnits(userId, existing, now = new Date()) {
  const rnd = () => Math.random().toString(36).slice(2, 10).toUpperCase();
  const make = (daysAgo, customerName, items) => {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 16, 30).getTime();
    const slots = items.flatMap((item) => Array.from({ length: item.qty }, (_, k) => ({ key: `${item.id}-${k + 1}`, item, n: k + 1 })));
    const labels = Object.fromEntries(slots.map((x) => [x.key, `RQ-${rnd()}`]));
    return unitsFromVisit({ visitId: `V-DEMO-${daysAgo}${rnd().slice(0, 3)}`, userId, customerName, slots, labels, at });
  };
  return addUnits(existing, [
    ...make(2, '中村 恵子', DEMO_ITEMS.slice(0, 3)),
    ...make(1, '小林 正志', DEMO_ITEMS.slice(3)),
  ]);
}
