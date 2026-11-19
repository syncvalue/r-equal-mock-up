// チラシのマスタと、反響の集計（マーケティング部）。チラシ＝新聞折込・ポスティング・DM・はがきで配る広告。
// チラシには固有のID（頭文字＋4桁。N=新聞折込・P=ポスティング・D=DM・はがき）が印刷されていて、お客様が電話で伝える。受付のチラシIDと同じもの。
// 画面から独立した純関数。操作はすべて新しい配列を返す（元は変えない）。削除はなく、有効・無効だけ。

export const FLYERS_KEY = 'rq-mock-flyers';

export const MEDIA = [
  { key: 'newspaper', label: '新聞折込', prefix: 'N' },
  { key: 'posting', label: 'ポスティング', prefix: 'P' },
  { key: 'dm', label: 'DM・はがき', prefix: 'D' },
];
export const mediaOf = (key) => MEDIA.find((m) => m.key === key) ?? null;

// 進捗（あらかじめ登録して、1件ずつ配布まで進める）。未着手 → 制作中（デザイン）→ 入稿済み → 配布済み
export const STAGES = [
  { key: 'plan', label: '未着手' },
  { key: 'design', label: '制作中' },
  { key: 'submitted', label: '入稿済み' },
  { key: 'distributed', label: '配布済み' },
];
export const stageLabel = (key) => STAGES.find((x) => x.key === key)?.label ?? '';
const isStage = (k) => STAGES.some((x) => x.key === k);
// 進捗がない古い保存は、配布のおわりが過ぎていれば配布済み、そうでなければ入稿済みとして読む
export const stageOf = (f, today) => (isStage(f.stage) ? f.stage : f.to < today ? 'distributed' : 'submitted');

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const shiftDay = (day, n) => {
  const [y, m, d] = day.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
};
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// 初期値（ダミー）。受付で使っているチラシID（N1012・N1019・P1015・D1001）と、今日配布のチラシ
export function defaultFlyers(today) {
  const f = (id, media, name, adType, area, from, to, quantity, cost, stage = 'distributed', deadline = '') => ({ id, name, media, adType, area, from, to, quantity, cost, note: '', stage, deadline, file: null, active: true });
  return [
    f('N1012', 'newspaper', '10/12号 背広・婦人服', '背広', '大阪府（北摂・大阪市）', shiftDay(today, -38), shiftDay(today, -38), 32000, 160000),
    f('N1019', 'newspaper', '10/19号 ブランドバッグ・貴金属', '婦人ふく', '大阪府（大阪市・堺市）', shiftDay(today, -31), shiftDay(today, -31), 30000, 150000),
    f('P1015', 'posting', '10月 ポスティング（西宮・芦屋）', '婦人くつ', '兵庫県（西宮市・芦屋市）', shiftDay(today, -35), shiftDay(today, -33), 6000, 36000),
    f('D1001', 'dm', '再訪のお客様へのはがき', '', '大阪府（過去のお客様）', shiftDay(today, -20), shiftDay(today, -20), 800, 48000),
    f('N1020', 'newspaper', '今月の折込 着物・骨董', '背広', '大阪府（吹田市・豊中市・箕面市）', today, today, 28000, 140000, 'submitted', shiftDay(today, -4)),
    f('P1016', 'posting', '京都ポスティング（北区・上京区）', '婦人くつ', '京都府（京都市北区・上京区）', shiftDay(today, -1), shiftDay(today, 1), 5000, 30000, 'submitted', shiftDay(today, -6)),
    f('N1021', 'newspaper', '来週の折込 貴金属・ブランド', '婦人ふく', '兵庫県（西宮市・尼崎市）', shiftDay(today, 6), shiftDay(today, 6), 26000, 130000, 'design', today), // 入稿期限が今日
    f('P1017', 'posting', '神戸ポスティング（東灘・灘）', '婦人くつ', '兵庫県（神戸市東灘区・灘区）', shiftDay(today, 4), shiftDay(today, 5), 4500, 27000, 'design', shiftDay(today, -1)), // 入稿期限が過ぎている
    f('D1002', 'dm', '年末のご案内はがき', '', '大阪府（過去のお客様）', shiftDay(today, 12), shiftDay(today, 12), 900, 54000, 'plan', shiftDay(today, 2)),
    f('N1022', 'newspaper', '再来週の折込 背広・婦人服', '背広', '大阪府（大阪市・堺市）', shiftDay(today, 13), shiftDay(today, 13), 30000, 150000, 'plan', shiftDay(today, 7)),
  ];
}

