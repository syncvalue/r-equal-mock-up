// コールセンターが確定した訪問予約。営業アプリ・本社画面と共有するため localStorage に保存する。
// schedule.js から読み込まれるため、他のモジュールには依存しない（循環を避ける）。
export const RESERVATION_KEY = 'rq-mock-reservations';

export const loadReservations = () => {
  try {
    const list = JSON.parse(localStorage.getItem(RESERVATION_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

const save = (list) => localStorage.setItem(RESERVATION_KEY, JSON.stringify(list));

export const addReservation = (record) => save([record, ...loadReservations()]);
export const removeReservation = (id) => save(loadReservations().filter((r) => r.id !== id));

const pad = (n, w = 2) => String(n).padStart(w, '0');
export const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const minToHHMM = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

// 受電番号: CC-日付-連番（その日の予約数から採番。モックのため、通話の記録がない受電は欠番になる）
export function nextReceptionNo(list, now = new Date()) {
  const day = ymdOf(now).replaceAll('-', '');
  const used = list.filter((r) => r.receptionNo.startsWith(`CC-${day}-`)).length;
  return `CC-${day}-${pad(5000 + used + 1, 4)}`;
}

// 今日からの日数（日付のみで比較）
export function dayOffset(dateStr, now = new Date()) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}

// 予約 → 営業アプリの「予定」の形式。訪問先の座標は、エリアの中心で代用する（モック）
export function reservationToEvent(r, now = new Date()) {
  return {
    id: r.id, userId: r.userId, day: dayOffset(r.date, now), start: r.start, end: r.end,
    receptionNo: r.receptionNo, receivedAt: r.receivedAt, operator: r.operator, apType: r.apType,
    items: r.hearing.wants, memo: r.hearing.notes, lat: r.lat, lng: r.lng, hearing: r.hearing,
    customer: { name: r.customer.name, kana: r.customer.kana, phone: r.customer.phone, zip: r.customer.zip, address: r.customer.address, occupation: '', birth: '' },
  };
}

export const reservationEvents = (now = new Date()) => loadReservations().map((r) => reservationToEvent(r, now));
