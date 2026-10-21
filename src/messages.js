// 本社からのメッセージ。初期表示用の固定メッセージ（ダミー）と、本社画面から送られたメッセージを合わせて扱う。
import { loadMessages, loadReadIds } from './store.js';

const H = 3600000;
const ago = (hours) => Date.now() - hours * H;

// 固定のダミーメッセージ（全員宛）
const SEED = () => [
  { id: 'seed-1', important: true, sender: '本社 営業企画部', target: 'all', sentAt: ago(2),
    title: '今週金曜 18:00 月次ミーティングのお知らせ',
    body: '今週金曜日の18:00から、オンラインで月次ミーティングを行います。各グループの先月の振り返りと、今月の買取強化商材の共有を予定しています。参加リンクは別途メールでお送りします。' },
  { id: 'seed-2', important: true, sender: '本社 コンプライアンス室', target: 'all', sentAt: ago(26),
    title: 'クーリング・オフの説明を徹底してください',
    body: '訪問時は、クーリング・オフの内容と満了日を、必ずお客様に口頭でお伝えし、契約書のチェック項目に記入いただいてください。説明漏れのご報告が増えています。' },
  { id: 'seed-3', important: false, sender: '本社 査定部', target: 'all', sentAt: ago(50),
    title: '今月の買取強化商材',
    body: 'ロレックス（デイトジャスト・サブマリーナ）、ルイ・ヴィトン（ネヴァーフル・スピーディ）の買取を強化しています。状態の良いものは、査定部へ写真を送ってご相談ください。' },
  { id: 'seed-4', important: false, sender: '本社 システム管理', target: 'all', sentAt: ago(96),
    title: 'シールのQR読取について',
    body: '買取商品へのシール貼付後、QRコードの読取を忘れずに行ってください。読取が完了していない商品は、持ち帰り時のチェックで差異となります。' },
  // グループリーダーからのメッセージ（kind: 'leader'。宛先は、そのグループ）
  { id: 'seed-l1', kind: 'leader', important: true, sender: 'リーダー 田中 健', target: 'A', sentAt: ago(5),
    title: '今週の訪問目標について',
    body: '今週は、グループ全体で買取金額 600万円を目標にします。再訪のお客様へのご提案を優先し、困ったことがあれば、訪問前に私へ連絡してください。' },
  { id: 'seed-l2', kind: 'leader', important: false, sender: 'リーダー 田中 健', target: 'A', sentAt: ago(30),
    title: '日報の書き方のお願い',
    body: '日報の所感欄に、お客様の反応と、次回につながる話を、一言で構いませんので書いてください。評価の登録も、忘れずにお願いします。' },
  { id: 'seed-l3', kind: 'leader', important: true, sender: 'リーダー 佐藤 大輔', target: 'B', sentAt: ago(4),
    title: '明日の朝の集合について',
    body: '明日は、9:00に営業所で、短いミーティングを行います。新しい買取強化商材を共有します。' },
  { id: 'seed-l4', kind: 'leader', important: false, sender: 'リーダー 佐藤 大輔', target: 'B', sentAt: ago(28),
    title: '訪問時の身だしなみの確認',
    body: '名札と社員証を、お客様から見える位置に付けてください。' },
];

// 自分に届くメッセージ（宛先が全員、または自分のグループ）を新しい順に。本社とリーダーのものを合わせる
export function messagesFor(user) {
  return [...loadMessages(), ...SEED()]
    .filter((m) => m.target === 'all' || m.target === user.group)
    .sort((a, b) => b.sentAt - a.sentAt);
}
export const hqMessagesFor = (user) => messagesFor(user).filter((m) => m.kind !== 'leader');
export const leaderMessagesFor = (user) => messagesFor(user).filter((m) => m.kind === 'leader');

export const unreadCount = (user) => {
  const read = new Set(loadReadIds(user.id));
  return messagesFor(user).filter((m) => !read.has(m.id)).length;
};
