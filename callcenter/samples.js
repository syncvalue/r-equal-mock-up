// サンプルの受付データ（ダミー）。配車確定の画面などを、最初から見られるように、今日を起点に、仮確定・確定済み・確定→変更・取消の見本を作る。
// 営業は、空いている人（欠勤・予定の重なりを避けた、担当が少ない順の先頭）を自動で割り当てる
import { areaById, locateAddress, rankCandidates } from '../src/dispatch.js';
import { ymdOf } from '../src/reservations.js';
import { blankForm } from './form.js';
import { blankMain, flyerOf } from './master.js';
import { buildRecordFields } from './record.js';

const SAMPLES = [
  // 翌々日（配車係が主に確定する日）
  { off: 2, start: 600, dur: 90, area: 'osaka', status: 'tentative', f: { lastName: '田村', firstName: '恵子', lastKana: 'タムラ', firstKana: 'ケイコ', phone: '090-4411-2201', gender: 'f', age: '58', address: '大阪府吹田市江坂町1-12-3', flyerId: 'N1019', cats: ['ブランドバッグ'], main: { 婦人服: 11 }, wants: 'ヴィトン 2点、ワンピース多数', attendee: 'ご本人', parking: 'あり', nameplate: 'あり' } },
  { off: 2, start: 780, dur: 90, area: 'osaka', status: 'tentative', f: { lastName: '中川', firstName: '昭夫', lastKana: 'ナカガワ', firstKana: 'アキオ', phone: '080-3322-1180', gender: 'm', age: '71', address: '大阪府堺市堺区南花田口町2-1-8', flyerId: 'N1012', cats: ['腕時計'], main: { 背広: 6 }, wants: 'オメガ 1本', attendee: 'ご本人', parking: 'なし', notes: '駐車場がないので、近くのコインパーキングを案内' } },
  { off: 2, start: 930, dur: 60, area: 'osaka', status: 'tentative', f: { lastName: '山田', firstName: '花子', lastKana: 'ヤマダ', firstKana: 'ハナコ', phone: '090-2468-1357', phone2: '06-1234-5678', gender: 'f', age: '62', zip: '545-0052', address: '大阪府大阪市阿倍野区阿倍野筋1-2-3', flyerId: 'N1019', cats: ['ブランドバッグ', '着物・骨董'], wants: 'シャネル 1点、着物 数点', attendee: 'ご本人', companion: 'あり', companionNote: 'ご主人' } },
  { off: 2, start: 600, dur: 90, area: 'hyogo', status: 'confirmed', f: { lastName: '岡本', firstName: '美代子', lastKana: 'オカモト', firstKana: 'ミヨコ', phone: '070-5566-7788', gender: 'f', age: '67', address: '兵庫県西宮市甲子園口2-5-6', flyerId: 'P1015', cats: ['着物・骨董'], main: { 婦人靴: 6 }, wants: '訪問着 3点', attendee: 'ご本人' } },
  { off: 2, start: 840, dur: 90, area: 'kanto', status: 'tentative', f: { lastName: '高田', firstName: '誠', lastKana: 'タカダ', firstKana: 'マコト', phone: '090-7788-1122', gender: 'm', age: '49', address: '東京都世田谷区三軒茶屋1-3-5', chirashi: 4, cats: ['カメラ・家電'], wants: 'ミラーレス 2台、レンズ 4本', attendee: 'ご本人' } },
  { off: 2, start: 660, dur: 60, area: 'osaka', status: 'tentative', review: true, f: { lastName: '小山', firstName: '敏子', lastKana: 'コヤマ', firstKana: 'トシコ', phone: '06-6334-9988', gender: 'f', age: '55', address: '大阪府豊中市庄内西町3-4-5', flyerId: 'N1019', cats: ['貴金属・ジュエリー'], wants: '指輪 3点、ネックレス 2点', attendee: 'ご本人' } },
  { off: 2, start: 810, dur: 90, area: 'osaka', status: 'cancelled', f: { lastName: '森本', firstName: '勝', lastKana: 'モリモト', firstKana: 'マサル', phone: '090-1357-2468', gender: 'm', age: '64', address: '大阪府大阪市東住吉区田辺2-6-7', flyerId: 'N1012', main: { 背広: 6 }, wants: '背広 数着', attendee: 'ご本人' } },
  // 明日・3日後・今日
  { off: 1, start: 660, dur: 60, area: 'osaka', status: 'confirmed', f: { lastName: '北村', firstName: '智子', lastKana: 'キタムラ', firstKana: 'トモコ', phone: '090-8800-1234', gender: 'f', age: '60', address: '大阪府大阪市北区天神橋3-2-1', flyerId: 'N1019', cats: ['貴金属・ジュエリー'], wants: '真珠のネックレス', attendee: 'ご本人' } },
  { off: 1, start: 840, dur: 90, area: 'osaka', status: 'tentative', f: { lastName: '西岡', firstName: '孝', lastKana: 'ニシオカ', firstKana: 'タカシ', phone: '080-6600-4321', gender: 'm', age: '73', address: '大阪府枚方市岡東町12-1', flyerId: 'D1001', cats: ['腕時計'], wants: 'セイコー 数本', attendee: 'ご本人' } },
  { off: 3, start: 630, dur: 90, area: 'osaka', status: 'tentative', f: { lastName: '藤本', firstName: '雅子', lastKana: 'フジモト', firstKana: 'マサコ', phone: '090-9922-3344', gender: 'f', age: '69', address: '大阪府大阪市北区中崎西2-4-12', flyerId: 'N1019', cats: ['着物・骨董'], wants: '着物 10点ほど', attendee: 'ご本人', companion: 'あり', companionNote: '娘様' } },
  { off: 3, start: 810, dur: 90, area: 'tokai', status: 'tentative', f: { lastName: '内山', firstName: '浩', lastKana: 'ウチヤマ', firstKana: 'ヒロシ', phone: '080-1212-3434', gender: 'm', age: '52', address: '愛知県名古屋市中村区名駅1-1-4', chirashi: 4, cats: ['ゲーム・ホビー'], wants: 'ゲーム機・ソフト 多数', attendee: 'ご本人' } },
  { off: 0, start: 900, dur: 60, area: 'osaka', status: 'confirmed', f: { lastName: '前川', firstName: '玲子', lastKana: 'マエカワ', firstKana: 'レイコ', phone: '090-5050-6060', gender: 'f', age: '57', address: '大阪府大阪市天王寺区上本町6-3-2', flyerId: 'N1012', cats: ['ブランドバッグ'], wants: 'エルメス 1点', attendee: 'ご本人' } },
];