const valid = (v) => Array.isArray(v) && v.length > 0 && v.every((f) => f && f.id && f.name && mediaOf(f.media));

export function loadFlyers(today) {
  try {
    const saved = JSON.parse(localStorage.getItem(FLYERS_KEY));
    return valid(saved) ? saved : defaultFlyers(today);
  } catch {
    return defaultFlyers(today);
  }
}

export function saveFlyers(list) {
  try {
    localStorage.setItem(FLYERS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// 次のID。配布方法ごとに、いまの最大の番号の次（1001から）
export function nextFlyerId(flyers, mediaKey) {
  const prefix = mediaOf(mediaKey)?.prefix ?? 'N';
  const max = flyers.reduce((n, f) => (f.id.startsWith(prefix) ? Math.max(n, Number(f.id.slice(1)) || 0) : n), 1000);
  return `${prefix}${max + 1}`;
}

// 全角の数字・「,」・「円」を取って、整数にする。読めなければ NaN。空は defaultValue
const toInt = (v, defaultValue) => {
  const s = String(v ?? '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,，円\s]/g, '');
  if (s === '') return defaultValue;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
};

// チラシのデザインデータ（画像かPDFを1つ）。モックは localStorage に入れるので、大きさに上限がある
export const MAX_FILE_BYTES = 500 * 1024;
export const FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
const fileProblem = (f) => (!f || !FILE_TYPES.includes(f.type) || !String(f.dataUrl ?? '').startsWith('data:') ? 'badFile' : !(f.size > 0) || f.size > MAX_FILE_BYTES ? 'bigFile' : '');

const fail = (flyers, reason) => ({ ok: false, flyers, reason });

// 登録・更新（id があれば更新）。デザインデータ（file）は、指定しなければ、いまのものを残し、null で外す。reason: noName／dupName／badMedia／noArea／badDate／dateOrder／badQuantity／badCost／badDeadline／deadlineOrder／badFile／bigFile／notFound／mediaLocked
export function saveFlyer(flyers, input) {
  const { id, media, adType, from, to, note } = input;
  const old = id ? flyers.find((f) => f.id === id) : null;
  if (id && !old) return fail(flyers, 'notFound');
  const name = String(input.name ?? '').trim();
  const area = String(input.area ?? '').trim();
  if (!name) return fail(flyers, 'noName');
  if (!mediaOf(media)) return fail(flyers, 'badMedia');
  if (old && old.media !== media) return fail(flyers, 'mediaLocked');
  if (flyers.some((f) => f.name === name && f.id !== id)) return fail(flyers, 'dupName');
  if (!area) return fail(flyers, 'noArea');
  if (!DAY_RE.test(from ?? '') || !DAY_RE.test(to ?? '')) return fail(flyers, 'badDate');
  if (from > to) return fail(flyers, 'dateOrder');
  const deadline = String(input.deadline ?? '').trim();
  if (deadline && !DAY_RE.test(deadline)) return fail(flyers, 'badDeadline');
  if (deadline && deadline > from) return fail(flyers, 'deadlineOrder');
  const quantity = toInt(input.quantity, NaN);
  if (!Number.isInteger(quantity) || quantity < 1) return fail(flyers, 'badQuantity');
  const cost = toInt(input.cost, 0);
  if (!Number.isInteger(cost) || cost < 0) return fail(flyers, 'badCost');
  const file = input.file === undefined ? (old?.file ?? null) : input.file;
  const problem = file && fileProblem(file);
  if (problem) return fail(flyers, problem);
  const item = { id: id ?? nextFlyerId(flyers, media), name, media, adType: String(adType ?? ''), area, from, to, quantity, cost, note: String(note ?? '').trim(), deadline, stage: isStage(input.stage) ? input.stage : old?.stage ?? 'plan', file: file ? { name: String(file.name ?? ''), type: file.type, size: file.size, dataUrl: file.dataUrl } : null, active: old?.active ?? true };
  return { ok: true, flyers: old ? flyers.map((f) => (f.id === id ? item : f)) : [...flyers, item] };
}

// 進捗を1つ進める（dir=1）・戻す（dir=-1）。両端では動かない
export function advanceFlyer(flyers, id, dir = 1, today = '') {
  const f = flyers.find((x) => x.id === id);
  if (!f) return fail(flyers, 'notFound');
  const i = STAGES.findIndex((x) => x.key === stageOf(f, today));
  const next = STAGES[i + dir];
  if (!next) return fail(flyers, 'noMove');
  return { ok: true, flyers: flyers.map((x) => (x.id === id ? { ...x, stage: next.key } : x)) };
}

export function setFlyerActive(flyers, id, active) {
  if (!flyers.some((f) => f.id === id)) return fail(flyers, 'notFound');
  return { ok: true, flyers: flyers.map((f) => (f.id === id ? { ...f, active } : f)) };
}

// その日に配布しているチラシ（有効で、配布の期間に、その日が入る）。オペレーターが、今日の電話を見込むための材料
export const flyersOnDay = (flyers, day) => flyers.filter((f) => f.active && f.from <= day && day <= f.to).sort((a, b) => a.id.localeCompare(b.id));

// ---- 反響の集計 ----------------------------------------------------------------------------------
// 反響＝そのチラシのIDで、コールセンターが受けた受付。取消も、電話が来たので数える（取消は別に出す）。
// 反響率＝受付÷部数。1件あたりの費用＝費用÷受付（受付がなければ出さない）。買取の金額・粗利は、まだ使わない（今後の要件）。

export function flyerStats(flyers, receptions, results = {}) {
  return flyers.map((flyer) => {
    const mine = receptions.filter((r) => r.flyerId === flyer.id);
    const calls = mine.length;
    const done = mine.map((r) => results[r.id]).filter(Boolean);
    const gross = done.reduce((n, x) => n + x.gross, 0);
    return {
      flyer, calls,
      confirmed: mine.filter((r) => r.status === 'confirmed' || (r.status === undefined)).length,
      cancelled: mine.filter((r) => r.status === 'cancelled').length,
      rate: calls / flyer.quantity,
      costPerCall: calls ? Math.round(flyer.cost / calls) : null,
      won: done.filter((x) => x.won).length, amount: done.reduce((n, x) => n + x.amount, 0), gross,
      profit: gross - flyer.cost, roi: flyer.cost ? gross / flyer.cost : null,
    };
  });
}

// 配布方法ごとの合計（反響の少ない方法を見直すため）
export function statsByMedia(stats) {
  return MEDIA.map((media) => {
    const rows = stats.filter((s) => s.flyer.media === media.key);
    const sum = (k) => rows.reduce((n, s) => n + (k === 'calls' ? s.calls : s.flyer[k]), 0);
    const calls = sum('calls');
    const cost = sum('cost');
    const quantity = sum('quantity');
    const gross = rows.reduce((n, x) => n + x.gross, 0);
    return { media, count: rows.length, quantity, cost, calls, rate: quantity ? calls / quantity : 0, costPerCall: calls ? Math.round(cost / calls) : null, won: rows.reduce((n, x) => n + x.won, 0), amount: rows.reduce((n, x) => n + x.amount, 0), gross, profit: gross - cost, roi: cost ? gross / cost : null };
  });
}

// 効果の順: 1件あたりの費用が安い順。反響のないチラシは最後
export const rankByEfficiency = (stats) => [...stats].sort((a, b) => (a.costPerCall ?? Infinity) - (b.costPerCall ?? Infinity) || b.calls - a.calls || a.flyer.id.localeCompare(b.flyer.id));

// 日ごとの反響（配布のあと、何日目に電話が来たか）
export function dailyCalls(receptions, flyerId) {
  const counts = {};
  receptions.filter((r) => r.flyerId === flyerId && r.receivedTs).forEach((r) => { const d = ymd(new Date(r.receivedTs)); counts[d] = (counts[d] ?? 0) + 1; });
  return Object.keys(counts).sort().map((day) => ({ day, count: counts[day] }));
}

// 損益（粗利から費用を引いた額）の大きい順。買取の金額・粗利で測る効果
export const rankByProfit = (stats) => [...stats].sort((a, b) => b.profit - a.profit || b.calls - a.calls || a.flyer.id.localeCompare(b.flyer.id));

// ---- 買取の実績（受付→訪問→買取）----------------------------------------------------------------
// 受付の記録のIDは、鑑定士の予定（訪問）のIDと同じ。訪問が終わっていれば、売った商品の買取額と、想定販売価格との差（粗利）が分かる。
export function receptionResult(reception, visits) {
  const v = visits.find((x) => x.eventId === reception.id && x.endedAt);
  if (!v) return null;
  const sold = (v.items ?? []).filter((i) => i.sell);
  const amount = sold.reduce((n, i) => n + (i.price || 0), 0);
  const gross = sold.reduce((n, i) => n + (i.expectedPrice > 0 ? Math.max(0, i.expectedPrice - (i.price || 0)) : 0), 0); // 想定販売価格を入れた商品だけ（粗利の見込み）
  return { won: amount > 0, amount, gross };
}

// デモ用の見本の実績（モックには、受付のあとの訪問の記録が、ほとんどないため）。確定した受付だけ。同じ受付には、いつも同じ値
export function demoResult(reception) {
  if (reception.status !== 'confirmed') return null;
  const h = [...String(reception.id)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 100003, 7);
  if (h % 10 >= 6) return { won: false, amount: 0, gross: 0 };
  const amount = (30 + (h % 120)) * 1000;
  return { won: true, amount, gross: Math.max(1000, Math.round((amount * (0.18 + (h % 22) / 100)) / 1000) * 1000) };
}

// ---- オペレーターへの見せ方 -----------------------------------------------------------------------
export const flyersTomorrow = (flyers, today) => flyersOnDay(flyers, shiftDay(today, 1));

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
// 曜日ごとの受付の件数（日〜土）
export function weekdayTrend(receptions) {
  const count = Array(7).fill(0);
  receptions.filter((r) => r.flyerId && r.receivedTs).forEach((r) => { count[new Date(r.receivedTs).getDay()] += 1; });
  return WEEKDAYS.map((label, i) => ({ label, count: count[i] }));
}

export const prefOf = (text) => String(text ?? '').match(/(北海道|東京都|大阪府|京都府|[^\s都道府県（(]{2,3}県)/)?.[1] ?? '';

// 配布エリアの都道府県ごとの、部数・受付・反響率（反響率の高い順）
export function areaTrend(flyers, receptions) {
  const by = {};
  flyers.forEach((f) => {
    const pref = prefOf(f.area);
    if (!pref) return;
    const row = by[pref] ?? { pref, quantity: 0, calls: 0 };
    by[pref] = { ...row, quantity: row.quantity + f.quantity, calls: row.calls + receptions.filter((r) => r.flyerId === f.id).length };
  });
  return Object.values(by).map((x) => ({ ...x, rate: x.calls / x.quantity })).sort((a, b) => b.rate - a.rate || a.pref.localeCompare(b.pref));
}

// チラシ→アポ（受付）→訪問→買い取った商品。広告は受付に結びつき、商品には直接つなげない（受付をたどれば、どの広告で何を買い取ったかが分かる）
export function receptionDetails(flyerId, receptions, visits) {
  return receptions.filter((r) => r.flyerId === flyerId).map((r) => {
    const v = visits.find((x) => x.eventId === r.id && x.endedAt);
    const sold = (v?.items ?? []).filter((i) => i.sell);
    return { id: r.id, receptionNo: r.receptionNo ?? '', date: r.date ?? '', status: r.status ?? 'confirmed', customer: r.customer?.name ?? '', items: sold.map((i) => i.name), amount: sold.reduce((n, i) => n + (i.price || 0), 0), visited: Boolean(v) };
  });
}
