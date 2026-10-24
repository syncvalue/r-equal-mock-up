// 受付の記録の組み立て・復元・差分（画面に依存しない純関数）。
// 受付時の入力（form）をそのまま記録に残す（formData）ので、あとから全ての項目を変更できる。
import { ATTENDEES, flyerOf, normalizeFlyerId, triggerText, contactText, splitName } from './master.js';
import { fullName, fullKana, wantsText, companionText, profileText } from './intake.js';
import { minToHHMM } from '../src/reservations.js';

const GENDER = { f: '女性', m: '男性' };
const genderLabel = (g) => GENDER[g] ?? '';

// 入力（form）から、記録に入れる内容を作る。area=確定した営業エリア、pos=訪問先の位置（概算）
export function buildRecordFields(form, { area, pos }) {
  const flyer = flyerOf(form.flyerId)?.id;
  return {
    date: form.date, start: minToHHMM(form.start), end: minToHHMM(form.start + form.dur),
    gender: form.gender, areaId: area?.id ?? null, lat: (pos ?? area)?.lat ?? 0, lng: (pos ?? area)?.lng ?? 0,
    flyerId: form.flyerId ? normalizeFlyerId(form.flyerId) : null, chirashi: triggerText(form.chirashi, flyer),
    hearing: {
      trigger: triggerText(form.chirashi, flyer), attendee: form.attendee || '未確認', wants: wantsText(form), mainItems: { ...form.mainItems },
      large: form.large.trim() || '未確認', notes: form.notes.trim() || '未確認',
      profile: profileText(form, genderLabel), companion: companionText(form), parking: form.parking || '未確認', nameplate: form.nameplate || '未確認', contact: contactText(form.contactFrom, form.contactTo),
    },
    customer: {
      name: fullName(form), lastName: form.lastName.trim(), firstName: form.firstName.trim(), kana: fullKana(form), lastKana: form.lastKana.trim(), firstKana: form.firstKana.trim(),
      phone: form.phone.trim(), phone2: form.phone2.trim(), zip: form.zip.trim(), address: form.address.trim(),
    },
    formData: { ...form }, // 変更するときに、入力欄をそのまま戻すため
  };
}

const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

// 記録から、入力（form）を戻す。formData がない古い記録は、残っている内容から、できる範囲で戻す
export function formFromRecord(r, blank) {
  const base = r.formData
    ? { ...blank, ...r.formData }
    : (() => {
      const c = r.customer;
      const [last, first] = c.lastName !== undefined ? [c.lastName, c.firstName] : splitName(c.name);
      const [lastK, firstK] = c.lastKana !== undefined ? [c.lastKana, c.firstKana] : splitName(c.kana);
      const flyer = flyerOf(r.flyerId);
      const h = r.hearing ?? {};
      const known = (v) => (v && v !== '未確認' ? v : '');
      return {
        ...blank, phone: c.phone ?? '', phone2: c.phone2 ?? '', lastName: last, firstName: first, lastKana: lastK, firstKana: firstK, zip: c.zip ?? '',
        flyerId: flyer ? flyer.id : '', chirashi: flyer ? flyer.chirashi : null, wants: known(h.wants), mainItems: { ...blank.mainItems, ...(h.mainItems ?? {}) },
        attendee: ATTENDEES.includes(h.attendee) ? h.attendee : '', large: known(h.large), notes: known(h.notes) === '特になし' ? '' : known(h.notes),
        companion: ['あり', 'なし'].includes(String(h.companion).slice(0, 2)) ? String(h.companion).slice(0, 2) : '', parking: known(h.parking), nameplate: known(h.nameplate),
      };
    })();
  return {
    ...base, address: r.customer.address, gender: r.gender, areaId: r.areaId, areaAddr: r.customer.address, userId: r.userId,
    date: r.date, start: toMin(r.start), dur: toMin(r.end) - toMin(r.start), whenAsked: true,
  };
}

// 変更前後の違い（配車係に見せる）。項目名と、変更前→変更後
export function diffRecords(a, b, nameOf = (id) => id) {
  const out = [];
  const add = (label, x, y) => { if (String(x ?? '') !== String(y ?? '')) out.push({ label, from: String(x ?? '') || '（空）', to: String(y ?? '') || '（空）' }); };
  add('訪問日時', `${a.date} ${a.start}〜${a.end}`, `${b.date} ${b.start}〜${b.end}`);
  add('担当営業', nameOf(a.userId), nameOf(b.userId));
  add('お客様', a.customer.name, b.customer.name);
  add('電話番号', [a.customer.phone, a.customer.phone2].filter(Boolean).join(' / '), [b.customer.phone, b.customer.phone2].filter(Boolean).join(' / '));
  add('訪問先', a.customer.address, b.customer.address);
  const ha = a.hearing ?? {};
  const hb = b.hearing ?? {};
  [['trigger', '来電のきっかけ'], ['profile', '性別・年齢'], ['wants', '売りたいもの'], ['attendee', '当日の立会い'], ['companion', 'ご同席者'], ['large', '大型品'],
    ['parking', '駐車スペース'], ['nameplate', '表札'], ['contact', '前日確認の連絡時間'], ['notes', '訪問時の注意']].forEach(([k, label]) => add(label, ha[k], hb[k]));
  return out;
}
