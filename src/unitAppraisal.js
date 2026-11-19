// 査定（査定部）: 鑑定士が登録した高額品（紫・赤のシールの商品）を、専門の査定員が確認して確定する。
// 状態は、商品（stock.js の unit）の appraisal で持つ。なければ、色から決まる（高額品は査定待ち、ほかは対象外）。
// すべて純粋関数（新しい配列を返す）。
import { isHighValue } from './warehouseMaster.js';
import { RANKS } from './data.js';
import { unitsFromVisit, addUnits } from './stock.js';

// 'none'（査定の対象外）／'pending'（査定待ち）／'confirmed'（確定済み）
export function appraisalStatus(unit, master) {
  if (unit.appraisal?.status === 'confirmed') return 'confirmed';
  return isHighValue(unit, master) ? 'pending' : 'none';
}

// 査定の一覧。filter: 'pending'｜'confirmed'｜'all'（対象外は含めない）。買取の古い順
// q: 商品名・シールNo.・お客様の名前での絞り込み（空白は無視）
const squash = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
export const appraisalQueue = (units, master, filter = 'pending', q = '') =>
  units
    .filter((u) => { const s = appraisalStatus(u, master); return s !== 'none' && (filter === 'all' || s === filter); })
    .filter((u) => !squash(q) || [u.name, u.code, u.customerName].some((v) => squash(v).includes(squash(q))))
    .sort((a, b) => a.at - b.at);

const normalize = (raw) => String(raw ?? '').trim().toUpperCase();

// 読み取った（入力した）シールNo.から、査定する商品を引く。結果: ok／empty／unknown／replaced（貼り替え済みの古いシール）／notTarget（査定の対象外）
export function lookupForAppraisal(units, master, raw) {
  const code = normalize(raw);
  if (!code) return { type: 'empty' };
  const unit = units.find((u) => u.code === code);
  if (!unit) {
    const old = units.find((u) => (u.relabels ?? []).some((r) => r.from === code));
    return old ? { type: 'replaced', code, newCode: old.code } : { type: 'unknown', code };
  }
  return appraisalStatus(unit, master) === 'none' ? { type: 'notTarget', code, unit } : { type: 'ok', code, unit };
}

// 訂正の入力チェック（商品名・ランク）。問題なければ ''。買取金額は、お客様に支払い済みなので、直せない
export function editProblem({ name, rank }) {
  if (!String(name ?? '').trim()) return 'name';
  if (!RANKS.some((r) => r.value === rank)) return 'rank';
  return '';
}

const FIELDS = ['name', 'rank'];

// 査定を確定する。edits は確認後の商品名・ランク（訂正がなければ、いまの値のまま。金額は変えない）。変わった項目は、前→後を記録する
export function confirmAppraisal(units, master, raw, { by, at = Date.now(), edits }) {
  const found = lookupForAppraisal(units, master, raw);
  if (found.type !== 'ok') return { units, result: found };
  const unit = found.unit;
  if (appraisalStatus(unit, master) === 'confirmed') return { units, result: { type: 'dup', code: unit.code, unit } };
  const next = { name: String(edits.name ?? '').trim(), rank: edits.rank };
  const problem = editProblem(next);
  if (problem) return { units, result: { type: 'bad', problem } };
  const changes = FIELDS.filter((f) => next[f] !== unit[f]).map((f) => ({ field: f, from: unit[f], to: next[f] }));
  const done = { ...unit, ...next, appraisal: { status: 'confirmed', by, at, changes } };
  return { units: units.map((u) => (u.code === unit.code ? done : u)), result: { type: 'ok', code: unit.code, unit: done } };
}

// 画面に出す文言
export function appraisalMessage(r) {
  switch (r.type) {
    case 'ok': return { ok: true, text: `${r.unit.name}（${r.code}）の査定を確定しました` };
    case 'dup': return { ok: false, text: `${r.code} は、査定を確定済みです` };
    case 'notTarget': return { ok: false, text: `${r.code} は、査定の対象外です（紫・赤のシールの商品が対象）` };
    case 'replaced': return { ok: false, text: `${r.code} は、貼り替え済みの古いシールです。新しいシール（${r.newCode}）を読み取ってください` };
    case 'unknown': return { ok: false, text: `${r.code} は、買取商品として登録されていません` };
    case 'bad': return { ok: false, text: { name: '商品名を入力してください', rank: 'ランクを選んでください' }[r.problem] };
    default: return { ok: false, text: 'シールNo.を入力してください' };
  }
}

// ---- デモ用: 査定待ちの高額品（鑑定士が登録した紫・赤のシールの商品）。シールNo.は固定（二度押しても増えない）-----------------
const DEMO = [
  { code: 'RQ-PDEMO001', color: 'purple', customerName: '中村 恵子', item: { id: 'ap-demo-1', name: 'プラチナ ダイヤリング 0.5ct', category: 'ジュエリー・貴金属', rank: 'A', price: 280000, qty: 1 } },
  { code: 'RQ-RDEMO001', color: 'red', customerName: '小林 正志', item: { id: 'ap-demo-2', name: 'K18 ネックレス（約20g）', category: 'ジュエリー・貴金属', rank: 'B', price: 96000, qty: 1 } },
  { code: 'RQ-RDEMO002', color: 'red', customerName: '小林 正志', item: { id: 'ap-demo-3', name: 'ロレックス デイトジャスト', category: '腕時計', rank: 'B', price: 420000, qty: 1 } },
  { code: 'RQ-PDEMO002', color: 'purple', customerName: '山口 光男', item: { id: 'ap-demo-4', name: '純金 インゴット 100g', category: 'ジュエリー・貴金属', rank: 'S', price: 1280000, qty: 1 } },
  { code: 'RQ-RDEMO003', color: 'red', customerName: '山口 光男', item: { id: 'ap-demo-5', name: 'K18 ブレスレット（約15g）', category: 'ジュエリー・貴金属', rank: 'A', price: 72000, qty: 1 } },
  { code: 'RQ-PDEMO003', color: 'purple', customerName: '佐藤 由美', item: { id: 'ap-demo-6', name: 'ミキモト パールネックレス', category: 'ジュエリー・貴金属', rank: 'A', price: 150000, qty: 1 } },
  { code: 'RQ-RDEMO004', color: 'red', customerName: '佐藤 由美', item: { id: 'ap-demo-7', name: 'オメガ シーマスター', category: '腕時計', rank: 'B', price: 185000, qty: 1 } },
  { code: 'RQ-RDEMO005', color: 'red', customerName: '高橋 健一', item: { id: 'ap-demo-8', name: 'Pt900 マリッジリング', category: 'ジュエリー・貴金属', rank: 'B', price: 64000, qty: 1 } },
  { code: 'RQ-PDEMO004', color: 'purple', customerName: '高橋 健一', item: { id: 'ap-demo-9', name: 'カルティエ タンク ソロ', category: '腕時計', rank: 'S', price: 330000, qty: 1 } },
];
// userId: 鑑定士のID（配列なら、順に割り当てる）
export function demoAppraisalUnits(existing, userId, now = new Date()) {
  const ids = [].concat(userId);
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 16, 30).getTime();
  return addUnits(existing, DEMO.flatMap((d, i) => unitsFromVisit({
    visitId: `V-DEMO-AP-${d.code}`, userId: ids[i % ids.length], customerName: d.customerName, at,
    slots: [{ key: `${d.item.id}-1`, item: d.item, n: 1 }], labels: { [`${d.item.id}-1`]: d.code }, colors: { [`${d.item.id}-1`]: d.color },
  })));
}
