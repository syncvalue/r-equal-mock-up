// マーケティング部のダッシュボード（追いたい数字）。画面から独立した純関数。
import { flyerStats, shiftDay, stageOf } from './flyers.js';

const p2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const OPEN = ['plan', 'design']; // 入稿していない進捗

// 入稿の期限を分ける（未着手・制作中で、期限があるものだけ）。overdue＝期限が過ぎた／today＝今日／soon＝あす〜3日以内
export function dueFlyers(flyers, today) {
  const open = flyers.filter((f) => f.active && f.deadline && OPEN.includes(stageOf(f, today))).sort((a, b) => a.deadline.localeCompare(b.deadline) || a.id.localeCompare(b.id));
  const limit = shiftDay(today, 3);
  return { overdue: open.filter((f) => f.deadline < today), today: open.filter((f) => f.deadline === today), soon: open.filter((f) => f.deadline > today && f.deadline <= limit) };
}

// n か月前の同じ日（その月にない日は、月末）
export function windowStart(today, months) {
  const [y, m, d] = today.split('-').map(Number);
  const last = new Date(y, m - 1 - months + 1, 0).getDate();
  return ymd(new Date(y, m - 1 - months, Math.min(d, last)));
}

// 直近 months か月（既定3）の、受付の件数の多い順。反響のないチラシは入れない
export function topFlyersByCalls(flyers, receptions, today, { months = 3, limit = 5 } = {}) {
  const from = windowStart(today, months);
  const inWindow = receptions.filter((r) => r.receivedTs && ymd(new Date(r.receivedTs)) >= from && ymd(new Date(r.receivedTs)) <= today);
  return flyerStats(flyers, inWindow).filter((s) => s.calls > 0).sort((a, b) => b.calls - a.calls || a.flyer.id.localeCompare(b.flyer.id)).slice(0, limit);
}

// 有効なチラシの、進捗ごとの件数
export function stageCounts(flyers, today = '') {
  const c = { plan: 0, design: 0, submitted: 0, distributed: 0 };
  flyers.filter((f) => f.active).forEach((f) => { c[stageOf(f, today)] += 1; });
  return c;
}

// 今月のまとめ: 受付の件数（先月も）、今月配布するチラシの費用、今月の受付の粗利と損益
export function monthSummary(flyers, receptions, results, today) {
  const month = today.slice(0, 7);
  const prev = windowStart(`${month}-01`, 1).slice(0, 7);
  const monthOf = (r) => ymd(new Date(r.receivedTs)).slice(0, 7);
  const withFlyer = receptions.filter((r) => r.flyerId && r.receivedTs);
  const mine = withFlyer.filter((r) => monthOf(r) === month);
  const cost = flyers.filter((f) => f.active && f.from.slice(0, 7) === month).reduce((n, f) => n + f.cost, 0);
  const gross = mine.reduce((n, r) => n + (results[r.id]?.gross ?? 0), 0);
  return { calls: mine.length, prevCalls: withFlyer.filter((r) => monthOf(r) === prev).length, cost, gross, profit: gross - cost };
}
