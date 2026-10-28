// 訪問カレンダー（エリアごと）の集計。週の表は「日 × 時間」で、その時間に訪問が入っている営業の人数（濃さ）を出し、
// 日別は「営業 × 時間」。画面から独立した純関数。訪問は、営業の元からの予定と、コールセンターの受付（取消を除く）。
import { USERS } from './dashboard.js';
import { areaOfUser, busyBlocks, attendanceOf, WORK_START, WORK_END, SLOT_STEP } from './dispatch.js';

export const slotStarts = () => Array.from({ length: (WORK_END - WORK_START) / SLOT_STEP }, (_, i) => WORK_START + i * SLOT_STEP);

// その日そのエリアの営業。エリアの営業所の営業に、その日そのエリアの訪問が入った他エリアの営業（出張など）を足す
export function areaStaff(areaId, date, reservations, now = new Date()) {
  const visiting = new Set(reservations.filter((r) => r.areaId === areaId && r.date === date && r.status !== 'cancelled' && r.userId).map((r) => r.userId));
  return USERS.filter((u) => areaOfUser(u.id) === areaId || visiting.has(u.id));
}

// 日別の列（営業ごと）。欠勤の営業は、列は残して absent を立てる
export function dayColumns({ areaId, date, reservations, now = new Date() }) {
  return areaStaff(areaId, date, reservations, now).map((user) => {
    const att = attendanceOf(user.id, date, now);
    return { user, att, absent: att.kind === 'absent', blocks: busyBlocks(user.id, date, reservations, now) };
  });
}

// 週の濃さ。slots の busy=その時間に訪問が入っている営業の人数、total=その日に働く営業の人数（欠勤を除く）、ratio=busy/total
export function weekHeat({ areaId, dates, reservations, now = new Date() }) {
  return dates.map((date) => {
    const present = dayColumns({ areaId, date, reservations, now }).filter((c) => !c.absent);
    const slots = slotStarts().map((start) => {
      const busy = present.filter((c) => c.blocks.some((b) => b.start < start + SLOT_STEP && b.end > start)).length;
      return { start, busy, total: present.length, ratio: present.length ? busy / present.length : 0 };
    });
    return { date, total: present.length, slots };
  });
}

// 濃さ（割合 0〜1）→ 背景の透明度と文字色。空きは薄く、埋まるほど濃く
export function heatStyle(ratio) {
  const alpha = Math.round((0.06 + 0.84 * Math.min(1, Math.max(0, ratio))) * 100) / 100;
  return { alpha, bg: `rgba(13,148,136,${alpha})`, fg: alpha > 0.5 ? 'text-white' : 'text-slate-700' };
}
