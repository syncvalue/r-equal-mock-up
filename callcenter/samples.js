// サンプルの受付データ（ダミー）。配車確定の画面などを、最初から見られるように、今日を起点に、仮確定・確定済み・確定→変更・取消の見本を作る。
// 鑑定士は、空いている人（休み・予定の重なりを避けた、担当が少ない順の先頭）を自動で割り当てる
import { areaById, locateAddress, rankCandidates, dummyCustomerRank } from '../src/dispatch.js';
import { ymdOf } from '../src/reservations.js';
import { blankForm } from './form.js';
import { blankMain, flyerOf } from './master.js';
import { buildRecordFields } from './record.js';
import { seedCustomerIds } from '../src/customerHistory.js';

const SAMPLES = [
  // 翌々日（配車係が主に確定する日）
  { off: 2, start: 600, dur: 90, area: 'osaka', status: 'tentative', f: { name: '田村 恵子', kana: 'タムラ ケイコ', phone: '090-4411-2201', gender: 'f', age: '58', address: '大阪府吹田市千里万博公園1-1（万博記念公園）', flyerId: 'N1019', cats: ['ブランドバッグ'], main: { 婦人服: 11 }, wants: 'ヴィトン 2点、ワンピース多数', attendee: 'ご本人', parking: 'あり', nameplate: 'あり' } },
  { off: 2, start: 780, dur: 90, area: 'osaka', status: 'tentative', f: { name: '中川 昭夫', kana: 'ナカガワ アキオ', phone: '080-3322-1180', gender: 'm', age: '71', address: '大阪府堺市堺区南瓦町3-1（堺市役所）', flyerId: 'N1012', cats: ['腕時計'], main: { 背広: 6 }, wants: 'オメガ 1本', attendee: 'ご本人', parking: 'なし', notes: '駐車場がないので、近くのコインパーキングを案内' } },
  { off: 2, start: 930, dur: 60, area: 'osaka', status: 'tentative', f: { name: '山田 花子', kana: 'ヤマダ ハナコ', phone: '090-2468-1357', phone2: '06-1234-5678', gender: 'f', age: '62', zip: '542-0076', address: '大阪府大阪市中央区難波5-1-60（なんばCITY）', flyerId: 'N1019', cats: ['ブランドバッグ', '着物・骨董'], wants: 'シャネル 1点、着物 数点', attendee: 'ご本人', companion: 'あり', companionNote: 'ご主人' } },
  { off: 2, start: 600, dur: 90, area: 'hyogo', status: 'confirmed', f: { name: '岡本 美代子', kana: 'オカモト ミヨコ', phone: '070-5566-7788', gender: 'f', age: '67', address: '兵庫県西宮市甲子園町1-1（甲子園球場）', flyerId: 'P1015', cats: ['着物・骨董'], main: { 婦人靴: 6 }, wants: '訪問着 3点', attendee: 'ご本人' } },
  { off: 2, start: 840, dur: 90, area: 'kanto', status: 'tentative', f: { name: '高田 誠', kana: 'タカダ マコト', phone: '090-7788-1122', gender: 'm', age: '49', address: '東京都港区芝公園4-2-8（東京タワー）', chirashi: 4, cats: ['カメラ・家電'], wants: 'ミラーレス 2台、レンズ 4本', attendee: 'ご本人' } },
  { off: 2, start: 660, dur: 60, area: 'osaka', status: 'tentative', review: true, f: { name: '小山 敏子', kana: 'コヤマ トシコ', phone: '06-6334-9988', gender: 'f', age: '55', address: '大阪府大阪市淀川区西中島5-16-1（新大阪駅）', flyerId: 'N1019', cats: ['貴金属・ジュエリー'], wants: '指輪 3点、ネックレス 2点', attendee: 'ご本人' } },
  { off: 2, start: 810, dur: 90, area: 'osaka', status: 'cancelled', f: { name: '森本 勝', kana: 'モリモト マサル', phone: '090-1357-2468', gender: 'm', age: '64', address: '大阪府大阪市都島区東野田町2-1-38（京橋駅）', flyerId: 'N1012', main: { 背広: 6 }, wants: '背広 数着', attendee: 'ご本人' } },
  // 同じ番号で、複数の予約と、過去の訪問がある見本（受電画面で「過去の訪問」を見られる）。日付は、買取の履歴（src/customerHistory.js）に合わせる
  { on: '2026-08-03', start: 600, dur: 90, status: 'confirmed', area: 'osaka', f: { name: '山田 花子', kana: 'ヤマダ ハナコ', phone: '090-2468-1357', phone2: '06-1234-5678', gender: 'f', age: '62', zip: '542-0076', address: '大阪府大阪市中央区難波5-1-60（なんばCITY）', flyerId: 'N1019', cats: ['ブランドバッグ', '着物・骨董'], wants: 'シャネル 1点、着物 数点', attendee: 'ご本人', companion: 'あり', companionNote: 'ご主人' } },
  { on: '2026-04-12', start: 780, dur: 90, status: 'confirmed', area: 'osaka', f: { name: '山田 花子', kana: 'ヤマダ ハナコ', phone: '090-2468-1357', phone2: '06-1234-5678', gender: 'f', age: '62', zip: '542-0076', address: '大阪府大阪市中央区難波5-1-60（なんばCITY）', flyerId: 'N1019', cats: ['ブランドバッグ', '着物・骨董'], wants: 'シャネル 1点、着物 数点', attendee: 'ご本人', companion: 'あり', companionNote: 'ご主人' } },
  { off: 9, start: 600, dur: 90, status: 'tentative', area: 'osaka', f: { name: '山田 花子', kana: 'ヤマダ ハナコ', phone: '090-2468-1357', phone2: '06-1234-5678', gender: 'f', age: '62', zip: '542-0076', address: '大阪府大阪市中央区難波5-1-60（なんばCITY）', flyerId: 'N1019', cats: ['ブランドバッグ', '着物・骨董'], wants: 'シャネル 1点、着物 数点', attendee: 'ご本人', companion: 'あり', companionNote: 'ご主人' } },
  { on: '2026-09-12', start: 600, dur: 120, area: 'osaka', status: 'confirmed', f: { name: '前川 玲子', kana: 'マエカワ レイコ', phone: '090-5050-6060', gender: 'f', age: '57', address: '大阪府大阪市天王寺区茶臼山町1-108（天王寺動物園）', flyerId: 'N1012', cats: ['ブランドバッグ'], wants: 'エルメス 1点', attendee: 'ご本人' } },
  // 明日・3日後・今日
  { off: 1, start: 660, dur: 60, area: 'osaka', status: 'confirmed', f: { name: '北村 智子', kana: 'キタムラ トモコ', phone: '090-8800-1234', gender: 'f', age: '60', address: '大阪府大阪市中央区大阪城1-1（大阪城天守閣）', flyerId: 'N1019', cats: ['貴金属・ジュエリー'], wants: '真珠のネックレス', attendee: 'ご本人' }, calls: [{ result: 'reached', memo: '時間は予定どおりで大丈夫。ネックレスのほかに、指輪も見てほしいとのこと', by: '佐藤', hoursAgo: 3 }] },
  { off: 1, start: 840, dur: 90, area: 'osaka', status: 'tentative', hold: 'お客様に連絡して、回答待ち', f: { name: '西岡 孝', kana: 'ニシオカ タカシ', phone: '080-6600-4321', gender: 'm', age: '73', address: '大阪府枚方市大垣内町2-1-20（枚方市役所）', flyerId: 'D1001', cats: ['腕時計'], wants: 'セイコー 数本', attendee: 'ご本人' }, calls: [{ result: 'noanswer', memo: '留守電に伝言を入れた', by: '渡辺', hoursAgo: 4 }, { result: 'noanswer', memo: '', by: '佐藤', hoursAgo: 1 }] },
  { off: 3, start: 630, dur: 90, area: 'osaka', status: 'tentative', f: { name: '藤本 雅子', kana: 'フジモト マサコ', phone: '090-9922-3344', gender: 'f', age: '69', address: '大阪府大阪市北区梅田3-1-1（大阪駅）', flyerId: 'N1019', cats: ['着物・骨董'], wants: '着物 10点ほど', attendee: 'ご本人', companion: 'あり', companionNote: '娘様' } },
  { off: 3, start: 810, dur: 90, area: 'tokai', status: 'tentative', f: { name: '内山 浩', kana: 'ウチヤマ ヒロシ', phone: '080-1212-3434', gender: 'm', age: '52', address: '愛知県名古屋市中村区名駅1-1-4（名古屋駅）', chirashi: 4, cats: ['ゲーム・ホビー'], wants: 'ゲーム機・ソフト 多数', attendee: 'ご本人' } },
  { off: 0, start: 900, dur: 60, area: 'osaka', status: 'confirmed', f: { name: '前川 玲子', kana: 'マエカワ レイコ', phone: '090-5050-6060', gender: 'f', age: '57', address: '大阪府大阪市天王寺区茶臼山町1-108（天王寺動物園）', flyerId: 'N1012', cats: ['ブランドバッグ'], wants: 'エルメス 1点', attendee: 'ご本人' } },
];

