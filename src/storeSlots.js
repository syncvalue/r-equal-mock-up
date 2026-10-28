// 店舗の来店予約の空き状況（画面から独立した純関数）。来店の時刻は30分刻み。
// 同じ時刻に受けられる来店の数は、その店舗の有効な店舗スタッフの人数（モックの前提。1件は、その時刻の枠だけを使う）。
export const STORE_TIMES = Array.from({ length: 18 }, (_, i) => `${String(10 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export const storeCapacity = (employees, storeId) => Math.max(1, employees.filter((e) => e.role === 'store' && e.active && e.storeId === storeId).length);

const pad = (n) => String(n).padStart(2, '0');
const COUNTED = (v) => v.status !== 'cancelled' && v.status !== 'noshow' && Boolean(v.time);

// dates の各日について、時刻ごとの予約の数（booked）・空き（free）・満席（full）・過ぎた枠（past）・埋まり具合（ratio）
export function storeWeek({ visits, storeId, dates, capacity, now = Date.now() }) {
  const d = new Date(now);
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const nowTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return dates.map((date) => ({
    date,
    slots: STORE_TIMES.map((time) => {
      const booked = visits.filter((v) => v.storeId === storeId && v.date === date && v.time === time && COUNTED(v)).length;
      const free = Math.max(0, capacity - booked);
      return { time, booked, free, full: free === 0, ratio: Math.min(1, booked / capacity), past: date < today || (date === today && time < nowTime) };
    }),
  }));
}
