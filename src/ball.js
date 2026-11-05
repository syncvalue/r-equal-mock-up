// 経費精算の「ボール」: いま誰の対応待ちか（忘れ防止のバッジ・お知らせに使う）。
// 経理部のボール＝未チェック・鑑定士が修正した・鑑定士からの返信／質問・日報が未提出の過去日。
// 鑑定士のボール＝差戻し（直すまで）・経理部の質問に返信待ち。チェック済み・提出前の今日の分は、誰も持たない。
import { checkKey } from './dailyCheck.js';
import { threadOf } from './expenseChat.js';

const lastOf = (thread) => thread.messages.at(-1) ?? null;

// status: 'pending' | 'ok' | 'returned'。closed: 日報を提出（終業）済みか。isToday: 今日の分か
export function ballOf({ status, thread, closed, isToday }) {
  if (status === 'ok') return { ball: null, why: '' };
  if (!closed) return isToday ? { ball: null, why: '' } : { ball: 'accounting', why: '日報が未提出です（確認・差戻しが必要）' };
  const last = lastOf(thread);
  if (status === 'returned') {
    return last?.from === 'sales' && !last.kind
      ? { ball: 'accounting', why: '鑑定士から質問があります' }
      : { ball: 'sales', why: '差戻しです。経費を修正してください' };
  }
  if (last?.from === 'accounting' && !last.kind) return { ball: 'sales', why: '経理部の質問に返信してください' };
  if (last?.kind === 'revised') return { ball: 'accounting', why: '鑑定士が修正しました。もう一度確認してください' };
  if (last?.from === 'sales') return { ball: 'accounting', why: '鑑定士から返信があります' };
  return { ball: 'accounting', why: '未チェック' };
}

const dayDiff = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);

// ボールを持っている（鑑定士×日）の一覧。古い日から。who: 'accounting' | 'sales'。userId: 鑑定士の画面では、自分だけ
export function ballList(days, checks, chats, today, who, userId = null) {
  return days.filter((d) => d.startedAt && (!userId || d.userId === userId) && d.date <= today)
    .map((d) => {
      const status = checks[checkKey(d.userId, d.date)]?.status ?? 'pending';
      const b = ballOf({ status, thread: threadOf(chats, d.userId, d.date), closed: Boolean(d.closedAt), isToday: d.date === today });
      return { userId: d.userId, date: d.date, status, age: dayDiff(d.date, today), ...b };
    })
    .filter((r) => r.ball === who)
    .sort((a, b) => a.date.localeCompare(b.date) || a.userId.localeCompare(b.userId));
}
