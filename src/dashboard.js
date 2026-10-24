// 業績ダッシュボードのデータとロジック。
// 表示する業績は、すべて静的なダミーデータ（ユーザー×日付から決まる疑似乱数）。保存領域や他の画面のデータは使わない。

export const GROUPS = [
  { id: 'A', name: 'グループA（東日本）' },
  { id: 'B', name: 'グループB（西日本）' },
];

// role: leader = グループリーダー（グループ全員の業績を閲覧可）／member = 一般（自分の業績のみ）
// target: 月間の買取金額目標, skill: 成約しやすさ, base: 1契約あたりの平均買取額（ダミーデータ生成用）
export const USERS = [
  { id: 'u01', name: '鈴木 一郎', group: 'A', role: 'member', target: 4000000, skill: 0.62, base: 180000 },
  { id: 'u02', name: '田中 健', group: 'A', role: 'leader', target: 5000000, skill: 0.74, base: 200000 },
  { id: 'u03', name: '佐々木 美咲', group: 'A', role: 'member', target: 4000000, skill: 0.7, base: 165000 },
  { id: 'u04', name: '高橋 翔', group: 'A', role: 'member', target: 3500000, skill: 0.55, base: 185000 },
  { id: 'u05', name: '山本 結衣', group: 'A', role: 'member', target: 3500000, skill: 0.66, base: 155000 },
  { id: 'u06', name: '佐藤 大輔', group: 'B', role: 'leader', target: 5000000, skill: 0.72, base: 205000 },
  { id: 'u07', name: '伊藤 恵', group: 'B', role: 'member', target: 4000000, skill: 0.6, base: 195000 },
  { id: 'u08', name: '渡辺 蓮', group: 'B', role: 'member', target: 3500000, skill: 0.58, base: 175000 },
  { id: 'u09', name: '松田 亮', group: 'B', role: 'member', target: 4000000, skill: 0.64, base: 170000 },
  { id: 'u10', name: '青木 さくら', group: 'B', role: 'member', target: 3500000, skill: 0.57, base: 160000 },
  { id: 'u11', name: '西田 翼', group: 'A', role: 'member', target: 4000000, skill: 0.68, base: 172000 },
  { id: 'u12', name: '森 凛', group: 'B', role: 'member', target: 3800000, skill: 0.61, base: 168000 },
  { id: 'u13', name: '大塚 大地', group: 'A', role: 'member', target: 3500000, skill: 0.52, base: 158000 },
  { id: 'u14', name: '内田 美優', group: 'B', role: 'member', target: 4200000, skill: 0.71, base: 190000 },
  { id: 'u15', name: '堀 拓海', group: 'A', role: 'member', target: 4500000, skill: 0.75, base: 198000 },
  { id: 'u16', name: '三浦 彩', group: 'B', role: 'member', target: 3500000, skill: 0.56, base: 162000 },
];

// 本社 査定部の担当者。担当するグループの営業の予定・訪問を、本社画面で見る
export const APPRAISERS = [
  { id: 'a1', name: '査定部 青木', groups: ['A'] },
  { id: 'a2', name: '査定部 井上', groups: ['B'] },
];

export const userById = (id) => USERS.find((u) => u.id === id) ?? USERS[0];
export const isLeader = (u) => u.role === 'leader';
export const roleLabel = (u) => (isLeader(u) ? 'グループリーダー' : '営業');
export const groupMembers = (u) => USERS.filter((x) => x.group === u.group);

// 閲覧できるユーザー: リーダーはグループ全員、一般は自分のみ（asLeader で、表示するロールをデモ用に切り替えられる）
export function visibleUsers(user, scope, memberId, asLeader = isLeader(user)) {
  if (!asLeader) return [user];
  const members = groupMembers(user);
  if (scope === 'member') return members.filter((m) => m.id === memberId);
  return scope === 'group' ? members : [user];
}

// ---- 日付 -------------------------------------------------------------------
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function rangeOf(period, now = new Date()) {
  const end = startOfDay(now);
  if (period === 'today') return { start: end, end };
  if (period === 'week') return { start: addDays(end, -((end.getDay() + 6) % 7)), end };
  return { start: new Date(end.getFullYear(), end.getMonth(), 1), end };
}
const daysIn = ({ start, end }) => Math.round((end - start) / 86400000) + 1;
export const prevRange = (r) => ({ start: addDays(r.start, -daysIn(r)), end: addDays(r.start, -1) });
export const eachDay = (r) => Array.from({ length: daysIn(r) }, (_, i) => addDays(r.start, i));

