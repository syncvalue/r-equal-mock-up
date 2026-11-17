// 顧客検索（鑑定士タブレット）。検索の対象は、自分が担当したお客様だけ。目的は、鑑定士自身が、お客様に電話して、再訪のアポを取ること。
// 前回の訪問から何日たっているか・いま近くにいるか・最近電話したか、を見て、連絡する相手を選ぶ。画面から独立した純関数。
import { userById } from './dashboard.js';
import { seedCustomersOf } from './customerHistory.js';
import { eventsOfDay, dayDate } from './schedule.js';
import { loadContracts } from './store.js';
import { locateAddress } from './dispatch.js';
import { distanceKm, OFFICE } from './route.js';
import { lastCallOf, callsOfPhones, daysSince } from './callLog.js';

// メモの先頭 n 文字（長ければ「…」）。一覧で、メモの頭だけ見えるように
export const clip = (text, n = 100) => { const t = [...String(text ?? '').replace(/\s+/g, ' ').trim()]; return t.length > n ? `${t.slice(0, n).join('')}…` : t.join(''); };

const digits = (s) => String(s ?? '').replace(/\D/g, '');
const approx = (address) => locateAddress(address, OFFICE) ?? { lat: OFFICE.lat, lng: OFFICE.lng };

// ダミーの顧客（鑑定士ごとに決まる）。このモックは、過去の訪問の記録が少ないため、一覧が使えるよう補う
const PLACES = [
  ['大阪府大阪市中央区谷町4-5-6', 34.6815, 135.5238], ['大阪府大阪市浪速区日本橋3-2-1', 34.6586, 135.5058], ['大阪府大阪市阿倍野区阿倍野筋2-1-4', 34.6464, 135.5139],
  ['大阪府大阪市北区天神橋2-3-8', 34.6969, 135.5124], ['大阪府吹田市江坂町1-12-3', 34.7585, 135.4969], ['大阪府堺市堺区南花田口町2-1-8', 34.5732, 135.4829],
  ['大阪府東大阪市長堂1-4-9', 34.6685, 135.6003], ['兵庫県尼崎市東難波町5-2-1', 34.7265, 135.4156], ['大阪府豊中市庄内西町3-4-5', 34.7433, 135.4618], ['京都府京都市下京区烏丸通七条下ル', 34.9885, 135.7585],
];
const SURNAMES = ['青山', '池田', '上野', '遠藤', '大野', '加藤', '川口', '菊地', '久保', '小林', '坂本', '島田', '杉山', '関', '田口', '土屋', '那須', '野村', '早川', '平野'];
const GIVEN = ['和子', '幸子', '正雄', '典子', '義男', '節子', '博', '光子', '茂', '洋子'];
const KANA = { 青山: 'アオヤマ', 池田: 'イケダ', 上野: 'ウエノ', 遠藤: 'エンドウ', 大野: 'オオノ', 加藤: 'カトウ', 川口: 'カワグチ', 菊地: 'キクチ', 久保: 'クボ', 小林: 'コバヤシ', 坂本: 'サカモト', 島田: 'シマダ', 杉山: 'スギヤマ', 関: 'セキ', 田口: 'タグチ', 土屋: 'ツチヤ', 那須: 'ナス', 野村: 'ノムラ', 早川: 'ハヤカワ', 平野: 'ヒラノ' };
const GKANA = { 和子: 'カズコ', 幸子: 'サチコ', 正雄: 'マサオ', 典子: 'ノリコ', 義男: 'ヨシオ', 節子: 'セツコ', 博: 'ヒロシ', 光子: 'ミツコ', 茂: 'シゲル', 洋子: 'ヨウコ' };
const seeded = (str) => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000; };

function demoCustomers(userId, now) {
  const rnd = seeded(`mycust-${userId}`);
  return Array.from({ length: 8 }, (_, i) => {
    const sur = SURNAMES[Math.floor(rnd() * SURNAMES.length)];
    const giv = GIVEN[Math.floor(rnd() * GIVEN.length)];
    const [address, lat, lng] = PLACES[Math.floor(rnd() * PLACES.length)];
    const ago = 8 + Math.floor(rnd() * 400);
    const count = 1 + Math.floor(rnd() * 4);
    const four = () => String(1000 + Math.floor(rnd() * 9000));
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ago, 10).getTime();
    return {
      phone: `0${['90', '80', '70'][i % 3]}-${four()}-${four()}`, name: `${sur} ${giv}`, kana: `${KANA[sur]} ${GKANA[giv]}`, address, lat: lat + (rnd() - 0.5) * 0.004, lng: lng + (rnd() - 0.5) * 0.004,
      visits: Array.from({ length: count }, (_, k) => ({ at: at - k * 70 * 86400000, total: 30000 + Math.floor(rnd() * 570) * 1000 })),
    };
  });
}

