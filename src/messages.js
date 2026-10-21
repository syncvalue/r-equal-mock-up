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
];

// 自分に届くメッセージ（宛先が全員、または自分のグループ）を新しい順に
export function messagesFor(user) {
  return [...loadMessages(), ...SEED()]
    .filter((m) => m.target === 'all' || m.target === user.group)
    .sort((a, b) => b.sentAt - a.sentAt);
}

export const unreadCount = (user) => {
  const read = new Set(loadReadIds(user.id));
  return messagesFor(user).filter((m) => !read.has(m.id)).length;
};
