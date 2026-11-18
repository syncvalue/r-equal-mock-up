// 鑑定士ごとの色（訪問カレンダーの帯の色分け）。鑑定士の並び順で、色相をずらして決める（同じ人は、いつも同じ色）。画面から独立した純関数
import { USERS } from './dashboard.js';

const GOLDEN = 137.508; // 隣り合う番号の色が、できるだけ離れるように
export function staffColor(userId) {
  const i = Math.max(0, USERS.findIndex((u) => u.id === userId));
  const h = Math.round((i * GOLDEN) % 360);
  return { solid: `hsl(${h} 55% 36%)`, tint: `hsl(${h} 60% 92%)` }; // solid=濃い（白い文字が読める）／tint=薄い（点線の帯の中）
}

// 訪問の帯の見た目。前日確認が済んでいれば、鑑定士の色で塗りつぶし。まだ（未連絡・不通）なら、点線の枠＋薄い色
export function visitBlockStyle(userId, reached) {
  const c = staffColor(userId);
  return reached
    ? { cls: 'text-white', css: `background:${c.solid};border:2px solid ${c.solid}` }
    : { cls: 'text-slate-900', css: `background:${c.tint};border:2px dashed ${c.solid}` };
}