// 実際の記録から: 前日の予定で買取した訪問、保存した契約（このアプリで買取したもの）、評価を残した過去の訪問
function recordedCustomers(userId, now) {
  const name = userById(userId).name;
  const fromEvents = eventsOfDay(-1, userId).filter((e) => e.past?.items?.some((i) => i.sell)).map((e) => ({
    phone: e.customer.phone, name: e.customer.name, kana: e.customer.kana, address: e.customer.address, lat: e.lat, lng: e.lng,
    visits: [{ at: dayDate(e.day, now).getTime(), total: e.past.items.filter((i) => i.sell).reduce((n, i) => n + i.price * (i.qty ?? 1), 0) }],
  }));
  const fromContracts = loadContracts().filter((c) => c.callInfo?.appraiser === name && c.customer?.phone).map((c) => ({
    phone: c.customer.phone, name: c.customer.name, kana: c.customer.kana, address: c.customer.address, visits: [{ at: c.sentAt, total: c.total }],
  }));
  return [...seedCustomersOf(name), ...fromEvents, ...fromContracts];
}

// 自分の顧客の一覧。from（現在地 {lat,lng}）があれば距離を、calls（電話の記録）があれば直近の電話を付ける。前回の訪問から長い順
export function customerRows(userId, { now = new Date(), from = null, calls = [], notes = {} } = {}) {
  const byPhone = new Map();
  [...recordedCustomers(userId, now), ...demoCustomers(userId, now)].forEach((c) => {
    const key = digits(c.phone);
    const cur = byPhone.get(key);
    byPhone.set(key, cur ? { ...cur, visits: [...cur.visits, ...c.visits], lat: cur.lat ?? c.lat, lng: cur.lng ?? c.lng } : c);
  });
  return sortRows([...byPhone.values()].filter((c) => c.visits.length).map((c) => {
    const pos = c.lat != null ? { lat: c.lat, lng: c.lng } : approx(c.address);
    const visits = [...c.visits].sort((a, b) => b.at - a.at);
    return {
      phone: c.phone, name: c.name, kana: c.kana ?? '', address: c.address ?? '', lat: pos.lat, lng: pos.lng,
      lastVisitAt: visits[0].at, days: daysSince(visits[0].at, now), visitCount: visits.length, total: visits.reduce((n, v) => n + (v.total || 0), 0),
      distanceKm: from ? Math.round(distanceKm(from, pos) * 10) / 10 : null, lastCall: lastCallOf(calls, [c.phone]),
      callMemo: callsOfPhones(calls, [c.phone]).find((x) => x.memo) ?? null, // 直近の、メモ付きの電話の記録
      favorite: Boolean(notes[digits(c.phone)]?.favorite), memo: notes[digits(c.phone)]?.memo ?? '', // お気に入りと自分用のメモ（自分だけ）
    };
  }), 'days');
}

// 検索（氏名・フリガナ・電話番号・住所・自分用のメモ）と、絞り込み（前回の訪問から○日以上・現在地から○km以内）
export function filterRows(rows, { q = '', minDays = 0, nearKm = 0, favOnly = false } = {}) {
  const text = String(q).trim().toLowerCase();
  const num = digits(q);
  return rows.filter((r) => (!text || [r.name, r.kana, r.address, r.memo].some((x) => x.toLowerCase().includes(text)) || (num.length >= 3 && digits(r.phone).includes(num)))
    && (!favOnly || r.favorite) && r.days >= minDays && (!nearKm || (r.distanceKm !== null && r.distanceKm <= nearKm)));
}

// 並べ替え: days=前回の訪問から長い順／near=現在地から近い順／call=電話していない順（電話したことがなければ先、あとは電話が古い順）
export function sortRows(rows, key) {
  const by = {
    days: (a, b) => b.days - a.days,
    near: (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || b.days - a.days,
    call: (a, b) => (a.lastCall?.at ?? 0) - (b.lastCall?.at ?? 0) || b.days - a.days,
  }[key] ?? (() => 0);
  return [...rows].sort(by);
}

// 電話の履歴を、鑑定士に見せるとき: ほかの鑑定士の電話は、名前を伏せる（オペレーターと、自分の電話は、そのまま）
export const maskOtherSales = (list, userId) => list.map((c) => (c.kind === '鑑定士が架電' && c.userId !== userId ? { ...c, by: '鑑定士（ほかの担当）' } : c));
