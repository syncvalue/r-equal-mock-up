// 営業のスケジュールに元から入っていた予定（灰色の帯）を、配車係が動かせるように、予約として取り込む（画面に依存しない）。
// 取り込んだ予約は、元の位置のまま「確定済み」で作り、そのあと動かす（動かすと、仮確定に戻る）。元の予定は、元の位置から外す
import { areaOfUser } from '../src/dispatch.js';
import { hearingOf } from '../src/schedule.js';
import { minToHHMM } from '../src/reservations.js';

const stamp = (d = new Date()) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const base = (areaId) => ({ areaId: areaId ?? null });
const UNKNOWN = '未確認';

export function reservationFromBlock(block, { userId, date, now = new Date(), seq = 1 }) {
  const e = block.ev ?? null;
  const areaId = areaOfUser(userId);
  const common = { id: `AD-${block.gid}`, status: 'confirmed', confirmedAt: stamp(now), confirmedBy: '（営業の予定を取り込み）', userId, date, start: minToHHMM(block.start), end: minToHHMM(block.end), gender: '', lat: block.lat ?? 0, lng: block.lng ?? 0, ...base(areaId) };
  if (e) {
    const h = hearingOf(e);
    return {
      ...common, receptionNo: e.receptionNo, receivedAt: e.receivedAt, receivedTs: Date.parse(String(e.receivedAt).replace(/\//g, '-')) || now.getTime(), operator: e.operator, apType: e.apType, flyerId: null, chirashi: h.trigger,
      hearing: { trigger: h.trigger, attendee: h.attendee, wants: h.wants, large: h.large, notes: h.notes, profile: UNKNOWN, companion: UNKNOWN, parking: UNKNOWN, nameplate: UNKNOWN, contact: UNKNOWN },
      customer: { name: e.customer.name, kana: e.customer.kana, phone: e.customer.phone, phone2: '', zip: e.customer.zip, address: e.customer.address },
    };
  }
  return { // ダミーの他の訪問（お客様名と住所だけ）
    ...common, receptionNo: `CC-${date.replaceAll('-', '')}-${9000 + seq}`, receivedAt: stamp(now), receivedTs: now.getTime(), operator: '—', apType: '新', flyerId: null, chirashi: UNKNOWN,
    hearing: { trigger: UNKNOWN, attendee: UNKNOWN, wants: '（既存の予定）', large: UNKNOWN, notes: UNKNOWN, profile: UNKNOWN, companion: UNKNOWN, parking: UNKNOWN, nameplate: UNKNOWN, contact: UNKNOWN },
    customer: { name: String(block.label).replace(/\s*様$/, ''), kana: '', phone: '', phone2: '', zip: '', address: block.place ?? '' },
  };
}