const stampOf = (d) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function sampleReservations(now = new Date()) {
  const day = (off) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + off);
  const list = [];
  SAMPLES.forEach((sp, i) => {
    const area = areaById(sp.area);
    const flyer = flyerOf(sp.f.flyerId);
    const form = {
      ...blankForm(now), ...sp.f, date: ymdOf(day(sp.off)), start: sp.start, dur: sp.dur, areaId: area.id, areaAddr: sp.f.address,
      chirashi: sp.f.chirashi ?? flyer?.chirashi ?? null, cats: sp.f.cats ?? [], mainItems: { ...blankMain(), ...(sp.f.main ?? {}) }, phone2: sp.f.phone2 ?? '', whenAsked: true,
    };
    const pos = locateAddress(form.address, area);
    const pick = rankCandidates({ gender: form.gender, areaId: area.id, date: form.date, start: form.start, dur: form.dur, reservations: list.filter((r) => r.status !== 'cancelled'), here: pos, now })
      .inArea.find((c) => c.free);
    if (!pick) return;
    const received = new Date(day(-1).getTime() + (9 + (i % 8)) * 3600000 + (i * 7 % 60) * 60000); // 昨日の日中に受電
    const rec = {
      id: `SMP-${String(i + 1).padStart(2, '0')}`, receptionNo: `CC-${ymdOf(received).replaceAll('-', '')}-${5001 + i}`, receivedAt: stampOf(received), receivedTs: received.getTime(),
      status: sp.status === 'confirmed' ? 'confirmed' : 'tentative', operator: i % 2 ? '渡辺' : '佐藤', userId: pick.user.id, apType: sp.f.phone === '090-2468-1357' ? '再' : '新',
      ...buildRecordFields(form, { area, pos }),
    };
    if (sp.status === 'confirmed') Object.assign(rec, { confirmedAt: stampOf(new Date(received.getTime() + 20 * 3600000)), confirmedBy: '配車係' });
    if (sp.status === 'cancelled') Object.assign(rec, { status: 'cancelled', cancelReason: 'お客様のご都合（やめる）', cancelledAt: stampOf(new Date(received.getTime() + 22 * 3600000)), cancelledBy: '佐藤' });
    if (sp.review) { // 確定済みだった予約が、日時を変更されて、仮確定に戻った見本
      const was = { date: ymdOf(day(3)), start: '13:00', end: '14:00', userId: pick.user.id };
      Object.assign(rec, { needsReview: true, revertedAt: stampOf(new Date(now.getTime() - 3600000)), changes: [{ at: stampOf(new Date(now.getTime() - 3600000)), by: '渡辺', wasConfirmed: true,
        diff: [{ label: '訪問日時', from: `${was.date} ${was.start}〜${was.end}`, to: `${rec.date} ${rec.start}〜${rec.end}` }, { label: '訪問先', from: '大阪府豊中市庄内東町1-1-1', to: rec.customer.address }] }] });
    }
    list.push(rec);
  });
  return list;
}