// ---- ダミーの業績データ（ユーザー×日付で固定の疑似乱数） ---------------------------
const seeded = (str) => {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000;
};

// 訪問の結果。不在・日程変更の依頼は、営業の責任ではないため、訪問数・成約率には含めない（業績対象外）
export const RESULTS = {
  won: { label: '成約', cls: 'bg-emerald-100 text-emerald-800' },
  lost: { label: '不成約', cls: 'bg-slate-200 text-slate-700' },
  absent: { label: '不在', cls: 'bg-amber-100 text-amber-800', excluded: true },
  resched: { label: '日程変更の依頼', cls: 'bg-amber-100 text-amber-800', excluded: true },
};

const SURNAMES = ['山口', '松田', '井上', '木下', '斉藤', '橋本', '前田', '石川', '中島', '原田', '小川', '後藤', '岡本', '長谷川', '村田', '近藤'];
const GIVEN = ['太郎', '花子', '健', '美穂', '誠', '陽子', '修', '恵', '悟', '由美', '浩', '里美', '拓也', '千里'];
const GOODS = ['ブランドバッグ', '腕時計', 'ジュエリー・貴金属', 'カメラ・家電', 'ゲーム・ホビー', 'ブランドバッグ・腕時計'];
const LOST_REASONS = ['金額が合わず、見送り', '家族の同意が得られず、見送り', '今回は売却をやめる', '他社での売却を選択'];
const SLOTS = ['09:30', '11:00', '13:00', '14:30', '16:00', '17:30'];
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];

// その日の訪問の記録（ダミー）。件数・契約・金額は、ユーザー×日付で固定
function dummyVisits(user, date, isToday) {
  const rnd = seeded(`${user.id}-${ymd(date)}`);
  const rnd2 = seeded(`detail-${user.id}-${ymd(date)}`);
  if (date.getDay() === 0) return [];
  let attempts = 1 + Math.floor(rnd() * 4);
  if (isToday) attempts = Math.floor(rnd() * 3); // 当日は途中経過のため少なめ
  const times = [...SLOTS].sort(() => rnd2() - 0.5).slice(0, attempts).sort();
  return times.map((time) => {
    let result = 'lost';
    let amount = 0;
    if (rnd() < user.skill) {
      result = 'won';
      amount = Math.round((user.base * (0.3 + rnd() * 0.9)) / 1000) * 1000;
    }
    const customer = `${pick(rnd2, SURNAMES)} ${pick(rnd2, GIVEN)}`;
    const items = pick(rnd2, GOODS);
    let note = '';
    if (result === 'lost') {
      const r = rnd2();
      if (r < 0.25) { result = 'absent'; note = 'インターホン・電話ともに応答なし'; }
      else if (r < 0.4) { result = 'resched'; note = '玄関口で、別の日時での訪問を希望'; }
      else note = pick(rnd2, LOST_REASONS);
    }
    return { date, time, userId: user.id, customer, items, result, amount, note };
  });
}

function dummyDay(user, date, isToday) {
  const v = dummyVisits(user, date, isToday);
  return { visits: v.filter((x) => !RESULTS[x.result].excluded).length, contracts: v.filter((x) => x.result === 'won').length, amount: v.reduce((n, x) => n + x.amount, 0) };
}

// その日の日報（ダミー）。訪問の結果は、業績の集計と同じもの。現金は、買取代金を含む経費・入金から、ユーザー×日付で固定の値を作る
const EXPENSE_LABELS = { purchase: '買取代金', gas: 'ガソリン代', lunch: '昼食代', toll: '高速・駐車場', supply: '備品購入' };
const DIFF_NOTES = ['小銭の数え間違い', '駐車場代のレシートを紛失', '釣り銭の渡し間違い'];
const REPORT_COMMENTS = ['', '', '午後の訪問で、次回のご提案につながるお話ができた。', '渋滞で移動に時間がかかった。明日は早めに出発する。', 'お客様から、知人の紹介の話をいただいた。'];

