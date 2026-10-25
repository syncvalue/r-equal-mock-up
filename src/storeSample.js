// 店舗の来店のサンプル（ダミー）。記録が空のときだけ、画面の起動時に入れる。今日を基準に、待ち・予約・完了が並ぶ。
import { dateKey } from './workday.js';

// 店舗ごとの見本（先頭の2店舗に、それぞれ別のお客様）
const PEOPLE = [
  [
    { name: '山田 花子', kana: 'ヤマダ ハナコ', phone: '090-2468-1357', wants: '腕時計・ブランドバッグ' }, // 過去に3回の買取（見本の履歴）
    { name: '鈴木 一郎', kana: 'スズキ イチロウ', phone: '', wants: 'カメラ' },
    { name: '高橋 恵子', kana: 'タカハシ ケイコ', phone: '080-3333-4401', wants: 'ジュエリー' },
    { name: '森田 健', kana: 'モリタ ケン', phone: '070-3333-4402', wants: '貴金属' },
  ],
  [
    { name: '前田 聡', kana: 'マエダ サトシ', phone: '090-4444-5501', wants: 'ブランドバッグ' },
    { name: '斉藤 由美', kana: 'サイトウ ユミ', phone: '', wants: '腕時計' },
    { name: '岡本 剛', kana: 'オカモト ツヨシ', phone: '080-4444-5502', wants: 'ゲーム・ホビー' },
    { name: '長谷川 優', kana: 'ハセガワ ユウ', phone: '070-4444-5503', wants: 'ジュエリー' },
  ],
];
const OPERATORS = ['佐藤', '渡辺'];
const STAFF = [{ id: 'st01', name: '田中 美咲' }, { id: 'st03', name: '松井 彩花' }];

export function sampleVisits(now, storeIds) {
  const today = dateKey(new Date(now));
  const tomorrow = dateKey(new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate() + 1));
  const at = (h, m) => { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime(); };
  return storeIds.slice(0, PEOPLE.length).flatMap((storeId, i) => {
    const [a, b, c, d] = PEOPLE[i];
    const base = (n, who, status, extra) => ({ id: `SV-SAMPLE-${i}${n}`, storeId, status, customer: { name: who.name, kana: who.kana, phone: who.phone }, wants: who.wants, createdAt: at(9, 0), createdBy: OPERATORS[i], ...extra });
    return [
      base(1, a, 'reserved', { source: 'reserved', date: today, time: '14:00' }),
      base(2, c, 'reserved', { source: 'reserved', date: tomorrow, time: '11:00' }),
      base(3, b, 'waiting', { source: 'walkin', date: today, time: '', createdBy: '', arrivedAt: at(10, 40) }),
      base(4, d, 'done', { source: 'walkin', date: today, time: '', createdBy: '', arrivedAt: at(10, 0), startedAt: at(10, 5), endedAt: at(10, 50), staffId: STAFF[i].id, staffName: STAFF[i].name, result: { type: 'purchased', contractId: `GS-SAMPLE-${i}`, total: 86000, count: 2 } }),
    ];
  });
}
