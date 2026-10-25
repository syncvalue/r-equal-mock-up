// 営業所のマスタ。営業が所属する拠点で、担当の都道府県を持つ。操作はすべて新しい配列を返す。
// モックのため、エリア判定・配車（src/dispatch.js の AREAS）や営業の所属には、まだつながっていない（倉庫の「営業所との関係」の選択肢にだけ使う）。
import { AREAS, PREFS } from './dispatch.js';

export const OFFICES_KEY = 'rq-mock-offices';

// 初期値（ダミー）。既存の担当エリアと同じ。名前は「営業所」を付けない短い名前
export const DEFAULT_OFFICES = AREAS.map((a) => ({ id: a.id, name: a.name.replace('エリア', ''), prefs: [...a.prefs], active: true }));
export const officeLabel = (o) => `${o.name}営業所`;

const valid = (v) => Array.isArray(v) && v.length > 0 && v.every((o) => o && o.id && o.name && Array.isArray(o.prefs));

export function loadOffices() {
  try {
    const saved = JSON.parse(localStorage.getItem(OFFICES_KEY));
    return valid(saved) ? saved : DEFAULT_OFFICES;
  } catch {
    return DEFAULT_OFFICES;
  }
}

export function saveOffices(list) {
  try {
    localStorage.setItem(OFFICES_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const newId = () => `O-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const fail = (offices, reason) => ({ ok: false, offices, reason });
const toList = (v) => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(/[,、\s　]+/)).map((x) => String(x).trim()).filter(Boolean))];

// 登録・更新（id があれば更新）。prefs は、配列でも、区切り文字つきの文字列でもよい。reason: noName／dupName／badPref／notFound
export function saveOffice(offices, { id, name, prefs }) {
  const old = id ? offices.find((o) => o.id === id) : null;
  if (id && !old) return fail(offices, 'notFound');
  const n = String(name ?? '').trim();
  if (!n) return fail(offices, 'noName');
  if (offices.some((o) => o.name === n && o.id !== id)) return fail(offices, 'dupName');
  const list = toList(prefs);
  if (list.some((p) => !PREFS.includes(p))) return fail(offices, 'badPref');
  const item = { id: id ?? newId(), name: n, prefs: list, active: old?.active ?? true };
  return { ok: true, offices: old ? offices.map((o) => (o.id === id ? item : o)) : [...offices, item] };
}

// 有効・無効。有効な営業所は、最低1つ残す。reason: notFound／lastActive
export function setOfficeActive(offices, id, active) {
  const o = offices.find((x) => x.id === id);
  if (!o) return fail(offices, 'notFound');
  if (!active && o.active && !offices.some((x) => x.active && x.id !== id)) return fail(offices, 'lastActive');
  return { ok: true, offices: offices.map((x) => (x.id === id ? { ...x, active } : x)) };
}

export const activeOffices = (offices) => offices.filter((o) => o.active);
export const officeName = (officeId, offices = loadOffices()) => offices.find((o) => o.id === officeId)?.name ?? '';