export function dummyReport(user, date, now = new Date()) {
  const isToday = ymd(date) === ymd(now);
  const visits = dummyVisits(user, date, isToday);
  if (date.getDay() === 0 || date > now) return null;
  const rnd = seeded(`rep-${user.id}-${ymd(date)}`);
  const purchase = visits.reduce((n, v) => n + v.amount, 0);
  const expenses = [];
  if (purchase) expenses.push({ type: 'purchase', label: EXPENSE_LABELS.purchase, amount: purchase, memo: `買取 ${visits.filter((v) => v.result === 'won').length}件` });
  if (visits.length) {
    expenses.push({ type: 'gas', label: EXPENSE_LABELS.gas, amount: 4000 + Math.floor(rnd() * 21) * 100, memo: '' });
    expenses.push({ type: 'lunch', label: EXPENSE_LABELS.lunch, amount: 700 + Math.floor(rnd() * 6) * 100, memo: '' });
    if (rnd() < 0.3) expenses.push({ type: rnd() < 0.5 ? 'toll' : 'supply', label: EXPENSE_LABELS[rnd() < 0.5 ? 'toll' : 'supply'], amount: 500 + Math.floor(rnd() * 15) * 100, memo: '' });
  }
  const opening = 30000 + Math.floor(rnd() * 6) * 10000;
  const deposit = purchase > 250000 ? 500000 : 300000;
  const spent = expenses.reduce((n, e) => n + e.amount, 0);
  const balance = opening + deposit - spent;
  const diff = rnd() < 0.85 ? 0 : (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 15)) * 100;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    userId: user.id, date, source: 'dummy', closed: !isToday,
    startTime: `08:${pad(40 + Math.floor(rnd() * 30) % 20)}`, closeTime: `${17 + Math.floor(rnd() * 2)}:${pad(Math.floor(rnd() * 6) * 10)}`,
    opening, depositTotal: deposit, expenses, expenseTotal: spent, balance,
    counted: isToday ? null : balance + diff, diff: isToday ? 0 : diff, diffNote: !isToday && diff ? DIFF_NOTES[Math.floor(rnd() * DIFF_NOTES.length)] : '',
    comment: isToday ? '' : REPORT_COMMENTS[Math.floor(rnd() * REPORT_COMMENTS.length)], visits,
  };
}

// 指定ユーザー・期間の日報（新しい日から）。日曜（休み）と、これからの日はない
export function reportsOf(user, range, now = new Date()) {
  return eachDay(range).map((d) => dummyReport(user, d, now)).filter(Boolean).reverse();
}

// 指定ユーザー・期間の、訪問ごとの結果（新しい順）
export function visitRecords(users, range, now = new Date()) {
  const todayKey = ymd(now);
  return eachDay(range)
    .flatMap((d) => users.flatMap((u) => dummyVisits(u, d, ymd(d) === todayKey)))
    .sort((a, b) => b.date - a.date || b.time.localeCompare(a.time));
}

// 指定ユーザー・期間の日別データ
export function dailySeries(users, range, now = new Date()) {
  const todayKey = ymd(now);
  return eachDay(range).map((d) => {
    const row = { date: d, visits: 0, contracts: 0, amount: 0 };
    users.forEach((u) => {
      const day = dummyDay(u, d, ymd(d) === todayKey);
      row.visits += day.visits;
      row.contracts += day.contracts;
      row.amount += day.amount;
    });
    return row;
  });
}

export function summarize(series) {
  const t = series.reduce((a, d) => ({ visits: a.visits + d.visits, contracts: a.contracts + d.contracts, amount: a.amount + d.amount }), { visits: 0, contracts: 0, amount: 0 });
  return { ...t, rate: t.visits ? t.contracts / t.visits : 0, avg: t.contracts ? Math.round(t.amount / t.contracts) : 0 };
}

export const stats = (users, range, now) => summarize(dailySeries(users, range, now));

// 今月の目標達成状況（期間の選択とは独立）
export function monthProgress(users, now = new Date()) {
  const range = rangeOf('month', now);
  const amount = stats(users, range, now).amount;
  const target = users.reduce((n, u) => n + u.target, 0);
  const monthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { amount, target, rate: target ? amount / target : 0, pace: now.getDate() / monthDays };
}
