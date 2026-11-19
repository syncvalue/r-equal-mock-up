// 配布カレンダー（月の表）。日ごとに、その日に配布するチラシを並べる。画面から独立した純関数。
import { flyersOnDay } from './flyers.js';

const p2 = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

// month: 'YYYY-MM'。日曜はじまり。前後の月の日も含めて、週ごとの7日で埋める
export function monthGrid(flyers, month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(y, m, 0).getDate()) / 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
    const day = key(date);
    return { day, inMonth: date.getMonth() === m - 1, flyers: flyersOnDay(flyers, day) };
  }));
}

export function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
}
