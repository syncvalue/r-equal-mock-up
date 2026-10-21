// 訪問予定（静的なダミーデータ）。日付は「今日からの日数」で持ち、常に今日を起点に3日分を表示する。
export const OFFICE = { name: '営業所', address: '大阪府大阪市天王寺区上汐5丁目1-1', lat: 34.6623, lng: 135.5174 };

const c = (name, kana, phone, zip, address, occupation, birth) => ({ name, kana, phone, zip, address, occupation, birth });

// 訪問先は、実在する施設の住所・座標（Googleマップで検索できる場所）。お客様の氏名・電話は架空。
export const EVENTS = [
  { id: 'ev-0-1', day: 0, start: '10:00', end: '11:30', receptionNo: 'CC-20261020-0042', receivedAt: '2026/10/20 09:42', operator: '佐藤', apType: '新',
    items: 'ブランドバッグ・腕時計', memo: '1階エントランスでお待ちください。', lat: 34.6462, lng: 135.5138,
    customer: c('山田 太郎', 'ヤマダ タロウ', '090-1234-5678', '545-6016', '大阪府大阪市阿倍野区阿倍野筋1-1-43（あべのハルカス）', '会社員', '1975-04-12') },
  { id: 'ev-0-2', day: 0, start: '13:00', end: '14:00', receptionNo: 'CC-20261020-0047', receivedAt: '2026/10/20 11:05', operator: '佐藤', apType: '再',
    items: '貴金属・ジュエリー', memo: '前回ご利用のお客様。', lat: 34.6525, lng: 135.5063,
    customer: c('中村 花子', 'ナカムラ ハナコ', '080-2345-6789', '556-0002', '大阪府大阪市浪速区恵美須東1-18-6（通天閣）', '自営', '1962-09-03') },
  { id: 'ev-0-3', day: 0, start: '15:30', end: '17:00', receptionNo: 'CC-20261020-0051', receivedAt: '2026/10/20 13:20', operator: '渡辺', apType: '新',
    items: 'カメラ・家電', memo: 'ご夫婦で同席予定。', lat: 34.6873, lng: 135.5262,
    customer: c('小林 悟', 'コバヤシ サトル', '070-3456-7890', '540-0002', '大阪府大阪市中央区大阪城1-1（大阪城天守閣）', '会社員', '1980-01-27') },
  { id: 'ev-1-1', day: 1, start: '10:30', end: '12:00', receptionNo: 'CC-20261020-0058', receivedAt: '2026/10/20 15:02', operator: '佐藤', apType: '新',
    items: 'ブランドバッグ', memo: '', lat: 34.7055, lng: 135.49,
    customer: c('加藤 恵', 'カトウ メグミ', '090-4567-8901', '531-6023', '大阪府大阪市北区大淀中1-1-88（梅田スカイビル）', 'パート', '1971-06-18') },
  { id: 'ev-1-2', day: 1, start: '14:00', end: '15:00', receptionNo: 'CC-20261020-0061', receivedAt: '2026/10/20 16:30', operator: '渡辺', apType: '再',
    items: '腕時計', memo: 'ロレックスを数本。事前に型番の連絡あり。', lat: 34.8083, lng: 135.5321,
    customer: c('吉田 修', 'ヨシダ オサム', '080-5678-9012', '565-0826', '大阪府吹田市千里万博公園1-1（万博記念公園）', '自営', '1958-11-09') },
  { id: 'ev-1-3', day: 1, start: '16:00', end: '17:30', receptionNo: 'CC-20261020-0064', receivedAt: '2026/10/20 17:10', operator: '佐藤', apType: '新',
    items: '貴金属', memo: '', lat: 34.7855, lng: 135.4382,
    customer: c('松本 里美', 'マツモト サトミ', '070-6789-0123', '560-0036', '大阪府豊中市蛍池西町3-555（大阪国際空港）', '無職', '1949-03-22') },
  { id: 'ev-2-1', day: 2, start: '11:00', end: '12:00', receptionNo: 'CC-20261021-0003', receivedAt: '2026/10/21 09:15', operator: '佐藤', apType: '新',
    items: 'ゲーム・ホビー', memo: '', lat: 34.6545, lng: 135.429,
    customer: c('井上 誠', 'イノウエ マコト', '090-7890-1234', '552-0022', '大阪府大阪市港区海岸通1-1-10（海遊館）', '会社員', '1990-08-14') },
  { id: 'ev-2-2', day: 2, start: '13:30', end: '15:00', receptionNo: 'CC-20261021-0006', receivedAt: '2026/10/21 10:40', operator: '渡辺', apType: '再',
    items: 'ブランドバッグ・ジュエリー', memo: '', lat: 34.6654, lng: 135.4323,
    customer: c('木村 陽子', 'キムラ ヨウコ', '080-8901-2345', '554-0031', '大阪府大阪市此花区桜島2-1-33（ユニバーサル・スタジオ・ジャパン）', '自営', '1968-12-05') },
];

export const eventsOfDay = (day) => EVENTS.filter((e) => e.day === day).sort((a, b) => a.start.localeCompare(b.start));
export const eventById = (id) => EVENTS.find((e) => e.id === id);
export const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
export const dayDate = (day, now = new Date()) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + day);
