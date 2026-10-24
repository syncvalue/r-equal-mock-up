// コールセンターが確定した訪問予約。営業アプリ・本社画面と共有するため localStorage に保存する。
// schedule.js から読み込まれるため、他のモジュールには依存しない（循環を避ける）。
export const RESERVATION_KEY = 'rq-mock-reservations';
// 配車係が動かして、予約として取り込んだ元の予定（営業のスケジュールに元からあった予定）の識別子
export const MOVED_KEY = 'rq-mock-moved-blocks';
export const loadMovedIds = () => {
  try {
    const list = JSON.parse(localStorage.getItem(MOVED_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
export const addMovedId = (id) => localStorage.setItem(MOVED_KEY, JSON.stringify([...new Set([...loadMovedIds(), id])]));

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
export const updateReservation = (id, patch) => save(loadReservations().map((r) => (r.id === id ? { ...r, ...patch } : r)));

// 受付の状態。オペレーターは「仮確定」まで。誰が訪問するかは、配車係が確定する（主に翌々日の予定を、毎日確定していく）。
// status がない古い記録は、確定済みとして扱う
export const isTentative = (r) => r.status === 'tentative';
export const isCancelled = (r) => r.status === 'cancelled';

const stamp = () => new Date().toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' });

// 取消。記録は残す（誰が・いつ・なぜ）。取り消した予約は、営業の空き・担当件数・営業のタブレットの予定から外れる
export const cancelReservation = (id, reason, by) => updateReservation(id, { status: 'cancelled', needsReview: false, cancelReason: reason, cancelledAt: stamp(), cancelledBy: by });

// 受付済みの予約の変更（どの項目でも）。仮確定の変更は、仮確定のまま（誰にも知らせない）。
// 確定済みの変更は、仮確定に戻し、配車係に分かるよう needsReview を立てる（配車係が確定し直す・確認するまで）。変更の履歴（変更前後の差分）を残す
export function amendReservation(id, fields, by, diff = [], { notify = true } = {}) { // notify=false: 配車係自身の変更（自分には知らせない）
  const r = loadReservations().find((x) => x.id === id);
  if (!r) return;
  const wasConfirmed = !isTentative(r);
  const revert = wasConfirmed ? { confirmedAt: null, confirmedBy: null, needsReview: notify, revertedAt: stamp() } : {};
  updateReservation(id, { ...fields, status: 'tentative', ...revert, changes: [...(r.changes ?? []), { at: stamp(), by, wasConfirmed, diff }] });
}

// 配車係が確認すべき変更（確定済みだった予約が、変更されて仮確定に戻った）
export const needsReview = (r) => Boolean(r.needsReview) && !isCancelled(r);
export const acknowledgeReservation = (id) => updateReservation(id, { needsReview: false });
// 仮確定に戻った時点からの、変更の差分（その間に複数回変更されたら、すべて）
export function reviewDiffs(r) {
  const list = r.changes ?? [];
  const from = list.map((c) => c.wasConfirmed).lastIndexOf(true);
  return list.slice(Math.max(0, from)).flatMap((c) => c.diff ?? []);
}

// お客様から電話があったとき、その番号で受け付け済みの（まだ訪問していない・取り消していない）予約を探す
export function openReservationsFor(list, phones, today) {
  const mine = phones.map((p) => String(p ?? '').replace(/\D/g, '')).filter((d) => d.length >= 10);
  if (!mine.length) return [];
  return list
    .filter((r) => !isCancelled(r) && r.date >= today && [r.customer.phone, r.customer.phone2].some((p) => mine.includes(String(p ?? '').replace(/\D/g, ''))))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

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
    customer: { name: r.customer.name, kana: r.customer.kana, phone: r.customer.phone, phone2: r.customer.phone2 ?? '', zip: r.customer.zip, address: r.customer.address, occupation: '', birth: '' },
  };
}

// 営業のタブレットに出すのは、配車係が確定した訪問だけ（仮確定は、担当が決まっていないため出さない）
export const reservationEvents = (now = new Date()) => loadReservations().filter((r) => !isTentative(r) && !isCancelled(r)).map((r) => reservationToEvent(r, now));
