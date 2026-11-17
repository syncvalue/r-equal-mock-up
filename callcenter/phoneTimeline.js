// 電話番号ごとの「過去の訪問」。受電したとき、「このあたり買い取っているな」と分かりながら話せるように、
// 訪問済みの受付・取消した受付・買取の記録を、1つの一覧にまとめる（画面から独立した純関数）。
// 新しい順。これからの予約は、変更・取消のボタンがある別の欄（openResHtml）に出すので、ここには入れない。
import { visitLines } from '../src/customerHistory.js';

const digits = (s) => String(s ?? '').replace(/\D/g, '');
const pad = (n) => String(n).padStart(2, '0');
const ymdOfMs = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// reservations: 受付の記録／visits: 買取の記録（customerHistory の historyOf の visits）／declined: 見送り品（declinedList の元の形）
export function pastVisitRows({ phones, reservations, visits = [], declined = [], today, nameOf = (id) => id }) {
  const mine = new Set(phones.map(digits).filter((d) => d.length >= 10));
  if (!mine.size) return [];
  const has = (r) => [r.customer?.phone, r.customer?.phone2].some((p) => mine.has(digits(p)));
  const rows = reservations.filter((r) => has(r) && (r.status === 'cancelled' || r.date < today)).map((r) => ({
    kind: r.status === 'cancelled' ? 'cancelled' : 'visited', date: r.date, start: r.start, end: r.end, reserved: true, staff: nameOf(r.userId),
    items: r.hearing?.wants ?? '', total: 0, lines: [], note: r.status === 'cancelled' ? r.cancelReason ?? '' : '', declinedCount: 0,
  }));
  visits.forEach((v) => {
    const date = ymdOfMs(v.at);
    const row = rows.find((x) => x.kind === 'visited' && x.date === date && x.total === 0);
    const bought = { items: v.items, total: v.total, lines: visitLines(v) };
    if (row) Object.assign(row, bought);
    else rows.push({ kind: 'visited', date, start: '', end: '', reserved: false, staff: '', note: '', declinedCount: 0, ...bought });
  });
  declined.forEach((d) => {
    const row = rows.find((x) => x.kind === 'visited' && x.date === ymdOfMs(d.at));
    if (row) row.declinedCount += d.items.reduce((n, i) => n + (i.qty ?? 1), 0);
  });
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
