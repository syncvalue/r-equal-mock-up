// 週間収支: 週（月曜〜日曜）ごとの入出金、粗利、固定費、残高。入出金の帳簿（ledger.js）から集計する。
import { dateKey } from './workday.js';
import { totals, balanceOn, datesBetween, OPENING_BALANCE } from './ledger.js';

// その日を含む週の、月曜の日付
export function weekStart(date) {
  const d = new Date(`${date}T00:00:00`);
  return dateKey(new Date(d.getTime() - ((d.getDay() + 6) % 7) * 86400000));
}
export const weekEnd = (start) => dateKey(new Date(new Date(`${start}T00:00:00`).getTime() + 6 * 86400000));
export const shiftWeek = (start, n) => dateKey(new Date(new Date(`${start}T00:00:00`).getTime() + n * 7 * 86400000));

// 粗利 ＝ 販売代金 − 原価（販売代金の記録に入れた原価）
export const grossProfit = (list) => list.filter((e) => e.category === 'sales').reduce((n, e) => n + e.amount - e.cost, 0);

export function weeklySummary(list, start, opening = OPENING_BALANCE) {
  const end = weekEnd(start);
  const week = list.filter((e) => e.date >= start && e.date <= end);
  const t = totals(week);
  const gross = grossProfit(week);
  const fixed = week.filter((e) => e.category === 'fixed').reduce((n, e) => n + e.amount, 0);
  const days = datesBetween(start, end).map((date) => {
    const d = totals(week.filter((e) => e.date === date));
    return { date, in: d.in, out: d.out, balance: balanceOn(list, date, opening) };
  });
  return {
    start, end, in: t.in, out: t.out, gross, fixed, afterFixed: gross - fixed,
    opening: balanceOn(list, dateKey(new Date(new Date(`${start}T00:00:00`).getTime() - 86400000)), opening), balance: balanceOn(list, end, opening), days,
  };
}

// 直近 n 週（新しい週が先）
export const recentWeeks = (list, now, n = 8, opening = OPENING_BALANCE) => {
  const cur = weekStart(dateKey(new Date(now)));
  return Array.from({ length: n }, (_, i) => weeklySummary(list, shiftWeek(cur, -i), opening));
};