const stampOf = (d) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function sampleReservations(now = new Date()) {
  const day = (off) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + off);
  const list = [];
  const digitsOf = (p) => String(p ?? '').replace(/\D/g, '');
  const known = new Map(seedCustomerIds().map((c) => [digitsOf(c.phones[0]), c.id]));
  let nextId = 200; // 過去の履歴にないお客様は、C000201 から順に付ける（同じ電話番号は同じID）
  const idOfSample = (phone) => { const k = digitsOf(phone); if (!known.has(k)) known.set(k, `C${String(++nextId).padStart(6, '0')}`); return known.get(k); };
  const daysTo = (ymd) => Math.round((new Date(`${ymd}T00:00:00`) - day(0)) / 86400000);
  SAMPLES.forEach((sp0, i) => {
    const sp = { ...sp0, off: sp0.on ? daysTo(sp0.on) : sp0.off }; // on=日付で指定（買取の履歴に合わせる過去の訪問）
    const area = areaById(sp.area);
    const flyer = flyerOf(sp.f.flyerId);
    const form = {
      ...blankForm(now), ...sp.f, customerId: idOfSample(sp.f.phone), date: ymdOf(day(sp.off)), start: sp.start, dur: sp.dur, areaId: area.id, areaAddr: sp.f.address,
      chirashi: sp.f.chirashi ?? flyer?.chirashi ?? null, cats: sp.f.cats ?? [], mainItems: { ...blankMain(), ...(sp.f.main ?? {}) }, phone2: sp.f.phone2 ?? '', whenAsked: true,
    };
    const pos = locateAddress(form.address, area);
    const pick = rankCandidates({ gender: form.gender, areaId: area.id, date: form.date, start: form.start, dur: form.dur, reservations: list.filter((r) => r.status !== 'cancelled'), here: pos, now })
      .inArea.find((c) => c.free);
    if (!pick) return;
    const received = new Date(day(sp.on ? sp.off - 1 : -1).getTime() + (9 + (i % 8)) * 3600000 + (i * 7 % 60) * 60000); // 昨日の日中に受電
    const rec = {
      id: `SMP-${String(i + 1).padStart(2, '0')}`, receptionNo: `CC-${ymdOf(received).replaceAll('-', '')}-${5001 + i}`, receivedAt: stampOf(received), receivedTs: received.getTime(),
      status: sp.status === 'confirmed' ? 'confirmed' : 'tentative', operator: i % 2 ? '渡辺' : '佐藤', userId: pick.user.id, apType: sp.f.phone === '090-2468-1357' ? '再' : '新', customerRank: dummyCustomerRank(`${sp.f.phone}`),
      ...buildRecordFields(form, { area, pos }),
    };
    if (sp.status === 'confirmed') Object.assign(rec, { confirmedAt: stampOf(new Date(received.getTime() + 20 * 3600000)), confirmedBy: '配車係' });
    if (sp.status === 'cancelled') Object.assign(rec, { status: 'cancelled', cancelReason: 'お客様のご都合（やめる）', cancelledAt: stampOf(new Date(received.getTime() + 22 * 3600000)), cancelledBy: '佐藤' });
    if (sp.calls) rec.confirmCalls = sp.calls.map((c) => ({ result: c.result, memo: c.memo, by: c.by, at: now.getTime() - c.hoursAgo * 3600000 })); // 前日確認の連絡の見本
    if (sp.hold) Object.assign(rec, { everConfirmed: true, holdNote: sp.hold, revertedAt: stampOf(new Date(now.getTime() - 2 * 3600000)) }); // 配車係が、お客様に連絡するために、確定から仮に戻した見本
    if (sp.review) { // 確定済みだった予約が、日時を変更されて、仮確定に戻った見本
      const was = { date: ymdOf(day(3)), start: '13:00', end: '14:00', userId: pick.user.id };
      Object.assign(rec, { needsReview: true, everConfirmed: true, revertedAt: stampOf(new Date(now.getTime() - 3600000)), changes: [{ at: stampOf(new Date(now.getTime() - 3600000)), by: '渡辺', wasConfirmed: true,
        diff: [{ label: '訪問日時', from: `${was.date} ${was.start}〜${was.end}`, to: `${rec.date} ${rec.start}〜${rec.end}` }, { label: '訪問先', from: '大阪府豊中市庄内東町1-1-1', to: rec.customer.address }] }] });
    }
    list.push(rec);
  });
  return list;
}
